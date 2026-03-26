"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu, RefreshCw, Play, Clock, ChevronLeft, Users,
} from "lucide-react";
import { GameSettings, PlayerColor, GameMode } from "../types";

export function SetupPage({ onStart, onBack }: { onStart: (s: GameSettings) => void; onBack: () => void }) {
  const [playerColor, setPlayerColor] = useState<PlayerColor | "random">("white");
  const [thinkTime, setThinkTime] = useState(1.0);
  const [mode, setMode] = useState<GameMode>("ai");
  const [variant, setVariant] = useState<"standard" | "chess960">("standard");
  const [timeLimit, setTimeLimit] = useState(10);
  const [increment, setIncrement] = useState(0);

  const engineTimeOptions = [0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0];

  const handleStart = () => {
    let resolvedColor = playerColor;
    if (resolvedColor === "random") {
      resolvedColor = Math.random() < 0.5 ? "white" : "black";
    }
    onStart({
      playerColor: resolvedColor as PlayerColor,
      thinkTime,
      mode,
      variant,
      matchSettings: { timeLimit, increment }
    });
  };

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-slate-100 flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] rounded-full bg-indigo-700/10 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-700/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-lg"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>

        <div className="bg-[#161619] border border-white/5 rounded-3xl p-8 shadow-2xl">
          <h2 className="font-black text-2xl mb-8 flex items-center gap-2">
            <div className="w-10 h-10 bg-[#1a1a1f] rounded-xl flex items-center justify-center border border-white/10 overflow-hidden">
              <img src="/DC_logo.png" alt="Setup" className="w-full h-full object-contain p-1.5" />
            </div>
            Game Setup
          </h2>

          {/* Mode Selection */}
          <div className="mb-8 p-1 bg-black/40 rounded-2xl flex border border-white/5">
            <button
              onClick={() => setMode("ai")}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${mode === "ai" ? "bg-[#262621] text-emerald-400 shadow-xl border border-white/5" : "text-slate-500"}`}
            >
              <Cpu className="w-4 h-4" /> Against AI
            </button>
            <button
              onClick={() => setMode("p2p")}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${mode === "p2p" ? "bg-[#262621] text-indigo-400 shadow-xl border border-white/5" : "text-slate-500"}`}
            >
              <Users className="w-4 h-4" /> Play vs Friend
            </button>
          </div>

          {/* Variant Selection */}
          <div className="mb-8 p-1 bg-black/40 rounded-2xl flex border border-white/5">
            <button
              onClick={() => setVariant("standard")}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${variant === "standard" ? "bg-[#262621] text-amber-400 shadow-xl border border-white/5" : "text-slate-500"}`}
            >
              Standard
            </button>
            <button
              onClick={() => setVariant("chess960")}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${variant === "chess960" ? "bg-[#262621] text-rose-400 shadow-xl border border-white/5" : "text-slate-500"}`}
            >
              Fischer Random
            </button>
          </div>

          <div className={`grid gap-8 ${mode === "ai" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
            {/* Color Selection */}
            <div>
              <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block">Play As</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setPlayerColor("white")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${playerColor === "white" ? "border-indigo-500 bg-indigo-500/10" : "border-white/5 bg-[#0d0d0f]"
                    }`}
                >
                  <div className="w-8 h-8 rounded-full bg-white shadow-lg border border-white/20" />
                  <span className="text-xs font-bold">White</span>
                </button>
                <button
                  onClick={() => setPlayerColor("random")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${playerColor === "random" ? "border-indigo-500 bg-indigo-500/10" : "border-white/5 bg-[#0d0d0f]"
                    }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-white to-[#1a1a1a] border border-slate-500 flex items-center justify-center font-bold text-xs text-white pb-[2px]">
                    ?
                  </div>
                  <span className="text-xs font-bold">Random</span>
                </button>
                <button
                  onClick={() => setPlayerColor("black")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${playerColor === "black" ? "border-indigo-500 bg-indigo-500/10" : "border-white/5 bg-[#0d0d0f]"
                    }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-slate-700" />
                  <span className="text-xs font-bold">Black</span>
                </button>
              </div>
            </div>

            {/* Engine Think Time — AI only */}
            {mode === "ai" ? (
              <div>
                <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Engine Think Time
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {engineTimeOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => setThinkTime(t)}
                      className={`py-2 px-3 rounded-lg text-[10px] font-black border transition-all flex-[1_0_21%] ${thinkTime === t ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-white/5 bg-[#0d0d0f] text-slate-500"
                        }`}
                    >
                      {t < 1 ? Math.round(t * 1000) + "ms" : t + "s"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block flex items-center justify-between">
                    <span>Limit (min)</span>
                    <span className="text-indigo-400 font-bold">{timeLimit}m</span>
                  </label>
                  <select
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                  >
                    {[1, 3, 5, 10, 20, 30, 60, 90].map(m => (
                      <option key={m} value={m} className="bg-[#1a1a1f]">{m} min</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block flex items-center justify-between">
                    <span>Inc (sec)</span>
                    <span className="text-indigo-400 font-bold">+{increment}s</span>
                  </label>
                  <select
                    value={increment}
                    onChange={(e) => setIncrement(parseInt(e.target.value))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                  >
                    {[0, 1, 2, 3, 5, 10, 30, 60].map(s => (
                      <option key={s} value={s} className="bg-[#1a1a1f]">{s} sec</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <motion.button
            onClick={handleStart}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-4 mt-8 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all border ${mode === "p2p"
              ? "bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_0_30px_rgba(99,102,241,0.35)] border-indigo-400/30"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-[0_0_30px_rgba(16,185,129,0.35)] border-emerald-400/30"
              }`}
          >
            {mode === "p2p" ? <Users className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {mode === "p2p" ? "Create Challenge" : "Start Game"}
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}