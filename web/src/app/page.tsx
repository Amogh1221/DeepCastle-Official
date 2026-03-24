"use client";

import React, { useState, useCallback, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { motion } from "framer-motion";
import { Cpu, Settings2, RefreshCw, TrendingUp, Flag, RotateCcw, Lightbulb, ChevronRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://localhost:7860";

export default function DeepcastleGrandmaster() {
  const [game, setGame] = useState(new Chess());
  const gameRef = useRef(new Chess()); // keep a ref in sync for callbacks
  const [fen, setFen] = useState(new Chess().fen());
  const [moveHistory, setMoveHistory] = useState<{ san: string; score: string }[]>([]);
  const [stats, setStats] = useState({ score: 0.0, depth: 0, nodes: 0, nps: 0, pv: "" });
  const [thinking, setThinking] = useState(false);
  const [botMessage, setBotMessage] = useState("Let's see what you've got.");
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);

  // Highlighting & Click-to-move State
  const [moveFrom, setMoveFrom] = useState("");
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  // Trigger Backend Move
  const fetchMove = useCallback(async (currentFen: string) => {
    setThinking(true);
    setIsPlayerTurn(false);
    setBotMessage("Analyzing potential lines...");

    try {
      const response = await fetch(`${API_URL}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: currentFen, time: 1.0 }),
      });

      if (!response.ok) throw new Error("API Network Error");

      const data = await response.json();

      if (data.bestmove) {
        const currentGame = new Chess(currentFen);

        let appliedMove = null;
        try {
          appliedMove = currentGame.move(data.bestmove);
        } catch {
          try {
            appliedMove = currentGame.move({
              from: data.bestmove.substring(0, 2),
              to: data.bestmove.substring(2, 4),
              promotion: data.bestmove.length > 4 ? data.bestmove.substring(4) : "q",
            });
          } catch (err) {
            console.error("Engine move parse failed", err);
          }
        }

        if (appliedMove) {
          gameRef.current = currentGame;
          setGame(currentGame);
          setFen(currentGame.fen());
          setMoveHistory(prev => [...prev, { san: appliedMove!.san, score: data.score?.toFixed(2) ?? "?" }]);
          setStats({
            score: data.score ?? 0,
            depth: data.depth ?? 0,
            nodes: data.nodes ?? 0,
            nps: data.nps ?? 0,
            pv: data.pv ?? "",
          });

          if (data.score > 2.0) setBotMessage("My position is dominating.");
          else if (data.score < -2.0) setBotMessage("You are playing remarkably well.");
          else setBotMessage("So be it.");
        } else {
          setBotMessage("Engine returned an invalid move.");
        }
      }
    } catch (error) {
      console.error(error);
      setBotMessage("Connection to engine failed. Please ensure the API is running!");
    } finally {
      setThinking(false);
      setIsPlayerTurn(true);
    }
  }, []);

  // Core move application — used by both drag-drop and click-to-move
  function applyPlayerMove(from: string, to: string): boolean {
    const currentGame = gameRef.current;

    // Guard: only allow moves when it's the player's turn (white) and game not over
    if (currentGame.turn() !== "w" || currentGame.isGameOver() || !isPlayerTurn) {
      return false;
    }

    const gameCopy = new Chess(currentGame.fen());
    let moveObj = null;

    try {
      moveObj = gameCopy.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }

    if (moveObj) {
      gameRef.current = gameCopy;
      setGame(gameCopy);
      setFen(gameCopy.fen());
      setMoveHistory(prev => [...prev, { san: moveObj!.san, score: "USR" }]);
      setBotMessage("Formidable move. Calculating...");
      setMoveFrom("");
      setOptionSquares({});

      setTimeout(() => fetchMove(gameCopy.fen()), 150);
      return true;
    }

    return false;
  }

  // react-chessboard onPieceDrop handler
  function onDrop(sourceSquare: string, targetSquare: string): boolean {
    setMoveFrom("");
    setOptionSquares({});
    return applyPlayerMove(sourceSquare, targetSquare);
  }

  // Highlight legal move targets for a square
  function getMoveOptions(square: string): boolean {
    const moves = gameRef.current.moves({ square: square as any, verbose: true });

    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
    const originalPiece = gameRef.current.get(square as any);

    moves.forEach((move: any) => {
      const targetPiece = gameRef.current.get(move.to);
      const isCapture = targetPiece && originalPiece && targetPiece.color !== originalPiece.color;

      newSquares[move.to] = {
        background: isCapture
          ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
          : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });

    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick(square: string) {
    if (gameRef.current.turn() !== "w" || gameRef.current.isGameOver() || !isPlayerTurn) return;

    if (!moveFrom) {
      const piece = gameRef.current.get(square as any);
      if (piece && piece.color === "w") {
        const hasMoves = getMoveOptions(square);
        if (hasMoves) setMoveFrom(square);
      }
      return;
    }

    // Try to apply the move from selected square to clicked square
    const success = applyPlayerMove(moveFrom, square);

    if (!success) {
      // Maybe the user clicked another one of their own pieces — re-select
      const piece = gameRef.current.get(square as any);
      if (piece && piece.color === "w") {
        const hasMoves = getMoveOptions(square);
        if (hasMoves) {
          setMoveFrom(square);
          return;
        }
      }
      setMoveFrom("");
      setOptionSquares({});
    }
  }

  function resetGame() {
    const fresh = new Chess();
    gameRef.current = fresh;
    setGame(fresh);
    setFen(fresh.fen());
    setMoveHistory([]);
    setMoveFrom("");
    setOptionSquares({});
    setBotMessage("A fresh start. Your move.");
    setStats({ score: 0, depth: 0, nodes: 0, nps: 0, pv: "" });
    setIsPlayerTurn(true);
  }

  function forceUndo() {
    const g = new Chess(gameRef.current.fen());
    g.undo(); // undo bot move
    g.undo(); // undo player move
    const fresh = new Chess(g.fen());
    gameRef.current = fresh;
    setGame(fresh);
    setFen(fresh.fen());
    setMoveHistory(h => h.slice(0, -2));
    setMoveFrom("");
    setOptionSquares({});
    setIsPlayerTurn(true);
    setBotMessage("Take-back granted. Choose wisely.");
  }

  const winProb = 50 + stats.score * 7;
  const clampedProb = Math.max(5, Math.min(95, winProb));

  return (
    <main className="min-h-screen bg-[#111111] text-slate-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30" />
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-10 gap-6 relative z-10">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between p-3 bg-[#262421] rounded-lg border-b-2 border-slate-900 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center overflow-hidden border-2 border-indigo-400">
                  <Cpu className="w-8 h-8 text-white opacity-80" />
                </div>
                {thinking && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#262421]"></span>
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-100 flex items-center gap-2">
                  Deepcastle v7{" "}
                  <span className="text-orange-500 text-xs font-bold px-1.5 py-0.5 bg-orange-500/10 rounded border border-orange-500/20">
                    3604 Elo
                  </span>
                </h3>
              </div>
            </div>
            <Settings2 className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors" />
          </div>

          <div className="flex gap-4 items-stretch">
            <div className="w-6 bg-[#161512] rounded-md flex flex-col-reverse overflow-hidden border border-slate-800 shadow-inner relative">
              <motion.div
                initial={{ height: "50%" }}
                animate={{ height: `${clampedProb}%` }}
                className="bg-gray-100 shadow-[0_0_15px_rgba(255,255,255,0.1)] relative"
                transition={{ type: "spring", stiffness: 40, damping: 15 }}
              >
                <div className="absolute top-2 w-full text-center text-[10px] font-black text-black opacity-40 px-0.5">
                  {stats.score.toFixed(1)}
                </div>
              </motion.div>
              <div className="absolute top-1/2 w-full border-t border-slate-700 pointer-events-none" />
            </div>

            <div className="flex-1 bg-[#262421] p-3 rounded-lg shadow-2xl relative border-2 border-[#3d3a36]">
              <Chessboard
                {...({
                  position: fen,
                  onPieceDrop: onDrop,
                  onSquareClick: onSquareClick,
                  arePiecesDraggable: !thinking && isPlayerTurn,
                  customSquareStyles: optionSquares,
                  customBoardStyle: { borderRadius: "4px" },
                  customDarkSquareStyle: { backgroundColor: "#779556" },
                  customLightSquareStyle: { backgroundColor: "#ebecd0" },
                  animationDuration: 200,
                } as any)}
              />
            </div>
          </div>

          <div className="p-3 bg-[#262421] rounded-lg shadow-md border-t-2 border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center border border-slate-600">
                <div className="w-6 h-6 bg-slate-400 rounded-sm opacity-50" />
              </div>
              <span className="font-bold text-sm tracking-tight">Human Challenger</span>
            </div>
            {thinking && (
              <span className="text-xs text-emerald-400 animate-pulse font-semibold">Engine thinking...</span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <section className="bg-[#262421] rounded-lg border border-[#3d3a36] flex flex-col shadow-xl">
            <div className="p-6 flex gap-4 min-h-[120px]">
              <div className="w-12 h-12 flex-shrink-0 bg-indigo-600/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
                <Cpu className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="flex-1">
                <div className="relative bg-[#3d3a36] p-4 rounded-xl rounded-tl-none border border-white/5 shadow-inner">
                  <p className="text-sm italic leading-relaxed text-slate-200">"{botMessage}"</p>
                  <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-transparent border-r-[10px] border-r-[#3d3a36] border-b-[8px] border-b-transparent"></div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[#262421] rounded-lg border border-[#3d3a36] p-4 flex flex-col gap-4 flex-1 shadow-xl">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161512] p-3 rounded-lg border border-white/5">
                <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Depth</p>
                <p className="text-xl font-bold tracking-tighter text-slate-200">
                  {stats.depth}
                  <span className="text-[10px] ml-1 opacity-40">PLY</span>
                </p>
              </div>
              <div className="bg-[#161512] p-3 rounded-lg border border-white/5">
                <p className="text-[9px] uppercase font-black text-slate-600 mb-1">Search Speed</p>
                <p className="text-xl font-bold tracking-tighter text-indigo-400">
                  {(stats.nps / 1000).toFixed(1)}k
                  <span className="text-[10px] ml-1 opacity-40">NPS</span>
                </p>
              </div>
            </div>

            <div className="flex-1 bg-[#161512] rounded-lg border border-white/5 flex flex-col overflow-hidden max-h-[300px]">
              <div className="p-3 bg-[#2b2a27] text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center justify-between">
                <span>History</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <div className="flex-1 overflow-y-auto p-1 grid grid-cols-1 divide-y divide-white/5">
                {moveHistory.length === 0 ? (
                  <div className="h-48 flex items-center justify-center opacity-20 italic text-sm">
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

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setBotMessage("I accept your surrender.")}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group"
              >
                <Flag className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-red-300">Resign</span>
              </button>
              <button
                onClick={forceUndo}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-slate-700 rounded transition-all group"
              >
                <RotateCcw className="w-5 h-5 text-slate-400 group-hover:text-white" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-slate-100">Undo</span>
              </button>
              <button
                onClick={() => setBotMessage("I suggest you improve your positional awareness.")}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-amber-900/40 rounded transition-all group"
              >
                <Lightbulb className="w-5 h-5 text-slate-400 group-hover:text-amber-400" />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">Hint</span>
              </button>
            </div>
          </section>

          <div className="bg-[#262421] p-4 rounded-lg border border-[#3d3a36] flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-tighter">
              <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                <RefreshCw className="w-3 h-3" /> Auto
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-indigo-400" /> {stats.nodes.toLocaleString()} Nodes
              </div>
            </div>
            <button
              onClick={resetGame}
              className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10"
            >
              New Game
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}