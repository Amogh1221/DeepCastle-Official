const fs = require('fs');
let f = fs.readFileSync('src/app/components/GamePage.tsx', 'utf8');
const lines = f.split('\n');
const out = [];
let skip = 0;

for (let i = 0; i < lines.length; i++) {
  if (skip > 0) { skip--; continue; }
  const line = lines[i];

  // Detect the clock div in opponent header (lines 447-449)
  if (line.includes('px-4 py-2 rounded-lg font-mono text-xl font-black') &&
      lines[i+1] && lines[i+1].includes('formatTime(')) {
    // Skip: this div line, formatTime line, closing </div>
    skip = 2;
    continue;
  }

  // Detect the clock div in player footer (lines 517-519)
  // Same pattern but one level deeper - handled by same check above

  out.push(line);
}

f = out.join('\n');
fs.writeFileSync('src/app/components/GamePage.tsx', f);

const remaining = (f.match(/formatTime/g) || []).length;
console.log('Remaining formatTime uses:', remaining);
