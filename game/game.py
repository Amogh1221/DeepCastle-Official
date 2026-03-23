import pygame
import chess
import random
import sys
import math
import threading
import time
import traceback
from deepcastle import DeepCastle

# ==================== CONFIG ====================
BASE_WIDTH, BASE_HEIGHT = 1200, 850
BOARD_SIZE = 640
SQ_SIZE = BOARD_SIZE // 8

# Premium Color Palette (Chess.com Inspired)
LIGHT_SQUARE    = (238, 238, 210)
DARK_SQUARE     = (118, 150, 86)
ACCENT          = (129, 182, 76)  # Chess.com Green
ACCENT_HOVER    = (149, 202, 96)
BG_COLOR        = (49, 46, 43)    # Dark Charcoal
CARD_COLOR      = (38, 37, 34)    # Slightly darker but richer
TEXT_COLOR      = (255, 255, 255)
SECONDARY_TEXT  = (186, 184, 182)
HIGHLIGHT_COLOR = (246, 246, 105, 180) # Semi-transparent yellow
LEGAL_MOVE_COLOR= (0, 0, 0, 25)        # Subtle circle
CHECK_COLOR     = (255, 100, 100)
MOVE_HISTORY_BG = (38, 37, 34)
BORDER_COLOR    = (60, 58, 55)

MENU, GAME, SETTINGS = 0, 1, 2

# ==================== INIT ====================
pygame.init()
screen = pygame.display.set_mode((BASE_WIDTH, BASE_HEIGHT), pygame.RESIZABLE)
pygame.display.set_caption("DeepCastle Chess Engine")
clock = pygame.time.Clock()

font_title  = pygame.font.SysFont("arial", 56, bold=True)
font_large  = pygame.font.SysFont("arial", 32, bold=True)
font_medium = pygame.font.SysFont("arial", 24)
font_small  = pygame.font.SysFont("arial", 18)
font_tiny   = pygame.font.SysFont("arial", 14)

# ==================== GAME STATE ====================
game_state   = MENU
player_color = chess.WHITE
board        = chess.Board()

bot              = None
play_vs_bot      = False
bot_depth        = 3                 # iterative deepening max depth
bot_time_limit   = 10.0               # seconds per move
bot_thinking     = False
bot_move_result  = None
bot_thread       = None
bot_think_time   = 0.0
bot_nodes        = 0

selected_square   = None
dragging          = False
dragged_piece     = None
legal_targets     = []
promotion_pending = None
game_over         = False
winner_text       = ""
move_history      = []
last_move         = None

show_eval_bar     = True
current_eval      = 0.0  # + = White advantage, - = Black
eval_lerp         = 0.5  # For smooth animation (0.0=Black, 1.0=White)

entering_depth    = False
depth_input_text  = "3"
selecting_version = False

# ==================== LOAD PIECES ====================
try:
    sprite   = pygame.image.load("pieces.png").convert_alpha()
    ROWS, COLS = 2, 6
    sprite_w = sprite.get_width()  // COLS
    sprite_h = sprite.get_height() // ROWS

    pieces      = {}
    piece_order = [chess.KING, chess.QUEEN, chess.BISHOP,
                   chess.KNIGHT, chess.ROOK, chess.PAWN]

    for row in range(ROWS):
        for col in range(COLS):
            rect  = pygame.Rect(col*sprite_w, row*sprite_h, sprite_w, sprite_h)
            img   = sprite.subsurface(rect)
            img   = pygame.transform.smoothscale(img, (SQ_SIZE, SQ_SIZE))
            color = chess.WHITE if row == 0 else chess.BLACK
            pieces[(piece_order[col], color)] = img
except Exception:
    print("Warning: pieces.png not found. Using text pieces.")
    pieces = None

# ==================== UTILITY ====================
def get_window_size():
    return screen.get_width(), screen.get_height()

def get_board_offset():
    w, h = get_window_size()
    return 70, (h - BOARD_SIZE) // 2

def flip_coords(col, row):
    if player_color == chess.BLACK:
        col = 7 - col
        row = 7 - row
    return col, row

def get_square_from_mouse(pos):
    bx, by = get_board_offset()
    mx, my = pos
    if not (bx <= mx <= bx + BOARD_SIZE and by <= my <= by + BOARD_SIZE):
        return None
    col = (mx - bx) // SQ_SIZE
    row = (my - by) // SQ_SIZE
    col, row = flip_coords(col, row)
    return chess.square(col, 7 - row)

def format_move(move):
    return board.san(move) if move in board.legal_moves else str(move)

# ==================== DRAWING ====================
def draw_board():
    bx, by = get_board_offset()
    for r in range(8):
        for c in range(8):
            dc, dr = flip_coords(c, r)
            color  = LIGHT_SQUARE if (dc + dr) % 2 == 0 else DARK_SQUARE
            pygame.draw.rect(screen, color,
                             pygame.Rect(bx + dc*SQ_SIZE, by + dr*SQ_SIZE, SQ_SIZE, SQ_SIZE))
    for i in range(8):
        fl = chr(ord('a') + (i if player_color == chess.WHITE else 7 - i))
        screen.blit(font_tiny.render(fl, True, TEXT_COLOR),
                    (bx + i*SQ_SIZE + SQ_SIZE - 15, by + BOARD_SIZE + 5))
        rn = str(8 - i if player_color == chess.WHITE else i + 1)
        screen.blit(font_tiny.render(rn, True, TEXT_COLOR),
                    (bx - 20, by + i*SQ_SIZE + 5))

def draw_last_move():
    if last_move:
        bx, by = get_board_offset()
        surf   = pygame.Surface((SQ_SIZE, SQ_SIZE), pygame.SRCALPHA)
        surf.fill((255, 255, 0, 50))
        for sq in [last_move.from_square, last_move.to_square]:
            col = chess.square_file(sq)
            row = 7 - chess.square_rank(sq)
            col, row = flip_coords(col, row)
            screen.blit(surf, (bx + col*SQ_SIZE, by + row*SQ_SIZE))

def draw_legal_moves():
    bx, by = get_board_offset()
    for sq in legal_targets:
        col = chess.square_file(sq)
        row = 7 - chess.square_rank(sq)
        col, row = flip_coords(col, row)
        cx = bx + col*SQ_SIZE + SQ_SIZE // 2
        cy = by + row*SQ_SIZE + SQ_SIZE // 2
        if board.piece_at(sq):
            pygame.draw.circle(screen, LEGAL_MOVE_COLOR[:3], (cx, cy), SQ_SIZE//2 - 5, 4)
        else:
            pygame.draw.circle(screen, LEGAL_MOVE_COLOR[:3], (cx, cy), 12)

def draw_check():
    if board.is_check():
        bx, by   = get_board_offset()
        king_sq  = board.king(board.turn)
        col      = chess.square_file(king_sq)
        row      = 7 - chess.square_rank(king_sq)
        col, row = flip_coords(col, row)
        alpha    = int((math.sin(pygame.time.get_ticks()*0.005)+1)/2*150 + 50)
        surf     = pygame.Surface((SQ_SIZE, SQ_SIZE), pygame.SRCALPHA)
        surf.fill((255, 0, 0, alpha))
        screen.blit(surf, (bx + col*SQ_SIZE, by + row*SQ_SIZE))

def draw_pieces(mouse_pos=None):
    bx, by = get_board_offset()
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece:
            if dragging and sq == selected_square:
                continue
            col = chess.square_file(sq)
            row = 7 - chess.square_rank(sq)
            col, row = flip_coords(col, row)
            if pieces:
                screen.blit(pieces[(piece.piece_type, piece.color)],
                            (bx + col*SQ_SIZE, by + row*SQ_SIZE))
            else:
                color = (255, 255, 255) if piece.color == chess.WHITE else (0, 0, 0)
                screen.blit(font_large.render(piece.symbol().upper(), True, color),
                            (bx + col*SQ_SIZE + 20, by + row*SQ_SIZE + 20))

    if dragging and dragged_piece and pieces:
        img  = pieces[(dragged_piece.piece_type, dragged_piece.color)]
        x, y = mouse_pos
        screen.blit(img, (x - SQ_SIZE//2, y - SQ_SIZE//2))

def draw_button(rect, text, hover_color=None):
    mouse_pos = pygame.mouse.get_pos()
    is_hover  = rect.collidepoint(mouse_pos)
    color     = (hover_color or ACCENT_HOVER) if is_hover else ACCENT
    pygame.draw.rect(screen, color, rect, border_radius=10)
    label     = font_medium.render(text, True, TEXT_COLOR)
    screen.blit(label, label.get_rect(center=rect.center))
    return is_hover

def draw_side_panel():
    w, h    = get_window_size()
    bx, by  = get_board_offset()
    panel_x = bx + BOARD_SIZE + 35
    panel_w = w - panel_x - 35

    # --- TOP CARD: BOT / STATUS ---
    top_card_h = 160
    pygame.draw.rect(screen, CARD_COLOR, (panel_x, 30, panel_w, top_card_h), border_radius=12)
    pygame.draw.rect(screen, BORDER_COLOR, (panel_x, 30, panel_w, top_card_h), 2, border_radius=12)

    # Bot Avatar
    avatar_rect = pygame.Rect(panel_x + 20, 50, 60, 60)
    pygame.draw.ellipse(screen, BORDER_COLOR, avatar_rect)
    bot_label = font_medium.render("DC", True, ACCENT)
    screen.blit(bot_label, bot_label.get_rect(center=avatar_rect.center))

    # Bot Title
    screen.blit(font_large.render("DeepCastle v7", True, TEXT_COLOR), (panel_x + 95, 52))
    screen.blit(font_tiny.render("Neural Engine • 2.7M NPS", True, SECONDARY_TEXT), (panel_x + 95, 88))

    # Thinking Status
    if bot_thinking:
        dots = "." * (int(time.time() * 2) % 4)
        status_text = f"Thinking{dots}"
        screen.blit(font_small.render(status_text, True, ACCENT), (panel_x + 95, 115))
    else:
        status_text = "Your move" if not game_over else "Game Over"
        screen.blit(font_small.render(status_text, True, SECONDARY_TEXT), (panel_x + 95, 115))

    # Eval Toggle
    eval_btn = pygame.Rect(panel_x + panel_w - 75, 45, 60, 30)
    draw_button(eval_btn, "Eval" if show_eval_bar else "Off", 
               ACCENT if show_eval_bar else BORDER_COLOR)

    # --- MOVE HISTORY ---
    history_y = 210
    history_h = 400
    pygame.draw.rect(screen, CARD_COLOR, (panel_x, history_y, panel_w, history_h), border_radius=12)
    pygame.draw.rect(screen, BORDER_COLOR, (panel_x, history_y, panel_w, history_h), 2, border_radius=12)

    # Header
    header_rect = pygame.Rect(panel_x, history_y, panel_w, 45)
    pygame.draw.rect(screen, BORDER_COLOR, header_rect, border_top_left_radius=12, border_top_right_radius=12)
    label = font_medium.render("Move History", True, TEXT_COLOR)
    screen.blit(label, (panel_x + 15, history_y + 10))

    # List of moves (Chess.com Style: 1. e4 c5)
    mv_y = history_y + 60
    h_list = list(move_history)
    pairs = []
    for j in range(0, len(h_list), 2):
        w_mv = h_list[j]
        b_mv = h_list[j+1] if j+1 < len(h_list) else ""
        pairs.append((w_mv, b_mv))

    shown_pairs = pairs[-14:]
    s_idx = len(pairs) - len(shown_pairs)
    for k, pair_tuple in enumerate(shown_pairs):
        p_w, p_b = pair_tuple
        num_txt = font_small.render(f"{s_idx + k + 1}.", True, SECONDARY_TEXT)
        screen.blit(num_txt, (panel_x + 15, mv_y))
        screen.blit(font_small.render(str(p_w), True, TEXT_COLOR), (panel_x + 60, mv_y))
        if p_b:
            screen.blit(font_small.render(str(p_b), True, TEXT_COLOR), (panel_x + 155, mv_y))
        mv_y += 24

    # --- BOTTOM CONTROLS ---
    button_y  = history_y + history_h + 20
    btn_w     = (panel_w - 15) // 2
    undo_btn  = pygame.Rect(panel_x,           button_y, btn_w, 50)
    ng_btn    = pygame.Rect(panel_x + btn_w + 15, button_y, btn_w, 50)
    menu_btn  = pygame.Rect(panel_x,           button_y + 70, panel_w, 50)

    draw_button(undo_btn, "↶ Undo", BORDER_COLOR)
    draw_button(ng_btn,   "+ New", BORDER_COLOR)
    draw_button(menu_btn, "Home Menu", CARD_COLOR)

    return undo_btn, ng_btn, menu_btn, eval_btn

def draw_eval_bar():
    if not show_eval_bar: return
    bx, by = get_board_offset()
    ex, ew = bx - 45, 30
    eh = BOARD_SIZE
    
    # BG
    pygame.draw.rect(screen, (0, 0, 0), (ex, by, ew, eh), border_radius=4)
    pygame.draw.rect(screen, BORDER_COLOR, (ex, by, ew, eh), 2, border_radius=4)

    # Sigmoid like mapping for evaluation bar heights
    # Map CP to 0.0-1.0 range
    def cp_to_scale(cp):
        # We want +1.0 to be ~60%, +3.0 to be ~80%, +10.0 to be ~95%
        # A simple linear clamp for now
        v = (cp / 100.0)
        return 0.5 + 0.5 * (math.atan(v / 4.0) / (math.pi/2))

    global current_eval, eval_lerp
    target_scale = cp_to_scale(current_eval)
    eval_lerp += (target_scale - eval_lerp) * 0.05 # Smoothing
    
    wh = int(eh * eval_lerp)
    if wh > 0:
        pygame.draw.rect(screen, (240, 240, 240), (ex, by + eh - wh, ew, wh), border_radius=4)

    # Label
    label_txt = f"{abs(current_eval/100.0):.1f}"
    if abs(current_eval) > 8000: # Mate
        mate_dist = (10000 - abs(current_eval))
        label_txt = f"M{mate_dist}"
        
    color = (0, 0, 0) if eval_lerp > 0.5 else (255, 255, 255)
    lab = font_tiny.render(label_txt, True, color)
    lx = ex + ew//2 - lab.get_width()//2
    ly = by + eh - 20 if eval_lerp > 0.5 else by + 5
    screen.blit(lab, (lx, ly))

def draw_board():
    bx, by = get_board_offset()
    pygame.draw.rect(screen, BORDER_COLOR, (bx-4, by-4, BOARD_SIZE+8, BOARD_SIZE+8), border_radius=4)
    for r in range(8):
        for c in range(8):
            dc, dr = flip_coords(c, r)
            color  = LIGHT_SQUARE if (dc + dr) % 2 == 0 else DARK_SQUARE
            pygame.draw.rect(screen, color, pygame.Rect(bx + dc*SQ_SIZE, by + dr*SQ_SIZE, SQ_SIZE, SQ_SIZE))
            if dc == 0:
                rn = str(8 - dr if player_color == chess.WHITE else dr + 1)
                txt = font_tiny.render(rn, True, DARK_SQUARE if (dc + dr) % 2 == 0 else LIGHT_SQUARE)
                screen.blit(txt, (bx + 5, by + dr*SQ_SIZE + 5))
            if dr == 7:
                fl = chr(ord('a') + (dc if player_color == chess.WHITE else 7 - dc))
                txt = font_tiny.render(fl, True, DARK_SQUARE if (dc + dr) % 2 == 0 else LIGHT_SQUARE)
                screen.blit(txt, (bx + dc*SQ_SIZE + SQ_SIZE - 15, by + dr*SQ_SIZE + SQ_SIZE - 18))

def draw_last_move():
    if last_move:
        bx, by = get_board_offset()
        for sq in [last_move.from_square, last_move.to_square]:
            c, r = flip_coords(chess.square_file(sq), 7 - chess.square_rank(sq))
            surf = pygame.Surface((SQ_SIZE, SQ_SIZE), pygame.SRCALPHA)
            surf.fill(HIGHLIGHT_COLOR)
            screen.blit(surf, (bx + c*SQ_SIZE, by + r*SQ_SIZE))

def draw_check():
    if board.is_check():
        bx, by   = get_board_offset()
        king_sq  = board.king(board.turn)
        c, r     = flip_coords(chess.square_file(king_sq), 7 - chess.square_rank(king_sq))
        # Pulsing Glow
        alpha = int(100 + 100 * math.sin(time.time() * 8))
        glow = pygame.Surface((SQ_SIZE, SQ_SIZE), pygame.SRCALPHA)
        pygame.draw.rect(glow, (255, 0, 0, alpha), (0, 0, SQ_SIZE, SQ_SIZE), border_radius=4)
        screen.blit(glow, (bx + c*SQ_SIZE, by + r*SQ_SIZE))

def draw_menu():
    screen.fill(BG_COLOR)
    w, h = get_window_size()
    
    # Title Section
    title_rect = pygame.Rect(w//2 - 300, h//6, 600, 150)
    title    = font_title.render("DEEPCASTLE", True, ACCENT)
    subtitle = font_medium.render("The Neural Chess Powerhouse", True, SECONDARY_TEXT)
    screen.blit(title, (w//2 - title.get_width()//2, h//6))
    screen.blit(subtitle, (w//2 - subtitle.get_width()//2, h//6 + 70))

    # Decorative Line
    pygame.draw.line(screen, BORDER_COLOR, (w//2 - 100, h//6 + 110), (w//2 + 100, h//6 + 110), 2)

    bw, bh = 420, 60
    bx     = w//2 - bw//2
    sy     = h//2 - 60
    options = ["Analyze with DeepCastle v7",
               "Local Prototype (White)",
               "Local Prototype (Black)",
               "Custom Setup"]
    buttons = []
    for i, text in enumerate(options):
        btn = pygame.Rect(bx, sy + i*75, bw, bh)
        draw_button(btn, text, CARD_COLOR if i > 0 else ACCENT_HOVER)
        buttons.append(btn)

    footer = font_small.render(
        f"Build 2026.03.23  •  Engine: PVS 2.7M NPS  •  Network: HalfKAv2",
        True, BORDER_COLOR
    )
    screen.blit(footer, (w//2 - footer.get_width()//2, h - 40))
    return buttons

def draw_version_selector():
    w, h = get_window_size()
    overlay = pygame.Surface((w, h), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    screen.blit(overlay, (0, 0))

    dw, dh = 520, 380
    dialog  = pygame.Rect(w//2 - dw//2, h//2 - dh//2, dw, dh)
    pygame.draw.rect(screen, CARD_COLOR, dialog, border_radius=15)

    screen.blit(font_large.render("Engine Settings", True, TEXT_COLOR),
                (dialog.centerx - font_large.render("Engine Settings", True, TEXT_COLOR).get_width()//2,
                 dialog.y + 25))

    # NNUE info
    info1 = font_medium.render("DeepCastle v7 — HalfKAv2_hm^ NNUE", True, ACCENT)
    screen.blit(info1, (dialog.centerx - info1.get_width()//2, dialog.y + 85))
    info2 = font_small.render("400 epochs · gensfen depth-9 · 10B positions", True, TEXT_COLOR)
    screen.blit(info2, (dialog.centerx - info2.get_width()//2, dialog.y + 120))

    screen.blit(font_medium.render(f"Think Time: {bot_time_limit:.1f}s per move", True, TEXT_COLOR),
                (dialog.centerx - 120, dialog.y + 175))
    screen.blit(font_small.render("← → keys to adjust time (1-30s)", True, TEXT_COLOR),
                (dialog.centerx - 110, dialog.y + 210))

    feat = font_tiny.render(
        "PVS + Iterative Deepening + LMR + Null Move + TT + Killers + History",
        True, (150, 200, 150)
    )
    screen.blit(feat, (dialog.centerx - feat.get_width()//2, dialog.y + 278))

    start_btn = pygame.Rect(dialog.centerx - 100, dialog.y + 310, 200, 45)
    draw_button(start_btn, "Start Game")
    # return dummy rects for v1/v2 (unused) + start
    return pygame.Rect(0,0,0,0), pygame.Rect(0,0,0,0), start_btn

def draw_promotion_dialog():
    bx, by = get_board_offset()
    overlay = pygame.Surface((BOARD_SIZE, BOARD_SIZE), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 160))
    screen.blit(overlay, (bx, by))
    
    # Dialog Box
    dw, dh = 460, 180
    dialog = pygame.Rect(bx + BOARD_SIZE//2 - dw//2, by + BOARD_SIZE//2 - dh//2, dw, dh)
    pygame.draw.rect(screen, CARD_COLOR, dialog, border_radius=15)
    pygame.draw.rect(screen, BORDER_COLOR, dialog, 2, border_radius=15)
    
    label = font_medium.render("Promote Your Pawn", True, TEXT_COLOR)
    screen.blit(label, (dialog.centerx - label.get_width()//2, dialog.y + 20))
    
    promote_pieces = [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]
    buttons = []
    for i, pt in enumerate(promote_pieces):
        btn = pygame.Rect(dialog.x + 30 + i*110, dialog.y + 65, 85, 85)
        is_hover = btn.collidepoint(pygame.mouse.get_pos())
        pygame.draw.rect(screen, BORDER_COLOR if is_hover else CARD_COLOR, btn, border_radius=10)
        if pieces:
            p_img = pieces[(pt, board.turn)]
            scaled = pygame.transform.smoothscale(p_img, (75, 75))
            screen.blit(scaled, (btn.x + 5, btn.y + 5))
        buttons.append((btn, pt))
    return buttons

def draw_game_over_dialog():
    w, h    = get_window_size()
    overlay = pygame.Surface((w, h), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    screen.blit(overlay, (0, 0))
    result  = font_title.render(winner_text, True, ACCENT)
    screen.blit(result, (w//2 - result.get_width()//2, h//2 - 100))
    ng_btn  = pygame.Rect(w//2 - 150, h//2,      300, 55)
    mn_btn  = pygame.Rect(w//2 - 150, h//2 + 70, 300, 55)
    draw_button(ng_btn, "New Game")
    draw_button(mn_btn, "Main Menu")
    return ng_btn, mn_btn

# ==================== GAME LOGIC ====================
def start_game(color, vs_bot):
    global game_state, player_color, board, play_vs_bot, bot
    global game_over, winner_text, move_history, last_move, bot_thinking

    game_state   = GAME
    player_color = color
    board.reset()
    play_vs_bot  = vs_bot
    game_over    = False
    winner_text  = ""
    move_history = []
    last_move    = None
    bot_thinking = False

    if vs_bot:
        if bot is None:
            bot = DeepCastle()
        else:
            bot.tt_clear()

def play_vs_bot_action():
    global selecting_version
    selecting_version = True

def bot_think_worker(board_copy, depth, time_lim, is_bg=False):
    global bot_move_result, bot_think_time, bot_nodes
    try:
        if bot:
            bot_move_result = bot.select_move(board_copy, depth=depth, time_limit=time_lim, is_background=is_bg)
            bot_think_time  = float(bot.think_time)
            bot_nodes       = int(bot.nodes)
            global current_eval
            current_eval    = float(bot.last_score)
    except Exception as e:
        import traceback, random
        traceback.print_exc()
        moves = list(board_copy.legal_moves)
        bot_move_result = random.choice(moves) if moves else None

def make_move(move):
    global last_move, bot_thinking, bot_move_result, bot_think_time
    global game_over, winner_text

    if move in board.legal_moves:
        move_history.append(format_move(move))
        board.push(move)
        last_move = move

        if board.is_checkmate():
            game_over   = True
            winner_text = "Black Wins!" if board.turn == chess.WHITE else "White Wins!"
        elif board.is_stalemate() or board.is_insufficient_material():
            game_over   = True
            winner_text = "Draw!"
        elif board.can_claim_fifty_moves():
            game_over   = True
            winner_text = "Draw by 50-move rule!"
        elif board.can_claim_threefold_repetition():
            game_over   = True
            winner_text = "Draw by repetition!"

        if not game_over:
            if play_vs_bot and board.turn != player_color:
                bot_thinking    = True
                bot_move_result = None
                bot_think_time  = 0.0
                board_copy      = board.copy()
                threading.Thread(
                    target=bot_think_worker,
                    args=(board_copy, bot_depth, bot_time_limit),
                    daemon=True
                ).start()
            elif show_eval_bar:
                # Background eval for player's turn
                board_copy = board.copy()
                threading.Thread(
                    target=bot_think_worker,
                    args=(board_copy, 1, 0.5, True), # Fast background eval
                    daemon=True
                ).start()

# ==================== MAIN LOOP ====================
running = True
while running:
    clock.tick(60)

    if game_state == MENU:
        if selecting_version:
            draw_menu()
            v1_btn, v2_btn, start_btn = draw_version_selector()
        else:
            menu_buttons = draw_menu()

    elif game_state == GAME:
        screen.fill(BG_COLOR)
        draw_board()
        draw_eval_bar()
        draw_last_move()
        draw_check()
        draw_legal_moves()
        draw_pieces(pygame.mouse.get_pos())
        undo_btn, new_game_btn, menu_btn, eval_btn = draw_side_panel()

        if promotion_pending:
            promo_buttons = draw_promotion_dialog()
        if game_over:
            game_over_new_btn, game_over_menu_btn = draw_game_over_dialog()

        # Apply bot move when ready
        if bot_thinking and bot_move_result is not None:
            legal = {m.uci(): m for m in board.legal_moves}
            uci   = bot_move_result.uci() if hasattr(bot_move_result, "uci") else str(bot_move_result)
            if uci in legal:
                make_move(legal[uci])
            bot_thinking    = False
            bot_move_result = None

    # ==================== EVENTS ====================
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_F11:
                pygame.display.toggle_fullscreen()
            if selecting_version:
                # Use current value to help Pyre understand it's a number
                curr_time = float(bot_time_limit)
                if event.key == pygame.K_LEFT:
                    bot_time_limit = max(1.0, curr_time - 1.0)
                elif event.key == pygame.K_RIGHT:
                    bot_time_limit = min(30.0, curr_time + 1.0)

        if event.type == pygame.MOUSEBUTTONDOWN:
            mouse_pos = event.pos

            if game_state == MENU:
                if selecting_version:
                    if start_btn.collidepoint(mouse_pos):
                        try:
                            # Explicitly cast to int to avoid lint issues
                            entered_val = int(depth_input_text)
                            bot_depth = max(1, min(10, entered_val))
                        except Exception:
                            bot_depth = 5
                        selecting_version = False
                        bot = None  # force reload
                        start_game(chess.WHITE, True)
                else:
                    actions = [
                        play_vs_bot_action,
                        lambda: start_game(chess.WHITE, False),
                        lambda: start_game(chess.BLACK, False),
                        lambda: start_game(random.choice([chess.WHITE, chess.BLACK]), False),
                    ]
                    for i, btn in enumerate(menu_buttons):
                        if btn.collidepoint(mouse_pos):
                            actions[i]()
                            break

            elif game_state == GAME:
                if (play_vs_bot and board.turn != player_color) or bot_thinking:
                    continue

                if undo_btn.collidepoint(mouse_pos):
                    if board.move_stack:
                        board.pop()
                        if play_vs_bot and board.move_stack:
                            board.pop()
                        if move_history:
                            move_history.pop()
                        game_over         = False
                        promotion_pending = None
                        last_move         = board.peek() if board.move_stack else None
                    continue

                if new_game_btn.collidepoint(mouse_pos):
                    start_game(player_color, play_vs_bot)
                    continue

                if menu_btn.collidepoint(mouse_pos):
                    game_state        = MENU
                    selecting_version = False
                    continue

                if game_state == GAME and eval_btn.collidepoint(mouse_pos):
                    show_eval_bar = not show_eval_bar
                    continue

                if game_over:
                    if game_over_new_btn.collidepoint(mouse_pos):
                        start_game(player_color, play_vs_bot)
                    elif game_over_menu_btn.collidepoint(mouse_pos):
                        game_state        = MENU
                        selecting_version = False
                    continue

                if promotion_pending:
                    for btn_rect, pt in promo_buttons:
                        if btn_rect.collidepoint(mouse_pos):
                            make_move(chess.Move(promotion_pending[0],
                                                 promotion_pending[1],
                                                 promotion=pt))
                            promotion_pending = None
                            break
                    continue

                sq = get_square_from_mouse(mouse_pos)
                if sq is not None:
                    piece = board.piece_at(sq)
                    if piece and piece.color == board.turn:
                        selected_square = sq
                        dragged_piece   = piece
                        dragging        = True
                        legal_targets   = [m.to_square for m in board.legal_moves
                                           if m.from_square == sq]

        if event.type == pygame.MOUSEBUTTONUP and dragging:
            target_sq = get_square_from_mouse(event.pos)
            if target_sq is not None and selected_square is not None:
                moves = [m for m in board.legal_moves
                         if m.from_square == selected_square
                         and m.to_square == target_sq]
                if moves:
                    if any(m.promotion for m in moves):
                        promotion_pending = (selected_square, target_sq)
                    else:
                        make_move(moves[0])
            dragging        = False
            selected_square = None
            dragged_piece   = None
            legal_targets   = []

    pygame.display.flip()

pygame.quit()
sys.exit()
