"use client";
import React, { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HomePage } from "./components/HomePage";
import { SetupPage } from "./components/SetupPage";
import { LobbyPage } from "./components/LobbyPage";
import { GamePage } from "./components/GamePage";
import { ReviewPage } from "./components/ReviewPage";
import { GameSettings, AppPage } from "./types";

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [settings, setSettings] = useState<GameSettings>({ 
    playerColor: "white", 
    thinkTime: 2.0, 
    mode: "ai", 
    matchSettings: { timeLimit: 0, increment: 0 }
  });
  const [reviewMoves, setReviewMoves] = useState<string[]>([]);
  const [incomingChallenge, setIncomingChallenge] = useState<string|null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("match");
    if (m) {
      setIncomingChallenge(m);
    }
  }, []);

  function handlePlay() { setPage("setup"); }
  function handleBack() { setPage("home"); }
  
  function handleStart(s: GameSettings) { 
    if (s.mode === "p2p" && !s.matchId) {
      const mid = Math.random().toString(36).substring(2, 9);
      setSettings({...s, matchId: mid});
      setPage("lobby");
    } else {
      setSettings(s);
      setPage("game"); 
    }
  }

  function acceptChallenge() {
    if (incomingChallenge) {
      setSettings({
        playerColor: "black",
        thinkTime: 1.0,
        mode: "p2p",
        matchSettings: { timeLimit: 10, increment: 5 },
        matchId: incomingChallenge
      });
      setPage("game");
      setIncomingChallenge(null);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  function handleHome() { setPage("home"); }
  function handleRematch() { setPage("setup"); }
  function handleReview(moves: string[]) { setReviewMoves(moves); setPage("review"); }

  return (
    <div className="relative">
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
        {page === "lobby" && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LobbyPage matchId={settings.matchId || ""} onBack={handleBack} />
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

      <AnimatePresence>
        {incomingChallenge && (
           <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} 
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-[#1a1a1f] border-2 border-indigo-500/50 p-6 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex items-center gap-6">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center animate-bounce">
                 <Users className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-left">
                  <p className="font-black text-white text-lg">Challenge Received!</p>
                  <p className="text-xs text-slate-500">Someone wants to play you on DeepCastle</p>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => setIncomingChallenge(null)} className="px-4 py-2 hover:bg-white/5 rounded-xl text-xs font-bold text-slate-500">Decline</button>
                 <button onClick={acceptChallenge} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-black text-white shadow-lg">Accept</button>
              </div>
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}