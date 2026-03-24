import chess
import chess.engine
import chess.pgn
import time
import os
import random
import math

# ==================== CONFIGURATION ====================
ENGINE_1_PATH = r"..\engine\deepcastle.exe"
ENGINE_2_PATH = r".\stockfish-windows-x86-64-avx2.exe"  # Change this to your baseline engine

NETWORK_BIG   = r"..\engine\nn-9a0cc2a62c52.nnue"
NETWORK_SMALL = r"..\..\nnue-pytorch\output.nnue"

GAMES_TO_PLAY = 20
TIME_LIMIT    = 0.1  # 0.1 seconds per move for a quick benchmark
OUTPUT_PGN    = "tournament_results.pgn"

# Use common starting moves to keep games diverse
OPENINGS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", # Start
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", # 1. e4 e5
    "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2", # 1. d4 d5
    "rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 2", # 1. c4 e5
    "rnbqkbnr/pppppppp/8/8/5N2/8/PPPPPPPP/RNBQKB1R b KQkq - 1 1", # 1. Nf3
]

def calculate_elo(wins, losses, draws):
    total = wins + losses + draws
    if total == 0: return 0.0
    
    score = (wins + (draws * 0.5)) / total
    if score == 1.0: return float('inf')
    if score == 0.0: return float('-inf')
    
    # Standard Elo logistic curve formula
    diff = -400 * math.log10(1 / score - 1)
    return diff

def main():
    if not os.path.exists(ENGINE_1_PATH):
        print(f"Error: Deepcastle engine not found at {ENGINE_1_PATH}.")
        return
        
    print(f"Starting Elo Benchmark: {GAMES_TO_PLAY} games at {TIME_LIMIT}s/move...")
    
    # Configure Deepcastle with its NNUE files
    options = {}
    if os.path.exists(NETWORK_BIG) and os.path.exists(NETWORK_SMALL):
        options["EvalFile"] = os.path.abspath(NETWORK_BIG)
        options["EvalFileSmall"] = os.path.abspath(NETWORK_SMALL)
        print("Successfully loaded NNUE Networks into Deepcastle!")
    else:
        print("Warning: Network files missing. Make sure your Eval files are present!")
    
    e1 = chess.engine.SimpleEngine.popen_uci(os.path.abspath(ENGINE_1_PATH))
    e1.configure(options)
    
    e2 = None
    if os.path.exists(ENGINE_2_PATH):
        e2 = chess.engine.SimpleEngine.popen_uci(ENGINE_2_PATH)
    else:
        print(f"Error: Baseline Stockfish not found at {ENGINE_2_PATH}!")
        e1.quit()
        return

    wins, losses, draws = 0, 0, 0

    with open(OUTPUT_PGN, "w") as f_pgn:
        for i in range(GAMES_TO_PLAY):
            board = chess.Board(OPENINGS[i % len(OPENINGS)])
            game = chess.pgn.Game()
            is_dc_white = (i % 2 == 0)
            
            game.headers["Event"] = "DeepCastle Elo Benchmark"
            game.headers["White"] = "Deepcastle" if is_dc_white else "Stockfish"
            game.headers["Black"] = "Stockfish" if is_dc_white else "Deepcastle"
            print(f"\rPlaying Game {i+1}/{GAMES_TO_PLAY} ({game.headers['White']} vs {game.headers['Black']})...", end="")

            node = game
            while not board.is_game_over():
                is_dc_turn = (board.turn == chess.WHITE and is_dc_white) or (board.turn == chess.BLACK and not is_dc_white)
                current_engine = e1 if is_dc_turn else e2
                
                try:
                    result = current_engine.play(board, chess.engine.Limit(time=TIME_LIMIT))
                    board.push(result.move)
                    node = node.add_main_variation(result.move)
                except Exception as e:
                    print(f"\nEngine crashed: {e}")
                    break
            
            result_str = board.result()
            game.headers["Result"] = result_str
            
            if result_str == "1-0":
                if is_dc_white: wins += 1
                else: losses += 1
            elif result_str == "0-1":
                if not is_dc_white: wins += 1
                else: losses += 1
            elif result_str == "1/2-1/2":
                draws += 1
                
            f_pgn.write(str(game) + "\n\n")
            f_pgn.flush()
    
    e1.quit()
    e2.quit()
    
    print("\n---------------------------------------------------------")
    print("Tournament Complete!")
    print(f"Deepcastle Record: {wins} Wins | {losses} Losses | {draws} Draws")
    
    elo_diff = calculate_elo(wins, losses, draws)
    if elo_diff == float('inf'):
        print(f"Estimated Elo diff: Deepcastle is FAR SUPERIOR (>+800 Elo) to baseline!")
    elif elo_diff == float('-inf'):
        print(f"Estimated Elo diff: Deepcastle is severely trailing (<-800 Elo) baseline.")
    else:
        print(f"Estimated Elo diff: {elo_diff:+.1f} Elo (compared to baseline)")
    print("---------------------------------------------------------")

if __name__ == "__main__":
    main()
