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

    try:
        # Start Engine
        transport, engine = await chess.engine.popen_uci(ENGINE_PATH)
        
        # Configure NNUE
        if os.path.exists(NNUE_PATH):
            await engine.configure({"EvalFile": NNUE_PATH})
            # Optimization for server environment
            await engine.configure({"Hash": 512, "Threads": 2})

        board = chess.Board(request.fen)
        
        # ANALYSIS FOR STATS + BEST MOVE
        limit = chess.engine.Limit(time=request.time, depth=request.depth)
        
        # Get result
        result = await engine.play(board, limit)
        
        # Get info for stats (analysing briefly to get score/pv)
        info_list = await engine.analyse(board, limit)
        info = info_list # analyse returns a list in async context if using multipv, but simple by default
        
        # Extract stats
        score = info["score"].relative.score(mate_score=10000) / 100.0 if "score" in info else 0.0
        depth = info.get("depth", 0)
        nodes = info.get("nodes", 0)
        nps = info.get("nps", 0)
        pv = " ".join([board.san(m) for m in info.get("pv", [])[:5]])
        
        await engine.quit()
        
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

if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces port is 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
