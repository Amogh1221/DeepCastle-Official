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

export function HomePage({ onPlay }: { onPlay: () => void }) {
  const specs = [
    {
      icon: <Brain className="w-6 h-6" />,
      label: "Architecture",
      value: "NNUE Hybrid",
      sub: "Efficiently Updatable Neural Network",
      color: "from-violet-500 to-purple-600",
    },
    {
      icon: <Trophy className="w-6 h-6" />,
      label: "Estimated Elo",
      value: "3600+",
      sub: "Calibrated vs Stockfish 18",
      color: "from-amber-500 to-orange-600",
    },
    {
      icon: <Database className="w-6 h-6" />,
      label: "Training Data",
      value: "100M+ Positions",
      sub: "Stockfish self-play, depth 9",
      color: "from-cyan-500 to-blue-600",
    },
    {
      icon: <GitBranch className="w-6 h-6" />,
      label: "Search",
      value: "Alpha-Beta",
      sub: "With iterative deepening",
      color: "from-emerald-500 to-green-600",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      label: "Speed",
      value: "~5M NPS",
      sub: "Nodes per second",
      color: "from-yellow-500 to-amber-600",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      label: "Evaluation",
      value: "HalfKAv2-HM",
      sub: "King-relative feature set",
      color: "from-rose-500 to-red-600",
    },
  ];

  const timeline = [
    { version: "v1–v5", label: "HCE Era", desc: "Hand-crafted evaluation functions, PST tables, material balance." },
    { version: "v6", label: "NNUE Born", desc: "First neural net evaluation trained on large_gensfen_multipvdiff_100_d9.binpack — 100M+ Stockfish self-play positions at depth 9." },
    { version: "Current", label: "Hybrid Engine", desc: "NNUE + enhanced search, better pruning, faster move ordering, deployed on Hugging Face Spaces." },
  ];

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-slate-100 overflow-x-hidden">
      {/* ── Ambient bg ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-700/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-violet-700/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-indigo-900/5 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center text-center mb-20"
        >
          {/* Logo */}
          <div className="relative mb-8">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-[0_0_80px_rgba(99,102,241,0.4)] border border-indigo-500/30">
              <Cpu className="w-14 h-14 text-white" />
            </div>
            <div className="absolute -bottom-2 -right-2 bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
              Stable
            </div>
          </div>

          <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-4 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent">
            DeepCastle
          </h1>
          <p className="text-lg text-slate-400 max-w-xl leading-relaxed mb-10">
            A custom-built NNUE chess engine — trained on 100M+ Stockfish self-play positions at depth 9,
            powered by alpha-beta search and a halfKAv2-HM neural network.
          </p>

          <motion.button
            id="play-btn"
            onClick={onPlay}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="group relative flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-2xl font-black text-lg shadow-[0_0_40px_rgba(99,102,241,0.5)] transition-all duration-200 border border-indigo-400/30"
          >
            <Play className="w-5 h-5" />
            Play DeepCastle
            <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.button>
        </motion.div>

        {/* ── Spec Cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
        >
          <h2 className="text-xs uppercase font-black text-slate-600 tracking-[0.3em] mb-6 text-center">Engine Specifications</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-20">
            {specs.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.07 }}
                className="bg-[#161619] border border-white/5 rounded-2xl p-5 hover:border-indigo-500/30 transition-all group hover:bg-[#1a1a1f]"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform`}>
                  {s.icon}
                </div>
                <p className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-1">{s.label}</p>
                <p className="text-2xl font-black text-white mb-1">{s.value}</p>
                <p className="text-xs text-slate-500">{s.sub}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── How it Works ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mb-20"
        >
          <h2 className="text-xs uppercase font-black text-slate-600 tracking-[0.3em] mb-6 text-center">Engine Evolution</h2>
          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-600/50 via-violet-600/50 to-transparent" />
            <div className="flex flex-col gap-6">
              {timeline.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.1 }}
                  className="flex items-start gap-6 pl-20 relative"
                >
                  <div className="absolute left-5 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-[10px] font-black text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                    {i + 1}
                  </div>
                  <div className="flex-1 bg-[#161619] border border-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-black text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full border border-indigo-400/20">{t.version}</span>
                      <span className="font-bold text-sm text-white">{t.label}</span>
                    </div>
                    <p className="text-sm text-slate-400">{t.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── CTA bottom ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.button
            onClick={onPlay}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-3 px-8 py-3 bg-[#1e1e24] hover:bg-[#252530] border border-indigo-500/30 rounded-xl font-bold text-slate-200 transition-all"
          >
            <Play className="w-4 h-4 text-indigo-400" />
            Challenge DeepCastle Now
          </motion.button>
          <p className="text-xs text-slate-700">No account needed · Play directly in browser</p>
        </motion.div>
      </div>
    </main>
  );
}

const TIME_CONTROLS = [
  { label: "1 min", time: 1, inc: 0 },
  { label: "1+1", time: 1, inc: 1 },
  { label: "1+2", time: 1, inc: 2 },
  { label: "3 min", time: 3, inc: 0 },
  { label: "3+2", time: 3, inc: 2 },
  { label: "3+5", time: 3, inc: 5 },
  { label: "10 min", time: 10, inc: 0 },
  { label: "30 min", time: 30, inc: 0 },
  { label: "90+15", time: 90, inc: 15 },
];