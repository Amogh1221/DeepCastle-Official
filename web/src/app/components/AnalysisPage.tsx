"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { Home, RotateCcw, ChevronLeft, ChevronRight, Zap, Trash2, BookOpen } from "lucide-react";

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
  const [openingName, setOpeningName] = useState<string>("");
  const [stats, setStats] = useState({ score: 0.0, depth: 0, nodes: 0, nps: 0, pv: "", mateIn: null as number | null });
  const abortRef = useRef<AbortController | null>(null);
  const analysisFenRef = useRef<string>("");
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; abortRef.current?.abort(); };
  }, []);

  const currentFen = fens[currentIdx] ?? fens[0];

  // ── Background Analysis Loop (live eval + hint) ──
  const startBackgroundAnalysis = useCallback((fen: string) => {
    if (abortRef.current) abortRef.current.abort();
    analysisFenRef.current = fen;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsAnalyzing(true);
    setLiveEval("...");

    const thinkTimes = [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
    let idx = 0;

    const runNext = async () => {
      if (ctrl.signal.aborted || analysisFenRef.current !== fen) return;
      const t = thinkTimes[Math.min(idx, thinkTimes.length - 1)];
      try {
        const res = await fetch(`${API_URL}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen, time: t }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (analysisFenRef.current !== fen) return;
          
          const s = data.score;
          const evalStr = s !== undefined
            ? (s > 0 ? `+${Number(s).toFixed(2)}` : Number(s).toFixed(2))
            : "0.00";
          setLiveEval(evalStr);
          setOpeningName(data.opening || "");
          
          setStats({
            score: data.score ?? 0,
            depth: data.depth ?? 0,
            nodes: data.nodes ?? 0,
            nps: data.nps ?? 0,
            pv: data.pv ?? "",
            mateIn: data.mate_in ?? null
          });

          if (typeof data.bestmove === "string" && data.bestmove.length >= 4) {
            setBestMove(data.bestmove);
            if (showBestMove) {
              setBestArrow([{
                startSquare: data.bestmove.slice(0, 2),
                endSquare: data.bestmove.slice(2, 4),
                color: "rgba(163,209,96,0.85)"
              }]);
            }
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setLiveEval("?");
        return;
      }
      idx++;
      if (idx < thinkTimes.length && !ctrl.signal.aborted) {
        setTimeout(runNext, 200);
      } else if (!ctrl.signal.aborted) {
        setIsAnalyzing(false);
      }
    };

    runNext();
  }, [showBestMove]);

  // Analyze whenever position changes
  useEffect(() => {
    startBackgroundAnalysis(currentFen);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [currentFen, startBackgroundAnalysis]);

  // Hide best move arrow when toggled off
  useEffect(() => {
    if (!showBestMove) setBestArrow([]);
    else if (bestMove) setBestArrow([{
      startSquare: bestMove.slice(0, 2),
      endSquare: bestMove.slice(2, 4),
      color: "rgba(163,209,96,0.85)"
    }]);
  }, [showBestMove, bestMove]);

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
      setOpeningName("");
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
    setOpeningName("");
  }

  const evalNum = stats.score;
  const rawWinProb = Math.max(5, Math.min(95, 50 + evalNum * 7));
  const evalBarFill = rawWinProb; // Inside analysis, always from white's perspective
  
  const evalLabel = (() => {
    if (stats.mateIn !== null) return `M${stats.mateIn}`;
    return evalNum > 0 ? `+${evalNum.toFixed(2)}` : evalNum.toFixed(2);
  })();

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

      <div className="flex-1 flex justify-center py-4 px-2 overflow-hidden w-full">
        <div className="w-full max-w-[1100px] flex gap-3 h-full max-h-[820px]">
          
          <div className="flex flex-col gap-2" style={{ width: "55%" }}>
            <div className="flex gap-3 flex-1 min-h-0 justify-end">
              {/* Eval bar */}
            <div className="bg-[#161512] rounded-md flex flex-col overflow-hidden border border-slate-800 relative w-7 shrink-0">
                <motion.div 
                  animate={{ height: `${100 - evalBarFill}%` }}
                  className="bg-[#1a1a1a] flex-shrink-0"
                  transition={{ type: "spring", stiffness: 40, damping: 15 }}
                />
                <motion.div 
                  animate={{ height: `${evalBarFill}%` }}
                  className="bg-gray-100 flex-shrink-0 relative"
                  transition={{ type: "spring", stiffness: 40, damping: 15 }}
                >
                  <div className="absolute bottom-1 w-full text-center text-[9px] font-black text-black opacity-50 leading-none">
                    {evalLabel}
                  </div>
                </motion.div>
                <div className="absolute top-1/2 w-full border-t border-slate-700 pointer-events-none" />
            </div>

            <div className="flex-1 aspect-square bg-[#262421] p-3 rounded-lg shadow-2xl border-2 border-[#3d3a36]" style={{ height: "100%", maxHeight: "calc(100vh - 100px)" }}>
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
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#1a1a1f] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
            {/* Eval header */}
            <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center justify-between bg-black/20">
              <div className="flex-1 flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-black font-mono`}>{evalLabel}</span>
                  {isAnalyzing && (
                    <div className="flex gap-0.5">
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-indigo-400 rounded-full" />
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-indigo-400 rounded-full" />
                      <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-indigo-400 rounded-full" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="text-[10px] text-slate-500 uppercase font-black shrink-0 tracking-tighter">Depth {stats.depth}</span>
                  <div className="w-px h-2 bg-white/5 shrink-0" />
                  <span className="text-[10px] text-slate-500 font-mono truncate tracking-tighter">{stats.nps > 1000000 ? (stats.nps / 1000000).toFixed(1) + "M" : (stats.nps / 1000).toFixed(0) + "K"} NPS</span>
                </div>
              </div>
              <button
                onClick={() => setShowBestMove(v => !v)}
                className={`text-[10px] uppercase font-black px-3 py-1.5 rounded-lg transition-all ${showBestMove ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" : "text-slate-500 hover:text-slate-300 bg-white/5 border border-white/5"}`}
              >
                {showBestMove ? "✓ Best Move" : "Best Move"}
              </button>
            </div>

            {/* Best move / Opening */}
          {(bestMove || openingName) && (
            <div className="px-5 py-3 border-b border-white/5 shrink-0 bg-indigo-500/5 flex flex-col gap-2">
              {bestMove && (
                <div>
                  <p className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Suggested</p>
                  <p className="text-sm font-black text-emerald-400 font-mono mt-0.5">{bestMove}</p>
                </div>
              )}
              {openingName && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-[10px] font-bold text-indigo-300 line-clamp-1">{openingName}</span>
                </div>
              )}
            </div>
          )}

            {/* FEN input */}
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-2">Load Position (FEN)</p>
              <div className="flex gap-2 relative">
                <input
                  value={fenInput}
                  onChange={e => { setFenInput(e.target.value); setFenError(""); }}
                  onKeyDown={e => e.key === "Enter" && loadFen()}
                  placeholder="Paste FEN string..."
                  className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 font-mono"
                />
                <button onClick={loadFen} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white shadow shadow-indigo-500/20 rounded-lg font-black text-xs transition-all shrink-0">
                  Load
                </button>
              </div>
              {fenError && <p className="text-red-400 text-[10px] font-bold mt-1.5">{fenError}</p>}
            </div>

            {/* Move list */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/10">
              {sans.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs text-center px-6">
                  <div className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center bg-white/5 mb-3">
                    <Zap className="w-5 h-5 opacity-40 text-indigo-400" />
                  </div>
                  <p className="font-bold opacity-70">Make a move on the board to begin analysis.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
                  {Array.from({ length: Math.ceil(sans.length / 2) }).map((_, i) => {
                    const wSan = sans[i * 2];
                    const bSan = sans[i * 2 + 1];
                    const wIdx = i * 2 + 1;
                    const bIdx = i * 2 + 2;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="text-slate-600 w-8 text-right font-bold shrink-0">{i + 1}.</span>
                        <button
                          onClick={() => setCurrentIdx(wIdx)}
                          className={`flex-1 px-2.5 py-1.5 rounded-md text-left font-bold transition-all ${currentIdx === wIdx ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20" : "hover:bg-white/5 hover:text-slate-200"}`}
                        >{wSan}</button>
                        {bSan ? (
                          <button
                            onClick={() => setCurrentIdx(bIdx)}
                            className={`flex-1 px-2.5 py-1.5 rounded-md text-left font-bold transition-all ${currentIdx === bIdx ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20" : "hover:bg-white/5 hover:text-slate-200"}`}
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
            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5 shrink-0 bg-[#161618]">
              <button onClick={reset} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-all text-red-500 flex items-center justify-center" title="Reset Board">
                <RotateCcw className="w-4 h-4" />
              </button>
              <div className="flex-1 flex items-center gap-1 bg-black/30 border border-white/5 rounded-lg p-1 shadow-inner">
                <button onClick={() => setCurrentIdx(0)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-2" />
                </button>
                <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center border-l border-white/5">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 font-mono px-3 shrink-0">{currentIdx} / {sans.length}</span>
                <button onClick={() => setCurrentIdx(i => Math.min(fens.length - 1, i + 1))} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center border-r border-white/5">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => setCurrentIdx(fens.length - 1)} className="flex-1 py-1.5 hover:bg-white/5 rounded transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
