from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import os
import chess
import chess.engine
import re

app = FastAPI()

# Allow CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
ENGINE_PATH = os.environ.get("ENGINE_PATH", "../engine/deepcastle.exe")
NETWORK_BIG = os.environ.get("NETWORK_BIG", "../engine/nn-9a0cc2a62c52.nnue")
NETWORK_SMALL = os.environ.get("NETWORK_SMALL", "../engine/nn-47fc8b7fff06.nnue")

class MoveRequest(BaseModel):
    fen: str
    depth: int = 10

class MoveResponse(BaseModel):
    bestmove: str
    evaluation: float = 0.0

@app.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    if not os.path.exists(ENGINE_PATH):
        raise HTTPException(status_code=500, detail=f"Engine not found at {ENGINE_PATH}")

    try:
        # Popen UCI
        engine = chess.engine.SimpleEngine.popen_uci(os.path.abspath(ENGINE_PATH))
        
        # Configure NNUE
        engine.configure({
            "EvalFile": os.path.abspath(NETWORK_BIG),
            "EvalFileSmall": os.path.abspath(NETWORK_SMALL)
        })
        
        board = chess.Board(request.fen)
        result = engine.play(board, chess.engine.Limit(depth=request.depth))
        
        # Get evaluation
        info = engine.analyse(board, chess.engine.Limit(depth=request.depth))
        score = info["score"].relative.score(mate_score=10000) / 100.0
        
        engine.quit()
        
        return MoveResponse(
            bestmove=result.move.uci(),
            evaluation=score
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "online", "engine": "Deepcastle v7"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
