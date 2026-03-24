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

export function LobbyPage({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  
  if (!isClient) return null;
  const challengeLink = `${window.location.origin}?match=${matchId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(challengeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-slate-100 flex items-center justify-center p-6 text-center">
       <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#161619] border border-white/5 rounded-3xl p-10 max-w-md w-full shadow-2xl">
          <div className="w-20 h-20 bg-indigo-600/10 rounded-full flex items-center justify-center mx-auto mb-6">
             <Share2 className="w-10 h-10 text-indigo-400 animate-pulse" />
          </div>
          <h2 className="text-3xl font-black mb-2">Challenge Ready!</h2>
          <p className="text-slate-500 mb-8 text-sm">Send this link to your opponent. The game will start automatically once they join.</p>
          
          <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-center gap-3 mb-8">
             <input readOnly value={challengeLink} className="bg-transparent flex-1 text-[10px] text-slate-400 outline-none truncate" />
             <button onClick={copyLink} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-slate-400" />}
             </button>
          </div>

          <button onClick={onBack} className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/5 text-slate-400">
             Cancel Challenge
          </button>
       </motion.div>
    </main>
  );
}