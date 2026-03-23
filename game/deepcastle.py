import chess
import chess.engine
import os
import subprocess

# Resolve engine path relative to this file so it works regardless of cwd
_DEFAULT_ENGINE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "deepcastle.exe"
)

class DeepCastle:
    def __init__(self, engine_path=None, move_time_ms=3000):
        engine_path = engine_path or _DEFAULT_ENGINE
        self.version    = 7
        self.move_time  = move_time_ms / 1000.0  # convert to seconds for python-chess
        self.think_time = 0.0
        self.nodes      = 0
        self.last_score = 0.0
        self.engine_path = engine_path
        self._engine    = None

    def _get_engine(self):
        if self._engine is None:
            self._engine = chess.engine.SimpleEngine.popen_uci(
                self.engine_path,
                timeout=60,
                stderr=subprocess.DEVNULL
            )
        return self._engine

    def select_move(self, board, depth=None, time_limit=None, is_background=False):
        import time
        tl = time_limit or self.move_time
        engine = self._get_engine()
        fen_board = chess.Board(board.fen())
        
        last_info = None
        # Use Analysis to stream info messages
        with engine.analysis(fen_board, chess.engine.Limit(time=tl)) as analysis:
            for info in analysis:
                last_info = info
                # Update stats for GUI
                d = info.get("depth")
                n = info.get("nodes")
                t = info.get("time")
                s = info.get("score")
                self.nodes = n or self.nodes
                self.think_time = t or self.think_time
                if s:
                    cp = s.white().score()
                    if cp is not None: self.last_score = float(cp)
                    elif s.white().is_mate():
                        self.last_score = 10000.0 - s.white().mate() if s.white().mate() > 0 else -10000.0 - s.white().mate()

                if t and t >= tl: break

        result = analysis.wait()
        
        if not is_background:
            move_num = board.fullmove_number
            side = "White" if board.turn == chess.WHITE else "Black"
            # Extract final info for log
            d = last_info.get("depth") if last_info else "?"
            s = last_info.get("score") if last_info else None
            n = last_info.get("nodes") if last_info else 0
            nps = last_info.get("nps") if last_info else 0
            score_str = f"{s.white()}" if s else "???"
            
            print(f"[{move_num}. {side}] Move: {result.move} | Depth: {d} | Score: {score_str} | Nodes: {n:,} | NPS: {nps:,}")
            
        return result.move

    def tt_clear(self):
        if self._engine is not None:
            try:
                self._engine.ping()
            except Exception:
                pass

    def __del__(self):
        if self._engine is not None:
            try:
                self._engine.quit()
            except Exception:
                pass
