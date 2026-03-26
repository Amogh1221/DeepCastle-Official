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

# ─── Constants ────────────────────────────────────────────────────────────────
ENGINE_PATH = os.environ.get("ENGINE_PATH", "/app/engine/deepcastle")
# Hard-linked in the Dockerfile for absolute reliability
NNUE_PATH   = os.environ.get("NNUE_PATH",   "/app/engine/brain.nnue")
POOL_SIZE   = 4

# ─── Engine Pool ───────────────────────────────────────────────────────────────
class EnginePool:
    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._all_engines: list    = []

    async def _spawn(self):
        transport, engine = await chess.engine.popen_uci(ENGINE_PATH)

        options = {"Threads": 1, "Hash": 128}
        
        # Consistent NNUE loading
        if os.path.exists(NNUE_PATH):
            options["EvalFile"] = NNUE_PATH
            print(f"[Pool] Using NNUE: {NNUE_PATH}")
        else:
            print("[Pool] WARNING: NNUE brain.nnue not found — using classical eval")

        try:
            await engine.configure(options)
        except Exception as e:
            print(f"[Pool] configure warning: {e}")

        # Verification: Ask for a shallow analysis to ensure the binary is stable
        try:
            test_board = chess.Board()
            await asyncio.wait_for(
                engine.analyse(test_board, chess.engine.Limit(time=0.1)),
                timeout=10.0
            )
            print("[Pool] Engine spawn verified OK")
        except Exception as e:
            try: await engine.quit()
            except: pass
            raise RuntimeError(f"Engine failed verification (likely ARCH incompatibility): {e}")

        return engine

    async def start(self):
        print(f"[Pool] Starting {POOL_SIZE} engines...")
        for i in range(POOL_SIZE):
            try:
                engine = await self._spawn()
                self._all_engines.append(engine)
                await self._queue.put(engine)
                print(f"[Pool] Engine {i+1}/{POOL_SIZE} ready")
            except Exception as e:
                print(f"[Pool] CRITICAL: Engine {i+1} failed: {e}")

        if self._queue.qsize() == 0:
            raise RuntimeError("CRITICAL: Zero engines could start. check ARCH in Dockerfile.")
        print(f"[Pool] {self._queue.qsize()}/{POOL_SIZE} engines available")

    async def _replace_engine(self):
        try:
            fresh = await self._spawn()
            await self._queue.put(fresh)
            print("[Pool] Replacement engine added")
        except Exception as e:
            print(f"[Pool] Could not replace: {e}")

    @asynccontextmanager
    async def acquire(self, timeout: float = 10.0):
        try:
            engine = await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            raise HTTPException(status_code=503, detail="Engines busy — please retry")
        
        healthy = True
        try:
            yield engine
        except chess.engine.EngineTerminatedError:
            healthy = False
            raise HTTPException(status_code=500, detail="Engine crashed mid-task")
        except Exception:
            healthy = False
            raise
        finally:
            if healthy:
                await self._queue.put(engine)
            else:
                try: await engine.quit()
                except: pass
                asyncio.create_task(self._replace_engine())

    async def shutdown(self):
        while not self._queue.empty():
            try:
                e = self._queue.get_nowait()
                await e.quit()
            except: pass
        print("[Pool] shut down")

pool = EnginePool()

# ─── Openings DB ──────────────────────────────────────────────────────────────
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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── WebSocket / Multiplayer ──────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    async def connect(self, websocket: WebSocket, match_id: str):
        await websocket.accept()
        self.active_connections.setdefault(match_id, []).append(websocket)
    def disconnect(self, websocket: WebSocket, match_id: str):
        if match_id in self.active_connections:
            try: self.active_connections[match_id].remove(websocket)
            except: pass
            if not self.active_connections[match_id]: del self.active_connections[match_id]
    async def broadcast(self, message: str, match_id: str, exclude: WebSocket = None):
        for conn in self.active_connections.get(match_id, []):
            if conn != exclude:
                try: await conn.send_text(message)
                except: pass

manager = ConnectionManager()

@app.websocket("/ws/{match_id}")
async def websocket_endpoint(websocket: WebSocket, match_id: str):
    await manager.connect(websocket, match_id)
    await manager.broadcast(json.dumps({"type": "join"}), match_id, exclude=websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(data, match_id, exclude=websocket)
    except Exception:
        manager.disconnect(websocket, match_id)

# ─── Models ──────────────────────────────────────────────────────────
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

# ─── Logic ──────────────────────────────────────────────────────────────
def get_normalized_score(info) -> tuple[float, Optional[int]]:
    if "score" not in info: return 0.0, None
    raw = info["score"].white()
    if raw.is_mate():
        m = raw.mate() or 0
        return (10000.0 if m > 0 else -10000.0), m
    return float(raw.score() or 0.0), None

def get_win_percentage_from_cp(cp: int) -> float:
    cp_ceiled = max(-1000, min(1000, cp))
    MULTIPLIER = -0.00368208
    win_chances = 2.0 / (1.0 + math.exp(MULTIPLIER * cp_ceiled)) - 1.0
    return 50.0 + 50.0 * win_chances

def get_win_percentage(info: dict) -> float:
    score = info.get("score")
    if not score: return 50.0
    white_score = score.white()
    if white_score.is_mate(): return 100.0 if white_score.mate() > 0 else 0.0
    return get_win_percentage_from_cp(white_score.score())

def is_losing_or_alt_winning(pos_p, alt_p, is_w) -> bool:
    is_losing = pos_p < 50.0 if is_w else pos_p > 50.0
    is_alt_win = alt_p > 97.0 if is_w else alt_p < 3.0
    return is_losing or is_alt_win

def get_has_changed_outcome(l_win, p_win, is_w) -> bool:
    diff = (p_win - l_win) * (1 if is_w else -1)
    return diff > 10.0 and ((l_win < 50.0 and p_win > 50.0) or (l_win > 50.0 and p_win < 50.0))

def get_is_only_good_move(p_win, a_win, is_w) -> bool:
    return (p_win - a_win) * (1 if is_w else -1) > 10.0

def is_simple_recapture(fen_2, prev_m, play_m) -> bool:
    if prev_m.to_square != play_m.to_square: return False
    return chess.Board(fen_2).piece_at(prev_m.to_square) is not None

def get_material_difference(board: chess.Board) -> int:
    v = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
    w = sum(v.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE)
    b = sum(v.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK)
    return w - b

def get_is_piece_sacrifice(board: chess.Board, play_m, best_pv: list) -> bool:
    if not best_pv: return False
    w_to_p = board.turn == chess.WHITE
    sim = board.copy()
    moves = [play_m] + best_pv
    if len(moves) % 2 == 1: moves = moves[:-1]
    cw, cb = [], []
    for m in moves:
        if m in sim.legal_moves:
            p = sim.piece_at(m.to_square)
            if sim.is_en_passant(m): p = chess.Piece(chess.PAWN, not sim.turn)
            if p: (cb if sim.turn == chess.WHITE else cw).append(p.piece_type)
            sim.push(m)
        else: break
    for p in cw[:]:
        if p in cb: cw.remove(p); cb.remove(p)
    if abs(len(cw) - len(cb)) <= 1 and all(p == chess.PAWN for p in cw + cb): return False
    diff = get_material_difference(sim) - get_material_difference(board)
    return (diff if w_to_p else -diff) < 0

def get_move_classification(l_win, p_win, is_w, play_m, best_m, alt_win, fen_2, prev_m, board_b, best_pv_a) -> str:
    diff = (p_win - l_win) * (1 if is_w else -1)
    if alt_win is not None and diff >= -2.0:
        if get_is_piece_sacrifice(board_b, play_m, best_pv_a):
            if not is_losing_or_alt_winning(p_win, alt_win, is_w): return "Brilliant"
        is_re = is_simple_recapture(fen_2, prev_m[0], prev_m[1]) if fen_2 and prev_m else False
        if not is_re and not is_losing_or_alt_winning(p_win, alt_win, is_w):
            if get_has_changed_outcome(l_win, p_win, is_w) or get_is_only_good_move(p_win, alt_win, is_w): return "Great"
    if best_m and play_m == best_m: return "Best"
    if diff < -20.0: return "Blunder"
    if diff < -10.0: return "Mistake"
    if diff < -5.0: return "Inaccuracy"
    if diff < -2.0: return "Good"
    return "Excellent"

# ─── Routes ──────────────────────────────────────────────────
@app.get("/")
def home(): return {"status": "online", "pool": POOL_SIZE}

@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    async with pool.acquire() as engine:
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        result = await engine.play(board, limit)
        info = await engine.analyse(board, limit)
        cp, mate = get_normalized_score(info)
        depth, nodes, nps = info.get("depth", 0), info.get("nodes", 0), info.get("nps", 0)
        pv_b, pv_p = board.copy(), []
        for m in info.get("pv", [])[:5]:
            if m in pv_b.legal_moves:
                try: pv_p.append(pv_b.san(m)); pv_b.push(m)
                except: break
            else: break
        score_p = cp / 100.0 if abs(cp) < 9900 else (100.0 if cp > 0 else -100.0)
        return MoveResponse(bestmove=result.move.uci(), score=score_p, depth=depth, nodes=nodes, nps=nps, pv=" ".join(pv_p), mate_in=mate, opening=openings_db.get(board.fen().split(" ")[0]))

@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    async with pool.acquire(timeout=30.0) as engine:
        board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)
        analysis_results, counts = [], {"Book": 0, "Brilliant": 0, "Great": 0, "Best": 0, "Excellent": 0, "Good": 0, "Inaccuracy": 0, "Mistake": 0, "Blunder": 0}
        player_is_white = request.player_color.lower() == "white"
        fen_h, move_h, total_cpl, p_count = [board.fen()], [], 0.0, 0
        infos_before = await engine.analyse(board, limit, multipv=2)
        if not isinstance(infos_before, list): infos_before = [infos_before]
        current_score, _ = get_normalized_score(infos_before[0])
        for i, san_move in enumerate(request.moves):
            is_w_turn = board.turn == chess.WHITE
            is_p_turn = is_w_turn if player_is_white else not is_w_turn
            info_d = infos_before[0]
            best_m_b = info_d.get("pv", [None])[0]
            score_b, _ = get_normalized_score(info_d)
            win_pct_b = get_win_percentage(info_d)
            try: move = board.parse_san(san_move)
            except: break
            alt_win_b = None
            for line in infos_before:
                if line.get("pv") and line["pv"][0] != move:
                    alt_win_b = get_win_percentage(line); break
            board_b = board.copy(); board.push(move); move_h.append(move); fen_h.append(board.fen())
            infos_a_raw = await engine.analyse(board, limit, multipv=2)
            infos_a = infos_a_raw if isinstance(infos_a_raw, list) else [infos_a_raw]
            info_a_d = infos_a[0]
            win_pct_a, (score_a, _) = get_win_percentage(info_a_d), get_normalized_score(info_a_d)
            best_pv_a = info_a_d.get("pv", [])
            fen_2 = fen_h[-3] if len(move_h) >= 2 else None
            prev_m = (move_h[-2], move_h[-1]) if len(move_h) >= 2 else None
            if board.fen().split(" ")[0] in openings_db:
                cls, op_name = "Book", openings_db[board.fen().split(" ")[0]]
            else:
                cls, op_name = get_move_classification(win_pct_b, win_pct_a, is_w_turn, move, best_m_b, alt_win_b, fen_2, prev_m, board_b, best_pv_a), None
            move_gain = score_a - score_b if is_w_turn else score_b - score_a
            cpl = min(max(0.0, -move_gain), 1000.0)
            if is_p_turn:
                total_cpl += cpl; p_count += 1; counts[cls] = counts.get(cls, 0) + 1
            analysis_results.append(MoveAnalysis(move_num=i + 1, san=san_move, classification=cls, cpl=float(cpl), score_before=float(score_b / 100.0), score_after=float(score_a / 100.0), best_move=best_m_b.uci() if best_m_b else "", opening=op_name))
            infos_before = infos_a
        avg_cpl = total_cpl / max(1, p_count)
        acc = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
        elo = int(max(400, min(3600, round(3600 * math.exp(-0.015 * avg_cpl)))))
        return AnalyzeResponse(accuracy=round(acc, 1), estimated_elo=elo, moves=analysis_results, counts=counts)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=7860, workers=1, loop="uvloop", log_level="info")