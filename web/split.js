const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const components = [
    { startStr: '// ─── Types', endStr: '// ─── Home Page' },
    { startStr: '// ─── Home Page', endStr: '// ─── Setup Page' },
    { startStr: '// ─── Setup Page', endStr: '// ─── Lobby Page' },
    { startStr: '// ─── Lobby Page', endStr: '// ─── Result Modal' },
    { startStr: '// ─── Result Modal', endStr: '// ─── Resign Modal' },
    { startStr: '// ─── Resign Modal', endStr: '// ─── Game Over Modal' },
    { startStr: '// ─── Game Over Modal', endStr: '// ─── Game Page' },
    { startStr: '// ─── Game Page', endStr: '// ─── Review Page' },
    { startStr: '// ─── Review Page', endStr: '// ─── Root App' }
];

console.log("File loaded, breaking it up...");

let markers = [];
components.forEach(c => {
    let startMatch = content.indexOf(c.startStr);
    let endMatch = content.indexOf(c.endStr);
    if (startMatch !== -1 && endMatch !== -1) {
        markers.push({ name: c.startStr.replace('// ───', '').trim(), start: startMatch, end: endMatch, content: content.slice(startMatch, endMatch) });
    } else {
        console.error("Missing marker", c.startStr, "or", c.endStr);
    }
});

markers.forEach(m => {
    fs.writeFileSync(path.join(__dirname, 'src/app/components', m.name.replace(/ /g, '') + '.tsx'), m.content);
    console.log("Extracted: " + m.name);
});
