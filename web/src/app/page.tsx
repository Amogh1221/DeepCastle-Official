"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  RefreshCw,
  TrendingUp,
  Flag,
  RotateCcw,
  Lightbulb,
  ChevronRight,
  Eye,
  EyeOff,
  Play,
  Clock,
  Zap,
  Brain,
  Shield,
  GitBranch,
  Database,
  Trophy,
  ChevronLeft,
  X,
  Crown,
  Activity,
  Target,
  BarChart2,
  BookOpen,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

// ─── Types ───────────────────────────────────────────────────────────────────
type AppPage = "home" | "setup" | "game" | "review";
type PlayerColor = "white" | "black";

interface GameSettings {
  playerColor: PlayerColor;
  thinkTime: number; // seconds
}

interface Stats {
  score: number;
  depth: number;
  nodes: number;
  nps: number;
  pv: string;
  mateIn: number | null; // null = no mate, positive = bot mates user, negative = user mates bot
}

// ─── Home / Landing Page ─────────────────────────────────────────────────────
function HomePage({ onPlay }: { onPlay: () => void }) {
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

// ─── Setup Page ───────────────────────────────────────────────────────────────
function SetupPage({ onStart, onBack }: { onStart: (s: GameSettings) => void; onBack: () => void }) {
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  const [thinkTime, setThinkTime] = useState(1.0);

  const timeOptions = [0.1, 0.5, 1.0, 2.0, 5.0];

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-slate-100 flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[400px] h-[400px] rounded-full bg-indigo-700/10 blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-700/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>

        <div className="bg-[#161619] border border-white/5 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-xl">Game Setup</h2>
              <p className="text-xs text-slate-500">Configure your challenge</p>
            </div>
          </div>

          {/* Color Selection */}
          <div className="mb-8">
            <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block">Play As</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                id="play-as-white"
                onClick={() => setPlayerColor("white")}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                  playerColor === "white"
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-white/5 bg-[#0d0d0f] hover:border-white/20"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] border border-white/20" />
                <span className="text-sm font-bold">White</span>
                <span className="text-[10px] text-slate-500">You move first</span>
              </button>
              <button
                id="play-as-black"
                onClick={() => setPlayerColor("black")}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                  playerColor === "black"
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-white/5 bg-[#0d0d0f] hover:border-white/20"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#1a1a1a] border-2 border-slate-700 shadow-[0_0_20px_rgba(0,0,0,0.5)]" />
                <span className="text-sm font-bold">Black</span>
                <span className="text-[10px] text-slate-500">Bot moves first</span>
              </button>
            </div>
          </div>

          {/* Think Time */}
          <div className="mb-8">
            <label className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-4 block flex items-center gap-2">
              <Clock className="w-3 h-3" /> Engine Think Time
            </label>
            <div className="flex gap-2 flex-wrap">
              {timeOptions.map((t) => (
                <button
                  key={t}
                  id={`think-time-${t}`}
                  onClick={() => setThinkTime(t)}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    thinkTime === t
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                      : "border-white/5 bg-[#0d0d0f] text-slate-400 hover:border-white/20"
                  }`}
                >
                  {t < 1 ? `${t * 1000}ms` : `${t}s`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              {thinkTime < 0.5 ? "Weaker — faster play" : thinkTime >= 2 ? "Stronger — deeper search" : "Balanced"}
            </p>
          </div>

          <motion.button
            id="start-game-btn"
            onClick={() => onStart({ playerColor, thinkTime })}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(99,102,241,0.35)] transition-all border border-indigo-500/30"
          >
            <Play className="w-5 h-5" />
            Start Game
          </motion.button>
        </div>
      </motion.div>
    </main>
  );
}

// ─── Resign Modal ─────────────────────────────────────────────────────────────
function ResignModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#1a1a1f] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
      >
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
          <Flag className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-xl font-black mb-2">Resign?</h3>
        <p className="text-sm text-slate-400 mb-7">Are you sure you want to resign? DeepCastle wins.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-[#262621] hover:bg-[#30302a] border border-white/10 rounded-xl font-bold text-sm transition-all"
          >
            Cancel
          </button>
          <button
            id="confirm-resign"
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-sm transition-all"
          >
            Yes, Resign
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Resigned Result Modal ────────────────────────────────────────────────────
function ResultModal({ message, onHome, onRematch, onReview }: { message: string; onHome: () => void; onRematch: () => void; onReview: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="bg-[#1a1a1f] border border-white/10 rounded-3xl p-10 max-w-sm w-full shadow-2xl text-center"
      >
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <Flag className="w-10 h-10 text-red-400" />
        </div>
        <h3 className="text-3xl font-black mb-3 bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
          You Resigned
        </h3>
        <p className="text-slate-400 text-sm mb-2">{message}</p>
        <p className="text-[10px] text-slate-600 mb-8">DeepCastle accepts your surrender.</p>
        <div className="flex flex-col gap-3">
          <button onClick={onReview} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"><Activity className="w-4 h-4"/> Game Review</button>
          <div className="flex gap-3">
          <button
            id="result-home-btn"
            onClick={onHome}
            className="flex-1 py-3 bg-[#262621] hover:bg-[#30302a] border border-white/10 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Home
          </button>
          <button
            id="result-rematch-btn"
            onClick={onRematch}
            className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-bold text-sm transition-all"
          >
            Rematch
          </button>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Game Over Modal ──────────────────────────────────────────────────────────
function GameOverModal({ title, subtitle, isWin, onHome, onRematch, onReview }: {
  title: string; subtitle: string; isWin: boolean; onHome: () => void; onRematch: () => void; onReview: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="bg-[#1a1a1f] border border-white/10 rounded-3xl p-10 max-w-sm w-full shadow-2xl text-center"
      >
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border ${isWin ? "bg-amber-500/10 border-amber-500/20" : "bg-indigo-500/10 border-indigo-500/20"}`}>
          <Crown className={`w-10 h-10 ${isWin ? "text-amber-400" : "text-indigo-400"}`} />
        </div>
        <h3 className={`text-3xl font-black mb-3 bg-gradient-to-r bg-clip-text text-transparent ${isWin ? "from-amber-400 to-yellow-400" : "from-indigo-400 to-violet-400"}`}>
          {title}
        </h3>
        <p className="text-slate-400 text-sm mb-8">{subtitle}</p>
        <div className="flex flex-col gap-3">
          <button onClick={onReview} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"><Activity className="w-4 h-4"/> Game Review</button>
          <div className="flex gap-3">
          <button onClick={onHome} className="flex-1 py-3 bg-[#262621] hover:bg-[#30302a] border border-white/10 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Home
          </button>
          <button onClick={onRematch} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-bold text-sm transition-all">
            Rematch
          </button>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Game Page ────────────────────────────────────────────────────────────────
function GamePage({ settings, onHome, onRematch, onReview }: {
  settings: GameSettings;
  onHome: () => void;
  onRematch: () => void;
  onReview: (moves: string[]) => void;
}) {
  const playerColor = settings.playerColor; // "white" | "black"
  const playerChessColor = playerColor === "white" ? "w" : "b";
  const botChessColor = playerColor === "white" ? "b" : "w";

  const [fen, setFen] = useState(new Chess().fen());
  const gameRef = useRef(new Chess());
  const [moveHistory, setMoveHistory] = useState<{ san: string; score: string }[]>([]);
  const [stats, setStats] = useState<Stats>({ score: 0.0, depth: 0, nodes: 0, nps: 0, pv: "", mateIn: null });
  const [thinking, setThinking] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(playerColor === "white");
  const [botMessage, setBotMessage] = useState(
    playerColor === "white" ? "Let's see what you've got." : "Analyzing the position..."
  );
  const [showEvalBar, setShowEvalBar] = useState(true);

  // Modal states
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [gameResult, setGameResult] = useState<{ title: string; subtitle: string; isWin: boolean } | null>(null);

  // Click-to-move
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});

  // Hint arrow
  const [hintArrow, setHintArrow] = useState<[string, string] | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);

  // Custom arrows for react-chessboard
  const arrows: [string, string, string?][] = hintArrow ? [[hintArrow[0], hintArrow[1], "rgba(163, 209, 96, 0.8)"]] : [];

  // ── Eval bar logic ──
  // score from API is from white's POV (positive = white winning)
  // winProb for white → fill from bottom for white, top for black
  // If player is white: high fill = player winning (good), low fill = bot winning (bad)
  // If player is black: high fill = player winning = needs INVERTED

  // Raw white advantage (-∞ to +∞ pawns)
  const scoreForWhite = stats.score; // positive = white is winning
  // Convert to a 5–95% bar height where 50% = equal
  const rawWinProb = Math.max(5, Math.min(95, 50 + scoreForWhite * 7));
  // The bar renders from bottom: fill% = white's share
  // If playerColor=white: "your advantage" = rawWinProb; if black: inverted
  const evalBarFill = playerColor === "white" ? rawWinProb : 100 - rawWinProb;
  // Eval label: show from player's perspective
  const displayScore = playerColor === "white" ? scoreForWhite : -scoreForWhite;

  // Eval text: mate or centipawns
  const evalLabel = (() => {
    if (stats.mateIn !== null) {
      const m = stats.mateIn;
      // mateIn > 0: bot (opponent) can mate player; mateIn < 0: player can mate bot
      // We want to show it from player's perspective:
      // If m < 0 → player can mate: "M" + abs(m), e.g. M4 means you mate in 4
      // If m > 0 → bot can mate: "-M" + m (bad for player)
      if (m < 0) return `M${Math.abs(m)}`; // player mates bot
      else return `-M${m}`; // bot mates player
    }
    return displayScore.toFixed(2);
  })();

  // ── Engine error banner state ──
  const [engineError, setEngineError] = useState<string | null>(null);

  // ── Engine Fetch ──
  const fetchMove = useCallback(async (currentFen: string, forHint = false) => {
    if (!forHint) {
      setThinking(true);
      setIsPlayerTurn(false);
      setBotMessage("Analyzing potential lines...");
    }

    try {
      const response = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, time: settings.thinkTime }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Engine API error ${response.status}${detail ? `: ${detail}` : ""}`);
      }
      const data = await response.json();
      // Clear any previous engine error on success
      setEngineError(null);

      if (forHint) {
        if (data.bestmove && data.bestmove.length >= 4) {
          const from = data.bestmove.slice(0, 2);
          const to = data.bestmove.slice(2, 4);
          setHintArrow([from, to]);
          setTimeout(() => setHintArrow(null), 4000);
        }
        return;
      }

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

          let mateIn: number | null = null;
          if (data.score !== undefined && Math.abs(data.score) >= 100) {
            if (playerColor === "white") {
              mateIn = data.score > 0 ? -1 : 1;
            } else {
              mateIn = data.score > 0 ? 1 : -1;
            }
          }

          setStats({
            score: data.score ?? 0,
            depth: data.depth ?? 0,
            nodes: data.nodes ?? 0,
            nps: data.nps ?? 0,
            pv: data.pv ?? "",
            mateIn,
          });

          if ((data.score ?? 0) > 2) setBotMessage("My position is dominating.");
          else if ((data.score ?? 0) < -2) setBotMessage("You are playing remarkably well.");
          else setBotMessage("Interesting. Your move.");

          if (g.isGameOver()) handleGameOver(g);
        }
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "Unknown error";
      const isNetworkErr = msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError");
      if (!forHint) {
        setEngineError(
          isNetworkErr
            ? `Cannot reach the engine at ${API_URL}. Make sure the server is running (python server/main.py) and try again.`
            : `Engine error: ${msg}`
        );
        setBotMessage("Engine is offline. Check the server.");
      }
    } finally {
      if (!forHint) {
        setThinking(false);
        setIsPlayerTurn(true);
      }
    }
  }, [settings.thinkTime, playerColor]);

  // ── Bot moves first if player is black ──
  const initialBotMoveDone = useRef(false);
  useEffect(() => {
    if (playerColor === "black" && !initialBotMoveDone.current) {
      initialBotMoveDone.current = true;
      setTimeout(() => fetchMove(gameRef.current.fen()), 300);
    }
  }, []);

  function handleGameOver(g: Chess) {
    setGameEnded(true);
    if (g.isCheckmate()) {
      const loser = g.turn(); // whoever is to move is in checkmate
      const playerWon = loser === botChessColor;
      setGameResult({
        title: playerWon ? "You Win!" : "DeepCastle Wins",
        subtitle: playerWon ? "Brilliant! You checkmated DeepCastle." : "Checkmate. DeepCastle wins.",
        isWin: playerWon,
      });
    } else if (g.isDraw()) {
      setGameResult({ title: "It's a Draw", subtitle: "The game ended in a draw.", isWin: false });
    }
    setShowResultModal(true);
  }

  // ── Apply Player Move ──
  function applyPlayerMove(from: string, to: string): boolean {
    const g = gameRef.current;
    if (g.turn() !== playerChessColor || g.isGameOver() || !isPlayerTurn || gameEnded) return false;

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
      setHintArrow(null);

      if (copy.isGameOver()) {
        handleGameOver(copy);
        return true;
      }

      setTimeout(() => fetchMove(copy.fen()), 150);
      return true;
    }
    return false;
  }

  // ── Highlight legal moves ──
  function showLegalMoves(square: string): boolean {
    const g = gameRef.current;
    const moves = g.moves({ square: square as any, verbose: true });
    if (moves.length === 0) return false;

    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: "rgba(255, 255, 0, 0.4)" },
    };
    const srcPiece = g.get(square as any);
    moves.forEach((m: any) => {
      const dst = g.get(m.to as any);
      styles[m.to] = {
        background:
          dst && srcPiece && dst.color !== srcPiece.color
            ? "radial-gradient(circle, rgba(0,0,0,.15) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.15) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    setSquareStyles(styles);
    return true;
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare) return false;
    setMoveFrom(null);
    setSquareStyles({});
    return applyPlayerMove(sourceSquare, targetSquare);
  }

  function handleSquareClick({ square }: { piece: any; square: string }) {
    const g = gameRef.current;
    if (g.turn() !== playerChessColor || g.isGameOver() || !isPlayerTurn || gameEnded) return;

    if (moveFrom) {
      const moved = applyPlayerMove(moveFrom, square);
      if (moved) return;
      const p = g.get(square as any);
      if (p && p.color === playerChessColor) {
        const hasMoves = showLegalMoves(square);
        if (hasMoves) { setMoveFrom(square); return; }
      }
      setMoveFrom(null);
      setSquareStyles({});
      return;
    }

    const p = g.get(square as any);
    if (p && p.color === playerChessColor) {
      const hasMoves = showLegalMoves(square);
      if (hasMoves) setMoveFrom(square);
    }
  }

  // ── Controls ──
  function resetGame() {
    const fresh = new Chess();
    gameRef.current = fresh;
    setFen(fresh.fen());
    setMoveHistory([]);
    setSquareStyles({});
    setMoveFrom(null);
    setHintArrow(null);
    setGameEnded(false);
    setShowResultModal(false);
    setShowResignConfirm(false);
    setGameResult(null);
    const isWhite = playerColor === "white";
    setIsPlayerTurn(isWhite);
    setBotMessage(isWhite ? "A fresh start. Your move." : "Analyzing the position...");
    setStats({ score: 0, depth: 0, nodes: 0, nps: 0, pv: "", mateIn: null });
    setEngineError(null);

    if (playerColor === "black") {
      setTimeout(() => fetchMove(fresh.fen()), 300);
    }
  }

  function forceUndo() {
    const g = gameRef.current;
    if (g.history().length < 2) return;
    g.undo();
    g.undo();
    setFen(g.fen());
    setMoveHistory(h => h.slice(0, -2));
    setSquareStyles({});
    setMoveFrom(null);
    setHintArrow(null);
    setIsPlayerTurn(true);
    setGameEnded(false);
    setBotMessage("Take-back granted. Choose wisely.");
  }

  async function getHint() {
    if (loadingHint || thinking || !isPlayerTurn || gameEnded) return;
    setLoadingHint(true);
    setHintArrow(null);
    // Fetch the best move for the player's current position
    await fetchMove(gameRef.current.fen(), true);
    setLoadingHint(false);
  }

  function handleResign() {
    setShowResignConfirm(true);
  }

  function confirmResign() {
    setShowResignConfirm(false);
    setGameEnded(true);
    setShowResultModal(true);
    setGameResult(null); // null = resigned (use ResignModal-style display)
  }

  const boardOptions = {
    position: fen,
    squareStyles: squareStyles,
    darkSquareStyle: { backgroundColor: "#779556" },
    lightSquareStyle: { backgroundColor: "#ebecd0" },
    boardStyle: { borderRadius: "4px" },
    animationDurationInMs: 200,
    allowDragging: !thinking && isPlayerTurn && !gameEnded,
    onPieceDrop: handlePieceDrop,
    onSquareClick: handleSquareClick,
    boardOrientation: playerColor,
    customArrows: arrows,
  };

  return (
    <main className="min-h-screen bg-[#111111] text-slate-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-5" />
      </div>

      {/* Resign confirm */}
      <AnimatePresence>
        {showResignConfirm && (
          <ResignModal onConfirm={confirmResign} onCancel={() => setShowResignConfirm(false)} />
        )}
      </AnimatePresence>

      {/* Result modal */}
      <AnimatePresence>
        {showResultModal && (
          gameResult ? (
            <GameOverModal
              title={gameResult.title}
              subtitle={gameResult.subtitle}
              isWin={gameResult.isWin}
              onHome={onHome}
              onRematch={onRematch}
              onReview={() => onReview(moveHistory.map(m => m.san))}
            />
          ) : (
            <ResultModal
              message="A brave decision. DeepCastle accepts."
              onHome={onHome}
              onRematch={onRematch}
              onReview={() => onReview(moveHistory.map(m => m.san))}
            />
          )
        )}
      </AnimatePresence>

      {/* Engine offline banner */}
      <AnimatePresence>
        {engineError && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4"
          >
            <div className="flex items-start gap-3 bg-red-950 border border-red-500/40 rounded-xl p-4 shadow-2xl">
              <div className="flex-shrink-0 w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                <X className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-300 mb-0.5">Engine Offline</p>
                <p className="text-xs text-red-400/80 leading-relaxed break-words">{engineError}</p>
              </div>
              <button
                onClick={() => setEngineError(null)}
                className="flex-shrink-0 text-red-500 hover:text-red-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-10 gap-6 relative z-10">

        {/* ── LEFT : BOARD ── */}
        <div className="lg:col-span-6 flex flex-col gap-4">

          {/* Bot profile (top = opponent) */}
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
                DeepCastle{" "}
                <span className="text-orange-500 text-xs font-bold px-1.5 py-0.5 bg-orange-500/10 rounded border border-orange-500/20">
                  3600+ Elo
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                id="toggle-eval-bar"
                onClick={() => setShowEvalBar(v => !v)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title={showEvalBar ? "Hide eval bar" : "Show eval bar"}
              >
                {showEvalBar ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={onHome} className="text-slate-500 hover:text-slate-300 transition-colors" title="Back to home">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Board + Eval Bar */}
          <div className="flex gap-4 items-stretch">
            {/* Eval bar */}
            <AnimatePresence>
              {showEvalBar && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "1.75rem" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="bg-[#161512] rounded-md flex flex-col overflow-hidden border border-slate-800 relative flex-shrink-0"
                  style={{ width: "1.75rem" }}
                >
                  {/* Black's portion (top) */}
                  <motion.div
                    animate={{ height: `${100 - evalBarFill}%` }}
                    className="bg-[#1a1a1a] flex-shrink-0"
                    transition={{ type: "spring", stiffness: 40, damping: 15 }}
                  />
                  {/* White's portion (bottom) */}
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
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 bg-[#262421] p-3 rounded-lg shadow-2xl border-2 border-[#3d3a36]">
              <Chessboard
                position={fen}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                boardOrientation={playerColor}
                customArrows={arrows}
                animationDuration={200}
                customDarkSquareStyle={{ backgroundColor: "#779556" }}
                customLightSquareStyle={{ backgroundColor: "#ebecd0" }}
                customBoardStyle={{ borderRadius: "4px" }}
                arePiecesDraggable={!thinking && isPlayerTurn && !gameEnded}
              />
            </div>
          </div>

          {/* Player profile (bottom = player) */}
          <div className="p-3 bg-[#262421] rounded-lg shadow-md border-t-2 border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center border border-slate-600">
                <div className={`w-6 h-6 rounded-sm ${playerColor === "white" ? "bg-slate-200" : "bg-[#1a1a1a] border border-slate-600"}`} />
              </div>
              <span className="font-bold text-sm tracking-tight">
                Human Challenger{" "}
                <span className="text-xs text-slate-500">({playerColor})</span>
              </span>
            </div>
            {thinking && <span className="text-xs text-emerald-400 animate-pulse font-semibold">Engine thinking…</span>}
          </div>
        </div>

        {/* ── RIGHT : PANEL ── */}
        <div className="lg:col-span-4 flex flex-col gap-4">

          {/* Bot Speech */}
          <section className="bg-[#262421] rounded-lg border border-[#3d3a36] shadow-xl">
            <div className="p-6 flex gap-4 min-h-[100px]">
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
                <p className="text-[9px] uppercase font-black text-slate-600 mb-1">
                  {stats.mateIn !== null ? "Eval" : "Search Speed"}
                </p>
                {stats.mateIn !== null ? (
                  <p className="text-xl font-bold tracking-tighter text-amber-400">{evalLabel}</p>
                ) : (
                  <p className="text-xl font-bold tracking-tighter text-indigo-400">
                    {(stats.nps / 1000).toFixed(1)}k<span className="text-[10px] ml-1 opacity-40">NPS</span>
                  </p>
                )}
              </div>
            </div>

            {/* Move History */}
            <div className="flex-1 bg-[#161512] rounded-lg border border-white/5 flex flex-col overflow-hidden max-h-[260px]">
              <div className="p-3 bg-[#2b2a27] text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center justify-between">
                <span>History</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="flex-1 overflow-y-auto p-1 divide-y divide-white/5">
                {moveHistory.length === 0 ? (
                  <div className="h-36 flex items-center justify-center opacity-20 italic text-sm">
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

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                id="resign-btn"
                onClick={handleResign}
                disabled={gameEnded}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Flag className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-red-300">Resign</span>
              </button>
              <button
                id="undo-btn"
                onClick={forceUndo}
                disabled={moveHistory.length < 2 || gameEnded}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-slate-700 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-5 h-5 text-slate-400 group-hover:text-white" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-slate-100">Undo</span>
              </button>
              <button
                id="hint-btn"
                onClick={getHint}
                disabled={loadingHint || thinking || !isPlayerTurn || gameEnded}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-amber-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed relative"
              >
                <Lightbulb className={`w-5 h-5 text-slate-400 group-hover:text-amber-400 ${loadingHint ? "animate-pulse text-amber-400" : ""}`} />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">
                  {loadingHint ? "..." : "Hint"}
                </span>
                {hintArrow && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                )}
              </button>
            </div>
          </section>

          {/* Bottom bar */}
          <div className="bg-[#262421] p-4 rounded-lg border border-[#3d3a36] flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-tighter">
              <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                <Clock className="w-3 h-3" /> {settings.thinkTime}s
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-indigo-400" /> {stats.nodes.toLocaleString()} Nodes
              </div>
            </div>
            <button
              id="new-game-btn"
              onClick={resetGame}
              className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> New Game
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}


// ─── Review Page ──────────────────────────────────────────────────────────────
function ReviewPage({ settings, moves, onHome }: { settings: GameSettings; moves: string[]; onHome: () => void }) {
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
                    <Chessboard 
                       position={currentFen}
                       boardOrientation={settings.playerColor}
                       animationDuration={200}
                       arePiecesDraggable={false}
                       customDarkSquareStyle={{ backgroundColor: "#779556" }}
                       customLightSquareStyle={{ backgroundColor: "#ebecd0" }}
                       customBoardStyle={{ borderRadius: "4px" }}
                    />
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


// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [settings, setSettings] = useState<GameSettings>({ playerColor: "white", thinkTime: 1.0 });

const [reviewMoves, setReviewMoves] = useState<string[]>([]);

  function handlePlay() { setPage("setup"); }
  function handleBack() { setPage("home"); }
  function handleStart(s: GameSettings) { setSettings(s); setPage("game"); }
  function handleHome() { setPage("home"); }
  function handleRematch() { setPage("setup"); }
  function handleReview(moves: string[]) { setReviewMoves(moves); setPage("review"); }

  return (
    <AnimatePresence mode="wait">
      {page === "home" && (
        <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <HomePage onPlay={handlePlay} />
        </motion.div>
      )}
      {page === "setup" && (
        <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <SetupPage onStart={handleStart} onBack={handleBack} />
        </motion.div>
      )}
      {page === "game" && (
        <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <GamePage settings={settings} onHome={handleHome} onRematch={handleRematch} onReview={handleReview} />
        </motion.div>
      )}
      {page === "review" && (
        <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ReviewPage settings={settings} moves={reviewMoves} onHome={handleHome} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}