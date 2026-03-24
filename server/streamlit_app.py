import streamlit as st
import streamlit.components.v1 as components
import chess
import chess.engine
import subprocess
import os
import time
import requests
import json
from datetime import datetime

# ============================================================
# PAGE CONFIGURATION (Clean & Ghost Mode)
# ============================================================
st.set_page_config(
    page_title="Deepcastle v7 | Professional Chess Engine",
    page_icon="♟️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom CSS to completely HIDE Streamlit UI and style the app
st.markdown("""
<style>
    /* Hide Streamlit components */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    .block-container {padding-top: 2rem; padding-bottom: 0rem;}
    
    /* Overall Aesthetic */
    .stApp {
        background-color: #0d1117;
        color: #c9d1d9;
    }
    .main-header {
        font-family: 'Inter', sans-serif;
        font-weight: 800;
        background: linear-gradient(90deg, #5c6bc0, #c5cae9);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-size: 2.5rem;
        margin-bottom: 1rem;
    }
    .sidebar-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .move-log {
        font-family: 'Courier New', monospace;
        background: #161b22;
        padding: 10px;
        border-radius: 8px;
        max-height: 400px;
        overflow-y: auto;
    }
    .stSpinner > div > div {
        border-top-color: #5c6bc0 !important;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# ENGINE MANAGEMENT
# ============================================================
ENGINE_BIN = "engine/deepcastle_linux"
NETWORK_CUSTOM = "engine/output.nnue"

def ensure_engine_ready():
    if not os.path.exists(ENGINE_BIN):
        with st.status("Building Deepcastle Engine for Linux...", expanded=True):
            # Safe ARCH for Streamlit
            subprocess.run(["make", "-j", "build", "ARCH=x86-64-sse41-popcnt"], cwd="engine/src")
            subprocess.run(["mv", "engine/src/stockfish", ENGINE_BIN])
    
    if not os.path.exists(NETWORK_CUSTOM):
        st.warning(f"Note: Custom model '{NETWORK_CUSTOM}' missing from repo. Engine will use default evaluation.")

# ============================================================
# SESSION STATE
# ============================================================
if 'board' not in st.session_state:
    st.session_state.board = chess.Board()
if 'move_history' not in st.session_state:
    st.session_state.move_history = []
if 'evaluation' not in st.session_state:
    st.session_state.evaluation = 0.0
if 'last_processed_move' not in st.session_state:
    st.session_state.last_processed_move = ""

# ============================================================
# INTERACTIVE BOARD COMPONENT
# ============================================================
def interactive_board(fen):
    # Fixed height and more stable JS dependencies
    html_code = f"""
    <div id="board-container" style="background-color: #0d1117; color: white;">
        <link rel="stylesheet"
          href="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css">
        <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
        <script src="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>

        <div id="myBoard" style="width: 100%; max-width: 600px; margin: auto;"></div>
    </div>

    <script>
    var board = null;
    var game = new Chess("{fen}");

    function onDragStart (source, piece, position, orientation) {{
        if (game.game_over()) return false;
        // Only white moves (player is always white)
        if (piece.search(/^b/) !== -1) return false;
    }}

    function onDrop (source, target) {{
        var move = game.move({{
            from: source,
            to: target,
            promotion: 'q'
        }});

        if (move === null) return 'snapback';

        // Notify Streamlit with the UCI string and a unique ID to force an update
        if (window.parent.postMessage) {{
            window.parent.postMessage({{
                type: 'streamlit:setComponentValue',
                value: move.from + move.to
            }}, "*");
        }}
    }}

    function onSnapEnd () {{
        board.position(game.fen());
    }}

    var config = {{
        draggable: true,
        position: '{fen}',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{{piece}}.png'
    }};
    board = Chessboard('myBoard', config);
    
    // Ensure the board is resized to container
    $(window).resize(board.resize);
    </script>
    """
    # Key changes every move to force re-render
    return components.html(html_code, height=650, key=f"board_{st.session_state.board.fen()}")

# ============================================================
# ENGINE LOGIC
# ============================================================
def get_bot_move():
    if not st.session_state.board.is_game_over():
        if os.name != 'nt':
            with st.spinner("DeepCastle is calculating..."):
                engine = chess.engine.SimpleEngine.popen_uci(os.path.abspath(ENGINE_BIN))
                if os.path.exists(NETWORK_CUSTOM):
                    engine.configure({"EvalFile": os.path.abspath(NETWORK_CUSTOM)})
                
                # Use current think_time slider value
                limit = chess.engine.Limit(time=st.session_state.get('think_time', 1.0))
                result = engine.analyse(st.session_state.board, limit)
                
                # Update Evaluation
                score = result['score'].relative.score(mate_score=100000)
                if score is not None:
                    st.session_state.evaluation = score / 100.0
                
                # Play the best move
                res = engine.play(st.session_state.board, limit)
                st.session_state.board.push(res.move)
                st.session_state.move_history.append(res.move.uci())
                
                engine.quit()

# ============================================================
# MAIN LAYOUT
# ============================================================
col1, col2 = st.columns([2, 1])

with col1:
    st.markdown('<h1 class="main-header italic">Deepcastle <span style="font-weight:300">v7</span></h1>', unsafe_allow_html=True)
    if os.name != 'nt': ensure_engine_ready()

    # The Interactive Board
    move_from_js = interactive_board(st.session_state.board.fen())

    # Handle Human Move
    if move_from_js and (move_from_js != st.session_state.last_processed_move or len(st.session_state.board.move_stack) % 2 == 0):
        try:
            move = chess.Move.from_uci(move_from_js)
            # Only process if it's the player's turn (White)
            if st.session_state.board.turn == chess.WHITE and move in st.session_state.board.legal_moves:
                st.session_state.board.push(move)
                st.session_state.move_history.append(move_from_js)
                st.session_state.last_processed_move = move_from_js
                
                # BOT TURN IMMEDIATELY
                get_bot_move()
                st.rerun()
        except Exception as e:
            # Illegal or invalid move input
            pass

with col2:
    st.session_state.think_time = st.slider("Bot Thinking Time (sec)", 0.1, 5.0, 1.0, key='think_slider')
    
    st.markdown("### 📊 Engine Insights")
    eval_score = st.session_state.evaluation
    st.metric("Bot Evaluation", f"{eval_score:+0.2f}")
    
    progress_val = max(0.0, min(1.0, (50 + eval_score * 5) / 100.0))
    st.progress(progress_val, text="Advantage Meter")
    
    st.markdown("### 📜 Move Analysis")
    moves_text = ""
    for i, move in enumerate(st.session_state.move_history):
        if i % 2 == 0: moves_text += f"**{i//2 + 1}.** {move} "
        else: moves_text += f"{move}  \n"
    st.markdown(f'<div class="move-log">{moves_text}</div>', unsafe_allow_html=True)
    
    if st.button("New Game", use_container_width=True):
        st.session_state.board = chess.Board()
        st.session_state.move_history = []
        st.session_state.last_processed_move = ""
        st.session_state.evaluation = 0.0
        st.rerun()

st.markdown("---")
st.caption("Deepcastle v7 | Professional Chess Engine GUI | Powered by Streamlit")
