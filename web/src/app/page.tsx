'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Trophy, History, Brain, Settings, ChevronRight, Play, RefreshCcw } from 'lucide-react';

export default function DeepcastlePage() {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [engineEval, setEngineEval] = useState<number>(0);
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [isThinking, setIsThinking] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://localhost:8000';

  const makeAMove = useCallback((move: any) => {
    try {
      const result = game.move(move);
      if (result) {
        setGame(new Chess(game.fen()));
        setMoveHistory(prev => [...prev, result.lan]);
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }, [game]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });

    if (move) {
      setIsThinking(true);
      fetch(`${API_URL}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: game.fen(), depth: 12 }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.bestmove) {
          makeAMove(data.bestmove);
          setEngineEval(data.evaluation);
        }
      })
      .catch(err => {
        console.error("Engine API failed, falling back to random move", err);
        const moves = game.moves();
        if (moves.length > 0) {
          makeAMove(moves[Math.floor(Math.random() * moves.length)]);
        }
      })
      .finally(() => setIsThinking(false));
    }
    return !!move;
  };

  const resetGame = () => {
    setGame(new Chess());
    setMoveHistory([]);
    setEngineEval(0);
  };

  return (
    <main className="min-h-screen p-4 md:p-8 chess-grid text-slate-100 bg-[#0f1115]">
      {/* Board Column */}
      <section className="flex flex-col gap-6">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Trophy className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight glow-text uppercase italic">Deepcastle <span className="text-indigo-400">v7</span></h1>
              <p className="text-xs text-slate-400 font-medium">Official Engine UI</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="glass px-4 py-2 rounded-full flex items-center gap-2">
              <Brain size={16} className="text-indigo-400" />
              <span className="text-sm font-semibold">{difficulty}</span>
            </div>
            <button 
              onClick={resetGame}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <RefreshCcw size={20} />
            </button>
          </div>
        </header>

        <div className="relative group w-full max-w-[600px] aspect-square border-8 border-[#26292e] rounded-xl overflow-hidden shadow-2xl shadow-indigo-900/20">
          {/* @ts-ignore */}
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop}
            customBoardStyle={{
              borderRadius: '4px',
            }}
            customDarkSquareStyle={{ backgroundColor: '#769656' }}
            customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
          />
          
          {/* Evaluation Bar Overlay */}
          <div className="absolute left-[-20px] top-0 bottom-0 w-2 bg-[#2a2d33] rounded-full overflow-hidden hidden md:block border border-slate-700">
             <div 
               className="bg-white/90 absolute bottom-0 w-full transition-all duration-500 ease-out" 
               style={{ height: `${50 + (engineEval * 5)}%` }}
             ></div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-4">
           {['Beginner', 'Intermediate', 'Advanced', 'Grandmaster'].map((lvl) => (
             <button
               key={lvl}
               onClick={() => setDifficulty(lvl)}
               className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                 difficulty === lvl ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'
               }`}
             >
               {lvl}
             </button>
           ))}
        </div>
      </section>

      {/* Sidebar Column */}
      <aside className="flex flex-col gap-6">
        {/* Engine Stats Card */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings className="text-indigo-400" size={18} />
            Engine Diagnostics
          </h2>
          <div className="flex flex-col gap-3">
             <div className="flex justify-between text-sm py-2 border-b border-white/5">
                <span className="text-slate-400">Status</span>
                <span className={`${isThinking ? 'text-indigo-400' : 'text-green-400'} flex items-center gap-1`}>
                  <span className={`w-1.5 h-1.5 ${isThinking ? 'bg-indigo-400 animate-bounce' : 'bg-green-400 animate-pulse'} rounded-full`} />
                  {isThinking ? 'Thinking...' : 'Online'}
                </span>
             </div>
             <div className="flex justify-between text-sm py-2 border-b border-white/5">
                <span className="text-slate-400">NNUE Brain</span>
                <span className="text-slate-200">HalfKAv2 (v7)</span>
             </div>
             <div className="flex justify-between text-sm py-2">
                <span className="text-slate-400">Depth</span>
                <span className="text-slate-200">18 Plies</span>
             </div>
          </div>
        </div>

        {/* Move History Card */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4 flex-grow max-h-[500px]">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <History className="text-indigo-400" size={18} />
            Move History
          </h2>
          <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {moveHistory.map((move, i) => (
                <div key={i} className="flex gap-2 items-center text-sm">
                  <span className="text-slate-500 w-4">{Math.floor(i/2) + 1}.</span>
                  <span className="bg-slate-800/50 px-3 py-1 rounded w-full border border-white/5 font-mono">
                    {move}
                  </span>
                </div>
              ))}
              {moveHistory.length === 0 && (
                <div className="col-span-2 text-center py-20 text-slate-500 italic">
                  Game starting...
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-auto pt-4 border-t border-white/5 flex gap-2">
             <button className="flex-1 btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                Takeback
             </button>
             <button className="p-3 glass rounded-xl text-slate-400 hover:text-white transition-all">
                <Play size={20} />
             </button>
          </div>
        </div>
      </aside>
    </main>
  );
}
