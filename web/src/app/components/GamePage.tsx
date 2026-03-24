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

import { ResignModal, ResultModal, GameOverModal } from './Modals';
export function GamePage({ settings, onHome, onRematch, onReview }: {
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

  // Multiplayer States
  const socketRef = useRef<WebSocket | null>(null);
  const [opponentJoined, setOpponentJoined] = useState(false);

  // Modal states
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [gameResult, setGameResult] = useState<{ title: string; subtitle: string; isWin: boolean } | null>(null);

  // ── Establish Multiplayer Session ──
  useEffect(() => {
    if (settings.mode === "p2p" && settings.matchId) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const cleanHost = API_URL.replace(/^https?:\/\//, "");
      const wsUrl = `${protocol}//${cleanHost}/ws/${settings.matchId}`;
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
         socket.send(JSON.stringify({ type: "join", color: playerColor }));
      };

      socket.onmessage = (event) => {
         const data = JSON.parse(event.data);
         if (data.type === "join") {
            setOpponentJoined(true);
            setBotMessage("Opponent is ready! Game ON.");
         } else if (data.type === "move") {
            applyExternalMove(data.move);
         } else if (data.type === "opponent_disconnected") {
            endGame(true, "Opponent disconnected — you win!");
         }
      };

      return () => socket.close();
    }
  }, []);



  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Click-to-move
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [squareStyles, setSquareStyles] = useState<Record<string, React.CSSProperties>>({});

  // Hint arrow
  const [hintArrow, setHintArrow] = useState<[string, string] | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const arrows = hintArrow ? [{ startSquare: hintArrow[0], endSquare: hintArrow[1], color: "rgba(163, 209, 96, 0.8)" }] : [];

  // Eval bar logic
  const scoreForWhite = stats.score;
  const rawWinProb = Math.max(5, Math.min(95, 50 + scoreForWhite * 7));
  const evalBarFill = playerColor === "white" ? rawWinProb : 100 - rawWinProb;
  const displayScore = playerColor === "white" ? scoreForWhite : -scoreForWhite;

  const evalLabel = (() => {
    if (stats.mateIn !== null) {
      const playerMate = stats.mateIn * (playerColor === "white" ? 1 : -1);
      if (playerMate > 0) return `M${playerMate}`;
      else return `-M${Math.abs(playerMate)}`;
    }
    return displayScore > 0 ? `+${displayScore.toFixed(2)}` : displayScore.toFixed(2);
  })();

  const [engineError, setEngineError] = useState<string | null>(null);

  const endGame = (isWin: boolean, subtitle: string) => {
    setGameEnded(true);
    setGameResult({ title: isWin ? "Victory!" : "DeepCastle Wins", subtitle, isWin });
    setShowResultModal(true);
  };

  const applyExternalMove = (move: any) => {
    const g = gameRef.current;
    if (g.isGameOver() || gameEnded) return;
    const copy = new Chess(g.fen());
    try {
      const mv = copy.move(move);
      if (mv) {
        gameRef.current = copy;
        setFen(copy.fen());
        setMoveHistory(prev => [...prev, { san: mv.san, score: "OPP" }]);
        setIsPlayerTurn(true);
        if (copy.isGameOver()) handleGameOver(copy);
      }
    } catch (e) {
      console.error("Invalid external move", e);
    }
  };

  // ── Engine Fetch ──
  const fetchMove = useCallback(async (currentFen: string, forHint = false) => {
    if (!forHint) {
      setThinking(true); setIsPlayerTurn(false); setBotMessage("Analyzing potential lines...");
    }
    try {
      const response = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, time: settings.thinkTime }),
      });
      if (!response.ok) throw new Error(`Engine API error`);
      const data = await response.json();
      setEngineError(null);
      if (forHint) {
        if (data.bestmove && data.bestmove.length >= 4) {
          setHintArrow([data.bestmove.slice(0, 2), data.bestmove.slice(2, 4)]);
          setTimeout(() => setHintArrow(null), 4000);
        }
        return;
      }
      if (data.bestmove) {
        const g = new Chess(currentFen);
        let mv = g.move(data.bestmove);
        if (!mv) mv = g.move({ from: data.bestmove.slice(0, 2), to: data.bestmove.slice(2, 4), promotion: "q" });
        if (mv) {
          gameRef.current = g; setFen(g.fen());
          setMoveHistory(prev => [...prev, { san: mv!.san, score: String(data.score?.toFixed(2) ?? "?") }]);
          setStats({
            score: data.score ?? 0, depth: data.depth ?? 0, nodes: data.nodes ?? 0, nps: data.nps ?? 0,
            pv: data.pv ?? "", mateIn: data.mate_in ?? null
          });
          setBotMessage("Interesting response.");
          if (g.isGameOver()) handleGameOver(g);
        }
      }
    } catch (err: any) {
      if (!forHint) setEngineError("Engine Offline");
    } finally {
      if (!forHint) { setThinking(false); setIsPlayerTurn(true); }
    }
  }, [settings.thinkTime, playerColor, settings.matchSettings.increment]);

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

  function applyPlayerMove(from: string, to: string): boolean {
    const g = gameRef.current;
    if (g.turn() !== playerChessColor || g.isGameOver() || !isPlayerTurn || gameEnded) return false;
    const copy = new Chess(g.fen());
    let mv = null;
    try { mv = copy.move({ from, to, promotion: "q" }); } catch { return false; }
    if (mv) {
      gameRef.current = copy; setFen(copy.fen());
      setMoveHistory(prev => [...prev, { san: mv!.san, score: "USR" }]);
      setBotMessage("Thinking..."); setMoveFrom(null); setSquareStyles({}); setHintArrow(null);
      if (settings.mode === "p2p" && socketRef.current) socketRef.current.send(JSON.stringify({ type: "move", move: { from, to, promotion: "q" } }));
      if (copy.isGameOver()) { handleGameOver(copy); return true; }
      if (settings.mode === "ai") setTimeout(() => fetchMove(copy.fen()), 150);
      else setIsPlayerTurn(false);
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
                <div className={`w-12 h-12 ${settings.mode === "ai" ? "bg-indigo-600" : "bg-emerald-600"} rounded-lg flex items-center justify-center border-2 ${settings.mode === "ai" ? "border-indigo-400" : "border-emerald-400"}`}>
                  {settings.mode === "ai" ? <Cpu className="w-8 h-8 text-white opacity-80" /> : <Users className="w-8 h-8 text-white opacity-80" />}
                </div>
                { (thinking || (!isPlayerTurn && settings.mode === "p2p")) && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#262421]" />
                  </span>
                )}
              </div>
              <div>
                 <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                   {settings.mode === "ai" ? "DeepCastle" : "Opponent"}
                   <span className="text-orange-500 text-xs font-bold px-1.5 py-0.5 bg-orange-500/10 rounded border border-orange-500/20">
                     {settings.mode === "ai" ? "3600+ Elo" : "Joined"}
                   </span>
                 </h3>
                 {settings.mode === "p2p" && !opponentJoined && <p className="text-[10px] text-amber-500 animate-pulse">Waiting for opponent...</p>}
              </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-3 border-l border-white/10 pl-4">
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
                 options={{
                   id: "game-board",
                   position: fen,
                   squareStyles: squareStyles,
                   darkSquareStyle: { backgroundColor: "#779556" },
                   lightSquareStyle: { backgroundColor: "#ebecd0" },
                   boardStyle: { borderRadius: "4px" },
                   animationDurationInMs: 200,
                   allowDragging: isPlayerTurn && !gameEnded,
                   onPieceDrop: handlePieceDrop,
                   onSquareClick: handleSquareClick,
                   boardOrientation: playerColor,
                   arrows: arrows,
                 }}
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
                You{" "}
                <span className="text-xs text-slate-500">({playerColor})</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
               {thinking && <span className="text-xs text-emerald-400 animate-pulse font-semibold">Engine thinking…</span>}
            </div>
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
            {settings.mode !== "p2p" && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#161512] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                  <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Depth</p>
                  <p className="text-xl font-bold tracking-tighter text-slate-200">
                    {stats.depth}<span className="text-[10px] ml-1 opacity-40">PLY</span>
                  </p>
                </div>
                <div className="bg-[#161512] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                  <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Speed</p>
                  <p className="text-xl font-bold tracking-tighter text-indigo-400">
                    <span>{(stats.nps / 1000).toFixed(1)}k<span className="text-[10px] ml-1 opacity-40">NPS</span></span>
                  </p>
                </div>
                <div className="bg-[#161512] p-3 rounded-lg border border-white/5 flex flex-col justify-center">
                  <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Nodes</p>
                  <p className="text-xl font-bold tracking-tighter text-emerald-400">
                    <span>{(stats.nodes / 1000).toFixed(1)}k</span>
                  </p>
                </div>
              </div>
            )}

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
                className={`flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed ${settings.mode === "p2p" ? "col-span-3" : ""}`}
              >
                <Flag className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-red-300">Resign</span>
              </button>
              {settings.mode !== "p2p" && (
                <button
                  id="hint-btn"
                  onClick={getHint}
                  disabled={loadingHint || thinking || !isPlayerTurn || gameEnded}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-amber-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed relative col-span-2"
                >
                  <Lightbulb className={`w-5 h-5 text-slate-400 group-hover:text-amber-400 ${loadingHint ? "animate-pulse text-amber-400" : ""}`} />
                  <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">
                    {loadingHint ? "..." : "Hint"}
                  </span>
                  {hintArrow && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                  )}
                </button>
              )}
            </div>
          </section>

          {/* Bottom bar */}
          {settings.mode !== "p2p" && (
            <div className="bg-[#262421] p-4 rounded-lg border border-[#3d3a36] flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" /> {settings.thinkTime < 1 ? Math.round(settings.thinkTime * 1000) + "ms" : settings.thinkTime + "s"} Think Time
                </div>
              </div>
              <button
                id="new-game-btn"
                onClick={resetGame}
                className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10 flex items-center gap-1.5 hover:bg-white/5 transition-colors pr-2 py-1 rounded"
              >
                <RefreshCw className="w-3 h-3" /> New Game
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}