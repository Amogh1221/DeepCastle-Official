"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { Home, RotateCcw, ChevronLeft, ChevronRight, Zap, Trash2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

// A single entry in the move tree
interface AnalysisMove {
  fen: string;   // FEN after this move
  san: string;   // The SAN that got us here
}

export function AnalysisPage({ onHome }: { onHome: () => void }) {
  // The list of board FENs reached in order. fens[0] = start position.
  const [fens, setFens] = useState<string[]>(["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]);
  const [sans, setSans] = useState<string[]>([]);  // san[i] = move that reached fens[i+1]
  const [currentIdx, setCurrentIdx] = useState(0); // index into fens[]
  const [flipped, setFlipped] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [fenError, setFenError] = useState("");

  // Click-to-move
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, any>>({});

  // Live engine eval
  const [liveEval, setLiveEval] = useState("0.00");
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [bestArrow, setBestArrow] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showBestMove, setShowBestMove] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; abortRef.current?.abort(); };
  }, []);

  const currentFen = fens[currentIdx] ?? fens[0];

  // Analyze whenever position changes
  useEffect(() => {
    const fen = currentFen;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsAnalyzing(true);
    setLiveEval("...");
    setBestArrow([]);

    let done = false;
    fetch(`${API_URL}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, time: 0.8 }),
      signal: ctrl.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || ctrl.signal.aborted || !isMounted.current) return;
        const s = data.score;
        const evalStr = s !== undefined
          ? (s > 0 ? `+${Number(s).toFixed(2)}` : Number(s).toFixed(2))
          : "0.00";
        setLiveEval(evalStr);
        if (typeof data.bestmove === "string" && data.bestmove.length >= 4) {
          const bm: string = data.bestmove;
          setBestMove(bm);
          setBestArrow([[bm.slice(0, 2), bm.slice(2, 4), "rgba(163,209,96,0.85)"]]);
        } else {
          setBestMove(null);
          setBestArrow([]);
        }
      })
      .catch(() => {
        // network error or abort – silently ignore
        if (isMounted.current && !ctrl.signal.aborted) setLiveEval("?");
      })
      .finally(() => {
        if (isMounted.current) setIsAnalyzing(false);
      });

    return () => ctrl.abort();
  }, [currentFen]);

  // Hide best move arrow when toggled off
  useEffect(() => {
    if (!showBestMove) setBestArrow([]);
    else if (bestMove) setBestArrow([[bestMove.slice(0, 2), bestMove.slice(2, 4), "rgba(163,209,96,0.85)"]]);
  }, [showBestMove]);

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrentIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIdx(i => Math.min(fens.length - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fens.length]);

  function makeMove(from: string, to: string): boolean {
    try {
      const g = new Chess(currentFen);
      const mv = g.move({ from, to, promotion: "q" });
      if (!mv) return false;
      // Truncate any future moves past current position
      const newFens = fens.slice(0, currentIdx + 1);
      const newSans = sans.slice(0, currentIdx);
      newFens.push(g.fen());
      newSans.push(mv.san);
      setFens(newFens);
      setSans(newSans);
      setCurrentIdx(newFens.length - 1);
      setMoveFrom(null);
      setSquareStyles({});
      return true;
    } catch {
      return false;
    }
  }

  function handleSquareClick({ square }: { piece: any; square: string }) {
    if (moveFrom) {
      if (makeMove(moveFrom, square)) return;
      // If move failed but it's a piece of the right color, re-select
      setMoveFrom(null);
      setSquareStyles({});
    }
    try {
      const g = new Chess(currentFen);
      const piece = g.get(square as any);
      if (piece && piece.color === g.turn()) {
        setMoveFrom(square);
        const legalMoves = g.moves({ square: square as any, verbose: true });
        const styles: Record<string, any> = {
          [square]: { backgroundColor: "rgba(255, 255, 0, 0.35)" }
        };
        legalMoves.forEach((m: any) => {
          styles[m.to] = {
            background: "radial-gradient(circle, rgba(163,209,96,0.7) 25%, transparent 25%)",
            borderRadius: "50%",
          };
        });
        setSquareStyles(styles);
      }
    } catch {}
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare) return false;
    return makeMove(sourceSquare, targetSquare);
  }

  function loadFen() {
    setFenError("");
    try {
      const g = new Chess();
      g.load(fenInput.trim());
      const startFen = g.fen();
      setFens([startFen]);
      setSans([]);
      setCurrentIdx(0);
      setMoveFrom(null);
      setSquareStyles({});
      setFenInput("");
      setBestMove(null);
      setBestArrow([]);
    } catch {
      setFenError("Invalid FEN string");
    }
  }

  function reset() {
    setFens(["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]);
    setSans([]);
    setCurrentIdx(0);
    setMoveFrom(null);
    setSquareStyles({});
    setFenInput("");
    setFenError("");
    setBestMove(null);
    setBestArrow([]);
  }

  const evalNum = parseFloat(liveEval.replace("...", "0").replace("?", "0") || "0");
  const evalColor = evalNum > 0.3 ? "text-emerald-400" : evalNum < -0.3 ? "text-red-400" : "text-slate-300";
  const evalBarWhite = Math.max(5, Math.min(95, 50 + evalNum * 5));

  return (
    <main className="min-h-screen bg-[#111113] text-slate-100 flex flex-col pt-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#161618] shrink-0">
        <button onClick={onHome} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold">
          <Home className="w-4 h-4" /> Home
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 overflow-hidden rounded-md">
            <img src="/DC_logo.png" alt="DC" className="w-full h-full object-cover" />
          </div>
          <span className="font-black text-sm bg-gradient-to-r from-indigo-300 to-violet-300 text-transparent bg-clip-text">
            Analysis Board
          </span>
        </div>
        <button onClick={() => setFlipped(f => !f)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Eval bar */}
        <div className="w-4 bg-[#1a1a1f] border-r border-white/5 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 flex flex-col">
            <div className="bg-[#222] transition-all duration-500" style={{ height: `${100 - evalBarWhite}%` }} />
            <div className="bg-slate-200 transition-all duration-500" style={{ height: `${evalBarWhite}%` }} />
          </div>
        </div>

        {/* Board */}
        <div className="flex items-center justify-center bg-[#111113]" style={{ width: "min(calc(100vh - 56px), 62vw)" }}>
          <div style={{ width: "100%", aspectRatio: "1 / 1", maxHeight: "calc(100vh - 56px)" }}>
            <Chessboard options={{
              position: currentFen,
              boardOrientation: flipped ? "black" : "white",
              animationDurationInMs: 120,
              darkSquareStyle: { backgroundColor: "#779556" },
              lightSquareStyle: { backgroundColor: "#ebecd0" },
              boardStyle: { borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" },
              squareStyles,
              arrows: showBestMove ? bestArrow : [],
              onSquareClick: handleSquareClick,
              onPieceDrop: handlePieceDrop,
              allowDragging: true,
            }} />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-h-0 border-l border-white/5 bg-[#161618]">
          {/* Eval header */}
          <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-black tabular-nums ${evalColor}`}>
                {liveEval}
              </span>
              {isAnalyzing && (
                <div className="flex gap-0.5 items-end">
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
                  <span className="w-1 h-3 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowBestMove(v => !v)}
              className={`text-[10px] font-black px-2 py-1 rounded border transition-all ${showBestMove ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-slate-500 bg-white/5 border-white/5"}`}
            >
              {showBestMove ? "✓ Best Move" : "Best Move"}
            </button>
          </div>

          {/* Best move */}
          {bestMove && (
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
              <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest">Best Move</p>
              <p className="text-sm font-black text-emerald-400 font-mono mt-0.5">{bestMove}</p>
            </div>
          )}

          {/* FEN input */}
          <div className="px-4 py-3 border-b border-white/5 shrink-0">
            <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest mb-2">Load FEN</p>
            <div className="flex gap-2">
              <input
                value={fenInput}
                onChange={e => { setFenInput(e.target.value); setFenError(""); }}
                onKeyDown={e => e.key === "Enter" && loadFen()}
                placeholder="Paste FEN string..."
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
            {sans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs text-center px-4">
                <Zap className="w-7 h-7 mb-2 opacity-20" />
                Make a move on the board
              </div>
            ) : (
              <div className="space-y-0.5">
                {Array.from({ length: Math.ceil(sans.length / 2) }).map((_, i) => {
                  const wSan = sans[i * 2];
                  const bSan = sans[i * 2 + 1];
                  const wIdx = i * 2 + 1; // fens index
                  const bIdx = i * 2 + 2;
                  return (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <span className="text-slate-600 w-7 text-right shrink-0">{i + 1}.</span>
                      <button
                        onClick={() => setCurrentIdx(wIdx)}
                        className={`flex-1 px-2 py-1.5 rounded text-left font-bold transition-all ${currentIdx === wIdx ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
                      >{wSan}</button>
                      {bSan ? (
                        <button
                          onClick={() => setCurrentIdx(bIdx)}
                          className={`flex-1 px-2 py-1.5 rounded text-left font-bold transition-all ${currentIdx === bIdx ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}
                        >{bSan}</button>
                      ) : (
                        <div className="flex-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nav */}
          <div className="flex items-center gap-1 px-2 py-2 border-t border-white/5 shrink-0">
            <button onClick={reset} className="p-2 hover:bg-red-500/10 rounded-lg transition-all text-slate-500 hover:text-red-400" title="Reset">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex-1 flex items-center gap-1 bg-black/20 rounded-lg p-1">
              <button onClick={() => setCurrentIdx(0)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-2" />
              </button>
              <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 font-mono px-2 shrink-0">{currentIdx}/{sans.length}</span>
              <button onClick={() => setCurrentIdx(i => Math.min(fens.length - 1, i + 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentIdx(fens.length - 1)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                <ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-2" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
