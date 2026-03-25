const fs = require('fs');
let content = fs.readFileSync('src/app/components/ReviewPage.tsx', 'utf8');

const replacement = `                  <div className="bg-[#302e2c] text-slate-200 p-6 rounded-xl border border-white/5 shadow-2xl flex flex-col flex-1 relative custom-scrollbar">
                      {/* HEADER */}
                      <div className="flex flex-col items-center mb-6 border-b border-white/10 pb-4">
                        <h2 className="text-xl font-normal flex items-center gap-2 mb-4">
                          <Check className="w-5 h-5"/> Game Analysis
                        </h2>
                        <div className="flex gap-4 mb-2">
                           <button onClick={onHome} className="bg-[#3d98bd] hover:bg-[#3488aa] text-[#1a1a1a] font-bold text-[10px] px-3 py-1 rounded shadow">
                             LOAD GAME
                           </button>
                           <button className="bg-[#3b3937] text-white/40 font-bold text-[10px] px-3 py-1 rounded shadow cursor-not-allowed flex items-center gap-1">
                             <Target className="w-3 h-3"/> ANALYZE
                           </button>
                        </div>
                      </div>

                      {/* CLASSIFICATION TEXT */}
                      <div className="flex flex-col items-center justify-center text-sm font-bold min-h-[50px] mb-4">
                        {currentMoveAnalysis && currentPly > 0 ? (
                            <div className="flex items-center gap-6">
                               <span className="flex items-center gap-1.5" style={{
                                 color: currentMoveAnalysis.classification === "Brilliant" ? "#2dd4bf" :
                                        currentMoveAnalysis.classification === "Best" ? "#10b981" :
                                        ["Blunder", "Mistake"].includes(currentMoveAnalysis.classification) ? "#ef4444" : "#fbbf24"
                               }}>
                                 <img src={\`/icons/\${currentMoveAnalysis.classification.toLowerCase()}.png\`} alt="" className="w-4 h-4" />
                                 {currentMoveAnalysis.san} is a {currentMoveAnalysis.classification.toLowerCase()}
                               </span>
                            </div>
                        ) : (
                            <span className="text-slate-400 font-normal">Game Review Ready</span>
                        )}
                        <span className="text-xs text-slate-400 font-normal mt-1">
                            {currentPly === 0 ? "Starting Position" : \`Move \${Math.ceil(currentPly / 2)}\`}
                        </span>
                      </div>

                      {/* MOVE LIST SCROLLBOX */}
                      <div className="flex-1 overflow-y-auto mb-4 border border-white/5 bg-black/10 rounded-lg p-2 flex flex-col min-h-[200px]">
                        {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                           const whiteMove = moves[i * 2];
                           const blackMove = moves[i * 2 + 1];
                           const whitePly = i * 2 + 1;
                           const blackPly = i * 2 + 2;
                           
                           return (
                               <div key={i} className="flex text-sm py-1 items-center hover:bg-white/5 rounded px-2">
                                  <div className="w-12 text-slate-500">{i + 1}.</div>
                                  <button 
                                      onClick={() => setCurrentPly(whitePly)} 
                                      className={\`flex-1 text-left font-bold pl-2 \${currentPly === whitePly ? 'bg-white/20 text-white rounded' : 'text-slate-300'}\`}
                                  >
                                      {whiteMove}
                                  </button>
                                  <button 
                                      onClick={() => blackMove && setCurrentPly(blackPly)}
                                      className={\`flex-1 text-left font-bold pl-2 \${currentPly === blackPly ? 'bg-white/20 text-white rounded' : 'text-slate-300'} \${!blackMove ? 'opacity-0 cursor-default' : ''}\`}
                                      disabled={!blackMove}
                                  >
                                      {blackMove || '...'}
                                  </button>
                               </div>
                           );
                        })}
                      </div>

                      {/* BOTTOM TOOLBAR */}
                      <div className="flex items-center justify-center gap-5 mt-auto text-slate-400 pt-4 border-t border-white/10">
                         <button className="hover:text-white transition-colors" title="Flip Board">
                            <RotateCcw className="w-5 h-5"/>
                         </button>
                         <button onClick={() => setCurrentPly(0)} className="hover:text-white transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                         </button>
                         <button onClick={() => setCurrentPly(Math.max(0, currentPly-1))} className="hover:text-white transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                         </button>
                         <button onClick={() => setCurrentPly(Math.min(moves.length, currentPly+1))} className="hover:text-white transition-colors">
                            <ChevronRight className="w-6 h-6" />
                         </button>
                         <button onClick={() => setCurrentPly(moves.length)} className="hover:text-white transition-colors">
                            <ChevronRight className="w-5 h-5" />
                         </button>
                      </div>
                  </div>`;

const lines = content.split(/\r?\n/);
const startIndex = 169; // Line 170 is index 169
const endIndex = 274;   // Line 275 is index 274

const newLines = [
  ...lines.slice(0, startIndex),
  replacement,
  ...lines.slice(endIndex)
];

fs.writeFileSync('src/app/components/ReviewPage.tsx', newLines.join('\\n'));
