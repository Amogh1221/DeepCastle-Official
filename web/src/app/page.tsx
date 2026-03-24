"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trophy, 
  Cpu, 
  History, 
  Settings2, 
  RefreshCw, 
  Zap,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// TYPES & DEFAULTS
// ============================================================
interface EngineStats {
  score: number;
  depth: number;
  nodes: number;
  nps: number;
  pv: string;
}

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

export default function DeepcastlePremium() {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<{san: string, score: string}[]>([]);
  const [stats, setStats] = useState<EngineStats>({
    score: 0.0,
    depth: 0,
    nodes: 0,
    nps: 0,
    pv: ""
  });
  const [thinking, setThinking] = useState(false);
  const [thinkTime, setThinkTime] = useState(1.0);

  // ============================================================
  // ENGINE LOGIC
  // ============================================================
  const fetchMove = useCallback(async (fen: string) => {
    setThinking(true);
    try {
      const response = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen, time: thinkTime }),
      });
      const data = await response.json();
      
      if (data.bestmove) {
        const move = game.move(data.bestmove);
        if (move) {
          setGame(new Chess(game.fen()));
          setMoveHistory(prev => [...prev, { san: move.san, score: data.score.toFixed(2) }]);
          setStats({
            score: data.score,
            depth: data.depth,
            nodes: data.nodes,
            nps: data.nps,
            pv: data.pv
          });
        }
      }
    } catch (error) {
      console.error("Engine API failed:", error);
    } finally {
      setThinking(false);
    }
  }, [game, thinkTime]);

  // ============================================================
  // HANDLERS
  // ============================================================
  function onDrop(sourceSquare: string, targetSquare: string) {
    if (game.turn() === 'b' || game.isGameOver()) return false;

    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      setGame(new Chess(game.fen()));
      setMoveHistory(prev => [...prev, { san: move.san, score: "USR" }]);
      
      // Trigger Engine
      setTimeout(() => fetchMove(game.fen()), 200);
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetGame() {
    setGame(new Chess());
    setMoveHistory([]);
    setStats({ score: 0, depth: 0, nodes: 0, nps: 0, pv: "" });
  }

  // =join eval bar calculation
  const winProb = 50 + (stats.score * 5);
  const clampedProb = Math.max(5, Math.min(95, winProb));

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-4 md:p-8 overflow-hidden selection:bg-indigo-500/30">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* ============================================================
            LEFT COLUMN: THE ENGINE ROOM
        ============================================================ */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 p-6 rounded-3xl shadow-2xl">
            <div>
              <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                DEEPCASTLE <span className="font-thin italic text-2xl ml-1 text-slate-500">v7</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-semibold flex items-center gap-2">
                <Zap className="w-3 h-3 text-yellow-500" /> Hybrid Neural Search Architecture
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={resetGame}
                className="p-3 hover:bg-slate-800/50 rounded-2xl transition-all border border-transparent hover:border-slate-700/50"
              >
                <RefreshCw className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Board Area */}
          <div className="flex gap-6 items-stretch">
            {/* Eval Bar */}
            <div className="w-4 bg-slate-900/60 rounded-full flex flex-col-reverse overflow-hidden border border-slate-800/50 shadow-inner">
               <motion.div 
                  initial={{ height: "50%" }}
                  animate={{ height: `${clampedProb}%` }}
                  className="bg-gradient-to-t from-slate-200 to-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  transition={{ type: "spring", stiffness: 50, damping: 20 }}
               />
            </div>

            {/* Chessboard Container */}
            <div className="flex-1 bg-slate-900/20 backdrop-blur-sm p-4 rounded-3xl border border-slate-800/30 shadow-2xl relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
               {/* @ts-ignore */}
               <Chessboard 
                 position={game.fen()} 
                 onPieceDrop={onDrop}
                 customBoardStyle={{
                   borderRadius: '12px',
                   boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)'
                 }}
                 customDarkSquareStyle={{ backgroundColor: '#1e293b' }}
                 customLightSquareStyle={{ backgroundColor: '#334155' }}
                 animationDuration={300}
               />
               
               {thinking && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-3xl z-20">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
                    />
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* ============================================================
            RIGHT COLUMN: ANALYSIS & STATS
        ============================================================ */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Engine Dashboard */}
          <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-6 shadow-2xl overflow-hidden relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <Cpu className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="font-bold text-lg tracking-tight">Engine Analysis</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 group hover:border-indigo-500/30 transition-colors">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Depth</p>
                  <p className="text-2xl font-black text-white">{stats.depth}<span className="text-xs text-slate-600 font-normal ml-1">ply</span></p>
               </div>
               <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 group hover:border-purple-500/30 transition-colors">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Evaluation</p>
                  <p className={cn("text-2xl font-black", stats.score >=0 ? "text-emerald-400" : "text-rose-400")}>
                    {stats.score > 0 && "+"}{stats.score.toFixed(2)}
                  </p>
               </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs px-2">
                <span className="text-slate-500 uppercase tracking-widest font-bold">Search (NPS)</span>
                <span className="text-indigo-400 font-mono">{(stats.nps/1000).toFixed(1)}k</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, stats.nps/20000)}%` }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" 
                />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 px-1">Principal Variation</p>
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/50 font-mono text-sm text-slate-300 leading-relaxed shadow-inner italic">
                {stats.pv || "Standing by... waiting for move."}
              </div>
            </div>
          </section>

          {/* Move Log */}
          <section className="flex-1 bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden min-h-[300px]">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500/10 rounded-xl">
                  <History className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="font-bold text-lg tracking-tight">Move Log</h2>
             </div>
             
             <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
               <AnimatePresence initial={false}>
                  {moveHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3 grayscale opacity-40">
                      <RefreshCw className="w-8 h-8 animate-spin-slow" />
                      <p className="text-xs uppercase tracking-widest font-bold">Awaiting first move</p>
                    </div>
                  ) : (
                    moveHistory.map((m, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i}
                        className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800/30 group hover:border-slate-700 active:scale-95 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-600 w-4">{Math.floor(i/2) + 1}</span>
                          <span className={cn("font-bold text-sm", i % 2 === 0 ? "text-slate-100" : "text-indigo-300")}>
                            {m.san}
                          </span>
                        </div>
                        <span className={cn("text-[10px] uppercase tracking-widest font-bold", m.score === "USR" ? "text-slate-500" : "text-emerald-500/80")}>
                          {m.score === "USR" ? "Player" : `CPU ${m.score}`}
                        </span>
                      </motion.div>
                    ))
                  )}
               </AnimatePresence>
             </div>
          </section>

          {/* Controls Footer */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/50 rounded-3xl p-4 shadow-2xl flex items-center gap-4">
             <div className="flex-1">
               <div className="flex items-center justify-between mb-2 px-1">
                 <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Thought Time</span>
                 <span className="text-xs font-black text-indigo-400">{thinkTime}s</span>
               </div>
               <input 
                 type="range" 
                 min="0.1" 
                 max="10.0" 
                 step="0.1"
                 value={thinkTime}
                 onChange={(e) => setThinkTime(parseFloat(e.target.value))}
                 className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
               />
             </div>
          </div>
        </div>

      </div>
    </main>
  );
}
