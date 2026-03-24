import streamlit as st
import streamlit.components.v1 as components
import chess
import chess.engine
import subprocess
import os
import time
import requests
import json
from PIL import Image
from datetime import datetime

# ============================================================
# PAGE CONFIGURATION (Ghost Mode - Ultimate Clean)
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
        margin-bottom: 10px;
    }
    .move-log {
        font-family: 'Courier New', monospace;
        background: #161b22;
        padding: 10px;
        border-radius: 8px;
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid #30363d;
    }
    .stSpinner > div > div {
        border-top-color: #5c6bc0 !important;
    }
    div[data-testid="stMetric"] {
        background: #161b22;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid #30363d;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# LOGO & BRANDING
# ============================================================
logo_path = "../game/pieces.png" # Path relative to server folder if run from repo root
if os.path.exists(logo_path):
    logo = Image.open(logo_path)
    # We want a specific part of the logo/sprite or just show it small?
    # Usually pieces.png is a sprite. For a logo, we just show a header.
    pass

# ============================================================
# ENGINE CLASS (Inspired by game.py/deepcastle.py)
# ============================================================
class DeepCastleManager:
    def __init__(self):
        # Pick binary based on OS
        if os.name == 'nt':
            self.engine_path = os.path.abspath("../engine/deepcastle.exe")
        else:
            self.engine_path = os.path.abspath("engine/deepcastle_linux")
            
        self.network_path = os.path.abspath("engine/output.nnue")
        self._engine = None

    def get_engine(self):
        if not self._engine:
            self._engine = chess.engine.SimpleEngine.popen_uci(
                self.engine_path, 
                stderr=subprocess.DEVNULL
            )
            # Try to configure custom model
            if os.path.exists(self.network_path):
                try:
                    self._engine.configure({"EvalFile": self.network_path})
                except:
                    pass
        return self._engine

    def stop(self):
        if self._engine:
            self._engine.quit()
            self._engine = None

# ============================================================
# ENGINE MANAGEMENT (The Magic behind the curtains)
# ============================================================
ENGINE_BIN_LINUX = "engine/deepcastle_linux"

def ensure_engine_ready():
    # Only build on Linux (Streamlit Cloud)
    if os.name != 'nt' and not os.path.exists(ENGINE_BIN_LINUX):
        with st.status("Initializing Neural Engine...", expanded=True):
            subprocess.run(["make", "-j", "build", "ARCH=x86-64-sse41-popcnt"], cwd="engine/src")
            subprocess.run(["mv", "engine/src/stockfish", ENGINE_BIN_LINUX])

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
    html_code = f"""
    <div id="board-container" style="background-color: #0d1117; color: white; display: flex; justify-content: center;">
        <link rel="stylesheet" href="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css">
        <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
        <script src="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>

        <div id="myBoard" style="width: 600px;"></div>
    </div>

    <script>
    var board = null;
    var game = new Chess("{fen}");

    function onDragStart (source, piece, position, orientation) {{
        if (game.game_over()) return false;
        // Only allow White moves (User)
        if (piece.search(/^b/) !== -1) return false;
    }}

    function onDrop (source, target) {{
        var move = game.move({{
            from: source,
            to: target,
            promotion: 'q'
        }});

        if (move === null) return 'snapback';

        // Notify Streamlit
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
    </script>
    """
    return components.html(html_code, height=620)

# ============================================================
# MAIN INTERFACE
# ============================================================
col1, col2 = st.columns([2, 1])

with col1:
    # Logo Integration
    logo_file = "game/pieces.png"
    if os.path.exists(logo_file):
        st.image(logo_file, width=120)
    
    st.markdown('<h1 class="main-header">DEEPCASTLE <span style="font-weight:100; font-style:italic">v7</span></h1>', unsafe_allow_html=True)
    st.caption("Custom Neural Architecture • HalfKAv2 hm^ • 2.7M NPS")
    
    ensure_engine_ready()

    # Board Display
    move_from_js = interactive_board(st.session_state.board.fen())

    # Move Processing (The "game.py" Loop)
    if move_from_js and move_from_js != st.session_state.last_processed_move:
        try:
            move = chess.Move.from_uci(move_from_js)
            if st.session_state.board.turn == chess.WHITE and move in st.session_state.board.legal_moves:
                # 1. Apply Human Move
                st.session_state.board.push(move)
                st.session_state.move_history.append(move_from_js)
                st.session_state.last_processed_move = move_from_js
                
                # 2. bot thinking step
                if not st.session_state.board.is_game_over():
                    with st.spinner("Deepcastle is calculating..."):
                        manager = DeepCastleManager()
                        engine = manager.get_engine()
                        
                        limit = chess.engine.Limit(time=st.session_state.get('think_time', 1.0))
                        # Evaluation
                        info = engine.analyse(st.session_state.board, limit)
                        score = info["score"].relative.score(mate_score=10000)
                        if score is not None:
                            st.session_state.evaluation = score / 100.0
                            
                        # Play
                        result = engine.play(st.session_state.board, limit)
                        st.session_state.board.push(result.move)
                        st.session_state.move_history.append(result.move.uci())
                        
                        manager.stop()
                st.rerun()
        except Exception as e:
            pass

with col2:
    st.markdown("### 📊 Engine Insights")
    st.session_state.think_time = st.slider("Thinking Time (sec)", 0.1, 5.0, 1.0)
    
    st.metric("Advantage", f"{st.session_state.evaluation:+0.2f}")
    prog = max(0.0, min(1.0, (50 + st.session_state.evaluation * 5) / 100.0))
    st.progress(prog, text="Win probability")

    st.markdown("### 📜 Move Analysis")
    moves_text = ""
    for i, mv in enumerate(st.session_state.move_history):
        if i % 2 == 0: moves_text += f"**{i//2 + 1}.** {mv} "
        else: moves_text += f"{mv}  \n"
    st.markdown(f'<div class="move-log">{moves_text}</div>', unsafe_allow_html=True)
    
    if st.button("New Game", use_container_width=True):
        st.session_state.board = chess.Board()
        st.session_state.move_history = []
        st.session_state.last_processed_move = ""
        st.session_state.evaluation = 0.0
        st.rerun()

st.markdown("---")
st.caption("Deepcastle v7 | Developed by Amogh Gupta | Based on Stockfish Core")
