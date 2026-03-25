"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion } from "framer-motion";
import {
  Home, RotateCcw, ChevronLeft, ChevronRight, Zap, AlertTriangle, Copy, Check, Trash2
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

interface AnalysisMove {
  before: string;
  after: string;
  san: string;
}

export function AnalysisPage({ onHome }: { onHome: () => void }) {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(new Chess().fen());
  const [history, setHistory] = useState<AnalysisMove[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [fenError, setFenError] = useState("");

  // Live engine
  const [liveEval, setLiveEval] = useState<string>("");
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [bestArrow, setBestArrow] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showBestMove, setShowBestMove] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Click-to-move state
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, any>>({});

  const currentFen = React.useMemo(() => {
    const g = new Chess();
    for (let i = 0; i < currentPly; i++) {
      try { g.move(history[i].san); } catch {}
    }
    return g.fen();
  }, [history, currentPly]);

  // Analyze current position
  const analyze = useCallback(async (fen: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsAnalyzing(true);
    setBestArrow([]);

    try {
      const res = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen, time: 1.0 }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        const s = data.score;
        setLiveEval(s !== undefined ? (s > 0 ? `+${s.toFixed(2)}` : s.toFixed(2)) : "");
        if (data.bestmove?.length >= 4) {
          const bm = data.bestmove;
          setBestMove(bm);
          if (showBestMove) {
            setBestArrow([[bm.slice(0, 2), bm.slice(2, 4), "rgba(163,209,96,0.85)"]]);
          }
        }
      }
    } catch {}
    finally { setIsAnalyzing(false); }
  }, [showBestMove]);

  useEffect(() => { analyze(currentFen); }, [currentFen]);

  useEffect(() => {
    if (bestMove && showBestMove) {
      setBestArrow([[bestMove.slice(0, 2), bestMove.slice(2, 4), "rgba(163,209,96,0.85)"]]);
    } else {
      setBestArrow([]);
    }
  }, [showBestMove, bestMove]);

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrentPly(p => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setCurrentPly(p => Math.min(history.length, p + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [history.length]);

  function handleSquareClick({ square }: { piece: any; square: string }) {
    const g = new Chess(currentFen);

    if (moveFrom) {
      try {
        const mv = g.move({ from: moveFrom, to: square, promotion: "q" });
        if (mv) {
          const newHistory = history.slice(0, currentPly);
          newHistory.push({ before: currentFen, after: g.fen(), san: mv.san });
          setHistory(newHistory);
          setCurrentPly(newHistory.length);
          setMoveFrom(null);
          setSquareStyles({});
          return;
        }
      } catch {}
      // If move failed, select new piece
      setMoveFrom(null);
      setSquareStyles({});
    }

    const piece = g.get(square as any);
    if (piece && piece.color === g.turn()) {
      setMoveFrom(square);
      const legalMoves = g.moves({ square: square as any, verbose: true });
      const styles: Record<string, any> = {
        [square]: { backgroundColor: "rgba(255, 255, 0, 0.4)" }
      };
      legalMoves.forEach((m: any) => {
        styles[m.to] = {
          background: "radial-gradient(circle, rgba(163,209,96,0.7) 25%, transparent 25%)",
          borderRadius: "50%",
        };
      });
      setSquareStyles(styles);
    }
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare) return false;
    const g = new Chess(currentFen);
    try {
      const mv = g.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (mv) {
        const newHistory = history.slice(0, currentPly);
        newHistory.push({ before: currentFen, after: g.fen(), san: mv.san });
        setHistory(newHistory);
        setCurrentPly(newHistory.length);
        setMoveFrom(null);
        setSquareStyles({});
        return true;
      }
    } catch {}
    return false;
  }

  function loadFen() {
    setFenError("");
    try {
      const g = new Chess();
      g.load(fenInput.trim());
      setHistory([]);
      setCurrentPly(0);
      // Store the FEN as a "starting" position in history context
      setHistory([{ before: "", after: g.fen(), san: "start" }]);
      setCurrentPly(1);
      setFenInput("");
    } catch {
      setFenError("Invalid FEN string");
    }
  }

  function reset() {
    setHistory([]);
    setCurrentPly(0);
    setFenInput("");
    setFenError("");
    setMoveFrom(null);
    setSquareStyles({});
  }

  const evalNum = parseFloat(liveEval || "0");
  const evalColor = evalNum > 0.5 ? "text-emerald-400" : evalNum < -0.5 ? "text-red-400" : "text-slate-300";
  const evalBarWhite = Math.max(5, Math.min(95, 50 + evalNum * 5));

  const displayHistory = history.filter(m => m.san !== "start");

  return (
    <main className="h-screen bg-[#111113] text-slate-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#161618] shrink-0">
        <button onClick={onHome} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold">
          <Home className="w-4 h-4" /> Home
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 overflow-hidden rounded-md">
            <img src="/DC_logo.png" alt="DC" className="w-full h-full object-cover" />
          </div>
          <span className="font-black text-sm bg-gradient-to-r from-indigo-300 to-violet-300 text-transparent bg-clip-text">Analysis Board</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFlipped(f => !f)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
        {/* Left: Eval bar + Board */}
        <div className="flex" style={{ width: "min(calc(100vh - 60px), 65vw)" }}>
          {/* Vertical eval bar */}
          <div className="w-5 bg-[#1a1a1f] border-r border-white/5 flex flex-col overflow-hidden relative">
            <div className="absolute inset-0 flex flex-col">
              <div className="bg-[#1a1a1f] transition-all duration-500" style={{ height: `${100 - evalBarWhite}%` }} />
              <div className="bg-slate-200 transition-all duration-500" style={{ height: `${evalBarWhite}%` }} />
            </div>
          </div>

          {/* Board */}
          <div className="flex-1 p-2">
            <div className="w-full h-full">
              <Chessboard options={{
                position: currentFen,
                boardOrientation: flipped ? "black" : "white",
                animationDurationInMs: 120,
                darkSquareStyle: { backgroundColor: "#779556" },
                lightSquareStyle: { backgroundColor: "#ebecd0" },
                boardStyle: { borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", height: "100%", width: "100%" },
                squareStyles,
                arrows: bestArrow,
                onSquareClick: handleSquareClick,
                onPieceDrop: handlePieceDrop,
                allowDragging: true,
              }} />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-h-0 border-l border-white/5 bg-[#161618]">
          {/* Eval display */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-black tabular-nums ${evalColor}`}>
                {liveEval || "0.00"}
              </div>
              {isAnalyzing && (
                <div className="flex gap-0.5">
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBestMove(v => !v)}
                className={`text-[10px] font-black px-2 py-1 rounded border transition-all ${showBestMove ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-slate-500 bg-white/5 border-white/5"}`}
              >
                {showBestMove ? "✓ Best Move" : "Best Move"}
              </button>
            </div>
          </div>

          {/* Best move display */}
          {bestMove && (
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
              <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest mb-1">Best Move</p>
              <p className="text-sm font-black text-emerald-400 font-mono">{bestMove}</p>
            </div>
          )}

          {/* FEN input */}
          <div className="px-4 py-3 border-b border-white/5 shrink-0">
            <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest mb-2">Load FEN Position</p>
            <div className="flex gap-2">
              <input
                value={fenInput}
                onChange={e => { setFenInput(e.target.value); setFenError(""); }}
                onKeyDown={e => e.key === "Enter" && loadFen()}
                placeholder="Paste FEN string here..."
                className="flex-1 min-w-0 bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 font-mono"
              />
              <button onClick={loadFen} className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 rounded-lg font-black text-xs transition-all shrink-0">
                Load
              </button>
            </div>
            {fenError && <p className="text-red-400 text-xs mt-1">{fenError}</p>}
          </div>

          {/* Move list */}
          <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
            <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest px-2 py-1">Moves</p>
            {displayHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-sm text-center px-4">
                <Zap className="w-8 h-8 mb-2 opacity-30" />
                Make a move on the board to start analysis
              </div>
            ) : (
              <div className="space-y-0.5">
                {Array.from({ length: Math.ceil(displayHistory.length / 2) }).map((_, i) => {
                  const wPly = i * 2 + 1;
                  const bPly = i * 2 + 2;
                  const wM = displayHistory[i * 2];
                  const bM = displayHistory[i * 2 + 1];
                  // currentPly is 1-indexed into displayHistory
                  return (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <span className="text-slate-600 w-7 text-right shrink-0">{i + 1}.</span>
                      <button
                        onClick={() => setCurrentPly(wPly)}
                        className={`flex-1 px-2 py-1.5 rounded text-left font-bold transition-all ${currentPly === wPly ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
                      >{wM?.san}</button>
                      <button
                        onClick={() => bM && setCurrentPly(bPly)}
                        disabled={!bM}
                        className={`flex-1 px-2 py-1.5 rounded text-left font-bold transition-all ${!bM ? "opacity-0 pointer-events-none" : currentPly === bPly ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
                      >{bM?.san || ""}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nav controls */}
          <div className="flex items-center gap-1 px-2 py-2 border-t border-white/5 shrink-0">
            <button onClick={reset} className="p-2 hover:bg-red-500/10 rounded-lg transition-all text-slate-500 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex-1 flex items-center gap-1 bg-black/20 rounded-lg p-1">
              <button onClick={() => setCurrentPly(0)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-2" />
              </button>
              <button onClick={() => setCurrentPly(p => Math.max(0, p - 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 font-mono px-2">{currentPly}/{displayHistory.length}</span>
              <button onClick={() => setCurrentPly(p => Math.min(displayHistory.length, p + 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentPly(displayHistory.length)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-2" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
