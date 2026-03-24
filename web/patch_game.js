const fs = require('fs');
let f = fs.readFileSync('src/app/components/GamePage.tsx', 'utf8');

const old = `} else if (data.type === "move") {\r\n            applyExternalMove(data.move);\r\n         }\r\n      };`;
const replacement = `} else if (data.type === "move") {\r\n            applyExternalMove(data.move);\r\n         } else if (data.type === "opponent_disconnected") {\r\n            endGame(true, "Opponent disconnected — you win!");\r\n         }\r\n      };`;

if (f.includes(old)) {
  f = f.replace(old, replacement);
  fs.writeFileSync('src/app/components/GamePage.tsx', f);
  console.log('Done!');
} else {
  // Try with LF
  const old2 = `} else if (data.type === "move") {\n            applyExternalMove(data.move);\n         }\n      };`;
  const rep2 = `} else if (data.type === "move") {\n            applyExternalMove(data.move);\n         } else if (data.type === "opponent_disconnected") {\n            endGame(true, "Opponent disconnected — you win!");\n         }\n      };`;
  if (f.includes(old2)) {
    f = f.replace(old2, rep2);
    fs.writeFileSync('src/app/components/GamePage.tsx', f);
    console.log('Done (LF)!');
  } else {
    console.log('Pattern not found. Checking context...');
    const idx = f.indexOf('applyExternalMove(data.move)');
    console.log('Found at index:', idx, '| Context:', JSON.stringify(f.slice(idx, idx+60)));
  }
}
