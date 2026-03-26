from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
import math
import chess
import chess.engine
import asyncio
import json

# ─── Engine Pool ───────────────────────────────────────────────────────────────
ENGINE_PATH = os.environ.get("ENGINE_PATH", "/app/engine/deepcastle")
NNUE_PATH   = os.environ.get("NNUE_PATH",   "/app/engine/output.nnue")

POOL_SIZE = 4

class EnginePool:
    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._all_engines: list    = []

    async def start(self):
        for i in range(POOL_SIZE):
            engine = await self._spawn()
            self._all_engines.append(engine)
            await self._queue.put(engine)
        print(f"[Pool] {POOL_SIZE} engines ready")

    async def _spawn(self):
        transport, engine = await chess.engine.popen_uci(ENGINE_PATH)
        options = {"Threads": 2, "Hash": 512}
        # Try each NNUE candidate in order
        for candidate in [NNUE_PATH,
                          "/app/engine/custom_big.nnue",
                          "/app/engine/nn-9a0cc2a62c52.nnue",
                          "/app/engine/nn-47fc8b7fff06.nnue"]:
            if os.path.exists(candidate):
                options["EvalFile"] = candidate
                break
        try:
            await engine.configure(options)
        except Exception as e:
            print(f"[Pool] configure warning: {e}")
        return engine

    @asynccontextmanager
    async def acquire(self, timeout: float = 10.0):
        try:
            engine = await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            raise HTTPException(status_code=503,
                                detail="All engines busy — try again shortly")
        healthy = True
        try:
            yield engine
        except Exception:
            healthy = False
            raise
        finally:
            if healthy:
                await self._queue.put(engine)
            else:
                try:
                    await engine.quit()
                except Exception:
                    pass
                try:
                    fresh = await self._spawn()
                    await self._queue.put(fresh)
                    print("[Pool] replaced dead engine")
                except Exception as e:
                    print(f"[Pool] CRITICAL: could not replace engine: {e}")

    async def shutdown(self):
        engines = []
        while not self._queue.empty():
            try:
                engines.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        for e in engines:
            try:
                await e.quit()
            except Exception:
                pass
        print("[Pool] all engines shut down")


pool = EnginePool()


# ─── Openings DB (loaded once at startup) ─────────────────────────────────────
openings_db: dict = {}

def load_openings():
    global openings_db
    path = os.path.join(os.path.dirname(__file__), "openings.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                openings_db = json.load(f)
            print(f"[Openings] Loaded {len(openings_db)} positions")
        except Exception as e:
            print(f"[Openings] Load error: {e}")


# ─── FastAPI Lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_openings()
    await pool.start()
    yield
    await pool.shutdown()

app = FastAPI(title="Deepcastle Engine API", lifespan=lifespan)


# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── WebSocket / Multiplayer ──────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, match_id: str):
        await websocket.accept()
        self.active_connections.setdefault(match_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, match_id: str):
        if match_id in self.active_connections:
            self.active_connections[match_id].discard(websocket) \
                if hasattr(self.active_connections[match_id], "discard") \
                else self._safe_remove(match_id, websocket)
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    def _safe_remove(self, match_id: str, ws: WebSocket):
        try:
            self.active_connections[match_id].remove(ws)
        except ValueError:
            pass

    async def broadcast(self, message: str, match_id: str, exclude: WebSocket = None):
        for conn in self.active_connections.get(match_id, []):
            if conn != exclude:
                try:
                    await conn.send_text(message)
                except Exception:
                    pass

manager = ConnectionManager()

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
    except Exception:
        manager.disconnect(websocket, match_id)
        await manager.broadcast(json.dumps({"type": "opponent_disconnected"}), match_id)


# ─── Pydantic Models ──────────────────────────────────────────────────────────
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


# ─── Score Utilities ──────────────────────────────────────────────────────────
def get_normalized_score(info) -> tuple[float, Optional[int]]:
    if "score" not in info:
        return 0.0, None
    raw = info["score"].white()
    if raw.is_mate():
        m = raw.mate() or 0
        return (10000.0 if m > 0 else -10000.0), m
    return raw.score() or 0.0, None

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
        return 100.0 if white_score.mate() > 0 else 0.0
    return get_win_percentage_from_cp(white_score.score())

def is_losing_or_alt_winning(pos_win_pct: float, alt_win_pct: float, is_white_move: bool) -> bool:
    is_losing    = pos_win_pct < 50.0 if is_white_move else pos_win_pct > 50.0
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
    return b.piece_at(previous_move.to_square) is not None

def get_material_difference(board: chess.Board) -> int:
    values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
              chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
    w = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE)
    b = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK)
    return w - b

def get_is_piece_sacrifice(board: chess.Board, played_move: chess.Move, best_pv: list) -> bool:
    if not best_pv:
        return False
    white_to_play = board.turn == chess.WHITE
    sim_board = board.copy()
    moves = [played_move] + best_pv
    if len(moves) % 2 == 1:
        moves = moves[:-1]
    captured_w, captured_b = [], []
    non_capturing = 1
    for m in moves:
        if m in sim_board.legal_moves:
            captured_piece = sim_board.piece_at(m.to_square)
            if sim_board.is_en_passant(m):
                captured_piece = chess.Piece(chess.PAWN, not sim_board.turn)
            if captured_piece:
                (captured_b if sim_board.turn == chess.WHITE else captured_w).append(captured_piece.piece_type)
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
        return False
    end_diff = get_material_difference(sim_board)
    mat_diff = end_diff - get_material_difference(board)
    return (mat_diff if white_to_play else -mat_diff) < 0

def get_move_classification(
    last_win_pct, pos_win_pct, is_white_move,
    played_move, best_move_before, alt_win_pct,
    fen_two_moves_ago, uci_next_two_moves,
    board_before_move, best_pv_after
) -> str:
    diff = (pos_win_pct - last_win_pct) * (1 if is_white_move else -1)
    if alt_win_pct is not None and diff >= -2.0:
        if get_is_piece_sacrifice(board_before_move, played_move, best_pv_after):
            if not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move):
                return "Brilliant"
    if alt_win_pct is not None and diff >= -2.0:
        is_recapture = False
        if fen_two_moves_ago and uci_next_two_moves:
            is_recapture = is_simple_recapture(fen_two_moves_ago, *uci_next_two_moves)
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


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/")
def home():
    return {"status": "online", "engine": "Deepcastle Hybrid Neural",
            "platform": "Hugging Face Spaces", "pool_size": POOL_SIZE}

@app.get("/health")
def health():
    if not os.path.exists(ENGINE_PATH):
        return {"status": "error", "message": "Engine binary not found"}
    return {"status": "ok", "engine": "Deepcastle", "pool_size": POOL_SIZE}

@app.get("/pool-status")
def pool_status():
    """How many engines are currently idle."""
    return {"idle_engines": pool._queue.qsize(), "total_engines": POOL_SIZE}


@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    async with pool.acquire(timeout=10.0) as engine:
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)

        result = await engine.play(board, limit)
        info   = await engine.analyse(board, limit)

        score_cp, mate_in = get_normalized_score(info)
        depth = info.get("depth", 0)
        nodes = info.get("nodes", 0)
        nps   = info.get("nps", 0)

        pv_board, pv_parts = board.copy(), []
        for m in info.get("pv", [])[:5]:
            if m in pv_board.legal_moves:
                try:
                    pv_parts.append(pv_board.san(m))
                    pv_board.push(m)
                except Exception:
                    break
            else:
                break

        score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)
        board_fen_only = board.fen().split(" ")[0]

        return MoveResponse(
            bestmove=result.move.uci(),
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=" ".join(pv_parts),
            mate_in=mate_in,
            opening=openings_db.get(board_fen_only),
        )


@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    # Analysis holds ONE engine for the whole game — intentional.
    async with pool.acquire(timeout=30.0) as engine:
        board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)

        analysis_results = []
        counts = {
            "Book": 0, "Brilliant": 0, "Great": 0, "Best": 0,
            "Excellent": 0, "Good": 0, "Inaccuracy": 0,
            "Mistake": 0, "Blunder": 0
        }

        player_is_white = request.player_color.lower() == "white"
        fen_history     = [board.fen()]
        move_history    = []
        total_cpl       = 0.0
        player_moves_count = 0

        infos_before = await engine.analyse(board, limit, multipv=2)
        if not isinstance(infos_before, list):
            infos_before = [infos_before]
        current_score, _ = get_normalized_score(infos_before[0])

        for i, san_move in enumerate(request.moves):
            is_white_turn  = board.turn == chess.WHITE
            is_player_turn = is_white_turn if player_is_white else not is_white_turn

            info_dict      = infos_before[0]
            pv_list        = info_dict.get("pv", [])
            best_move_before = pv_list[0] if pv_list else None

            score_before, _ = get_normalized_score(info_dict)
            win_pct_before  = get_win_percentage(info_dict)
            alt_win_pct_before: Optional[float] = None
            for line in infos_before:
                if line.get("pv") and line.get("pv")[0] != (
                    board.parse_san(san_move) if san_move else None
                ):
                    alt_win_pct_before = get_win_percentage(line)
                    break

            try:
                move = board.parse_san(san_move)
            except Exception:
                break

            board_before_move = board.copy()
            board.push(move)
            move_history.append(move)
            fen_history.append(board.fen())

            infos_after_raw = await engine.analyse(board, limit, multipv=2)
            infos_after: List[dict] = infos_after_raw if isinstance(infos_after_raw, list) else [infos_after_raw]
            info_after_dict = infos_after[0]

            win_pct_after   = get_win_percentage(info_after_dict)
            score_after, _  = get_normalized_score(info_after_dict)
            current_score   = score_after
            best_pv_after   = info_after_dict.get("pv", [])

            fen_two_moves_ago  = None
            uci_next_two_moves = None
            if len(move_history) >= 2:
                fen_two_moves_ago  = fen_history[-3]
                uci_next_two_moves = (move_history[-2], move_history[-1])

            board_fen_only = board.fen().split(" ")[0]
            if board_fen_only in openings_db:
                cls          = "Book"
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
                    best_pv_after=best_pv_after,
                )
                opening_name = None

            move_gain = score_after - score_before if is_white_turn else score_before - score_after
            cpl = min(max(0.0, -move_gain), 1000.0)

            if is_player_turn:
                total_cpl          += cpl
                player_moves_count += 1
                counts[cls]         = counts.get(cls, 0) + 1

            analysis_results.append(MoveAnalysis(
                move_num=i + 1,
                san=san_move,
                classification=cls,
                cpl=float(cpl),
                score_before=float(score_before / 100.0),
                score_after=float(score_after / 100.0),
                best_move=best_move_before.uci() if best_move_before else "",
                opening=opening_name,
            ))

            infos_before = infos_after

        avg_cpl      = total_cpl / max(1, player_moves_count)
        accuracy     = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
        estimated_elo = int(max(400, min(3600, round(3600 * math.exp(-0.015 * avg_cpl)))))

        return AnalyzeResponse(
            accuracy=round(accuracy, 1),
            estimated_elo=estimated_elo,
            moves=analysis_results,
            counts=counts,
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=7860,
        workers=1,          # Must be 1 — the pool lives in-process
        loop="uvloop",      # Faster event loop
        log_level="info",
    )