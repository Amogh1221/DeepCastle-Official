import streamlit as st
import streamlit.components.v1 as components
import chess
import chess.engine
import subprocess
import os
import time
import requests
import json
import pandas as pd
from PIL import Image
from datetime import datetime

# Import our custom professional component
from chessboard_comp import chessboard_comp

# ============================================================
# PAGE CONFIGURATION (Ghost Mode)
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
    [data-testid="stSidebar"] {display: none;}
    .block-container {padding: 1rem 5rem 0 5rem;}
    
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
        font-size: 2.8rem;
        margin-bottom: 0.2rem;
    }
    .sidebar-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 20px;
    }
    .move-log {
        font-family: 'Courier New', monospace;
        background: #161b22;
        padding: 10px;
        border-radius: 8px;
        max-height: 350px;
        overflow-y: auto;
        border: 1px solid #30363d;
        color: #8b949e;
        font-size: 0.9rem;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# UTILITIES & REPO PATHS
# ============================================================
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_WINDOWS = os.path.join(ROOT_DIR, "engine", "deepcastle.exe")
ENGINE_LINUX = os.path.join(ROOT_DIR, "engine", "deepcastle_linux")
NETWORK_CUSTOM = os.path.join(ROOT_DIR, "engine", "output.nnue")

def get_engine_path():
    if os.name == 'nt': return ENGINE_WINDOWS
    return ENGINE_LINUX

def ensure_engine_ready():
    # Only build on Linux (Streamlit Cloud)
    if os.name != 'nt' and not os.path.exists(ENGINE_LINUX):
        with st.status("Initializing Neural Engine...", expanded=True):
            subprocess.run(["make", "-j", "build", "ARCH=x86-64-sse41-popcnt"], cwd=os.path.join(ROOT_DIR, "engine", "src"))
            subprocess.run(["mv", os.path.join(ROOT_DIR, "engine", "src", "stockfish"), ENGINE_LINUX])

# ============================================================
# SESSION STATE
# ============================================================
if 'board' not in st.session_state:
    st.session_state.board = chess.Board()
if 'move_history' not in st.session_state:
    st.session_state.move_history = []
if 'analysis_stats' not in st.session_state:
    st.session_state.analysis_stats = []
if 'last_processed_move' not in st.session_state:
    st.session_state.last_processed_move = ""

# ============================================================
# ENGINE LOGIC (With Pro-Logs)
# ============================================================
def play_bot_turn():
    engine_path = get_engine_path()
    if not os.path.exists(engine_path):
        st.error(f"Engine not found at {engine_path}. Please build it first.")
        return

    with st.spinner("DeepCastle is analyzing..."):
        try:
            engine = chess.engine.SimpleEngine.popen_uci(engine_path)
            if os.path.exists(NETWORK_CUSTOM):
                try:
                    engine.configure({"EvalFile": NETWORK_CUSTOM})
                except:
                    pass
            
            limit = chess.engine.Limit(time=st.session_state.get('think_time', 1.0))
            
            # PRO-ANALYSIS LOGGING
            st.session_state.analysis_stats = []
            with engine.analysis(st.session_state.board, limit) as analysis:
                for info in analysis:
                    d = info.get("depth")
                    n = info.get("nodes")
                    t = info.get("time")
                    s = info.get("score")
                    pv = info.get("pv")
                    
                    if d and s and pv:
                        score_val = s.white().score(mate_score=10000) / 100.0
                        pv_str = " ".join([st.session_state.board.san(m) for m in pv[:5]])
                        
                        st.session_state.analysis_stats.insert(0, {
                            "Depth": f"{d}",
                            "Time": f"{t:.2f}s",
                            "Nodes": f"{n:,}",
                            "Score": f"{score_val:+0.2f}",
                            "PV": pv_str
                        })
                        
                        # Terminal Log (game.py style)
                        print(f"[Engine] Depth: {d} | Score: {score_val:+0.2f} | Nodes: {n:,}")

            # Final Best Move
            result = engine.play(st.session_state.board, limit)
            st.session_state.board.push(result.move)
            st.session_state.move_history.append({
                "move": result.move.uci(),
                "score": st.session_state.analysis_stats[0]["Score"] if st.session_state.analysis_stats else "???"
            })
            engine.quit()
        except Exception as e:
            st.error(f"Engine Error: {e}")

# ============================================================
# MAIN INTERFACE
# ============================================================
col1, col2 = st.columns([2, 1])

with col1:
    # Official Branding
    logo_file = os.path.join(ROOT_DIR, "game", "pieces.png")
    if os.path.exists(logo_file):
        st.image(logo_file, width=120)
    
    st.markdown('<h1 class="main-header">DEEPCASTLE <span style="font-weight:300; font-style:italic">v7</span></h1>', unsafe_allow_html=True)
    st.caption("Custom Neural Architecture • HalfKAv2 hm^ • 2.7M NPS")
    
    ensure_engine_ready()

    # Board Display using Custom HIGH-LEVEL Component
    move_from_js_raw = chessboard_comp(st.session_state.board.fen())

    # Move Processing
    if move_from_js_raw and move_from_js_raw != st.session_state.last_processed_move:
        # Extra UCI from UCI_Timestamp
        move_uci = move_from_js_raw.split("_")[0]
        try:
            move = chess.Move.from_uci(move_uci)
            if st.session_state.board.turn == chess.WHITE and move in st.session_state.board.legal_moves:
                st.session_state.board.push(move)
                st.session_state.move_history.append({"move": move_uci, "score": "USR"})
                st.session_state.last_processed_move = move_from_js_raw
                
                # BOT TURN
                if not st.session_state.board.is_game_over():
                    play_bot_turn()
                st.rerun()
        except: pass

with col2:
    st.markdown("### ⚙️ Engine Settings")
    st.session_state.think_time = st.selectbox(
        "Bot Thinking Time (s)", 
        [0.1, 0.5, 1.0, 2.0, 5.0, 10.0], 
        index=2
    )
    
    # Engine Analysis Table
    if st.session_state.analysis_stats:
        st.markdown("### 📊 Search Analysis")
        st.table(pd.DataFrame(st.session_state.analysis_stats).head(10))
    
    # Move History Detail
    st.markdown("### 📜 Final Evaluation Log")
    moves_text = ""
    for i, meta in enumerate(st.session_state.move_history):
        mv = meta["move"]
        score = meta["score"]
        if i % 2 == 0: 
            moves_text += f"{i//2 + 1}. <span style='color: white;'>{mv}</span> <small>({score})</small> "
        else: 
            moves_text += f"<span style='color: #5c6bc0;'>{mv}</span> <small>({score})</small><br>"
    st.markdown(f'<div class="move-log">{moves_text}</div>', unsafe_allow_html=True)
    
    if st.button("New Game", use_container_width=True):
        st.session_state.board = chess.Board()
        st.session_state.move_history = []
        st.session_state.analysis_stats = []
        st.session_state.last_processed_move = ""
        st.rerun()

st.markdown("---")
st.caption("Deepcastle v7 | Professional Chess Engine Interface | Neural Search Active")
