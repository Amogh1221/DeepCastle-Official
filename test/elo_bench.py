import os
import math
import random
import chess
import chess.engine
import chess.pgn
from datetime import datetime

# ============================================================
# CONFIGURATION
# ============================================================

# Paths to the engines
DEEPCASTLE_EXE = os.path.abspath("../engine/deepcastle.exe")
STOCKFISH_EXE = os.path.abspath("../game/stockfish-windows-x86-64-avx2.exe")

# NNUE Network Paths
# NOTE: Official Stockfish networks that are compatible with the engine source
SF_BIG_NET   = os.path.abspath("../engine/nn-9a0cc2a62c52.nnue")
SF_SMALL_NET = os.path.abspath("../engine/nn-47fc8b7fff06.nnue")

# Your custom network (if it fails, the engine might crash)
CUSTOM_NET   = os.path.abspath("../../../nnue-pytorch/output.nnue")

# Tournament Settings
NUM_GAMES = 20
TIME_CONTROL = 0.5  # Seconds per move
CONCURRENCY = 1     # Increase for faster matches if your system has many cores
OUTPUT_PGN = f"elo_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pgn"

# ============================================================
# LOGIC
# ============================================================

def calculate_elo_diff(w, l, d):
    total = w + l + d
    if total == 0: return 0
    score = (w + 0.5 * d) / total
    if score >= 1.0: return 800
    if score <= 0.0: return -800
    return round(-400 * math.log10(1 / score - 1), 2)

def play_game(idx):
    # Determine who is white
    dc_is_white = (idx % 2 == 0)
    
    # Openings to variety
    board = chess.Board()
    # Randomly shuffle some early moves if desired
    
    try:
        # Start engines
        dc_engine = chess.engine.SimpleEngine.popen_uci(DEEPCASTLE_EXE)
        # Configure Deepcastle
        # Use official nets for stability. Swap SF_SMALL_NET with CUSTOM_NET to test your brain!
        dc_engine.configure({
            "EvalFile": SF_BIG_NET,
            "EvalFileSmall": SF_SMALL_NET 
        })
        
        sf_engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_EXE)
        
        game = chess.pgn.Game()
        game.headers["Event"] = "Deepcastle Elo Test"
        game.headers["White"] = "Deepcastle" if dc_is_white else "Stockfish"
        game.headers["Black"] = "Stockfish" if dc_is_white else "Deepcastle"
        
        while not board.is_game_over():
            curr_engine = dc_engine if (board.turn == chess.WHITE) == dc_is_white else sf_engine
            result = curr_engine.play(board, chess.engine.Limit(time=TIME_CONTROL))
            board.push(result.move)
            
        dc_engine.quit()
        sf_engine.quit()
        
        res = board.result()
        if res == "1-0":
            return 1 if dc_is_white else -1
        elif res == "0-1":
            return 1 if not dc_is_white else -1
        else:
            return 0
            
    except Exception as e:
        print(f"Game {idx} Error: {e}")
        return None

def main():
    print("--------------------------------------------------")
    print("Welcome to the Deepcastle Elo Benchmark!")
    print(f"Deepcastle Path: {DEEPCASTLE_EXE}")
    print(f"Stockfish Path: {STOCKFISH_EXE}")
    print("--------------------------------------------------")
    
    if not os.path.exists(DEEPCASTLE_EXE):
        print(f"ERROR: Could not find {DEEPCASTLE_EXE}. Please run engine/build.bat first!")
        return

    wins, losses, draws = 0, 0, 0
    
    for i in range(NUM_GAMES):
        print(f"Starting Game {i+1}/{NUM_GAMES}... ", end="", flush=True)
        result = play_game(i)
        
        if result == 1:
            wins += 1
            print("Win")
        elif result == -1:
            losses += 1
            print("Loss")
        elif result == 0:
            draws += 1
            print("Draw")
        else:
            print("Crashed/Error")
            
    print("--------------------------------------------------")
    print("Tournament Final Score:")
    print(f"Wins: {wins} | Losses: {losses} | Draws: {draws}")
    
    elo = calculate_elo_diff(wins, losses, draws)
    print(f"Estimated Elo Difference: {elo:+} relative to Stockfish")
    print("--------------------------------------------------")

if __name__ == "__main__":
    main()
