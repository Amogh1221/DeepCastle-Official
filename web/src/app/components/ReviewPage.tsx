"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu, RefreshCw, TrendingUp, Flag, RotateCcw, Lightbulb, ChevronRight, Eye, EyeOff, Play, Clock, Zap, Brain, Shield, GitBranch, Database, Trophy, ChevronLeft, X, Crown, Activity, Target, BarChart2, BookOpen, Users, Share2, Copy, Check, Hash, MessageSquare, PlayCircle
} from "lucide-react";
import { GameSettings, MatchSettings, Stats, PlayerColor, GameMode, AppPage } from "../types";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

export function ReviewPage({ settings, moves, onHome }: { settings: GameSettings; moves: string[]; onHome: () => void }) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPly, setCurrentPly] = useState(0);
  const [error, setError] = useState<string|null>(null);

  // Generate board state on the fly
  const currentFen = React.useMemo(() => {
    const g = new Chess();
    for(let i=0; i<currentPly; i++) {
        try { g.move(moves[i]); } catch(e) {}
    }
    return g.fen();
  }, [moves, currentPly]);

  useEffect(() => {
    async function runAnalysis() {
      try {
        const res = await fetch(`${API_URL}/analyze-game`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            moves,
            time_per_move: 0.1,
            player_color: settings.playerColor
          })
        });
        if(!res.ok) throw new Error("Analysis failed");
        const data = await res.json();
        setAnalysis(data);
      } catch(err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    runAnalysis();
    setCurrentPly(moves.length); // go to end initially
  }, [moves, settings.playerColor]);

  // Which ply is the current player move? (If player is white, ply 1, 3, 5 are theirs. 1-indexed)
  const isPlayerMove = settings.playerColor === "white" ? currentPly % 2 !== 0 : currentPly % 2 === 0;
  
  // Find classification for current layout
  const currentMoveAnalysis = isPlayerMove && analysis 
      ? analysis.moves.find((m: any) => m.fen.split(" ")[0] === currentFen.split(" ")[0] || m.san === moves[currentPly-1]) 
      : null;

  return (
    <main className="min-h-screen bg-[#111111] text-slate-100 flex items-center justify-center p-4">
       {loading ? (
           <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 text-transparent bg-clip-text">DeepCastle is analyzing your game...</p>
           </div>
       ) : error ? (
           <div className="text-center">
              <p className="text-red-400 font-bold text-xl mb-4">Error: {error}</p>
              <button onClick={onHome} className="py-2 px-6 bg-slate-800 rounded">Go Home</button>
           </div>
       ) : (
           <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-10 gap-6">
              {/* BOARD */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                 <div className="w-full aspect-square bg-[#1a1a1f] p-4 rounded-xl border border-white/5 shadow-2xl">
                    <Chessboard options={{
                       position: currentFen,
                       boardOrientation: settings.playerColor,
                       animationDurationInMs: 200,
                       darkSquareStyle: { backgroundColor: "#779556" },
                       lightSquareStyle: { backgroundColor: "#ebecd0" },
                       boardStyle: { borderRadius: "4px" }
                    }} />
                 </div>
              </div>
              
              {/* STATS AREA + CONTROLS */}
              <div className="lg:col-span-4 flex flex-col gap-4 lg:min-h-[600px]">
                  <div className="bg-gradient-to-br from-[#1a1a1f] to-[#161619] p-6 rounded-xl border border-emerald-500/20 shadow-2xl flex flex-col flex-1">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black flex items-center gap-2 text-emerald-400"><Target className="w-6 h-6"/> Game Review</h2>
                        <button onClick={onHome} className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors">
                           <X className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-6">
                         <div className="bg-black/40 p-4 rounded-xl text-center border border-white/5">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-widest">Accuracy</p>
                            <p className="text-3xl font-black text-emerald-400">{analysis?.accuracy}%</p>
                         </div>
                         <div className="bg-black/40 p-4 rounded-xl text-center border border-white/5">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-widest">Performance</p>
                            <p className="text-3xl font-black text-amber-400">{analysis?.estimated_elo}</p>
                         </div>
                      </div>

                      {/* Move Context */}
                      <div className="mb-6 bg-black/40 p-5 rounded-xl border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 group-hover:opacity-10 transition-opacity">
                           <Activity className="w-16 h-16"/>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                           <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Current Position</span>
                           <span className="text-xs font-bold text-slate-300 bg-white/5 px-2 py-0.5 rounded">Move {Math.ceil(currentPly / 2)}</span>
                        </div>
                        {currentMoveAnalysis ? (
                           <div className="flex items-center gap-4">
                              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-xl border-2 ${
                                currentMoveAnalysis.classification === "Brilliant" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                                currentMoveAnalysis.classification === "Best" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                                currentMoveAnalysis.classification === "Blunder" ? "bg-red-500/10 text-red-500 border-red-500/30" :
                                "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}>
                                {currentMoveAnalysis.classification[0]}
                              </div>
                              <div>
                                 <p className={`text-xl font-black tracking-tighter ${
                                    currentMoveAnalysis.classification === "Brilliant" ? "text-cyan-400" :
                                    currentMoveAnalysis.classification === "Best" ? "text-emerald-400" :
                                    currentMoveAnalysis.classification === "Blunder" ? "text-red-500" :
                                    "text-amber-400"
                                 }`}>{currentMoveAnalysis.classification}</p>
                                 <p className="text-xs text-slate-500 font-medium">Centipawn Loss: {Math.round(currentMoveAnalysis.cpl)}</p>
                              </div>
                           </div>
                        ) : (
                           <div className="flex items-center gap-3 italic text-slate-500 text-sm py-2">
                              {currentPly <= 10 && currentPly > 0 ? (
                                <div className="flex items-center gap-2 text-indigo-400 not-italic font-black">
                                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                                    <BookOpen className="w-6 h-6" />
                                  </div>
                                  <span>Book Move</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-10 h-10 bg-slate-500/10 rounded-xl flex items-center justify-center border border-slate-500/20">
                                    <Clock className="w-6 h-6 animate-pulse" />
                                  </div>
                                  <span>{currentPly === 0 ? "Opening Position" : "Opponent Move Analyzed"}</span>
                                </div>
                              )}
                           </div>
                        )}
                      </div>

                      {/* Navigation Controls */}
                      <div className="grid grid-cols-2 gap-3 mb-8">
                        <button 
                           onClick={() => setCurrentPly(Math.max(0, currentPly-1))}
                           className="py-5 bg-[#262421] hover:bg-slate-700 rounded-2xl flex items-center justify-center transition-all border border-white/5 active:scale-95 group shadow-lg"
                        >
                           <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform"/>
                        </button>
                        <button 
                           onClick={() => setCurrentPly(Math.min(moves.length, currentPly+1))}
                           className="py-5 bg-[#262421] hover:bg-slate-700 rounded-2xl flex items-center justify-center transition-all border border-white/5 active:scale-95 group shadow-lg"
                        >
                           <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform"/>
                        </button>
                      </div>

                      <div className="space-y-2.5 mb-8">
                         {Object.entries(analysis?.counts || {}).filter(([_, count]: any) => count > 0).map(([cls, count]: any) => (
                             <div key={cls} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                <span className={`font-black text-[10px] uppercase tracking-widest ${
                                    cls === "Brilliant" ? "text-cyan-400" :
                                    cls === "Best" || cls === "Excellent" ? "text-emerald-400" :
                                    cls === "Blunder" ? "text-red-500" :
                                    "text-amber-400"
                                }`}>{cls}</span>
                                <span className="text-white font-black text-sm">{count}</span>
                             </div>
                         ))}
                      </div>

                      <div className="mt-auto">
                         <button onClick={onHome} className="w-full py-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-2xl font-black transition-all shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                            FINISH ANALYSIS
                         </button>
                      </div>
                  </div>
              </div>
           </div>
       )}
    </main>
  );
}