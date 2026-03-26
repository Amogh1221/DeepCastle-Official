from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Tuple
import os
import math
import chess
import chess.engine
import asyncio
import json
from contextlib import asynccontextmanager

# ─── Configuration ─────────────────────────────────────────────────────────────
ENGINE_PATH = os.environ.get("ENGINE_PATH", "/app/engine/deepcastle")
NNUE_PATH = os.environ.get("NNUE_PATH", "/app/engine/output.nnue")

# ─── Database ──────────────────────────────────────────────────────────────────
openings_db = {}
openings_path = os.path.join(os.path.dirname(__file__), "openings.json")
if os.path.exists(openings_path):
    try:
        with open(openings_path, "r", encoding="utf-8") as f:
            openings_db = json.load(f)
    except Exception:
        pass

# ─── Pydantic Models ───────────────────────────────────────────────────────────
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

# ─── Helper Functions ──────────────────────────────────────────────────────────
def get_normalized_score(info) -> tuple[float, Optional[int]]:
    """Returns the score from White's perspective in centipawns."""
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

def get_move_accuracy(win_pct_before: float, win_pct_after: float, is_white_move: bool) -> float:
    """Lichess-style win%-based per-move accuracy (0–100)."""
    if is_white_move:
        diff = win_pct_before - win_pct_after
    else:
        diff = (100.0 - win_pct_before) - (100.0 - win_pct_after)
    
    accuracy = 103.1668 * math.exp(-0.04354 * max(0.0, diff)) - 3.1669
    return max(0.0, min(100.0, accuracy))

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
    return diff > 10.0 and ((last_win_pct < 50.0 and pos_win_pct > 50.0) or (last_win_pct > 50.0 and pos_win_pct < 50.0))

def get_is_only_good_move(pos_win_pct: float, alt_win_pct: float, is_white_move: bool) -> bool:
    diff = (pos_win_pct - alt_win_pct) * (1 if is_white_move else -1)
    return diff > 10.0

def is_simple_recapture(fen_two_moves_ago: str, previous_move: chess.Move, played_move: chess.Move) -> bool:
    if previous_move.to_square != played_move.to_square:
        return False
    b = chess.Board(fen_two_moves_ago)
    return b.piece_at(previous_move.to_square) is not None

def get_material_difference(board: chess.Board) -> int:
    values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
    w = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE)
    b = sum(values.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK)
    return w - b

def get_is_piece_sacrifice(board: chess.Board, played_move: chess.Move, best_pv: list) -> bool:
    if not best_pv: return False
    start_diff = get_material_difference(board)
    white_to_play = board.turn == chess.WHITE
    sim_board = board.copy()
    moves = [played_move] + best_pv
    if len(moves) % 2 == 1: moves = moves[:-1]
    captured_w, captured_b = [], []
    non_capturing = 1
    for m in moves:
        if m in sim_board.legal_moves:
            captured_piece = sim_board.piece_at(m.to_square)
            if sim_board.is_en_passant(m): captured_piece = chess.Piece(chess.PAWN, not sim_board.turn)
            if captured_piece:
                if sim_board.turn == chess.WHITE: captured_b.append(captured_piece.piece_type)
                else: captured_w.append(captured_piece.piece_type)
                non_capturing = 1
            else:
                non_capturing -= 1
                if non_capturing < 0: break
            sim_board.push(m)
        else: break
    for p in captured_w[:]:
        if p in captured_b:
            captured_w.remove(p)
            captured_b.remove(p)
    if abs(len(captured_w) - len(captured_b)) <= 1 and all(p == chess.PAWN for p in captured_w + captured_b):
        return False
    end_diff = get_material_difference(sim_board)
    mat_diff = end_diff - start_diff
    player_rel = mat_diff if white_to_play else -mat_diff
    return player_rel < 0

def get_move_classification(last_win_pct, pos_win_pct, is_white_move, played_move, best_move_before, alt_win_pct, fen_two_moves_ago, uci_next_two_moves, board_before_move, best_pv_after) -> str:
    diff = (pos_win_pct - last_win_pct) * (1 if is_white_move else -1)
    if alt_win_pct is not None and diff >= -2.0:
        if get_is_piece_sacrifice(board_before_move, played_move, best_pv_after):
            if not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move): return "Brilliant"
    if alt_win_pct is not None and diff >= -2.0:
        is_recapture = False
        if fen_two_moves_ago and uci_next_two_moves:
             is_recapture = is_simple_recapture(fen_two_moves_ago, uci_next_two_moves[0], uci_next_two_moves[1])
        if not is_recapture and not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move):
            if get_has_changed_outcome(last_win_pct, pos_win_pct, is_white_move) or get_is_only_good_move(pos_win_pct, alt_win_pct, is_white_move): return "Great"
    if best_move_before and played_move == best_move_before: return "Best"
    if diff < -20.0: return "Blunder"
    if diff < -10.0: return "Mistake"
    if diff < -5.0: return "Inaccuracy"
    if diff < -2.0: return "Good"
    return "Excellent"

# ─── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    async def connect(self, websocket: WebSocket, match_id: str):
        await websocket.accept()
        if match_id not in self.active_connections: self.active_connections[match_id] = []
        self.active_connections[match_id].append(websocket)
    def disconnect(self, websocket: WebSocket, match_id: str):
        if match_id in self.active_connections:
            if websocket in self.active_connections[match_id]: self.active_connections[match_id].remove(websocket)
            if not self.active_connections[match_id]: del self.active_connections[match_id]
    async def broadcast(self, message: str, match_id: str, exclude: WebSocket = None):
        if match_id in self.active_connections:
            for connection in self.active_connections[match_id]:
                if connection != exclude:
                    try: await connection.send_text(message)
                    except Exception: pass

manager = ConnectionManager()

# ─── Engine Pool ───────────────────────────────────────────────────────────────
class EnginePool:
    def __init__(self, size=4):
        self.size = size
        self.engines = asyncio.Queue()
        self.all_engines = []
    async def start(self):
        print(f"Initializing bulletproof engine pool with {self.size} processes...")
        for i in range(self.size):
            try:
                engine = await self._create_engine()
                await self.engines.put(engine)
                self.all_engines.append(engine)
                print(f"  [+] Engine {i+1}/{self.size} ready.")
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"  [!] Failed to start engine {i+1}: {e}")
    async def _create_engine(self):
        if not os.path.exists(ENGINE_PATH): raise Exception("Engine binary not found")
        transport, engine = await chess.engine.popen_uci(ENGINE_PATH)
        if os.path.exists(NNUE_PATH):
            try: await engine.configure({"EvalFile": NNUE_PATH, "Hash": 512, "Threads": 1})
            except Exception: pass
        return engine
    @asynccontextmanager
    async def acquire(self):
        engine = await self.engines.get()
        try: yield engine
        finally:
            try: await self.engines.put(engine)
            except Exception: await self.engines.put(await self._create_engine())
    async def stop(self):
        for engine in self.all_engines:
            try: await engine.quit()
            except: pass

pool = EnginePool(size=4)

# ─── FastAPI Application ───────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool.start()
    yield
    await pool.stop()

app = FastAPI(title="Deepcastle Engine API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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

@app.get("/")
def home():
    return {"status": "online", "engine": "Deepcastle Bulletproof", "platform": "Hugging Face"}

@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    try:
        async with pool.acquire() as engine:
            board = chess.Board(request.fen)
            limit = chess.engine.Limit(time=request.time, depth=request.depth)
            result = await engine.play(board, limit)
            info = await engine.analyse(board, limit)
            score_cp, mate_in = get_normalized_score(info)
            pv_board = board.copy()
            pv_parts = []
            for m in info.get("pv", [])[:5]:
                if m in pv_board.legal_moves:
                    try:
                        pv_parts.append(pv_board.san(m))
                        pv_board.push(m)
                    except Exception: break
                else: break
            score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)
            return MoveResponse(bestmove=result.move.uci(), score=score_pawns, depth=info.get("depth", 0), nodes=info.get("nodes", 0), nps=info.get("nps", 0), pv=" ".join(pv_parts), mate_in=mate_in, opening=openings_db.get(board.fen().split(" ")[0]))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    try:
        async with pool.acquire() as engine:
            board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
            limit = chess.engine.Limit(time=request.time_per_move)
            analysis_results = []
            infos_before = await engine.analyse(board, limit, multipv=2)
            infos_before = infos_before if isinstance(infos_before, list) else [infos_before]
            counts = {"Book": 0, "Brilliant": 0, "Great": 0, "Best": 0, "Excellent": 0, "Good": 0, "Inaccuracy": 0, "Mistake": 0, "Blunder": 0}
            player_is_white = (request.player_color.lower() == "white")
            fen_history, move_history = [board.fen()], []
            player_move_accuracies, player_cpls = [], []
            current_score, _ = get_normalized_score(infos_before[0])
            for i, san_move in enumerate(request.moves):
                is_white_turn = board.turn == chess.WHITE
                is_player_turn = is_white_turn if player_is_white else not is_white_turn
                score_before = current_score
                try: move = board.parse_san(san_move)
                except Exception: break
                info_dict = infos_before[0]
                pv_list = info_dict.get("pv", [])
                best_move_before = pv_list[0] if pv_list else None
                win_pct_before = get_win_percentage(info_dict)
                alt_win_pct_before = None
                if len(infos_before) > 1:
                    for line in infos_before:
                        if line.get("pv") and line.get("pv")[0] != move:
                            alt_win_pct_before = get_win_percentage(line)
                            break
                board_before_move = board.copy()
                board.push(move)
                move_history.append(move)
                fen_history.append(board.fen())
                infos_after_raw = await engine.analyse(board, limit, multipv=2)
                infos_after = infos_after_raw if isinstance(infos_after_raw, list) else [infos_after_raw]
                info_after_dict = infos_after[0]
                win_pct_after = get_win_percentage(info_after_dict)
                score_after, _ = get_normalized_score(info_after_dict)
                current_score = score_after
                fen_two_moves_ago = fen_history[-3] if len(move_history) >= 2 else None
                uci_next_two_moves = (move_history[-2], move_history[-1]) if len(move_history) >= 2 else None
                board_fen_only = board.fen().split(" ")[0]
                if board_fen_only in openings_db:
                    cls, opening_name = "Book", openings_db[board_fen_only]
                else:
                    cls, opening_name = get_move_classification(win_pct_before, win_pct_after, is_white_turn, move, best_move_before, alt_win_pct_before, fen_two_moves_ago, uci_next_two_moves, board_before_move, info_after_dict.get("pv", [])), None
                move_gain = score_after - score_before if is_white_turn else score_before - score_after
                cpl = max(0.0, min(1000.0, -move_gain))
                move_acc = get_move_accuracy(win_pct_before, win_pct_after, is_white_turn)
                if is_player_turn:
                    player_move_accuracies.append(move_acc)
                    player_cpls.append(cpl)
                    counts[cls] = counts.get(cls, 0) + 1
                analysis_results.append(MoveAnalysis(move_num=i+1, san=san_move, best_move=best_move_before.uci() if best_move_before else "", classification=cls, opening=opening_name, cpl=float(cpl), score_before=float(score_before / 100.0), score_after=float(score_after / 100.0)))
                infos_before = infos_after
            if player_move_accuracies:
                accuracy = ( (sum(player_move_accuracies) / len(player_move_accuracies)) + (len(player_move_accuracies) / sum(1.0 / max(a, 0.1) for a in player_move_accuracies)) ) / 2.0
            else: accuracy = 0.0
            avg_cpl = sum(player_cpls) / max(1, len(player_cpls))
            estimated_elo = int(max(400, min(3600, round(3600 * math.exp(-0.015 * avg_cpl)))))
            return AnalyzeResponse(accuracy=round(accuracy, 1), estimated_elo=estimated_elo, moves=analysis_results, counts=counts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
