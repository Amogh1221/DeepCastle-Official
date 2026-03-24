const fs = require('fs');
let f = fs.readFileSync('src/app/components/GamePage.tsx', 'utf8');

const target1 = `<div className="grid grid-cols-3 gap-2">
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
                id="hint-btn"
                onClick={getHint}
                disabled={loadingHint || thinking || !isPlayerTurn || gameEnded}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-amber-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed relative col-span-2"
              >
                <Lightbulb className={\`w-5 h-5 text-slate-400 group-hover:text-amber-400 \${loadingHint ? "animate-pulse text-amber-400" : ""}\`} />
                <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">
                  {loadingHint ? "..." : "Hint"}
                </span>
                {hintArrow && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                )}
              </button>
            </div>`;

const rep1 = `<div className="grid grid-cols-3 gap-2">
              <button
                id="resign-btn"
                onClick={handleResign}
                disabled={gameEnded}
                className={\`flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed \${settings.mode === "p2p" ? "col-span-3" : ""}\`}
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
                  <Lightbulb className={\`w-5 h-5 text-slate-400 group-hover:text-amber-400 \${loadingHint ? "animate-pulse text-amber-400" : ""}\`} />
                  <span className="text-[10px] uppercase font-black text-slate-500 group-hover:text-amber-300">
                    {loadingHint ? "..." : "Hint"}
                  </span>
                  {hintArrow && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                  )}
                </button>
              )}
            </div>`;

const cleanCRLF = s => s.replace(/\r\n/g, '\n');

if (cleanCRLF(f).includes(cleanCRLF(target1))) {
  f = cleanCRLF(f).replace(cleanCRLF(target1), rep1);
  console.log("Replaced target1");
} else {
  console.log("Could not find target1");
}

const target2 = `<button
              id="new-game-btn"
              onClick={resetGame}
              className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> New Game
            </button>`;

const rep2 = `{settings.mode !== "p2p" && (
              <button
                id="new-game-btn"
                onClick={resetGame}
                className="text-[10px] uppercase font-black text-indigo-400 hover:text-indigo-300 tracking-widest pl-4 border-l border-white/10 flex items-center gap-1.5 hover:bg-white/5 transition-colors pr-2 py-1 rounded"
              >
                <RefreshCw className="w-3 h-3" /> New Game
              </button>
            )}`;

if (f.includes(cleanCRLF(target2))) {
  f = f.replace(cleanCRLF(target2), rep2);
  console.log("Replaced target2");
} else {
  console.log("Could not find target2");
}

fs.writeFileSync('src/app/components/GamePage.tsx', f);
