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
# PAGE CONFIGURATION
# ============================================================
st.set_page_config(
    page_title="Deepcastle v7 | Professional Chess Engine",
    page_icon="♟️",
    layout="wide",
)

# Custom CSS for the overall page aesthetic
st.markdown("""
<style>
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
            subprocess.run(["make", "-j", "build", "ARCH=x86-64-sse41-popcnt"], cwd="engine/src")
            subprocess.run(["mv", "engine/src/stockfish", ENGINE_BIN])
    
    if not os.path.exists(NETWORK_CUSTOM):
        st.warning(f"Custom model '{NETWORK_CUSTOM}' missing! Please upload it to your repo.")

# ============================================================
# SESSION STATE
# ============================================================
if 'board' not in st.session_state:
    st.session_state.board = chess.Board()
if 'move_history' not in st.session_state:
    st.session_state.move_history = []
if 'evaluation' not in st.session_state:
    st.session_state.evaluation = 0.0

# ============================================================
# DRAG-AND-DROP COMPONENT (The Magic)
# ============================================================
def interactive_board(fen, last_move=None):
    # A complete drag-and-drop board using chessboard.js
    html_code = f"""
    <link rel="stylesheet"
          href="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css"
          integrity="sha384-q94+BZtLrkL1/ohfjR8c6L+A6qzNH9R2+BLwyoAfu3i/WCvQjzL2RQJ3uNHDISdU"
          crossorigin="anonymous">
    <script src="https://code.jquery.com/jquery-3.5.1.min.js"
            integrity="sha384-ZvpUoO/+PpLXR1lu4jmpXWu80pZlYUAfxl5NsBMWOEPSjUn/6Z/hRTt8+pR6L4N2"
            crossorigin="anonymous"></script>
    <script src="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js"
            integrity="sha384-8Vi8W97iL4p84KxmdK8sly9u2+G67KxJ4FqJ9E0hT/V4W9u9Srk8Q9f4S5R9E9hT"
            crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>

    <div id="myBoard" style="width: 100%; max-width: 600px; margin: auto;"></div>

    <script>
    var board = null;
    var game = new Chess("{fen}");

    function onDragStart (source, piece, position, orientation) {{
        if (game.game_over()) return false;
        if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
            (game.turn() === 'b' && piece.search(/^w/) !== -1)) {{
            return false;
        }}
    }}

    function onDrop (source, target) {{
        var move = game.move({{
            from: source,
            to: target,
            promotion: 'q'
        }});

        if (move === null) return 'snapback';

        // Notify Streamlit about the move
        window.parent.postMessage({{
            type: 'streamlit:setComponentValue',
            value: move.from + move.to
        }}, "*");
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
    </script>
    """
    return components.html(html_code, height=620)

# ============================================================
# MAIN INTERFACE
# ============================================================
col1, col2 = st.columns([2, 1])

with col1:
    st.markdown('<h1 class="main-header italic">Deepcastle <span style="font-weight:300">v7</span></h1>', unsafe_allow_html=True)
    if os.name != 'nt': ensure_engine_ready()

    # The Interactive Board
    move_from_js = interactive_board(st.session_state.board.fen())

    # Handle the move from JavaScript
    if move_from_js:
        try:
            move = chess.Move.from_uci(move_from_js)
            if move in st.session_state.board.legal_moves:
                st.session_state.board.push(move)
                st.session_state.move_history.append(move_from_js)
                
                # Make bot move
                if not st.session_state.board.is_game_over():
                    if os.name != 'nt':
                        with st.spinner("Bot is thinking..."):
                            engine = chess.engine.SimpleEngine.popen_uci(os.path.abspath(ENGINE_BIN))
                            engine.configure({"EvalFile": os.path.abspath(NETWORK_CUSTOM)})
                            result = engine.play(st.session_state.board, chess.engine.Limit(time=1.0))
                            st.session_state.board.push(result.move)
                            st.session_state.move_history.append(result.move.uci())
                            engine.quit()
                st.rerun()
        except:
            pass

with col2:
    st.markdown("### 📊 Engine Insights")
    think_time = st.slider("Bot Thinking Time (sec)", 0.1, 5.0, 1.0)
    
    eval_score = st.session_state.evaluation
    st.metric("Bot Evaluation", f"{eval_score:+0.2f}")
    
    st.markdown("### 📜 Move Analysis")
    moves_text = ""
    for i, move in enumerate(st.session_state.move_history):
        if i % 2 == 0: moves_text += f"**{i//2 + 1}.** {move} "
        else: moves_text += f"{move}  \n"
    st.markdown(f'<div class="move-log">{moves_text}</div>', unsafe_allow_html=True)
    
    if st.button("New Game", use_container_width=True):
        st.session_state.board = chess.Board()
        st.session_state.move_history = []
        st.rerun()

st.markdown("---")
st.caption("Deepcastle v7 | Professional Chess Engine GUI | Powered by Streamlit")
