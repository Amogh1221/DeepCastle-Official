"use client";
import React, { useState, useEffect } from "react";
import { Users, Copy, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HomePage } from "./components/HomePage";
import { SetupPage } from "./components/SetupPage";
import { GamePage } from "./components/GamePage";
import { ReviewPage } from "./components/ReviewPage";
import { GameSettings, AppPage } from "./types";

// ─── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<AppPage>("home");
  const [settings, setSettings] = useState<GameSettings>({
    playerColor: "white",
    thinkTime: 2.0,
    mode: "ai",
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
    if (m) setIncomingChallenge(m);
  }, []);

  function handlePlay() { setPage("setup"); }
  function handleBack() { setPage("home"); }

  function handleStart(s: GameSettings) {
    if (s.mode === "p2p" && !s.matchId) {
      // Generate a match ID and go straight to GamePage (host waits)
      const mid = Math.random().toString(36).substring(2, 9);
      const finalSettings = { ...s, matchId: mid };
      setSettings(finalSettings);
      setPage("game");
      // After a tick, set the share link so it appears on top of GamePage
      if (typeof window !== "undefined") {
        const link = `${window.location.origin}?match=${mid}`;
        setShareLink(link);
      }
    } else {
      setSettings(s);
      setPage("game");
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
      setSettings({
        playerColor: "black",
        thinkTime: 1.0,
        mode: "p2p",
        matchSettings: { timeLimit: 0, increment: 0 },
        matchId: incomingChallenge
      });
      setPage("game");
      setIncomingChallenge(null);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  function handleHome() { setPage("home"); setShareLink(null); }
  function handleRematch() { setPage("setup"); setShareLink(null); }
  function handleReview(moves: string[]) { setReviewMoves(moves); setPage("review"); setShareLink(null); }

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

      {/* ── Share Link Popup (host, floats above GamePage) ── */}
      <AnimatePresence>
        {shareLink && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <div className="bg-[#1a1a1f] border-2 border-indigo-500/40 rounded-3xl p-8 max-w-md w-full shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">Challenge Ready! 🎯</h2>
                  <p className="text-sm text-slate-400">Share this link with your friend to start the game.</p>
                </div>
                <button
                  onClick={() => setShareLink(null)}
                  className="text-slate-600 hover:text-slate-300 transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-black/50 rounded-xl border border-white/5 p-4 flex items-center gap-3 mb-6">
                <span className="flex-1 text-xs text-slate-300 font-mono truncate">{shareLink}</span>
                <button
                  onClick={copyShareLink}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-black text-white transition-all flex-shrink-0"
                >
                  {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedShare ? "Copied!" : "Copy"}
                </button>
              </div>

              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-amber-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-300">Waiting for opponent…</p>
                  <p className="text-xs text-amber-500/70">Game will start automatically when they join</p>
                </div>
              </div>

              <button
                onClick={() => setShareLink(null)}
                className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-slate-400 border border-white/5 transition-all"
              >
                Dismiss — continue waiting
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Incoming Challenge Popup (opponent) ── */}
      <AnimatePresence>
        {incomingChallenge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              className="bg-[#1a1a1f] border-2 border-emerald-500/40 rounded-3xl p-8 max-w-sm w-full shadow-[0_30px_80px_rgba(0,0,0,0.8)] text-center"
            >
              <div className="w-20 h-20 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-emerald-500/20">
                <Users className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Challenge Received! ⚔️</h2>
              <p className="text-sm text-slate-400 mb-8">Someone wants to battle you on DeepCastle. Do you accept?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setIncomingChallenge(null); window.history.replaceState({}, "", window.location.pathname); }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-slate-400 border border-white/5 transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={acceptChallenge}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white shadow-lg transition-all"
                >
                  Accept!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}