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

app = FastAPI(title="Deepcastle Engine API")

# ─── Multiplaying / Challenge Manager ──────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # match_id -> list of websockets
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
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    async def broadcast(self, message: str, match_id: str, exclude: WebSocket = None):
        if match_id in self.active_connections:
            for connection in self.active_connections[match_id]:
                if connection != exclude:
                    try:
                        await connection.send_text(message)
                    except Exception:
                        pass

manager = ConnectionManager()

@app.websocket("/ws/{match_id}")
async def websocket_endpoint(websocket: WebSocket, match_id: str):
    await manager.connect(websocket, match_id)
    room = manager.active_connections.get(match_id, [])
    # Notify others that someone joined
    await manager.broadcast(json.dumps({"type": "join"}), match_id, exclude=websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Relay the message (move, etc.) to others in the same room
            await manager.broadcast(data, match_id, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, match_id)
        # Notify remaining players that opponent disconnected → they win
        await manager.broadcast(json.dumps({"type": "opponent_disconnected"}), match_id)
    except Exception:
        manager.disconnect(websocket, match_id)
        await manager.broadcast(json.dumps({"type": "opponent_disconnected"}), match_id)


# Allow ALL for easy testing (we can restrict this later if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths relative to the Docker container
DEEPCASTLE_ENGINE_PATH = os.environ.get(
    "DEEPCASTLE_ENGINE_PATH",
    os.environ.get("ENGINE_PATH", "/app/engine_bin/deepcastle"),
)
STOCKFISH_ENGINE_PATH = os.environ.get("STOCKFISH_ENGINE_PATH", "/usr/games/stockfish")
STOCKFISH_NNUE_PATH = os.environ.get("STOCKFISH_NNUE_PATH", "/app/engine_bin/stockfish.nnue")
NNUE_PATH = os.environ.get("NNUE_PATH", "/app/engine_bin/output.nnue")
NNUE_SMALL_PATH = os.environ.get("NNUE_SMALL_PATH", "/app/engine_bin/small_output.nnue")

class MoveRequest(BaseModel):
    fen: str
    time: float = 1.0  # seconds
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

@app.get("/")
def home():
    return {"status": "online", "engine": "Deepcastle Hybrid Neural", "platform": "Hugging Face Spaces"}

@app.get("/health")
def health():
    missing = []
    if not os.path.exists(DEEPCASTLE_ENGINE_PATH):
        missing.append("deepcastle")
    if not os.path.exists(STOCKFISH_ENGINE_PATH):
        missing.append("stockfish")
    if missing:
        return {"status": "error", "message": f"Missing engine binary: {', '.join(missing)}"}
    return {"status": "ok", "engines": ["deepcastle", "stockfish"]}

# Global engine instances to save memory and improve performance
_GLOBAL_DEEPCASTLE_ENGINE = None
_GLOBAL_STOCKFISH_ENGINE = None

async def _get_or_start_engine(engine_path: str, *, role: str, options: Optional[dict] = None):
    global _GLOBAL_DEEPCASTLE_ENGINE, _GLOBAL_STOCKFISH_ENGINE

    current_engine = _GLOBAL_DEEPCASTLE_ENGINE if role == "deepcastle" else _GLOBAL_STOCKFISH_ENGINE
    if current_engine is not None:
        try:
            if not current_engine.is_terminated():
                return current_engine
        except Exception:
            if role == "deepcastle":
                _GLOBAL_DEEPCASTLE_ENGINE = None
            else:
                _GLOBAL_STOCKFISH_ENGINE = None

    if not os.path.exists(engine_path):
        raise HTTPException(status_code=500, detail=f"{role} binary NOT FOUND at {engine_path}")

    print(f"[DEBUG] Attempting to start {role} engine at {engine_path}")
    try:
        transport, engine = await chess.engine.popen_uci(engine_path)
        print(f"[DEBUG] {role} process started. ID: {transport.get_pid()}")

        if options:
            await engine.configure(options)

        if role == "deepcastle":
            if os.path.exists(NNUE_PATH):
                try:
                    await engine.configure({"EvalFile": NNUE_PATH})
                    print("[DEBUG] DeepCastle big net loaded successfully.")
                except Exception as ne:
                    print(f"[ERROR] DeepCastle big net load failed: {str(ne)}")
            else:
                print(f"[WARNING] DeepCastle big net not found at {NNUE_PATH}")

            if os.path.exists(NNUE_SMALL_PATH):
                try:
                    await engine.configure({"EvalFileSmall": NNUE_SMALL_PATH})
                    print("[DEBUG] DeepCastle small net loaded successfully.")
                except Exception as ne:
                    print(f"[ERROR] DeepCastle small net load failed: {str(ne)}")
            else:
                print(f"[WARNING] DeepCastle small net not found at {NNUE_SMALL_PATH}")

            _GLOBAL_DEEPCASTLE_ENGINE = engine
        else:
            if os.path.exists(STOCKFISH_NNUE_PATH):
                try:
                    await engine.configure({"EvalFile": STOCKFISH_NNUE_PATH})
                    print("[DEBUG] Stockfish NNUE loaded successfully.")
                except Exception as ne:
                    print(f"[ERROR] Stockfish NNUE load failed: {str(ne)}")
            else:
                print(f"[WARNING] Stockfish NNUE not found at {STOCKFISH_NNUE_PATH}")

            _GLOBAL_STOCKFISH_ENGINE = engine

        return engine
    except Exception as e:
        print(f"[CRITICAL] {role} failed to start: {str(e)}")
        # Try to gather more info by running the binary directly briefly
        import subprocess
        try:
            diag = subprocess.run([engine_path, "uci"], capture_output=True, text=True, timeout=2)
            print(f"[DIAG] {role} output: {diag.stdout} | Error: {diag.stderr}")
        except Exception as de:
            print(f"[DIAG] Could not run diagnosis: {str(de)}")
        raise HTTPException(status_code=500, detail=f"{role} crash: {str(e)}")

async def get_deepcastle_engine():
    return await _get_or_start_engine(
        DEEPCASTLE_ENGINE_PATH,
        role="deepcastle",
        options={"Hash": 128, "Threads": 1},
    )

async def get_stockfish_engine():
    return await _get_or_start_engine(
        STOCKFISH_ENGINE_PATH,
        role="stockfish",
        options={"Hash": 128, "Threads": 1},
    )

def get_normalized_score(info) -> tuple[float, Optional[int]]:
    """Returns the score from White's perspective in centipawns."""
    if "score" not in info:
        return 0.0, None
    raw = info["score"].white()
    if raw.is_mate():
        m = raw.mate() or 0
        return (10000.0 if m > 0 else -10000.0), m
    return float(raw.score() or 0.0), None

# ─── Engine Inference Route ────────────────────────────────────────────────────
@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    try:
        engine = await get_deepcastle_engine()
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        
        # Search for best move
        result = await engine.play(board, limit)
        
        # Get evaluation separately to avoid blocking
        info = await engine.analyse(board, chess.engine.Limit(time=0.1, depth=limit.depth or 12))
        
        # From White's perspective in CP -> converted to Pawns for UI
        score_cp, mate_in = get_normalized_score(info)
        
        depth = info.get("depth", 0)
        nodes = info.get("nodes", 0)
        nps = info.get("nps", 0)

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

        # Map mate score to pawns representation to not break old UI
        score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)

        # Check for opening name
        board_fen_only = board.fen().split(" ")[0]
        opening_name = openings_db.get(board_fen_only)

        return MoveResponse(
            bestmove=result.move.uci(),
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv,
            mate_in=mate_in,
            opening=opening_name
        )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analysis-move", response_model=MoveResponse)
async def get_analysis_move(request: MoveRequest):
    try:
        engine = await get_stockfish_engine()
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)

        result = await engine.play(board, limit)
        info = await engine.analyse(board, chess.engine.Limit(time=0.1, depth=limit.depth or 12))

        score_cp, mate_in = get_normalized_score(info)

        depth = info.get("depth", 0)
        nodes = info.get("nodes", 0)
        nps = info.get("nps", 0)

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

        score_pawns = score_cp / 100.0 if abs(score_cp) < 9900 else (100.0 if score_cp > 0 else -100.0)

        board_fen_only = board.fen().split(" ")[0]
        opening_name = openings_db.get(board_fen_only)

        return MoveResponse(
            bestmove=result.move.uci(),
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv,
            mate_in=mate_in,
            opening=opening_name
        )
    except Exception as e:
        print(f"Analysis move error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


import math
import json
import os
from typing import Optional, List, Tuple

openings_db = {}
openings_path = os.path.join(os.path.dirname(__file__), "openings.json")
if os.path.exists(openings_path):
    try:
        with open(openings_path, "r", encoding="utf-8") as f:
            openings_db = json.load(f)
    except Exception as e:
        pass

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
        return False
        
    end_diff = get_material_difference(sim_board)
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
             is_recapture = is_simple_recapture(fen_two_moves_ago, uci_next_two_moves[0], uci_next_two_moves[1])
             
        if not is_recapture and not is_losing_or_alt_winning(pos_win_pct, alt_win_pct, is_white_move):
            if get_has_changed_outcome(last_win_pct, pos_win_pct, is_white_move) or get_is_only_good_move(pos_win_pct, alt_win_pct, is_white_move):
                return "Great"

    if best_move_before and played_move == best_move_before:
        return "Best"

    if diff < -20.0: return "Blunder"
    if diff < -10.0: return "Mistake"
    if diff < -5.0: return "Inaccuracy"
    if diff < -2.0: return "Good"
    return "Excellent"

@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    engine = None
    try:
        engine = await get_stockfish_engine()
        board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)
        
        analysis_results = []
        
        infos_before = await engine.analyse(board, limit, multipv=2)
        infos_before = infos_before if isinstance(infos_before, list) else [infos_before]
        
        counts = {
            "Book": 0, "Brilliant": 0, "Great": 0, "Best": 0, 
            "Excellent": 0, "Good": 0, "Inaccuracy": 0, 
            "Mistake": 0, "Blunder": 0
        }

        player_is_white = (request.player_color.lower() == "white")
        
        fen_history = [board.fen()]
        move_history = []
        total_cpl = 0.0
        player_moves_count = 0
        current_score, _ = get_normalized_score(infos_before[0])

        for i, san_move in enumerate(request.moves):
            is_white_turn = board.turn == chess.WHITE
            is_player_turn = is_white_turn if player_is_white else not is_white_turn
            
            score_before = current_score
            
            try:
                move = board.parse_san(san_move)
            except Exception:
                break # Invalid move

            info_dict = infos_before[0]
            pv_list = info_dict.get("pv", [])
            best_move_before = pv_list[0] if pv_list else None
            
            score_before, _ = get_normalized_score(info_dict)
            win_pct_before = get_win_percentage(info_dict)
            alt_win_pct_before: Optional[float] = None
            if len(infos_before) > 1:
                # Find the first alternative move that is not the played move
                for line in infos_before:
                    if line.get("pv") and line.get("pv")[0] != move:
                        alt_win_pct_before = get_win_percentage(line)
                        break

            board_before_move = board.copy()
            board.push(move)
            
            move_history.append(move)
            fen_history.append(board.fen())
            
            infos_after_raw = await engine.analyse(board, limit, multipv=2)
            infos_after: List[dict] = infos_after_raw if isinstance(infos_after_raw, list) else [infos_after_raw]
            
            info_after_dict: dict = infos_after[0]
            
            win_pct_after = get_win_percentage(info_after_dict)
            score_after, _ = get_normalized_score(info_after_dict)
            current_score = score_after
            
            best_pv_after = info_after_dict.get("pv", [])
            
            fen_two_moves_ago = None
            uci_next_two_moves = None
            if len(move_history) >= 2:
                fen_two_moves_ago = fen_history[-3]
                uci_next_two_moves = (move_history[-2], move_history[-1])

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
            
            move_gain = score_after - score_before if is_white_turn else score_before - score_after
            cpl = max(0, -move_gain)
            cpl = min(cpl, 1000.0)
            
            if is_player_turn:
                total_cpl += cpl
                player_moves_count += 1
                counts[cls] = counts.get(cls, 0) + 1
            
            analysis_results.append(MoveAnalysis(
                move_num=i+1,
                san=san_move,
                fen=board.fen(),
                classification=cls,
                cpl=float(cpl),
                score_before=float(score_before / 100.0),
                score_after=float(score_after / 100.0),
                best_move=best_move_before.uci() if best_move_before else "",
                opening=opening_name
            ))
            
            infos_before = infos_after

        # Win probability matching accuracy formula
        # Accuracy = 100 * exp(-0.02 * avg_cpl) smoothed
        avg_cpl = total_cpl / max(1, player_moves_count)
        
        # Simple heuristic mapping for Accuracy & Elo
        # 0 avg loss -> 100%
        # ~100 avg loss -> ~60%
        accuracy = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
        
        # Exponential Elo Decay calibrated to 3600 max engine strength
        estimated_elo = int(max(400, min(3600, round(3600 * math.exp(-0.015 * avg_cpl)))))

        return AnalyzeResponse(
            accuracy=round(accuracy, 1),
            estimated_elo=estimated_elo,
            moves=analysis_results,
            counts=counts
        )
        
    except Exception as e:
        print(f"Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces port is 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)