"use client";

import React, { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  RotateCcw, ChevronRight, ChevronLeft, Home, BarChart2, BookOpen, Zap, AlertTriangle
} from "lucide-react";
import { GameSettings } from "../types";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

// ── Classification colors / icons ──────────────────────────────────────────────
const CLS_COLOR: Record<string, string> = {
  Brilliant: "#2dd4bf", Great: "#06b6d4", Best: "#10b981", Excellent: "#4ade80",
  Good: "#a3e635", Inaccuracy: "#fbbf24", Mistake: "#f97316", Blunder: "#ef4444",
  Book: "#a5f3fc",
};
const CLS_BG: Record<string, string> = {
  Brilliant: "rgba(45,212,191,0.12)", Great: "rgba(6,182,212,0.12)", Best: "rgba(16,185,129,0.12)",
  Excellent: "rgba(74,222,128,0.12)", Good: "rgba(163,230,53,0.12)",
  Inaccuracy: "rgba(251,191,36,0.12)", Mistake: "rgba(249,115,22,0.12)", Blunder: "rgba(239,68,68,0.12)",
  Book: "rgba(165,243,252,0.12)",
};
const CLS_EMOJI: Record<string, string> = {
  Brilliant: "✦", Great: "!!", Best: "★", Excellent: "✓", Good: "·",
  Inaccuracy: "?", Mistake: "?!", Blunder: "??",
  Book: "📖",
};

// Map classification to icon filename — covers all cases
const getIconName = (cls: string): string => {
  const map: Record<string, string> = {
    "Brilliant": "splendid",
    "Great": "perfect",
    "Best": "best",
    "Excellent": "excellent",
    "Good": "okay",
    "Inaccuracy": "inaccuracy",
    "Mistake": "mistake",
    "Blunder": "blunder",
    "Book": "opening",
    "Forced": "forced",
  };
  return map[cls] || "okay";
};

function clsBadge(cls: string) {
  return (
    <span
      style={{ color: CLS_COLOR[cls] || "#94a3b8", background: CLS_BG[cls] }}
      className="text-[10px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 inline-flex items-center gap-1"
    >
      <img
        src={`/icons/${getIconName(cls)}.png`}
        alt=""
        className="w-3 h-3 inline-block"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      {cls}
    </span>
  );
}

function buildChess(startFen?: string) {
  const g = new Chess();
  if (startFen) {
    try { g.load(startFen); } catch (e) { }
  }
  return g;
}

export function ReviewPage({
  settings, moves, onHome,
}: { settings: GameSettings; moves: string[]; onHome: () => void }) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPly, setCurrentPly] = useState(moves.length);
  const [flipped, setFlipped] = useState(settings.playerColor === "black");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"review" | "analysis">("review");
  const [showMoveList, setShowMoveList] = useState(false);
  const [sidelineFen, setSidelineFen] = useState<string | null>(null);

  // Analysis-mode live eval
  const [analysisArrows, setAnalysisArrows] = useState<any[]>([]);
  const [liveEval, setLiveEval] = useState<string>("");
  const analysisFenRef = useRef("");
  const analysisAbortRef = useRef<AbortController | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Build board FEN + lastMove from ply
  const { fen: currentFen, lastMove } = React.useMemo(() => {
    const g = buildChess(settings.startFen);
    let moveObj: any = null;
    for (let i = 0; i < currentPly; i++) {
      try { moveObj = g.move(moves[i]); } catch (e) { }
    }
    return { fen: g.fen(), lastMove: moveObj };
  }, [moves, currentPly, settings.startFen]);

  // Run full-game analysis
  useEffect(() => {
    if (!moves || moves.length === 0) {
      setError("No moves to analyze. Play a full game first!");
      setLoading(false);
      return;
    }
    async function run() {
      try {
        const res = await fetch(`${API_URL}/analyze-game`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moves,
            time_per_move: 0.1,
            player_color: settings.playerColor,
            start_fen: settings.startFen,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server error ${res.status}: ${text.slice(0, 100)}`);
        }
        setAnalysis(await res.json());
      } catch (e: any) {
        setError(e.message || "Analysis failed. Make sure the engine is running.");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCurrentPly(p => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setCurrentPly(p => Math.min(moves.length, p + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moves.length]);

  // Reset sideline when navigating game history
  useEffect(() => {
    setSidelineFen(null);
  }, [currentPly]);

  // Live analysis engine
  useEffect(() => {
    analysisAbortRef.current?.abort();
    const ctrl = new AbortController();
    analysisAbortRef.current = ctrl;
    
    const targetFen = sidelineFen || currentFen;
    analysisFenRef.current = targetFen;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/analysis-move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen: targetFen, time: 0.5 }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          const data = await res.json();
          if (analysisFenRef.current !== targetFen) return;
          if (data.bestmove?.length >= 4) {
            setAnalysisArrows([{
              startSquare: data.bestmove.slice(0, 2),
              endSquare: data.bestmove.slice(2, 4),
              color: "rgba(163,209,96,0.85)"
            }]);
          }
          const s = data.score;
          setLiveEval(s !== undefined ? (s > 0 ? `+${s.toFixed(2)}` : s.toFixed(2)) : "");
        }
      } catch { }
    })();

    return () => analysisAbortRef.current?.abort();
  }, [currentFen, sidelineFen]);

  // Scroll active move into view (Desktop only)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth > 1024) {
      const el = moveListRef.current?.querySelector(`[data-ply="${currentPly}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentPly]);

  // ── Derived data ───────────────────────────────────────────────────────────────
  const currentMove = analysis?.moves?.[currentPly - 1] ?? null;

  const chartData = analysis
    ? [{ ply: 0, eval: 0 }, ...analysis.moves.map((m: any) => ({
      ply: m.move_num,
      eval: Math.max(-8, Math.min(8, m.score_after)),
    }))]
    : [];

  const counts = analysis?.counts ?? {};

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(255,255,0,0.35)" };
    squareStyles[lastMove.to] = { backgroundColor: "rgba(255,255,0,0.35)" };
  }

  const reviewArrows: any[] = [];
  if (lastMove && currentMove?.classification) {
    const bad = ["Blunder", "Mistake", "Inaccuracy"].includes(currentMove.classification);
    reviewArrows.push({
      startSquare: lastMove.from,
      endSquare: lastMove.to,
      color: bad ? "rgba(239,68,68,0.75)" : "rgba(16,185,129,0.75)"
    });
  }

  const boardArrows = sidelineFen ? analysisArrows : (tab === "analysis" ? analysisArrows : reviewArrows);

  const evalNum = currentMove?.score_after ?? (chartData[currentPly]?.eval ?? 0);
  const rawWinProb = Math.max(5, Math.min(95, 50 + evalNum * 7));
  const evalBarWhite = rawWinProb;
  const orientation = flipped ? (settings.playerColor === "white" ? "black" : "white") : settings.playerColor;

  function handlePieceDrop(sourceSquare: string, targetSquare: string) {
    const startFen = sidelineFen || currentFen;
    const g = new Chess(startFen);
    try {
      const mv = g.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (mv) {
        setSidelineFen(g.fen());
        setTab("analysis"); // Shift to analysis more to see engine lines
        return true;
      }
    } catch { }
    return false;
  }

  return (
    <main className="min-h-screen bg-[#111113] text-slate-100 flex flex-col items-center justify-start p-2 lg:p-4">

      {/* LOADING */}
      {loading && (
        <div className="flex flex-col items-center gap-5 mt-20">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 border-4 border-emerald-500/30 rounded-full" />
            <div className="absolute inset-0 w-20 h-20 border-4 border-t-emerald-400 rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-lg font-black bg-gradient-to-r from-emerald-400 to-teal-400 text-transparent bg-clip-text">
              DeepCastle is analyzing your game
            </p>
            <p className="text-slate-500 text-sm mt-1">This may take a minute…</p>
          </div>
        </div>
      )}

      {/* ERROR */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-6 max-w-sm text-center mt-20">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white mb-2">Analysis Failed</h2>
            <p className="text-slate-400 text-sm mb-1">{error}</p>
            <p className="text-slate-500 text-xs">Make sure the DeepCastle engine is running on Hugging Face.</p>
          </div>
          <button onClick={onHome} className="px-6 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold transition-all">
            ← Go Home
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="w-full max-w-[1240px] mx-auto flex flex-col xl:flex-row gap-8">

          {/* LEFT: Board + Graph + Nav */}
          <div className="flex flex-col gap-4 w-full xl:w-[540px] shrink-0">

            {/* Board row with eval bar */}
            <div className="flex gap-2 sm:gap-3">
              {/* Eval bar */}
              <div className="w-4 sm:w-5 bg-[#1e1e22] rounded-lg overflow-hidden border border-white/5 relative shrink-0 self-stretch min-h-[250px]">
                <div
                  className="absolute top-0 left-0 w-full transition-all duration-500 bg-gradient-to-b from-slate-200 to-slate-400"
                  style={{ height: `${100 - evalBarWhite}%` }}
                />
                <div
                  className="absolute bottom-0 left-0 w-full bg-[#161619]"
                  style={{ height: `${evalBarWhite}%` }}
                />
              </div>

              {/* Board */}
              <div className="flex-1 relative bg-[#1a1a1f] p-1 sm:p-1.5 rounded-xl border border-white/10 shadow-2xl overflow-visible">
                <div className="aspect-square w-full relative">
                  <Chessboard
                    options={{
                      position: sidelineFen || currentFen,
                      boardOrientation: orientation,
                      squareStyles,
                      arrows: boardArrows,
                      animationDurationInMs: 300,
                      onPieceDrop: ({ sourceSquare, targetSquare }) => targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
                      allowDragging: true,
                    }}
                  />

                  {/* Move Classification Icon Overlay */}
                  {currentMove && lastMove && tab !== "analysis" && (
                    (() => {
                      const file = lastMove.to.charCodeAt(0) - 97;
                      const rank = parseInt(lastMove.to[1]) - 1;
                      const x = orientation === "white" ? file : 7 - file;
                      const y = orientation === "white" ? 7 - rank : rank;
                      return (
                        <div
                          className="absolute z-[100] pointer-events-none"
                          style={{
                            width: "12.5%",
                            height: "12.5%",
                            left: `${x * 12.5}%`,
                            top: `${y * 12.5}%`,
                          }}
                        >
                          <img
                            src={`/icons/${getIconName(currentMove.classification)}.png`}
                            alt={currentMove.classification}
                            className="absolute -top-[20%] -right-[20%] w-[55%] h-[55%] min-w-[18px] min-h-[18px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] z-[200]"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>

            {/* Eval Graph */}
            <div className="h-20 sm:h-24 bg-[#161619] rounded-xl border border-white/5 px-3 py-2 sm:p-4 shrink-0 relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Evaluation</span>
                {tab === "analysis" && liveEval && (
                  <span className={`text-xs font-black ${parseFloat(liveEval) > 0 ? "text-emerald-400" : parseFloat(liveEval) < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {liveEval}
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height="75%">
                <AreaChart data={chartData} onClick={(e: any) => {
                  try {
                    if (e?.activePayload?.length > 0) setCurrentPly(e.activePayload[0].payload.ply);
                  } catch { }
                }} style={{ cursor: "pointer" }}>
                  <defs>
                    <linearGradient id="evalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[-8, 8]} hide />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#262421", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                    itemStyle={{ color: "#a7f3d0", fontWeight: "bold" }}
                    labelStyle={{ display: "none" }}
                    formatter={(v: any) => [typeof v === "number" ? (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : v, "Eval"]}
                  />
                  {currentPly > 0 && chartData[currentPly] && (
                    <ReferenceLine x={currentPly} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                  )}
                  <Area type="monotone" dataKey="eval" stroke="#10b981" strokeWidth={2} fill="url(#evalGrad)" dot={false} activeDot={{ r: 5, fill: "#34d399" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Nav controls (Mobile only) */}
            <div className="flex xl:hidden items-center gap-1 shrink-0">
              <button onClick={onHome} className="p-2.5 bg-[#1a1a1f] hover:bg-white/5 border border-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
                <Home className="w-4 h-4" />
              </button>
              <div className="flex-1 flex items-center gap-1 bg-[#1a1a1f] border border-white/5 rounded-lg p-1">
                <button onClick={() => setCurrentPly(0)} className="flex-1 py-2 hover:bg-white/5 rounded-md transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-2" />
                </button>
                <button onClick={() => setCurrentPly(p => Math.max(0, p - 1))} className="flex-1 py-2 hover:bg-white/5 rounded-md transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-xs text-slate-500 px-3 font-mono">{currentPly}/{moves.length}</span>
                <button onClick={() => setCurrentPly(p => Math.min(moves.length, p + 1))} className="flex-1 py-2 hover:bg-white/5 rounded-md transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button onClick={() => setCurrentPly(moves.length)} className="flex-1 py-2 hover:bg-white/5 rounded-md transition-all text-slate-400 hover:text-white flex items-center justify-center">
                  <ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-2" />
                </button>
              </div>
              <button onClick={() => setFlipped(f => !f)} className="p-2.5 bg-[#1a1a1f] hover:bg-white/5 border border-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* RIGHT: Move List & Analytics */}
          <div className="flex flex-col gap-3 w-full xl:w-[668px] xl:min-w-[400px]">

            {/* Tabs */}
            <div className="flex bg-[#1a1a1f] rounded-xl border border-white/5 p-1 gap-1 shrink-0">
              <button onClick={() => setTab("review")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${tab === "review" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}>
                <BarChart2 className="w-4 h-4" /> Game Review
              </button>
              <button onClick={() => setTab("analysis")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${tab === "analysis" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}>
                <Zap className="w-4 h-4" /> Analysis
              </button>
            </div>

            {/* REVIEW TAB */}
            {tab === "review" && (
              <div className="flex-1 flex flex-col bg-[#1a1a1f] rounded-xl border border-white/5 overflow-hidden min-h-0">

                {/* Accuracy + Elo */}
                <div className="flex items-stretch border-b border-white/5 shrink-0">
                  <div className="flex-1 px-4 py-3">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Accuracy</span>
                      <span className="text-sm font-black text-emerald-400">{analysis?.accuracy ?? "—"}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                        style={{ width: `${analysis?.accuracy ?? 0}%` }} />
                    </div>
                  </div>
                  <div className="border-l border-white/5 px-5 py-3 flex flex-col items-center justify-center shrink-0">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Perf ELO</p>
                    <p className="text-xl font-black text-amber-400">{analysis?.estimated_elo ?? "—"}</p>
                  </div>
                </div>

                {/* Classification icon grid */}
                <div className="grid grid-cols-4 sm:grid-cols-5 xl:grid-cols-4 gap-1.5 px-3 py-3 border-b border-white/5 shrink-0">
                  {Object.entries(CLS_COLOR).map(([cls]) =>
                    (counts[cls] ?? 0) > 0 ? (
                      <div key={cls}
                        style={{ borderColor: CLS_COLOR[cls] + "40", background: CLS_BG[cls] }}
                        className="flex flex-col items-center justify-center py-2 rounded-lg border gap-1">
                        <img
                          src={`/icons/${getIconName(cls)}.png`}
                          alt={cls}
                          className="w-5 h-5"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <span style={{ color: CLS_COLOR[cls] }} className="text-sm font-black leading-none">{counts[cls]}</span>
                        <span className="text-[9px] text-slate-500 font-bold truncate w-full text-center px-1">{cls}</span>
                      </div>
                    ) : null
                  )}
                </div>

                {/* Current move banner */}
                <div className="px-4 py-2.5 border-b border-white/5 shrink-0 min-h-[52px] flex items-center">
                  {currentMove ? (
                    <div className="flex items-start gap-3 w-full">
                      <span className="text-slate-400 text-xs w-8 shrink-0 mt-0.5">
                        {Math.ceil(currentPly / 2)}{currentPly % 2 !== 0 ? "." : "…"}
                      </span>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {clsBadge(currentMove.classification)}
                          <span className="text-slate-200 font-bold">{moves[currentPly - 1]}</span>
                          <span className="text-slate-500 text-[10px] ml-auto shrink-0 uppercase tracking-tighter">CPL {Math.round(currentMove.cpl)}</span>
                        </div>
                        {currentMove.opening && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                            <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="text-[10px] font-bold text-indigo-300 truncate">{currentMove.opening}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 text-xs">
                      {currentPly === 0 ? "Starting position — navigate through moves" : "Navigate to see move analysis"}
                    </span>
                  )}
                </div>

                {/* Move list — conditional */}
                <div className="flex-1 flex flex-col min-h-0 bg-black/10">
                  <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
                    <span className="text-[10px] uppercase text-slate-500 font-black tracking-widest">Move History</span>
                    <button
                      onClick={() => setShowMoveList(!showMoveList)}
                      className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${showMoveList ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"}`}
                    >
                      {showMoveList ? "Hide" : "Show"}
                    </button>
                  </div>

                  {showMoveList ? (
                    <div ref={moveListRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 custom-scrollbar min-h-0">
                      {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                        const whitePly = i * 2 + 1;
                        const blackPly = i * 2 + 2;
                        const whiteMove = moves[i * 2];
                        const blackMove = moves[i * 2 + 1];
                        const whiteAnalysis = analysis?.moves?.[i * 2];
                        const blackAnalysis = analysis?.moves?.[i * 2 + 1];
                        return (
                          <div key={i} className="flex items-center gap-1 text-xs rounded-lg hover:bg-white/3">
                            <span className="text-slate-600 w-7 text-right shrink-0 pr-1">{i + 1}.</span>
                            <button data-ply={whitePly} onClick={() => setCurrentPly(whitePly)}
                              className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all text-left ${currentPly === whitePly ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                              {whiteAnalysis && (
                                <img
                                  src={`/icons/${getIconName(whiteAnalysis.classification)}.png`}
                                  alt=""
                                  className="w-3.5 h-3.5 shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                              <span className="font-bold">{whiteMove}</span>
                            </button>
                            <button data-ply={blackPly} onClick={() => blackMove && setCurrentPly(blackPly)}
                              disabled={!blackMove}
                              className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all text-left ${!blackMove ? "opacity-0 pointer-events-none" : currentPly === blackPly ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                              {blackAnalysis && (
                                <img
                                  src={`/icons/${getIconName(blackAnalysis.classification)}.png`}
                                  alt=""
                                  className="w-3.5 h-3.5 shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              )}
                              <span className="font-bold">{blackMove || ""}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 opacity-40 text-center">
                       <Zap className="w-8 h-8 mb-2 text-indigo-400" />
                       <p className="text-xs font-bold text-slate-400">Move list is hidden</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ANALYSIS TAB */}
            {tab === "analysis" && (
              <div className="flex-1 flex flex-col bg-[#1a1a1f] rounded-xl border border-white/5 overflow-hidden min-h-0">
                {/* Live eval header */}
                <div className="px-4 py-3 border-b border-white/5 shrink-0 flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20 shrink-0">
                    <Zap className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-300">Live Engine Analysis</p>
                    <p className="text-[10px] text-slate-500">Browse any position to see the best move</p>
                  </div>
                  {liveEval && (
                    <span className={`ml-auto text-xl font-black ${parseFloat(liveEval) > 0 ? "text-emerald-400" : parseFloat(liveEval) < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {liveEval}
                    </span>
                  )}
                </div>

                <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4">
                  <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-4">
                    <p className="text-xs font-black text-indigo-300 mb-2">How to use Analysis Mode</p>
                    <ul className="text-xs text-slate-400 space-y-1.5 list-none">
                      <li>🟢 Green arrow = Engine's best move</li>
                      <li>⬅️ ➡️ Use arrow keys or nav buttons to browse</li>
                      <li>🔄 Tap Flip to switch board perspective</li>
                      <li>📊 Click the graph to jump to any position</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                      <p className="text-[9px] text-slate-500 uppercase font-black">Move</p>
                      <p className="text-lg font-black text-white">{currentPly === 0 ? "Start" : `${Math.ceil(currentPly / 2)}${currentPly % 2 !== 0 ? "." : "…"}`}</p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                      <p className="text-[9px] text-slate-500 uppercase font-black">Turn</p>
                      <p className="text-lg font-black text-white">
                        {currentFen.split(" ")[1] === "w" ? "⬜ White" : "⬛ Black"}
                      </p>
                    </div>
                  </div>

                  {currentMove && (
                    <div className="bg-black/20 rounded-xl border border-white/5 p-3">
                      <p className="text-[10px] uppercase text-slate-500 font-black tracking-widest mb-2">Review Data for This Move</p>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-white font-black text-base">{currentMove.san}</span>
                        {clsBadge(currentMove.classification)}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                          <p className="text-[9px] text-slate-500 uppercase font-black">Centipawn Loss</p>
                          <p className="text-sm font-black text-white">{Math.round(currentMove.cpl)}</p>
                        </div>
                        <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                          <p className="text-[9px] text-slate-500 uppercase font-black">Score After</p>
                          <p className={`text-sm font-black ${currentMove.score_after > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {currentMove.score_after > 0 ? "+" : ""}{currentMove.score_after.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Nav controls & Actions (Desktop) */}
            <div className="hidden xl:flex flex-col gap-3 mt-auto pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 transition-all">
                {/* Space on left to push nav to right */}
                <div className="flex-1" />
                
                <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded-xl p-1.5 focus-within:border-indigo-500/30 transition-all shrink-0">
                  <button onClick={() => setCurrentPly(0)} className="px-4 py-3 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center justify-center group">
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /><ChevronLeft className="w-4 h-4 -ml-2 group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                  <button onClick={() => setCurrentPly(p => Math.max(0, p - 1))} className="px-5 py-3 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center justify-center group">
                    <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                  
                  <div className="px-6 flex flex-col items-center min-w-[80px]">
                    <span className="text-sm font-black text-white">{currentPly}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest whitespace-nowrap">/ {moves.length} MOVES</span>
                  </div>

                  <button onClick={() => setCurrentPly(p => Math.min(moves.length, p + 1))} className="px-5 py-3 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center justify-center group">
                    <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                  <button onClick={() => setCurrentPly(moves.length)} className="px-4 py-3 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white flex items-center justify-center group">
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /><ChevronRight className="w-4 h-4 -ml-2 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setFlipped(f => !f)} className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-xs font-black uppercase tracking-widest text-slate-300 flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Flip Board
                </button>
                <button onClick={onHome} className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2">
                  <Home className="w-4 h-4" /> Return Home
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
