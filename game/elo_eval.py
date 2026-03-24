import chess.pgn
import math
import sys

def calculate_elo(target_pgn, baseline_elo=2000):
    wins, losses, draws = 0, 0, 0
    games = 0
    
    try:
        with open(target_pgn) as f:
            while True:
                game = chess.pgn.read_game(f)
                if game is None:
                    break
                
                result = game.headers["Result"]
                # Assume Engine 1 (DeepCastle) is "White" in every other game
                # Round 0: White(DeepCastle), Round 1: Black(DeepCastle)
                # For simplicity, search headers for "DeepCastle"
                is_white = game.headers["White"] == "DeepCastle"
                
                if result == "1-0":
                    if is_white: wins += 1
                    else: losses += 1
                elif result == "0-1":
                    if is_white: losses += 1
                    else: wins += 1
                elif result == "1/2-1/2":
                    draws += 1
                
                games += 1
    except FileNotFoundError:
        print(f"Error: {target_pgn} not found.")
        return

    if games == 0:
        print("No games found in PGN.")
        return

    score = (wins + 0.5 * draws) / games
    
    # Avoid log(0)
    if score >= 1.0: score = 0.999
    if score <= 0.0: score = 0.001
    
    # Elo Formula: dr = -400 * log10(1/score - 1)
    # This is the difference in rating (dr)
    dr = -400 * math.log10(1.0 / score - 1.0)
    final_elo = baseline_elo + dr
    
    print("-" * 30)
    print(f"Tournament Analysis: {games} Games")
    print("-" * 30)
    print(f"Wins:   {wins}")
    print(f"Losses: {losses}")
    print(f"Draws:  {draws}")
    print(f"Score:  {score*100:.1f}%")
    print("-" * 30)
    print(f"DeepCastle Elo: {int(final_elo)} (±{int(400/math.sqrt(games))})")
    print(f"(Baseline: {baseline_elo})")
    print("-" * 30)

if __name__ == "__main__":
    pgn_file = "tournament_results.pgn"
    if len(sys.argv) > 1:
        pgn_file = sys.argv[1]
    
    calculate_elo(pgn_file)
