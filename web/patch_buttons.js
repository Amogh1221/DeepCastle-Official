const fs = require('fs');

let f = fs.readFileSync('src/app/components/GamePage.tsx', 'utf8');

// Replace Hint button container
const hintRegex = /<div className="grid grid-cols-3 gap-2">([\s\S]*?)<button\s+id="resign-btn"([\s\S]*?)className="flex flex-col items-center justify-center gap-1.5 p-3 bg-\[#3d3a36\] hover:bg-red-900\/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed([\s\S]*?)<\/button>\s*<button\s+id="hint-btn"([\s\S]*?)<\/button>\s*<\/div>/g;

f = f.replace(hintRegex, (match, before, resignAttrs, res1, hintAttrs) => {
  return `<div className="grid grid-cols-3 gap-2">
              <button
                id="resign-btn"
                 \${resignAttrs.trim()}
                className={\`flex flex-col items-center justify-center gap-1.5 p-3 bg-[#3d3a36] hover:bg-red-900/40 rounded transition-all group disabled:opacity-40 disabled:cursor-not-allowed \${settings.mode === "p2p" ? "col-span-3" : "col-span-1"}\`}
              \${res1}</button>
              {settings.mode !== "p2p" && (
                <button
                  id="hint-btn"
                  \${hintAttrs.trim()}
                </button>
              )}
            </div>`;
});

// Replace New Game button
const newgameRegex = /<button\s+id="new-game-btn"([\s\S]*?)<RefreshCw className="w-3 h-3" \/> New Game\s*<\/button>/g;

f = f.replace(newgameRegex, (match, attrs) => {
  return `{settings.mode !== "p2p" ? (
              <button
                id="new-game-btn"
                 \${attrs.trim()}
              >
                <RefreshCw className="w-3 h-3" /> New Game
              </button>
            ) : <div />}`;
});

fs.writeFileSync('src/app/components/GamePage.tsx', f);
console.log('done.');
