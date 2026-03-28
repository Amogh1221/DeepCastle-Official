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

export function HomePage({ onPlay, onAnalyze }: { onPlay: () => void; onAnalyze: () => void }) {
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
      value: "Unknown",
      sub: "Not yet benchmarked",
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
      value: "~400–600k NPS",
      sub: "Typical in the web UI; varies by CPU & position",
      color: "from-yellow-500 to-amber-600",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      label: "Evaluation",
      value: "HalfKP",
      sub: "20,480-dim feature set",
      color: "from-rose-500 to-red-600",
    },
  ];

  const timeline = [
    {
      version: "v1",
      label: "First Steps — HCE",
      elo: "600–900",
      desc: "Built from scratch on Kaggle with 7M positions. King-relative 4096-feature encoding, single-head network (Embedding → 1024 → 512 → 1). Used BCEWithLogitsLoss with sigmoid targets. First working neural evaluator.",
    },
    {
      version: "v2",
      label: "Scale Up — 76M Positions",
      elo: "700–1000",
      desc: "Switched to flat 768 piece-square features (no king dependency). Trained on 76M positions from a custom binpack. Single-head EmbeddingBag, achieved 77% classification accuracy. No perspective awareness.",
    },
    {
      version: "v3",
      label: "Perspective Flip",
      elo: "800–1200",
      desc: "First dual-head architecture — White and Black perspectives computed separately. Board vertically mirrored for Black's view. Moved to local RTX 3060. Resolved Windows multiprocessing issues (mmap pickling, num_workers).",
    },
    {
      version: "v4",
      label: "HalfKP Features",
      elo: "1200–1400",
      desc: "Upgraded to HalfKP: 20,480 features per side (64 king sq × 5 piece types × 64 squares). Trained 77 epochs across 354M positions in a round-robin chunked strategy. Identified issues: wrong loss function (BCE instead of MSE), wrong targets (pre-sigmoid instead of raw CP).",
    },
    {
      version: "v5",
      label: "Loss Function Fix (Broken)",
      elo: "N/A",
      desc: "Attempted to implement the correct Stockfish symmetric sigmoid loss. Bug: applied offset formula (output−270)/340 directly on the raw logit (~0) instead of scaling first with nnue2score=600. Gradient did not depend on output — network learned nothing. Correctly identified and documented.",
    },
    {
      version: "v6",
      label: "NNUE Born — Correct Training",
      elo: "1400–1600",
      desc: "Fixed the loss: scorenet = output × 600, then symmetric sigmoid with offsets (270/340, 270/380), power=2.5. Added product pooling (SqrCReLU), 8 layer stack buckets by piece count, PSQT shortcut, FactorizedStackedLinear. Trained on Lichess HF streaming — loss stagnated due to non-quiet analysis board positions.",
    },
    {
      version: "v7 · Current",
      label: "Improved dataset & C++ dataloaders",
      elo: "Unknown",
      desc: "Reworked the v7 setup around a stronger training dataset (Stockfish gensfen self-play: depth 9, multipvdiff_100, quiet positions) for better validation accuracy. Training throughput uses the C++ SparseBatchDataset path (binpack) so batches load fast instead of bottlenecking on Python. The stack is FastAPI + a single long-lived UCI engine on Hugging Face Spaces, with the Next.js app on Vercel. Casual match sample vs Stockfish 18: 0W/1L/21D — illustrative, not a formal rating.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-slate-100 overflow-x-hidden">
      {/* ── Ambient bg ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-slate-700/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-emerald-700/5 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-slate-900/5 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center text-center mb-20"
        >
          {/* Logo */}
          <div className="mb-6 sm:mb-8">
            <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(255,255,255,0.07)]">
              <img src="/DC_logo.png" alt="DeepCastle Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight mb-4 bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent">
            DeepCastle
          </h1>
          <p className="text-base sm:text-lg text-slate-400 max-w-xl leading-relaxed mb-8 sm:mb-10 px-2 sm:px-0">
            A custom-built NNUE chess engine — trained on 100M+ Stockfish self-play positions at depth 9,
            powered by alpha-beta search and a HalfKP neural network.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <motion.button
              id="play-btn"
              onClick={onPlay}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="group relative flex items-center gap-3 px-8 sm:px-10 py-3 sm:py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 rounded-2xl font-black text-base sm:text-lg shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all duration-200 border border-emerald-400/30"
            >
              <Play className="w-5 h-5 flex-shrink-0" />
              Play
              <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
            <motion.button
              id="analyze-btn"
              onClick={onAnalyze}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="group relative flex items-center gap-3 px-8 sm:px-10 py-3 sm:py-4 bg-[#1a1a24] hover:bg-[#22223a] rounded-2xl font-black text-base sm:text-lg border border-indigo-500/30 hover:border-indigo-400/50 text-indigo-300 transition-all duration-200 shadow-[0_0_30px_rgba(99,102,241,0.1)]"
            >
              <BarChart2 className="w-5 h-5 flex-shrink-0" />
              Analysis
            </motion.button>
          </div>
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
          className="mb-16 sm:mb-20"
        >
          <h2 className="text-xs uppercase font-black text-slate-600 tracking-[0.3em] mb-8 text-center">Engine Evolution</h2>
          <div className="relative">
            <div className="absolute left-4 sm:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-600/50 via-slate-600/30 to-transparent" />
            <div className="flex flex-col gap-4 sm:gap-6">
              {timeline.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.07 }}
                  className="flex items-start gap-3 sm:gap-6 pl-12 sm:pl-20 relative"
                >
                  <div className={`absolute left-1 sm:left-5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black text-white shadow-lg ${
                    t.version.includes('Current') || t.version.includes('v7')
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-500/40'
                      : t.version === 'v5'
                      ? 'bg-gradient-to-br from-red-600 to-red-800 shadow-red-500/30'
                      : 'bg-gradient-to-br from-slate-600 to-slate-700 shadow-slate-500/20'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 bg-[#161619] border border-white/5 rounded-xl p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full border ${
                        t.version.includes('Current') || t.version.includes('v7')
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : t.version === 'v5'
                          ? 'text-red-400 bg-red-400/10 border-red-400/20'
                          : 'text-slate-400 bg-slate-400/10 border-slate-400/20'
                      }`}>{t.version}</span>
                      <span className="font-bold text-xs sm:text-sm text-white">{t.label}</span>
                      {t.elo === 'N/A' && (
                        <span className="ml-auto text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">Broken</span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{t.desc}</p>
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
          className="flex flex-col items-center gap-3 pb-8"
        >
          <p className="text-xs text-slate-700">No account needed · Play directly in browser</p>
          
          <div className="mt-4">
            <a
              href="https://github.com/Amogh1221/DeepCastle-Official"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-slate-400 hover:text-white transition-all text-[10px] font-black uppercase tracking-[0.2em]"
            >
              <GithubLogo className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
              Source on GitHub
            </a>
          </div>
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

function GithubLogo(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}