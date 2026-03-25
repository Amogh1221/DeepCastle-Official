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
ENGINE_PATH = os.environ.get("ENGINE_PATH", "/app/engine/deepcastle")
NNUE_PATH = os.environ.get("NNUE_PATH", "/app/engine/output.nnue")

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

# ─── New Analysis Types ────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    moves: List[str]             # e.g., ["e4", "e5", "Nf3", "Nc6", ...]
    time_per_move: float = 0.1   # quick eval per move
    player_color: str = "white"

class MoveAnalysis(BaseModel):
    move_num: int
    san: str
    fen: str
    classification: str          # Best, Excellent, Good, Inaccuracy, Mistake, Blunder, Brilliant
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
    if not os.path.exists(ENGINE_PATH):
        return {"status": "error", "message": "Engine binary not found"}
    return {"status": "ok", "engine": "Deepcastle"}

async def get_engine():
    if not os.path.exists(ENGINE_PATH):
        raise HTTPException(status_code=500, detail="Engine binary not found")
    transport, engine = await chess.engine.popen_uci(ENGINE_PATH)
    if os.path.exists(NNUE_PATH):
        try:
            await engine.configure({"EvalFile": NNUE_PATH})
            await engine.configure({"Hash": 512, "Threads": 2})
        except Exception:
            pass
    return engine

def get_normalized_score(info) -> tuple[float, Optional[int]]:
    """Returns the score from White's perspective in centipawns."""
    if "score" not in info:
        return 0.0, None
    raw = info["score"].white()
    if raw.is_mate():
        m = raw.mate() or 0
        return (10000.0 if m > 0 else -10000.0), m
    return raw.score() or 0.0, None

# ─── Engine Inference Route ────────────────────────────────────────────────────
@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    engine = None
    try:
        engine = await get_engine()
        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        
        result = await engine.play(board, limit)
        info = await engine.analyse(board, limit)
        
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

        return MoveResponse(
            bestmove=result.move.uci(),
            score=score_pawns,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv,
            mate_in=mate_in
        )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if engine:
            try:
                await engine.quit()
            except Exception:
                pass


# ─── Game Review Route ─────────────────────────────────────────────────────────
@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    engine = None
    try:
        engine = await get_engine()
        board = chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)
        
        analysis_results = []
        
        # We need the pre-move evaluation of the very first position
        info_before = await engine.analyse(board, limit)
        current_score, _ = get_normalized_score(info_before)

        # To track accuracy
        total_cpl = 0
        player_moves_count = 0
        
        counts = {
            "Brilliant": 0, "Great": 0, "Best": 0, 
            "Excellent": 0, "Good": 0, "Inaccuracy": 0, 
            "Mistake": 0, "Blunder": 0
        }

        player_is_white = (request.player_color.lower() == "white")

        for i, san_move in enumerate(request.moves):
            is_white_turn = board.turn == chess.WHITE
            is_player_turn = is_white_turn if player_is_white else not is_white_turn
            
            # The current_score is the score BEFORE this move
            score_before = current_score
            
            # Push move
            try:
                move = board.parse_san(san_move)
                board.push(move)
            except Exception:
                break # Invalid move, stop analysis here
            
            # Get eval AFTER move
            info_after = await engine.analyse(board, limit)
            score_after, _ = get_normalized_score(info_after)
            
            # Update current score for next iteration
            current_score = score_after
            
            # Calculate Centipawn Loss (diff between score before and score after)
            cpl = max(0, score_before - score_after) if is_white_turn else max(0, score_after - score_before)
            cpl = min(cpl, 1000.0)

            # Only track these stats for the requested player
            if is_player_turn:
                total_cpl += cpl
                player_moves_count += 1
            
            # Classification mapping
            if cpl <= 15:
                cls = "Best"
            elif cpl <= 35:
                cls = "Excellent"
            elif cpl <= 75:
                cls = "Good"
            elif cpl <= 150:
                cls = "Inaccuracy"
            elif cpl <= 300:
                cls = "Mistake"
            else:
                cls = "Blunder"
            
            if is_player_turn:
                counts[cls] += 1
            
            analysis_results.append(MoveAnalysis(
                move_num=i+1,
                san=san_move,
                fen=board.fen(),
                classification=cls,
                cpl=cpl,
                score_before=score_before / 100.0,
                score_after=score_after / 100.0
            ))

        # Win probability matching accuracy formula
        # Accuracy = 100 * exp(-0.02 * avg_cpl) smoothed
        avg_cpl = total_cpl / max(1, player_moves_count)
        
        # Simple heuristic mapping for Accuracy & Elo
        # 0 avg loss -> 100%
        # ~100 avg loss -> ~60%
        accuracy = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
        
        # Estimate Elo based slightly on accuracy
        # This is a fun heuristic metric
        estimated_elo = int(max(400, min(3600, 3600 - (avg_cpl * 20))))

        return AnalyzeResponse(
            accuracy=round(accuracy, 1),
            estimated_elo=estimated_elo,
            moves=analysis_results,
            counts=counts
        )
        
    except Exception as e:
        print(f"Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if engine:
            try:
                await engine.quit()
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces port is 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
