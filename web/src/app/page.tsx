"use client";

import React, { useState, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion } from "framer-motion";
import { Cpu, Settings2, RefreshCw, TrendingUp, Flag, RotateCcw, Lightbulb, ChevronRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

export default function DeepcastleGrandmaster() {
  const [fen, setFen] = useState(new Chess().fen());
  const gameRef = useRef(new Chess()); // Mutable ref — always up to date
  const [moveHistory, setMoveHistory] = useState<{ san: string; score: string }[]>([]);
  const [stats, setStats] = useState({ score: 0.0, depth: 0, nodes: 0, nps: 0, pv: "" });
  const [thinking, setThinking] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [botMessage, setBotMessage] = useState("Let's see what you've got.");

  // Click-to-move state
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});

  // ─── Engine Fetch ────────────────────────────────────────────────────────────
  const fetchMove = useCallback(async (currentFen: string) => {
    setThinking(true);
    setIsPlayerTurn(false);
    setBotMessage("Analyzing potential lines...");

    try {
      const response = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, time: 1.0 }),
      });

      if (!response.ok) throw new Error("API Error");
      const data = await response.json();

      if (data.bestmove) {
        const g = new Chess(currentFen);
        let mv = null;
        try {
          mv = g.move(data.bestmove);
        } catch {
          try {
            mv = g.move({
              from: data.bestmove.slice(0, 2),
              to: data.bestmove.slice(2, 4),
              promotion: data.bestmove.length > 4 ? data.bestmove[4] : "q",
            });
          } catch {}
        }

        if (mv) {
          gameRef.current = g;
          setFen(g.fen());
          setMoveHistory(prev => [...prev, { san: mv!.san, score: String(data.score?.toFixed(2) ?? "?") }]);
          setStats({
            score: data.score ?? 0,
            depth: data.depth ?? 0,
            nodes: data.nodes ?? 0,
            nps: data.nps ?? 0,
            pv: data.pv ?? "",
          });
          if ((data.score ?? 0) > 2) setBotMessage("My position is dominating.");
          else if ((data.score ?? 0) < -2) setBotMessage("You are playing remarkably well.");
          else setBotMessage("So be it.");
        } else {
          setBotMessage("Engine returned an invalid move.");
        }
      }
    } catch (err) {
      console.error(err);
      setBotMessage("Connection to engine failed!");
    } finally {
      setThinking(false);
      setIsPlayerTurn(true);
    }
  }, []);

  // ─── Apply Player Move ───────────────────────────────────────────────────────
  function applyPlayerMove(from: string, to: string): boolean {
    const g = gameRef.current;
    if (g.turn() !== "w" || g.isGameOver() || !isPlayerTurn) return false;

    const copy = new Chess(g.fen());
    let mv = null;
    try {
      mv = copy.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }

    if (mv) {
      gameRef.current = copy;
      setFen(copy.fen());
      setMoveHistory(prev => [...prev, { san: mv!.san, score: "USR" }]);
      setBotMessage("Formidable move. Calculating...");
      setMoveFrom(null);
      setSquareStyles({});
      setTimeout(() => fetchMove(copy.fen()), 150);
      return true;
    }
    return false;
  }

  // ─── Highlight legal move squares ────────────────────────────────────────────
  function showLegalMoves(square: string): boolean {
    const g = gameRef.current;
    const moves = g.moves({ square: square as any, verbose: true });
    if (moves.length === 0) return false;

    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: "rgba(255, 255, 0, 0.5)" },
    };
    const srcPiece = g.get(square as any);
    moves.forEach((m: any) => {
      const dst = g.get(m.to as any);
      styles[m.to] = {
        background:
          dst && srcPiece && dst.color !== srcPiece.color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    setSquareStyles(styles);
    return true;
  }

  // ─── react-chessboard v5 handlers (note different signatures!) ───────────────
  // onPieceDrop receives { piece, sourceSquare, targetSquare }
  function handlePieceDrop({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare) return false;
    setMoveFrom(null);
    setSquareStyles({});
    return applyPlayerMove(sourceSquare, targetSquare);
  }

  // onSquareClick receives { piece, square }
  function handleSquareClick({ square }: { piece: any; square: string }) {
    const g = gameRef.current;
    if (g.turn() !== "w" || g.isGameOver() || !isPlayerTurn) return;

    // If a piece is already selected, try to land on this square
    if (moveFrom) {
      const moved = applyPlayerMove(moveFrom, square);
      if (moved) return;

      // Wrong destination — check if user is clicking a different own piece
      const p = g.get(square as any);
      if (p && p.color === "w") {
        const hasMoves = showLegalMoves(square);
        if (hasMoves) { setMoveFrom(square); return; }
      }
      setMoveFrom(null);
      setSquareStyles({});
      return;
    }

    // Nothing selected yet — select if it's a white piece
    const p = g.get(square as any);
    if (p && p.color === "w") {
      const hasMoves = showLegalMoves(square);
      if (hasMoves) setMoveFrom(square);
    }
  }

  // ─── Game Controls ────────────────────────────────────────────────────────────
  function resetGame() {
    const fresh = new Chess();
    gameRef.current = fresh;
    setFen(fresh.fen());
    setMoveHistory([]);
    setSquareStyles({});
    setMoveFrom(null);
    setIsPlayerTurn(true);
    setBotMessage("A fresh start. Your move.");
    setStats({ score: 0, depth: 0, nodes: 0, nps: 0, pv: "" });
  }

  function forceUndo() {
    const g = new Chess(gameRef.current.fen());
    g.undo(); g.undo();
    const fresh = new Chess(g.fen());
    gameRef.current = fresh;
    setFen(fresh.fen());
    setMoveHistory(h => h.slice(0, -2));
    setSquareStyles({});
    setMoveFrom(null);
    setIsPlayerTurn(true);
    setBotMessage("Take-back granted. Choose wisely.");
  }

  const winProb = Math.max(5, Math.min(95, 50 + stats.score * 7));

  // ─── React-Chessboard v5 Options object ──────────────────────────────────────
  const boardOptions = {
    position: fen,
    squareStyles: squareStyles,
    darkSquareStyle: { backgroundColor: "#779556" },
    lightSquareStyle: { backgroundColor: "#ebecd0" },
    boardStyle: { borderRadius: "4px" },
    animationDurationInMs: 200,
    allowDragging: !thinking && isPlayerTurn,
    onPieceDrop: handlePieceDrop,
    onSquareClick: handleSquareClick,
  };

  return (
    <main className="min-h-screen bg-[#111111] text-slate-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-5" />
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-10 gap-6 relative z-10">

        {/* ── LEFT : BOARD ───────────────────────────────────── */}
        <div className="lg:col-span-6 flex flex-col gap-4">

          {/* Engine Profile */}
          <div className="flex items-center justify-between p-3 bg-[#262421] rounded-lg border-b-2 border-slate-900 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center border-2 border-indigo-400">
                  <Cpu className="w-8 h-8 text-white opacity-80" />
                </div>
                {thinking && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#262421]" />
                  </span>
                )}
              </div>
              <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                Deepcastle v7{" "}
                <span className="text-orange-500 text-xs font-bold px-1.5 py-0.5 bg-orange-500/10 rounded border border-orange-500/20">
                  3604 Elo
                </span>
              </h3>
            </div>
            <Settings2 className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors" />
          </div>

          {/* Board + Eval Bar */}
          <div className="flex gap-4 items-stretch">
            <div className="w-6 bg-[#161512] rounded-md flex flex-col-reverse overflow-hidden border border-slate-800 relative">
              <motion.div
                initial={{ height: "50%" }}
                animate={{ height: `${winProb}%` }}
                className="bg-gray-100 relative"
                transition={{ type: "spring", stiffness: 40, damping: 15 }}
              >
                <div className="absolute top-2 w-full text-center text-[10px] font-black text-black opacity-40">
                  {stats.score.toFixed(1)}
                </div>
              </motion.div>
              <div className="absolute top-1/2 w-full border-t border-slate-700 pointer-events-none" />
            </div>

            <div className="flex-1 bg-[#262421] p-3 rounded-lg shadow-2xl border-2 border-[#3d3a36]">
              {/* react-chessboard v5: all config goes through the `options` prop */}
              <Chessboard options={boardOptions} />
            </div>
          </div>

          {/* Player Profile */}
          <div className="p-3 bg-[#262421] rounded-lg shadow-md border-t-2 border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center border border-slate-600">
                <div className="w-6 h-6 bg-slate-400 rounded-sm opacity-50" />
              </div>
              <span className="font-bold text-sm tracking-tight">Human Challenger</span>
            </div>
            {thinking && <span className="text-xs text-emerald-400 animate-pulse font-semibold">Engine thinking…</span>}
          </div>
        </div>

        {/* ── RIGHT : PANEL ──────────────────────────────────── */}
        <div className="lg:col-span-4 flex flex-col gap-4">

          {/* Bot Speech */}
          <section className="bg-[#262421] rounded-lg border border-[#3d3a36] shadow-xl">
            <div className="p-6 flex gap-4 min-h-[120px]">
              <div className="w-12 h-12 flex-shrink-0 bg-indigo-600/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
                <Cpu className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="relative bg-[#3d3a36] p-4 rounded-xl rounded-tl-none border border-white/5">
                  <p className="text-sm italic leading-relaxed text-slate-200">"{botMessage}"</p>
                  <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-transparent border-r-[10px] border-r-[#3d3a36] border-b-[8px] border-b-transparent" />
                </div>
              </div>
            </div>
          </section>

          {/* Stats + History + Controls */}
          <section className="bg-[#262421] rounded-lg border border-[#3d3a36] p-4 flex flex-col gap-4 flex-1 shadow-xl">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161512] p-3 rounded-lg border border-white/5">
                <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Depth</p>
                <p className="text-xl font-bold tracking-tighter text-slate-200">
                  {stats.depth}<span className="text-[10px] ml-1 opacity-40">PLY</span>
                </p>
              </div>
              <div className="bg-[#161512] p-3 rounded-lg border border-white/5">
                <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Search Speed</p>
                <p className="text-xl font-bold tracking-tighter text-indigo-400">
                  {(stats.nps / 1000).toFixed(1)}k<span className="text-[10px] ml-1 opacity-40">NPS</span>
                </p>
              </div>
            </div>

            <div className="flex-1 bg-[#161512] rounded-lg border border-white/5 flex flex-col overflow-hidden max-h-[300px]">
              <div className="p-3 bg-[#2b2a27] text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center justify-between">
                <span>History</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="flex-1 overflow-y-auto p-1 divide-y divide-white/5">
                {moveHistory.length === 0 ? (
                  <div className="h-48 flex items-center justify-center opacity-20 italic text-sm">
                    Waiting for first move...
                  </div>
                ) : (
                  Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                    <div key={i} className="grid grid-cols-12 items-center hover:bg-white/5 transition-colors">
                      <div className="col-span-2 text-center text-[10px] font-bold text-slate-600 bg-[#2b2a27]/30 py-2 h-full flex items-center justify-center">
                        {i + 1}.
                      </div>
                      <div className="col-span-10 grid grid-cols-2">
                        <button className="py-2 px-3 text-left font-bold text-xs hover:bg-indigo-500/10 transition-colors">
                          {moveHistory[i * 2]?.san}
                        </button>
                        {moveHistory[i * 2 + 1] && (
                          <button className="py-2 px-3 text-left font-bold text-xs text-orange-400 hover:bg-orange-500/10 border-l border-white/5 transition-colors">
                            {moveHistory[i * 2 + 1].san}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setBotMessage("I accept your surrender.")} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group">
                <Flag className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-red-300">Resign</span>
              </button>
              <button onClick={forceUndo} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-slate-700 rounded transition-all group">
                <RotateCcw className="w-5 h-5 text-slate-400 group-hover:text-white" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-slate-100">Undo</span>
              </button>
              <button onClick={() => setBotMessage("I suggest positional improvement.")} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-amber-900/40 rounded transition-all group">
                <Lightbulb className="w-5 h-5 text-slate-400 group-hover:text-amber-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">Hint</span>
              </button>
            </div>
          </section>

          <div className="bg-[#262421] p-4 rounded-lg border border-[#3d3a36] flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-tighter">
              <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                <RefreshCw className="w-3 h-3" /> Auto
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-indigo-400" /> {stats.nodes.toLocaleString()} Nodes
              </div>
            </div>
            <button onClick={resetGame} className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10">
              New Game
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}