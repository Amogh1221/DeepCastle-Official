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

export function ResignModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
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

export function ResultModal({ message, onHome, onRematch, onReview }: { message: string; onHome: () => void; onRematch: () => void; onReview: () => void }) {
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

export function GameOverModal({ title, subtitle, isWin, onHome, onRematch, onReview }: {
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