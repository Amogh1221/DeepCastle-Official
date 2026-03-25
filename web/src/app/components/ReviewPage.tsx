"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
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
  const [flipped, setFlipped] = useState(false);

  // Generate board state on the fly
  const { fen: currentFen, lastMove } = React.useMemo(() => {
    const g = new Chess();
    let moveObj: any = null;
    for(let i=0; i<currentPly; i++) {
        try { moveObj = g.move(moves[i]); } catch(e) {}
    }
    return { fen: g.fen(), lastMove: moveObj };
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
            player_color: settings.playerColor,
            start_fen: settings.startFen
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

  // Prepare chart data (0 being opening position, 0 score)
  const chartData = analysis ? [{ move_num: 0, score: 0 }, ...analysis.moves.map((m: any) => ({
    move_num: m.move_num,
    score: settings.playerColor === "white" ? m.score_after : -m.score_after, // Chart goes up when player is winning
  }))] : [];

  const handleChartClick = (e: any) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      setCurrentPly(e.activePayload[0].payload.move_num);
    }
  };

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
                       boardOrientation: flipped ? (settings.playerColor === "white" ? "black" : "white") : settings.playerColor,
                       animationDurationInMs: 200,
                       darkSquareStyle: { backgroundColor: "#779556" },
                       lightSquareStyle: { backgroundColor: "#ebecd0" },
                       boardStyle: { borderRadius: "4px" },
                       squareStyles: (() => {
                          const styles: any = {};
                          if (lastMove) {
                            styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
                            styles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
                            if (currentMoveAnalysis?.classification) {
                               const iconName = currentMoveAnalysis.classification.toLowerCase();
                               styles[lastMove.to] = {
                                 ...styles[lastMove.to],
                                 backgroundImage: `url(/icons/${iconName}.png)`,
                                 backgroundRepeat: 'no-repeat',
                                 backgroundPosition: 'top right',
                                 backgroundSize: '40%'
                               };
                            }
                          }
                          return styles;
                       })(),
                       arrows: (() => {
                          if (lastMove && currentMoveAnalysis?.classification) {
                              const bad = ["Blunder", "Mistake", "Inaccuracy", "Miss"].includes(currentMoveAnalysis.classification);
                              return [
                                 [lastMove.from, lastMove.to, bad ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)'] as any
                              ];
                          }
                          return [];
                       })()
                    }} />
                 </div>


                 {/* EVALUATION GRAPH */}
                 <div className="w-full h-40 bg-[#1a1a1f] p-4 rounded-xl border border-white/5 shadow-2xl overflow-hidden cursor-pointer">
                   <h3 className="text-xs uppercase font-black text-slate-500 mb-2 tracking-widest pl-2">Evaluation Graph</h3>
                   <div className="w-full h-full -ml-4">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={chartData} onClick={handleChartClick}>
                         <YAxis domain={[-10, 10]} hide />
                         <Tooltip 
                           contentStyle={{ backgroundColor: "#262421", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                           itemStyle={{ color: "#a7f3d0", fontWeight: 'bold' }}
                           labelStyle={{ display: "none" }}
                           formatter={(value: any) => [typeof value === 'number' ? (value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)) : value, "Eval"]}
                         />
                         <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                         <Line 
                           type="monotone" 
                           dataKey="score" 
                           stroke="#10b981" 
                           strokeWidth={3}
                           dot={false}
                           activeDot={{ r: 6, fill: "#34d399", stroke: "#064e3b", strokeWidth: 2 }}
                         />
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                 </div>
              </div>
              
              {/* STATS AREA + CONTROLS */}
              <div className="lg:col-span-4 flex flex-col gap-4 lg:min-h-[600px]">
                  <div className="bg-[#302e2c] text-slate-200 p-6 rounded-xl border border-white/5 shadow-2xl flex flex-col flex-1 relative custom-scrollbar">
                      {/* HEADER */}
                      <div className="flex flex-col items-center mb-6 border-b border-white/10 pb-4">
                        <h2 className="text-xl font-normal flex items-center gap-2 mb-4">
                          <Check className="w-5 h-5"/> Game Analysis
                        </h2>
                        <div className="flex gap-4 mb-2">
                           <button onClick={onHome} className="bg-[#3d98bd] hover:bg-[#3488aa] text-[#1a1a1a] font-bold text-[10px] px-3 py-1 rounded shadow">
                             LOAD GAME
                           </button>
                           <button disabled className="bg-[#3b3937] text-white/40 font-bold text-[10px] px-3 py-1 rounded shadow cursor-not-allowed flex items-center gap-1">
                             <Target className="w-3 h-3"/> ANALYZE
                           </button>
                        </div>
                      </div>

                      {/* CLASSIFICATION TEXT */}
                      <div className="flex flex-col items-center justify-center text-sm font-bold min-h-[50px] mb-4">
                        {currentMoveAnalysis && currentPly > 0 ? (
                            <div className="flex items-center gap-6">
                               <span className="flex items-center gap-1.5" style={{
                                 color: currentMoveAnalysis.classification === "Brilliant" ? "#2dd4bf" :
                                        currentMoveAnalysis.classification === "Best" ? "#10b981" :
                                        ["Blunder", "Mistake"].includes(currentMoveAnalysis.classification) ? "#ef4444" : "#fbbf24"
                               }}>
                                 <img src={`/icons/${currentMoveAnalysis.classification.toLowerCase()}.png`} alt="" className="w-4 h-4" />
                                 {currentMoveAnalysis.san} is a {currentMoveAnalysis.classification.toLowerCase()}
                               </span>
                            </div>
                        ) : (
                            <span className="text-slate-400 font-normal">Game Review Ready</span>
                        )}
                        <span className="text-xs text-slate-400 font-normal mt-1">
                            {currentPly === 0 ? "Starting Position" : `Move ${Math.ceil(currentPly / 2)}`}
                        </span>
                      </div>

                      {/* MOVE LIST SCROLLBOX */}
                      <div className="flex-1 overflow-y-auto mb-4 border border-white/5 bg-black/10 rounded-lg p-2 flex flex-col min-h-[200px]">
                        {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                           const whiteMove = moves[i * 2];
                           const blackMove = moves[i * 2 + 1];
                           const whitePly = i * 2 + 1;
                           const blackPly = i * 2 + 2;
                           
                           return (
                               <div key={i} className="flex text-sm py-1 items-center hover:bg-white/5 rounded px-2">
                                  <div className="w-12 text-slate-500">{i + 1}.</div>
                                  <button 
                                      onClick={() => setCurrentPly(whitePly)} 
                                      className={`flex-1 text-left font-bold pl-2 ${currentPly === whitePly ? 'bg-white/20 text-white rounded' : 'text-slate-300'}`}
                                  >
                                      {whiteMove}
                                  </button>
                                  <button 
                                      onClick={() => blackMove && setCurrentPly(blackPly)}
                                      className={`flex-1 text-left font-bold pl-2 ${currentPly === blackPly ? 'bg-white/20 text-white rounded' : 'text-slate-300'} ${!blackMove ? 'opacity-0 cursor-default' : ''}`}
                                      disabled={!blackMove}
                                  >
                                      {blackMove || '...'}
                                  </button>
                               </div>
                           );
                        })}
                      </div>

                      {/* BOTTOM TOOLBAR */}
                      <div className="flex items-center justify-center gap-5 mt-auto text-slate-400 pt-4 border-t border-white/10">
                         <button onClick={() => setFlipped(!flipped)} className="hover:text-white transition-colors" title="Flip Board">
                            <RotateCcw className="w-5 h-5"/>
                         </button>
                         <button onClick={() => setCurrentPly(0)} className="hover:text-white transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                         </button>
                         <button onClick={() => setCurrentPly(Math.max(0, currentPly-1))} className="hover:text-white transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                         </button>
                         <button onClick={() => setCurrentPly(Math.min(moves.length, currentPly+1))} className="hover:text-white transition-colors">
                            <ChevronRight className="w-6 h-6" />
                         </button>
                         <button onClick={() => setCurrentPly(moves.length)} className="hover:text-white transition-colors">
                            <ChevronRight className="w-5 h-5" />
                         </button>
                      </div>
                      {/* SUMMARY CARDS */}
                      <div className="grid grid-cols-2 gap-3 mt-4 border-t border-white/10 pt-4">
                         <div className="bg-black/20 p-3 rounded-lg border border-white/5 text-center">
                            <p className="text-[9px] uppercase font-black text-slate-500 mb-1 tracking-widest">Accuracy</p>
                            <p className="text-xl font-black text-emerald-400">{analysis?.accuracy || 0}%</p>
                         </div>
                         <div className="bg-black/20 p-3 rounded-lg border border-white/5 text-center">
                            <p className="text-[9px] uppercase font-black text-slate-500 mb-1 tracking-widest">Perf. ELO</p>
                            <p className="text-xl font-black text-amber-400">{analysis?.estimated_elo || "???"}</p>
                         </div>
                      </div>
                  </div>


              </div>
           </div>
       )}
    </main>
  );
}