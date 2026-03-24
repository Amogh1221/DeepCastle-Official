import streamlit as st
import chess
import chess.engine
import subprocess
import os
import time
import requests
from datetime import datetime

# ============================================================
# PAGE CONFIGURATION (Chess.com Aesthetic)
# ============================================================
st.set_page_config(
    page_title="Deepcastle v7 | Professional Chess Engine",
    page_icon="♟️",
    layout="wide",
)

# Custom CSS for that premium dark mode / premium feel
st.markdown("""
<style>
    .stApp {
        background-color: #0d1117;
        color: #c9d1d9;
    }
    .main-header {
        font-family: 'Inter', sans-serif;
        font-weight: 800;
        letter-spacing: -0.02em;
        text-transform: uppercase;
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
        max-height: 300px;
        overflow-y: auto;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# ENGINE MANAGEMENT (The Magic behind the curtains)
# ============================================================

ENGINE_BIN = "engine/deepcastle_linux"
NETWORK_BIG = "engine/nn-9a0cc2a62c52.nnue"

def ensure_engine_ready():
    # 1. Check for binary
    if not os.path.exists(ENGINE_BIN):
        with st.status("Building Deepcastle Engine for Linux (This takes ~2 mins)...", expanded=True) as s:
            st.write("Compiling source code...")
            try:
                # Compile for Linux ARCH
                build_proc = subprocess.run(
                    ["make", "-j", "build", "ARCH=x86-64-modern"], 
                    cwd="engine/src", capture_output=True, text=True
                )
                if build_proc.returncode == 0:
                    subprocess.run(["mv", "engine/src/stockfish", ENGINE_BIN])
                    st.success("Compilation Success!")
                else:
                    st.error(f"Compilation Failed: {build_proc.stderr}")
            except Exception as e:
                st.error(f"Error during compilation: {e}")
    
    # 2. Check for NNUE brain
    if not os.path.exists(NETWORK_BIG):
        with st.status("Downloading Neural Network (100MB)...", expanded=True):
            r = requests.get("https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue", stream=True)
            with open(NETWORK_BIG, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            st.success("Network ready!")

# ============================================================
# APP STATE
# ============================================================

if 'board' not in st.session_state:
    st.session_state.board = chess.Board()
if 'move_history' not in st.session_state:
    st.session_state.move_history = []
if 'evaluation' not in st.session_state:
    st.session_state.evaluation = 0.0

# ============================================================
# UI LAYOUT
# ============================================================

col1, col2 = st.columns([2, 1])

with col1:
    st.markdown('<h1 class="main-header italic">Deepcastle <span style="font-weight:300">v7</span></h1>', unsafe_allow_html=True)
    
    # Check if we are on a system that can run the binary
    if os.name != 'nt':  # Only build if on Linux (Streamlit Cloud)
        ensure_engine_ready()

    # The Chessboard component (Using SVG for maximum compatibility)
    board_svg = chess.svg.board(board=st.session_state.board, size=600)
    st.image(board_svg, use_column_width=False)
    
    # Controls
    c1, c2, c3 = st.columns(3)
    with c1:
        if st.button("New Game", use_container_width=True):
            st.session_state.board = chess.Board()
            st.session_state.move_history = []
            st.rerun()
    with c2:
        if st.button("Takeback", use_container_width=True):
            if len(st.session_state.board.move_stack) > 0:
                st.session_state.board.pop()
                st.session_state.move_history.pop()
                st.rerun()

with col2:
    st.markdown("### 📊 Engine Insights")
    
    # Evaluation Bar
    eval_score = st.session_state.evaluation
    st.metric("Bot Evaluation", f"{eval_score:+0.2f}")
    st.progress(max(0, min(100, 50 + eval_score * 5)), text="Advantage Meter")

    st.markdown("### 📜 Move Analysis")
    moves_text = ""
    for i, move in enumerate(st.session_state.move_history):
        if i % 2 == 0:
            moves_text += f"**{i//2 + 1}.** {move} "
        else:
            moves_text += f"{move}  \n"
    st.markdown(f'<div class="move-log">{moves_text}</div>', unsafe_allow_html=True)

    # Human Move Entry (Simplified for Streamlit)
    move_input = st.text_input("Enter Move (e.g. e2e4):", key="human_move")
    if move_input:
        try:
            move = chess.Move.from_uci(move_input)
            if move in st.session_state.board.legal_moves:
                st.session_state.board.push(move)
                st.session_state.move_history.append(move_input)
                
                # Make bot move
                if not st.session_state.board.is_game_over():
                    if os.name != 'nt':
                        engine = chess.engine.SimpleEngine.popen_uci(os.path.abspath(ENGINE_BIN))
                        engine.configure({"EvalFile": os.path.abspath(NETWORK_BIG)})
                        result = engine.play(st.session_state.board, chess.engine.Limit(time=0.5))
                        st.session_state.board.push(result.move)
                        st.session_state.move_history.append(result.move.uci())
                        engine.quit()
                
                st.rerun()
            else:
                st.error("Illegal move!")
        except:
            st.error("Invalid move format!")

# Footer
st.markdown("---")
st.caption("Deepcastle v7 | Powered by Stockfish C++ Engine | Developed by Amogh Gupta")
