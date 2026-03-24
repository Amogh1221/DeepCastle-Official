from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import chess
import chess.engine
import asyncio
from typing import Optional

app = FastAPI(title="Deepcastle v7 Engine API")

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

@app.get("/")
def home():
    return {"status": "online", "engine": "Deepcastle v7 Hybrid Neural", "platform": "Hugging Face Spaces"}

@app.get("/health")
def health():
    if not os.path.exists(ENGINE_PATH):
        return {"status": "error", "message": "Engine binary not found"}
    return {"status": "ok", "engine": "Deepcastle v7"}

@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    if not os.path.exists(ENGINE_PATH):
        raise HTTPException(status_code=500, detail="Engine binary not found")

    engine = None
    try:
        # Start Engine
        transport, engine = await chess.engine.popen_uci(ENGINE_PATH)
        
        # Configure NNUE
        if os.path.exists(NNUE_PATH):
            try:
                await engine.configure({"EvalFile": NNUE_PATH})
                await engine.configure({"Hash": 512, "Threads": 2})
            except Exception:
                pass  # Non-fatal — engine still works without configs

        board = chess.Board(request.fen)
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        
        # Get best move
        result = await engine.play(board, limit)
        
        # Get analysis info for stats
        info = await engine.analyse(board, limit)
        
        # Extract score safely (handles centipawn + mate scores)
        score = 0.0
        if "score" in info:
            try:
                raw = info["score"].relative
                if raw.is_mate():
                    score = 100.0 if (raw.mate() or 0) > 0 else -100.0
                else:
                    score = (raw.score() or 0) / 100.0
            except Exception:
                score = 0.0

        depth = info.get("depth", 0)
        nodes = info.get("nodes", 0)
        nps = info.get("nps", 0)

        # Build PV safely — each PV move must be walked forward on a board copy
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
                break  # Stop at first illegal move; don't crash
        pv = " ".join(pv_parts)

        return MoveResponse(
            bestmove=result.move.uci(),
            score=score,
            depth=depth,
            nodes=nodes,
            nps=nps,
            pv=pv
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

if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces port is 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
