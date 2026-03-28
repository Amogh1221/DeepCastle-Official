from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Tuple
from contextlib import asynccontextmanager
import os
import math
import chess
import chess.engine
import asyncio
import json
import gc
import ctypes
import psutil

# ─── Force memory back to OS (Linux/HF compatible) ────────────────────────────
def force_memory_release():
    """
    Run GC twice (catches cyclic references missed on first pass),
    then call malloc_trim to return freed pages back to the OS.
    Without this, Python holds freed memory in its own pool and
    the OS still shows high RAM even after objects are deleted.
    """
    gc.collect()
    gc.collect()
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


# ─── Multiplayer / Challenge Manager ──────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, match_id: str):
        await websocket.accept()
        if match_id not in self.active_connections:
            self.active_connections[match_id] = []
        self.active_connections[match_id].append(websocket)

    def disconnect(self, websocket: WebSocket, match_id: str):
        if match_id in self.active_connections:
            if websocket in self.active_connections[match_id]:
                self.active_connections[match_id].remove(websocket)
            # FIX: Clean up empty rooms so dict doesn't grow forever
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    async def broadcast(self, message: str, match_id: str, exclude: WebSocket = None):
        if match_id not in self.active_connections:
            return
        dead = []
        for connection in self.active_connections[match_id]:
            if connection == exclude:
                continue
            try:
                await connection.send_text(message)
            except Exception:
                # FIX: Track dead sockets instead of silently ignoring them
                dead.append(connection)
        # FIX: Remove dead sockets after iteration to free memory
        for d in dead:
            self.active_connections[match_id].remove(d)
        # FIX: Clean up empty room after removing dead sockets
        if match_id in self.active_connections and not self.active_connections[match_id]:
            del self.active_connections[match_id]

manager = ConnectionManager()

# Paths relative to the Docker container
DEEPCASTLE_ENGINE_PATH = os.environ.get(
    "DEEPCASTLE_ENGINE_PATH",
    os.environ.get("ENGINE_PATH", "/app/engine_bin/deepcastle"),
)
NNUE_PATH = os.environ.get("NNUE_PATH", "/app/engine_bin/output.nnue")
NNUE_SMALL_PATH = os.environ.get("NNUE_SMALL_PATH", "/app/engine_bin/small_output.nnue")


class MoveRequest(BaseModel):
    fen: str
    time: float = 1.0
    depth: Optional[int] = None

class MoveResponse(BaseModel):
    bestmove: str
    score: float
    depth: int
    nodes: int
    nps: int
    pv: str
    mate_in: Optional[int] = None
    opening: Optional[str] = None

class AnalyzeRequest(BaseModel):
    moves: List[str]
    time_per_move: float = 0.1
    player_color: str = "white"
    start_fen: Optional[str] = None

class MoveAnalysis(BaseModel):
    move_num: int
    san: str
    best_move: str
    classification: str
    opening: Optional[str] = None
    cpl: float
    score_before: float
    score_after: float

class AnalyzeResponse(BaseModel):
    accuracy: float
    estimated_elo: int
    moves: List[MoveAnalysis]
    counts: Dict[str, int]


# Global engine instance
_GLOBAL_DEEPCASTLE_ENGINE = None
_ENGINE_LOCK = asyncio.Lock()
_ENGINE_IO_LOCK = asyncio.Lock()


def _engine_hash_mb() -> int:
    try:
        v = int(os.environ.get("ENGINE_HASH_MB", "128"))
    except ValueError:
        v = 128
    return max(8, min(512, v))


async def _get_or_start_engine(engine_path: str, *, role: str, options: Optional[dict] = None):
    global _GLOBAL_DEEPCASTLE_ENGINE

    current_engine = _GLOBAL_DEEPCASTLE_ENGINE
    if current_engine is not None:
        try:
            if not current_engine.is_terminated():
                return current_engine
        except Exception:
            _GLOBAL_DEEPCASTLE_ENGINE = None
        else:
            _GLOBAL_DEEPCASTLE_ENGINE = None

    async with _ENGINE_LOCK:
        current_engine = _GLOBAL_DEEPCASTLE_ENGINE
        if current_engine is not None:
            try:
                if not current_engine.is_terminated():
                    return current_engine
            except Exception:
                _GLOBAL_DEEPCASTLE_ENGINE = None
            else:
                _GLOBAL_DEEPCASTLE_ENGINE = None

        if not os.path.exists(engine_path):
            raise HTTPException(status_code=500, detail=f"{role} binary NOT FOUND at {engine_path}")

        try:
            _, engine = await chess.engine.popen_uci(engine_path)

            if options:
                await engine.configure(options)

            if os.path.exists(NNUE_PATH):
                try:
                    await engine.configure({"EvalFile": NNUE_PATH})
                except Exception as ne:
                    print(f"[ERROR] EvalFile load failed: {str(ne)}")
            else:
                print(f"[WARNING] EvalFile not found at {NNUE_PATH}")

            if os.path.exists(NNUE_SMALL_PATH):
                try:
                    await engine.configure({"EvalFileSmall": NNUE_SMALL_PATH})
                except Exception as ne:
                    print(f"[ERROR] EvalFileSmall load failed: {str(ne)}")
            else:
                print(f"[WARNING] EvalFileSmall not found at {NNUE_SMALL_PATH}")

            _GLOBAL_DEEPCASTLE_ENGINE = engine
            return engine
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"{role} crash: {str(e)}")


async def get_deepcastle_engine():
    return await _get_or_start_engine(
        DEEPCASTLE_ENGINE_PATH,
        role="deepcastle",
        options={"Hash": _engine_hash_mb(), "Threads": 1},
    )

async def get_stockfish_engine():
    return await get_deepcastle_engine()


async def _clear_engine_hash(engine) -> None:
    """Send ucinewgame to clear the engine hash table and reset internal state."""
    try:
        await engine.send_command("ucinewgame")
        await asyncio.wait_for(engine.ping(), timeout=5.0)
    except Exception as e:
        print(f"[WARNING] Failed to clear engine hash: {e}")


async def shutdown_engine_async() -> None:
    global _GLOBAL_DEEPCASTLE_ENGINE
    async with _ENGINE_IO_LOCK:
        async with _ENGINE_LOCK:
            eng = _GLOBAL_DEEPCASTLE_ENGINE
            _GLOBAL_DEEPCASTLE_ENGINE = None
    if eng:
        try:
            await asyncio.wait_for(eng.quit(), timeout=5.0)
        except Exception:
            pass


async def _detach_and_quit_engine(engine) -> None:
    global _GLOBAL_DEEPCASTLE_ENGINE
    async with _ENGINE_LOCK:
        if _GLOBAL_DEEPCASTLE_ENGINE is engine:
            _GLOBAL_DEEPCASTLE_ENGINE = None
    try:
        await asyncio.wait_for(engine.quit(), timeout=5.0)
    except Exception:
        pass


def _search_timeout_sec(request_time: float, depth: Optional[int] = None) -> float:
    try:
        cap = float(os.environ.get("ENGINE_SEARCH_TIMEOUT_SEC", "120"))
    except ValueError:
        cap = 120.0
    cap = max(15.0, min(600.0, cap))
    if request_time and request_time > 0:
        return min(cap, max(request_time * 3.0 + 10.0, 30.0))
    return cap


def _analyze_ply_timeout(time_per_move: float) -> float:
    try:
        cap = float(os.environ.get("ENGINE_SEARCH_TIMEOUT_SEC", "120"))
    except ValueError:
        cap = 120.0
    cap = max(15.0, min(600.0, cap))
    if time_per_move and time_per_move > 0:
        return min(cap, max(time_per_move * 80.0 + 15.0, 30.0))
    return cap


async def _engine_call(engine, coro, timeout_sec: float):
    try:
        return await asyncio.wait_for(coro, timeout=timeout_sec)
    except asyncio.TimeoutError:
        await _detach_and_quit_engine(engine)
        raise HTTPException(status_code=504, detail="Engine search timed out")


# ─── Background Memory Cleanup Task ───────────────────────────────────────────
_RAM_CLEANUP_THRESHOLD_MB = float(os.environ.get("RAM_CLEANUP_THRESHOLD_MB", "400"))
_RAM_CLEANUP_INTERVAL_SEC = int(os.environ.get("RAM_CLEANUP_INTERVAL_SEC", "300"))

async def memory_cleanup_task():
    """
    Background task that runs every 5 minutes.
    - Always runs GC twice and malloc_trim to return memory to OS.
    - If RAM exceeds threshold, also clears engine hash table.
    """
    while True:
        await asyncio.sleep(_RAM_CLEANUP_INTERVAL_SEC)
        try:
            process = psutil.Process(os.getpid())
            mem_mb = process.memory_info().rss / 1024 / 1024

            if mem_mb > _RAM_CLEANUP_THRESHOLD_MB:
                print(f"[CLEANUP] RAM at {mem_mb:.1f}MB (threshold {_RAM_CLEANUP_THRESHOLD_MB}MB) — clearing engine hash")
                engine = _GLOBAL_DEEPCASTLE_ENGINE
                if engine is not None:
                    try:
                        if not engine.is_terminated():
                            async with _ENGINE_IO_LOCK:
                                await _clear_engine_hash(engine)
                    except Exception:
                        pass
                force_memory_release()
                after_mb = process.memory_info().rss / 1024 / 1024
                print(f"[CLEANUP] Done. RAM: {mem_mb:.1f}MB → {after_mb:.1f}MB")
            else:
                # Always nudge GC + malloc_trim even when RAM is fine
                force_memory_release()
                print(f"[CLEANUP] RAM at {mem_mb:.1f}MB — OK")

        except Exception as e:
            print(f"[CLEANUP] Error during cleanup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(memory_cleanup_task())
    print(f"[STARTUP] Memory cleanup task started (every {_RAM_CLEANUP_INTERVAL_SEC}s, threshold {_RAM_CLEANUP_THRESHOLD_MB}MB)")
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await shutdown_engine_async()


app = FastAPI(title="Deepcastle Engine API", lifespan=lifespan)

# FIX: Global timeout middleware — kills hung requests so they don't queue in memory
@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    try:
        return await asyncio.wait_for(call_next(request), timeout=180.0)
    except asyncio.TimeoutError:
        return JSONResponse({"detail": "Request timed out"}, status_code=504)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/{match_id}")
async def websocket_endpoint(websocket: WebSocket, match_id: str):
    await manager.connect(websocket, match_id)
    await manager.broadcast(json.dumps({"type": "join"}), match_id, exclude=websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(data, match_id, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, match_id)
        await manager.broadcast(json.dumps({"type": "opponent_disconnected"}), match_id)
        force_memory_release()
    except Exception:
        manager.disconnect(websocket, match_id)
        await manager.broadcast(json.dumps({"type": "opponent_disconnected"}), match_id)
        force_memory_release()


# ─── Health & Monitoring ───────────────────────────────────────────────────────
@app.get("/")
def home():
    return {"status": "online", "engine": "Deepcastle Hybrid Neural", "platform": "Hugging Face Spaces"}


# FIX: Accept HEAD requests from UptimeRobot (was returning 405)
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    if not os.path.exists(DEEPCASTLE_ENGINE_PATH):
        return {"status": "error", "message": "Missing engine binary: deepcastle"}
    force_memory_release()
    return {"status": "ok", "engine": "deepcastle"}


@app.get("/health/ready")
async def health_ready():
    if not os.path.exists(DEEPCASTLE_ENGINE_PATH):
        raise HTTPException(status_code=503, detail="Missing engine binary")
    try:
        engine = await get_deepcastle_engine()
        async with _ENGINE_IO_LOCK:
            await asyncio.wait_for(engine.ping(), timeout=5.0)
        return {"status": "ok", "engine": "responsive"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/ram")
def ram_usage():
    """Monitor RAM usage — call anytime to check memory health."""
    process = psutil.Process(os.getpid())
    mem = process.memory_info()
    mem_mb = mem.rss / 1024 / 1024
    return {
        "rss_mb": round(mem_mb, 2),
        "vms_mb": round(mem.vms / 1024 / 1024, 2),
        "threshold_mb": _RAM_CLEANUP_THRESHOLD_MB,
        "cleanup_interval_sec": _RAM_CLEANUP_INTERVAL_SEC,
        "status": "high" if mem_mb > _RAM_CLEANUP_THRESHOLD_MB else "ok",
        "active_rooms": len(manager.active_connections),
        "active_connections": sum(len(v) for v in manager.active_connections.values()),
    }


# FIX: Call from frontend on game start/end to clear engine hash
@app.post("/new-game")
async def new_game():
    """
    Clear engine hash table between games.
    Call this from the frontend at these moments:
      - When user starts a new game vs bot
      - When game ends (checkmate / resign / draw)
      - When multiplayer match starts
      - When multiplayer match ends
    """
    try:
        engine = await get_deepcastle_engine()
        async with _ENGINE_IO_LOCK:
            await _clear_engine_hash(engine)
        force_memory_release()
        return {"status": "ok", "message": "Engine hash cleared"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Helpers ───────────────────────────────────────────────────────────────────
def get_normalized_score(info) -> Tuple[float, Optional[int]]:
    if "score" not in info:
        return 0.0, None
    raw = info["score"].white()
    if raw.is_mate():
        m = raw.mate() or 0
        return (10000.0 if m > 0 else -10000.0), m
    return float(raw.score() or 0.0), None


def normalize_search_stats(info: dict) -> Tuple[int, int, int]:
    depth = int(info.get("depth") or 0)
    nodes = int(info.get("nodes") or 0)
    t = info.get("time")
    nps_raw = int(info.get("nps") or 0)
    if t is not None and float(t) > 0 and nodes > 0:
        nps = max(0, int(round(nodes / float(t))))
    else:
        nps = nps_raw
    return depth, nodes, nps


# ─── Bot Move (/move) ──────────────────────────────────────────────────────────
@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    try:
        engine = await get_deepcastle_engine()
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        tsec = _search_timeout_sec(request.time, request.depth)

        async with _ENGINE_IO_LOCK:
            result = await _engine_call(
                engine,
                engine.play(board, limit, info=chess.engine.INFO_ALL),
                tsec,
            )
            info = dict(result.info)
            if not info:
                info = await _engine_call(
                    engine,
                    engine.analyse(board, limit, info=chess.engine.INFO_ALL),
                    tsec,
                )

        score_cp, mate_in = get_normalized_score(info)
        depth, nodes, nps = normalize_search_stats(info)

        pv_board = board.copy()
        pv_parts = []
        for m in info.get("pv", [])[:5]:
            if m in pv_board.legal_moves:
                try:
                    pv_parts.append(pv_board.san(m))
                    pv_board.push(m)
                except Exception:
                    break
            else:
                break
        pv = " ".join(pv_parts)
        del pv_board

        score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)
        board_fen_only = board.fen().split(" ")[0]
        opening_name = openings_db.get(board_fen_only)
        best_move = result.move.uci()

        del result
        del info

        return MoveResponse(
            bestmove=best_move,
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv,
            mate_in=mate_in,
            opening=opening_name
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Hint Move (/analysis-move) ───────────────────────────────────────────────
@app.post("/analysis-move", response_model=MoveResponse)
async def get_analysis_move(request: MoveRequest):
    try:
        engine = await get_stockfish_engine()
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        tsec = _search_timeout_sec(request.time, request.depth)

        async with _ENGINE_IO_LOCK:
            result = await _engine_call(
                engine,
                engine.play(board, limit, info=chess.engine.INFO_ALL),
                tsec,
            )
            info = dict(result.info)
            if not info:
                info = await _engine_call(
                    engine,
                    engine.analyse(board, limit, info=chess.engine.INFO_ALL),
                    tsec,
                )

        score_cp, mate_in = get_normalized_score(info)
        depth, nodes, nps = normalize_search_stats(info)

        pv_board = board.copy()
        pv_parts = []
        for m in info.get("pv", [])[:5]:
            if m in pv_board.legal_moves:
                try:
                    pv_parts.append(pv_board.san(m))
                    pv_board.push(m)
                except Exception:
                    break
            else:
                break
        pv = " ".join(pv_parts)
        del pv_board

        score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)
        board_fen_only = board.fen().split(" ")[0]
        opening_name = openings_db.get(board_fen_only)
        best_move = result.move.uci()

        del result
        del info

        # FIX: Clear hash + force memory back to OS after hint
        async with _ENGINE_IO_LOCK:
            await _clear_engine_hash(engine)
        force_memory_release()

        return MoveResponse(
            bestmove=best_move,
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv,
            mate_in=mate_in,
            opening=opening_name
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis move error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Openings DB ───────────────────────────────────────────────────────────────
openings_db = {}
openings_path = os.path.join(os.path.dirname(__file__), "openings.json")
if os.path.exists(openings_path):
    try:
        with open(openings_path, "r", encoding="utf-8") as f:
            openings_db = json.load(f)
    except Exception:
        pass


# ─── Move Classification Helpers ───────────────────────────────────────────────
def get_win_percentage_from_cp(cp: int) -> float:
    cp_ceiled = max(-1000, min(1000, cp))
    MULTIPLIER = -0.00368208
    win_chances = 2.0 / (1.0 + math.exp(MULTIPLIER * cp_ceiled)) - 1.0
    return 50.0 + 50.0 * win_chances

def get_win_percentage(info: dict) -> float:
    score = info.get("score")
    if not score:
        return 50.0
    white_score = score.white()
    if white_score.is_mate():
        mate_val = white_score.mate()
        return 100.0 if mate_val > 0 else 0.0
    return get_win_percentage_from_cp(white_score.score())

def is_losing_or_alt_winning(pos_win_pct: float, alt_win_pct: float, is_white_move: bool) -> bool:
    is_losing = pos_win_pct < 50.0 if is_white_move else pos_win_pct > 50.0
    is_alt_winning = alt_win_pct > 97.0 if is_white_move else alt_win_pct < 3.0
    return is_losing or is_alt_winning

def get_has_changed_outcome(last_win_pct: float, pos_win_pct: float, is_white_move: bool) -> bool:
    diff = (pos_win_pct - last_win_pct) * (1 if is_white_move else -1)
    return diff > 10.0 and (
        (last_win_pct < 50.0 and pos_win_pct > 50.0) or
        (last_win_pct > 50.0 and pos_win_pct < 50.0)
    )

def get_is_only_good_move(pos_win_pct: float, alt_win_pct: float, is_white_move: bool) -> bool:
    diff = (pos_win_pct - alt_win_pct) * (1 if is_white_move else -1)
    return diff > 10.0

def is_simple_recapture(fen_two_moves_ago: str, previous_move: chess.Move, played_move: chess.Move) -> bool:
    if previous_move.to_square != played_move.to_square:
        return False
    b = chess.Board(fen_two_moves_ago)
    result = b.piece_at(previous_move.to_square) is not None
    del b
    return result

def get_material_difference(board: chess.Board) -> int:
    values = {
        chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
        chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0
    }
    w = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE)
    b = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK)
    return w - b

def get_is_piece_sacrifice(board: chess.Board, played_move: chess.Move, best_pv: list) -> bool:
    if not best_pv:
        return False
    start_diff = get_material_difference(board)
    white_to_play = board.turn == chess.WHITE

    sim_board = board.copy()
    moves = [played_move] + best_pv
    if len(moves) % 2 == 1:
        moves = moves[:-1]

    captured_w = []
    captured_b = []
    non_capturing = 1

    for m in moves:
        if m in sim_board.legal_moves:
            captured_piece = sim_board.piece_at(m.to_square)
            if sim_board.is_en_passant(m):
                captured_piece = chess.Piece(chess.PAWN, not sim_board.turn)
            if captured_piece:
                if sim_board.turn == chess.WHITE:
                    captured_b.append(captured_piece.piece_type)
                else:
                    captured_w.append(captured_piece.piece_type)
                non_capturing = 1
            else:
                non_capturing -= 1
                if non_capturing < 0:
                    break
            sim_board.push(m)
        else:
            break

    for p in captured_w[:]:
        if p in captured_b:
            captured_w.remove(p)
            captured_b.remove(p)

    if abs(len(captured_w) - len(captured_b)) <= 1 and all(p == chess.PAWN for p in captured_w + captured_b):
        del sim_board
        return False

    end_diff = get_material_difference(sim_board)
    del sim_board
    mat_diff = end_diff - start_diff
    player_rel = mat_diff if white_to_play else -mat_diff
    return player_rel < 0

def get_move_classification(
    last_win_pct: float,
    pos_win_pct: float,
    is_white_move: bool,
    played_move: chess.Move,
    best_move_before: chess.Move,
    alt_win_pct: Optional[float],
    fen_two_moves_ago: Optional[str],
    uci_next_two_moves: Optional[Tuple[chess.Move, chess.Move]],
    board_before_move: chess.Board,
    best_pv_after: list
) -> str:
    diff = (pos_win_pct - last_win_pct) * (1 if is_white_move else -1)

    if alt_win_pct is not None and diff >= -2.0:
        if get_is_piece_sacrifice(board_before_move, played_move, best_pv_after):
            if not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move):
                return "Brilliant"

    if alt_win_pct is not None and diff >= -2.0:
        is_recapture = False
        if fen_two_moves_ago and uci_next_two_moves:
            is_recapture = is_simple_recapture(
                fen_two_moves_ago, uci_next_two_moves[0], uci_next_two_moves[1]
            )
        if not is_recapture and not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move):
            if get_has_changed_outcome(last_win_pct, pos_win_pct, is_white_move) or \
               get_is_only_good_move(pos_win_pct, alt_win_pct, is_white_move):
                return "Great"

    if best_move_before and played_move == best_move_before:
        return "Best"

    if diff < -20.0: return "Blunder"
    if diff < -10.0: return "Mistake"
    if diff < -5.0:  return "Inaccuracy"
    if diff < -2.0:  return "Good"
    return "Excellent"


# ─── Game Analysis (/analyze-game) ────────────────────────────────────────────
@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    try:
        engine = await get_stockfish_engine()
        board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)

        analysis_results = []
        ply_timeout = _analyze_ply_timeout(request.time_per_move)

        async with _ENGINE_IO_LOCK:
            infos_before = await _engine_call(
                engine,
                engine.analyse(board, limit, multipv=2),
                ply_timeout,
            )
        infos_before = infos_before if isinstance(infos_before, list) else [infos_before]

        counts = {
            "Book": 0, "Brilliant": 0, "Great": 0, "Best": 0,
            "Excellent": 0, "Good": 0, "Inaccuracy": 0,
            "Mistake": 0, "Blunder": 0
        }

        player_is_white = (request.player_color.lower() == "white")

        # FIX: Sliding window — only keep last 3 FENs and last 2 moves, never grows
        fen_window: List[str] = [board.fen()]
        move_window: List[chess.Move] = []

        total_cpl = 0.0
        player_moves_count = 0
        current_score, _ = get_normalized_score(infos_before[0])

        for i, san_move in enumerate(request.moves):
            is_white_turn = board.turn == chess.WHITE
            is_player_turn = is_white_turn if player_is_white else not is_white_turn

            try:
                move = board.parse_san(san_move)
            except Exception:
                break

            info_dict = infos_before[0]
            pv_list = info_dict.get("pv", [])
            best_move_before = pv_list[0] if pv_list else None

            score_before, _ = get_normalized_score(info_dict)
            win_pct_before = get_win_percentage(info_dict)

            alt_win_pct_before: Optional[float] = None
            if len(infos_before) > 1:
                for line in infos_before:
                    if line.get("pv") and line.get("pv")[0] != move:
                        alt_win_pct_before = get_win_percentage(line)
                        break

            board_before_move = board.copy()
            board.push(move)

            # FIX: Sliding window — discard oldest beyond what we need
            move_window.append(move)
            if len(move_window) > 2:
                move_window.pop(0)

            fen_window.append(board.fen())
            if len(fen_window) > 3:
                fen_window.pop(0)

            async with _ENGINE_IO_LOCK:
                infos_after_raw = await _engine_call(
                    engine,
                    engine.analyse(board, limit, multipv=2),
                    ply_timeout,
                )
            infos_after: List[dict] = infos_after_raw if isinstance(infos_after_raw, list) else [infos_after_raw]

            info_after_dict: dict = infos_after[0]

            win_pct_after = get_win_percentage(info_after_dict)
            score_after, _ = get_normalized_score(info_after_dict)
            current_score = score_after
            best_pv_after = info_after_dict.get("pv", [])

            fen_two_moves_ago = fen_window[0] if len(fen_window) == 3 else None
            uci_next_two_moves = tuple(move_window[-2:]) if len(move_window) >= 2 else None

            cls = "Book"
            opening_name = None
            board_fen_only = board.fen().split(" ")[0]

            if board_fen_only in openings_db:
                cls = "Book"
                opening_name = openings_db[board_fen_only]
            else:
                cls = get_move_classification(
                    last_win_pct=win_pct_before,
                    pos_win_pct=win_pct_after,
                    is_white_move=is_white_turn,
                    played_move=move,
                    best_move_before=best_move_before,
                    alt_win_pct=alt_win_pct_before,
                    fen_two_moves_ago=fen_two_moves_ago,
                    uci_next_two_moves=uci_next_two_moves,
                    board_before_move=board_before_move,
                    best_pv_after=best_pv_after
                )

            # FIX: Free board copy immediately after classification
            del board_before_move

            move_gain = score_after - score_before if is_white_turn else score_before - score_after
            cpl = max(0.0, min(-move_gain, 1000.0))

            if is_player_turn:
                total_cpl += cpl
                player_moves_count += 1
                counts[cls] = counts.get(cls, 0) + 1

            analysis_results.append(MoveAnalysis(
                move_num=i + 1,
                san=san_move,
                classification=cls,
                cpl=float(cpl),
                score_before=float(score_before / 100.0),
                score_after=float(score_after / 100.0),
                best_move=best_move_before.uci() if best_move_before else "",
                opening=opening_name
            ))

            # FIX: Release large engine result objects after each ply
            infos_before = infos_after
            infos_after = None
            info_after_dict = None
            infos_after_raw = None

        # FIX: Free sliding windows after loop
        del fen_window
        del move_window

        avg_cpl = total_cpl / max(1, player_moves_count)
        accuracy = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
        estimated_elo = int(max(400, min(3600, round(3600 * math.exp(-0.015 * avg_cpl)))))

        # FIX: Clear engine hash + force memory back to OS after full game analysis
        async with _ENGINE_IO_LOCK:
            await _clear_engine_hash(engine)
        force_memory_release()

        return AnalyzeResponse(
            accuracy=round(accuracy, 1),
            estimated_elo=estimated_elo,
            moves=analysis_results,
            counts=counts
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)