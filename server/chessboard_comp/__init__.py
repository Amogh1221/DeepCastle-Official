import os
import streamlit.components.v1 as components

# Resolve the path to the HTML file relative to this folder
_PARENT_DIR = os.path.dirname(os.path.abspath(__file__))
_PATH = os.path.join(_PARENT_DIR, "index.html")

# Declare the Streamlit component
_component_func = components.declare_component("chessboard_comp", path=_PARENT_DIR)

def chessboard_comp(fen, key=None):
    # Call the component, passing in the FEN string as an argument
    return _component_func(fen=fen, key=key, default=None)
