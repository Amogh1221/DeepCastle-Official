import math
import chess
from typing import Optional, List, Tuple
import re

code = """
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
    alt_win_pct: float,
    fen_two_moves_ago: str,
    uci_next_two_moves: tuple,
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

    if diff < -20: return "Blunder"
    if diff < -10: return "Mistake"
    if diff < -5: return "Inaccuracy"
    if diff < -2: return "Good"
    return "Excellent"


@app.post("/analyze-game", response_model=AnalyzeResponse)
async def analyze_game(request: AnalyzeRequest):
    engine = None
    try:
        engine = await get_engine()
        board = chess.Board(request.start_fen) if request.start_fen else chess.Board()
        limit = chess.engine.Limit(time=request.time_per_move)
        
        analysis_results = []
        
        infos_before = await engine.analyse(board, limit, multipv=2)
        infos_before = infos_before if isinstance(infos_before, list) else [infos_before]
        
        counts = {
            "Brilliant": 0, "Great": 0, "Best": 0, 
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
                break # Invalid move, stop analysis here

            info_before = infos_before[0]
            win_pct_before = get_win_percentage(info_before)
            best_move_before = info_before.get("pv", [None])[0]
            
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
            
            infos_after = await engine.analyse(board, limit, multipv=2)
            infos_after = infos_after if isinstance(infos_after, list) else [infos_after]
            info_after = infos_after[0]
            
            win_pct_after = get_win_percentage(info_after)
            score_after, _ = get_normalized_score(info_after)
            current_score = score_after
            
            best_pv_after = info_after.get("pv", [])
            
            fen_two_moves_ago = None
            uci_next_two_moves = None
            if len(move_history) >= 2:
                fen_two_moves_ago = fen_history[-3]
                uci_next_two_moves = (move_history[-2], move_history[-1])

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
                cpl=cpl,
                score_before=score_before / 100.0,
                score_after=score_after / 100.0
            ))
            
            infos_before = infos_after

        avg_cpl = total_cpl / max(1, player_moves_count)
        accuracy = max(10.0, min(100.0, 100.0 * math.exp(-0.005 * avg_cpl)))
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
"""

with open("server/main.py", "r", encoding="utf-8") as f:
    orig = f.read()

import re
# The new code requires `import math` at the top
if 'import math' not in orig:
    orig = "import math\n" + orig

# Find the analyze_game route and replace it
def_start = orig.find('@app.post("/analyze-game"')
if def_start == -1:
    print("Could not find analyze_game route")
    exit(1)

def_end = orig.find('if __name__ == "__main__":', def_start)
if def_end == -1:
    def_end = len(orig)

new_content = orig[:def_start] + code + "\n\n" + orig[def_end:]

with open("server/main.py", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Successfully updated server/main.py")
