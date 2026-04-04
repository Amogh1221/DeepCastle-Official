"use client";
import React, { useState, useEffect } from "react";
import { Users, Copy, Check, X } from "lucide-react";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { HomePage } from "./components/HomePage";
import { SetupPage } from "./components/SetupPage";
import { GamePage } from "./components/GamePage";
import { ReviewPage } from "./components/ReviewPage";
import { AnalysisPage } from "./components/AnalysisPage";
import { GameSettings, AppPage } from "./types";
import { getBackendIndex, setBackendIndex } from './api-utils';

// ─── Root App ──────────────────────────────────────────────────────────────────

function generateChess960Fen() {
  const pieces = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  
  // 1. Place bishops on opposite colors
  let b1 = Math.floor(Math.random() * 4) * 2; // 0, 2, 4, 6
  let b2 = Math.floor(Math.random() * 4) * 2 + 1; // 1, 3, 5, 7
  
  const line = new Array(8).fill(null);
  line[b1] = 'b';
  line[b2] = 'b';
  
  // 2. Place queen
  let q;
  do { q = Math.floor(Math.random() * 8); } while (line[q] !== null);
  line[q] = 'q';
  
  // 3. Place knights
  for (let i = 0; i < 2; i++) {
    let n;
    do { n = Math.floor(Math.random() * 8); } while (line[n] !== null);
    line[n] = 'n';
  }
  
  // 4. Place R K R in remaining slots
  const remaining = [];
  for (let i = 0; i < 8; i++) { if (line[i] === null) remaining.push(i); }
  line[remaining[0]] = 'r';
  line[remaining[1]] = 'k';
  line[remaining[2]] = 'r';
  
  const backline = line.join('');
  return `${backline}/pppppppp/8/8/8/8/PPPPPPPP/${backline.toUpperCase()} w KQkq - 0 1`;
}

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [settings, setSettings] = useState<GameSettings>({
    playerColor: "white",
    thinkTime: 2.0,
    mode: "ai",
    variant: "standard",
    matchSettings: { timeLimit: 0, increment: 0 }
  });
  const [reviewMoves, setReviewMoves] = useState<string[]>([]);
  const [incomingChallenge, setIncomingChallenge] = useState<string | null>(null);

  // Share link popup (shown on top of GamePage when host creates a P2P game)
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("match");
    if (m) {
      setIncomingChallenge(m);
      
      const n = params.get("node");
      if (n !== null) {
        setBackendIndex(parseInt(n));
      }
      
      const t = params.get("t");
      const i = params.get("i");
      const v = params.get("v");
      const hc = params.get("hc");
      const fen = params.get("fen");
      
      if (t !== null && i !== null) {
        setSettings(prev => ({
          ...prev,
          mode: "p2p",
          matchId: m,
          isJoiner: true,
          playerColor: hc === "white" ? "black" : "white", // Joiner is opposite of host
          variant: (v as any) || "standard",
          startFen: fen || undefined,
          matchSettings: {
            timeLimit: parseInt(t),
            increment: parseInt(i)
          }
        }));
      }
    }

    // Push initial state
    if (!window.history.state) {
      window.history.replaceState({ page: "home" }, "", "");
    }

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.page) setPage(e.state.page);
      else setPage("home");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigateTo(newPage: AppPage) {
    setPage(newPage);
    window.history.pushState({ page: newPage }, "", "");
  }

  function handlePlay() { navigateTo("setup"); }
  function handleBack() { navigateTo("home"); }

  function handleStart(s: GameSettings) {
    let finalSettings = { ...s };
    
    // Generate FEN for Chess960 if needed
    if (s.variant === "chess960" && !s.startFen) {
      finalSettings.startFen = generateChess960Fen();
    }

    if (s.mode === "p2p" && !s.matchId) {
      const mid = Math.random().toString(36).substring(2, 9);
      finalSettings.matchId = mid;
      
      setSettings(finalSettings);
      navigateTo("game");
      
      if (typeof window !== "undefined") {
        const link = `${window.location.origin}?match=${mid}&node=${getBackendIndex()}&hc=${s.playerColor}&v=${s.variant}${finalSettings.startFen ? '&fen=' + encodeURIComponent(finalSettings.startFen) : ''}&t=${s.matchSettings.timeLimit}&i=${s.matchSettings.increment}`;
        setShareLink(link);
      }
    } else {
      setSettings(finalSettings);
      navigateTo("game");
    }
  }

  function copyShareLink() {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  }

  function acceptChallenge() {
    if (incomingChallenge) {
      const params = new URLSearchParams(window.location.search);
      const hostColor = params.get("hc") as "white" | "black" | null;
      const joinerColor: "white" | "black" = hostColor === "white" ? "black" : "white";
      const variant = (params.get("v") || "standard") as "standard" | "chess960";
      const t = params.get("t");
      const i = params.get("i");
      const fen = params.get("fen");
      
      setSettings({
        playerColor: joinerColor,
        thinkTime: 1.0,
        mode: "p2p",
        variant,
        startFen: fen || undefined,
        matchSettings: { 
          timeLimit: t !== null ? parseInt(t) : 10, 
          increment: i !== null ? parseInt(i) : 0 
        },
        matchId: incomingChallenge,
        isJoiner: true
      });
      navigateTo("game");
      setIncomingChallenge(null);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  function handleHome() { navigateTo("home"); setShareLink(null); }
  function handleRematch() { navigateTo("setup"); setShareLink(null); }
  function handleReview(moves: string[]) { setReviewMoves(moves); navigateTo("review"); setShareLink(null); }
  function handleAnalysis() { navigateTo("analysis"); }

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {page === "home" && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HomePage onPlay={handlePlay} onAnalyze={handleAnalysis} />
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
        {page === "analysis" && (
          <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnalysisPage onHome={handleHome} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHALLENGE OVERLAY */}
      <AnimatePresence>
        {incomingChallenge && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="bg-[#1a1a1f] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                     <Users className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                     <h3 className="font-black text-white">Join Challenge</h3>
                     <p className="text-xs text-slate-500">Someone invited you to play!</p>
                  </div>
               </div>
               <div className="flex gap-3">
                  <button onClick={acceptChallenge} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all">
                     ACCEPT
                  </button>
                  <button onClick={() => setIncomingChallenge(null)} className="px-5 py-3 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl font-bold text-sm transition-all">
                     <X className="w-5 h-5" />
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHARE LINK OVERLAY */}
      <AnimatePresence>
        {shareLink && page === "game" && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-[#1a1a1f] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Share2 className="w-32 h-32 rotate-12" />
               </div>
               
               <button onClick={() => setShareLink(null)} className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
               </button>

               <div className="text-center mb-8 relative z-10">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 mx-auto mb-4">
                     <Users className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">Challenge Created!</h3>
                  <p className="text-slate-400 text-sm">Send this link to your friend to start the game.</p>
               </div>

               <div className="relative mb-6">
                  <input 
                     readOnly 
                     value={shareLink}
                     className="w-full bg-black/40 border border-white/5 rounded-xl py-4 pl-4 pr-12 text-sm text-slate-300 font-mono focus:outline-none"
                  />
                  <button 
                     onClick={copyShareLink}
                     className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
                  >
                     {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
               </div>

               <button 
                  onClick={() => setShareLink(null)}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all border border-white/5"
               >
                  I'm ready, let's wait
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Share2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}