const fs=require('fs');
const ts=fs.readFileSync('../Chesskit-main/src/data/openings.ts','utf8');
const reg=/{[^}]*name:\s*"([^"]+)",\s*fen:\s*"([^"]+)"[^}]*}/g;
let match;
let res={};
while((match=reg.exec(ts))!==null){
  const name=match[1];
  const fen=match[2];
  res[fen]=name;
}
fs.writeFileSync('./server/openings.json',JSON.stringify(res,null,2));
console.log('done parsing '+Object.keys(res).length+' openings');
