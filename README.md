<div align="center">
  <img src="game/DCLogo.png" alt="Deepcastle Logo" width="150" />
  <h1> DeepCastle</h1>

  <p>A professional-grade, full-stack chess engine ecosystem.</p>
</div>

<p align="center">
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js" /></a>
  <a href="https://pytorch.org/"><img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch" alt="PyTorch" /></a>
  <a href="https://isocpp.org/"><img src="https://img.shields.io/badge/C%2B%2B-00599C?style=for-the-badge&logo=cplusplus" alt="C++" /></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker" alt="Docker" /></a>
</p>
Play it live:https://deep-castle-official.vercel.app

---

## What is DeepCastle?

DeepCastle is an end-to-end chess engine ecosystem. Its core innovation is a **custom-trained dual-NNUE evaluation system** — two neural networks (BigNet and SmallNet) trained entirely from scratch using Stockfish self-play data, then integrated into a Stockfish-derived C++ search engine and deployed as a browser-accessible web application.

Unlike simply running Stockfish with its default weights, DeepCastle uses its own trained neural brains (`output.nnue` and `small_output.nnue`) to make all positional judgements.

### Benchmark Results (vs Stockfish 18)

Tested over **200 games** at **180+2 TC** against Stockfish 18 capped at `UCI_Elo = 3190`:

| Metric | Result |
|---|---|
| Score | 88W – 27L – 85D |
| Draw rate | 42.5% |
| Elo difference | **+109.5 ± 37.0** |
| LOS | 100% |
| Estimated Elo | **~3300 CCRL Blitz** |
| Score as White | 0.740 (58W – 10L – 32D) |
| Score as Black | 0.565 (30W – 17L – 53D) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  User Browser (Vercel)                                      │
│  Next.js 15 Frontend — react-chessboard, chess.js           │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS POST /move (FEN + time)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Hugging Face Spaces (Docker, port 7860)                    │
│  FastAPI Backend — UCI bridge, game analysis, WebSocket     │
└────────────────────────┬────────────────────────────────────┘
                         │  stdin/stdout UCI
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  DeepCastle C++ Engine                                      │
│  deepcastle binary + output.nnue (BigNet) +                 │
│  small_output.nnue (SmallNet)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 7-Stage Training Pipeline

### Stage 1 — Data Generation

Training data was generated using Stockfish's `gensfen` command, producing **100M+ quiet positions** at search depth 9. Quiet positions contain no captures, checks, or promotions on the next move, ensuring unambiguous training labels.

The dataset (`large_gensfen_multipvdiff_100_d9.binpack`) uses a multi-PV filter that keeps only positions where the top two moves differ by fewer than 100 centipawns — ensuring positions with genuine contest. Stored in `.binpack` format (~32 bytes/position), decoded at ~500k–2M positions/sec via a C++ `SparseBatchDataset` loader compiled with Numba.

### Stage 2 — Feature Engineering (HalfKAv2_hm^)

Each position is encoded as a sparse binary feature vector using the **HalfKAv2_hm^** (Half King-All v2, Horizontally Mirrored, Factorized) representation:

```
f = k × (P × S) + p × S + s
```

where `k ∈ [0,63]` is the king square index, `P = 10` piece types, `S = 64` squares, `p` is the piece type index, and `s` is the piece square. This gives 40,960 features per side before mirroring, reduced to **24,576 after horizontal mirroring**. A typical position activates only ~30 features.

### Stage 3 — Dual Neural Network Architecture

Two networks are trained independently:

**BigNet** (`output.nnue`, ~6.8M parameters):
- Feature Transformer: 24,576-dim sparse input → L1=256 accumulator
- PSQT shortcut: 8 piece-square table outputs (one per bucket)
- Perspective-aware merge: White + Black accumulators concatenated (512-dim)
- Product Pooling (SqrCReLU): 512 → 256 non-linear features
- 8 LayerStacks (bucket-selected by piece count):
  - L1: FactorizedStackedLinear [256 → 31+1], SqrCReLU → 2×31
  - L2: StackedLinear [62 → 32]
  - L3: StackedLinear [32 → 1]

**SmallNet** (`small_output.nnue`, ~3.5M parameters):
- Same architecture as BigNet but with L1=128, L2=15, L3=32

Key components:
- **Incremental Accumulator**: Only changed feature rows are updated per move; king moves trigger a full refresh. Reduces per-position evaluation from O(N²) matrix multiply to O(30) vector additions.
- **SqrCReLU Product Pooling**: Captures multiplicative interactions between White and Black perspectives (e.g. pins, tactical threats involving both sides).
- **PSQT Shortcut**: Piece-square table values learned directly from the feature transformer — one output per bucket.

### Stage 4 — Training

| Setting | BigNet | SmallNet |
|---|---|---|
| Script | `training/train.py` (PyTorch Lightning + tyro CLI) | same |
| Optimizer | Ranger21 (RAdam + Lookahead + Gradient Centralization) | same |
| Loss | Symmetric Sigmoid Power: \|p_f − q_f\|^2.5 | same |
| LR | 8.75 × 10⁻⁴, StepLR γ=0.992 | same |
| Mixed precision | bfloat16 on CUDA | same |
| Epochs | 400 | 75 |
| Epoch size | 25M positions | 20M positions |
| Batch size | 16,384 | 8,192 |
| Total positions | ~10 billion | ~1.5 billion |
| Training loss | 0.00542 → 0.00230 | 0.00556 → 0.00276 |
| Hardware | RTX 3060 12GB | RTX 4050 6GB |
| Duration | ~14 hours | ~7 hours |

Weight clipping constraints: `|W_emb| ≤ 127/64` and `|W_out| ≤ 127²/(600×16)`.

### Stage 5 — Quantization and Binary Export

Script: `training/serialize.py` (nnue-pytorch `NNUEWriter`)

- Feature Transformer weights: float32 → int16 (LEB128 compressed)
- Dense layer weights: float32 → int8 (per-layer scale factors)
- Output file named `nn-<sha256[:12]>.nnue` for content-hash reproducibility
- Architecture hash embedded in binary header for validation

Output sizes: `output.nnue` ≈ **6.2 MB** (BigNet), `small_output.nnue` ≈ **3.3 MB** (SmallNet)

### Stage 6 — C++ Engine (Search + Inference)

Derived from Stockfish 18 (GPLv3). Key source files:

| File | Role |
|---|---|
| `search.cpp` | Alpha-Beta + PVS, Iterative Deepening, Aspiration Windows, LMR, Null Move Pruning, Quiescence Search |
| `evaluate.cpp` | Adaptive dual-NNUE switching logic |
| `nnue/nnue_accumulator.cpp` | Incremental SIMD accumulator (~50ns/position) |
| `nnue/nnue_feature_transformer.h` | SIMD forward pass |
| `nnue/network.cpp` | `.nnue` loader, header validation |
| `position.cpp` | Board representation, Zobrist keys, do_move/undo_move |
| `movegen.cpp`, `movepick.cpp` | Move generation + ordering (hash move → MVV-LVA → killers → history) |
| `tt.cpp` | Transposition table (Zobrist hash → depth/score/best move) |
| `uci.cpp` | UCI protocol: uci/setoption/position/go/stop |
| `timeman.cpp` | Time management (movetime/wtime) |

**Dual-NNUE switching logic** (`evaluate.cpp`):
- If `|material_imbalance| > 962cp` → use SmallNet
- If SmallNet score `|v| < 277cp` → re-evaluate with BigNet
- Otherwise → BigNet for all balanced positions

**Build:**
```bash
# Linux / Docker
make -j4 ARCH=x86-64-sse41-popcnt

# Windows
make -j8 ARCH=x86-64-modern
```

Output: `deepcastle` binary (~970 KB) + `output.nnue` (6.2 MB) + `small_output.nnue` (3.3 MB)

Performance: ~400,000–600,000 NPS on cloud CPU (SSE4.1 SIMD)

### Stage 7 — Web Deployment

**Backend** (`server/main.py`) — FastAPI + uvicorn on Hugging Face Spaces (Docker, port 7860):
- Singleton UCI subprocess with asyncio I/O serialisation lock
- Background memory cleanup task (GC + `malloc_trim`)
- Global request timeout middleware (180s)
- WebSocket support for P2P multiplayer (`/ws/{match_id}`)
- Game analysis with move classification (see below)
- Opening lookup against `openings.json` (~3,400 entries)

**Frontend** (`web/`) — Next.js 15, TypeScript, Tailwind CSS 4:
- Libraries: `react-chessboard`, `chess.js`, Framer Motion, Lucide
- Pages: Home → SetupGame → GamePage → ReviewPage → AnalysisPage
- Features: real-time eval bar, PV display, NPS/depth stats, hint button, drag-and-drop, board flip, Chess960, P2P multiplayer via shareable URL

---

## Move Classification

Move quality is measured by **win percentage change (Δwp)**, derived from engine evaluation before and after each move using a Lichess-style sigmoid formula:

```
win% = 50 + 50 × (2 / (1 + exp(-0.00368208 × cp)) - 1)
```

| Classification | Condition |
|---|---|
| Brilliant | Δwp ≥ −2.0, piece sacrifice, not in a losing/already-winning position |
| Great | Δwp ≥ −2.0, changed game outcome or only good move, not a recapture |
| Best | Played move = engine's top choice |
| Excellent | Δwp ≥ −2.0 |
| Good | −5.0 ≤ Δwp < −2.0 |
| Inaccuracy | −10.0 ≤ Δwp < −5.0 |
| Mistake | −20.0 ≤ Δwp < −10.0 |
| Blunder | Δwp < −20.0 |

---

## Repository Structure

```
DeepCastle-Official/
├── engine/
│   ├── output.nnue          ← 6.2 MB BigNet (custom trained weights)
│   ├── small_output.nnue    ← 3.3 MB SmallNet (custom trained weights)
│   ├── src/                 ← C++ source (Stockfish-derived search + dual-NNUE)
│   ├── build.bat            ← Windows build script
│   └── build_linux.sh       ← Linux/Docker build script
│
├── training/
│   ├── train.py             ← Main training script (PyTorch Lightning + tyro CLI)
│   ├── serialize.py         ← PyTorch checkpoint → .nnue binary export
│   ├── config.py            ← TrainingConfig (hyperparameters)
│   ├── model/
│   │   ├── model.py         ← NNUEModel (nn.Module), HalfKAv2_hm^ features
│   │   └── lightning_module.py ← PyTorch Lightning wrapper
│   └── data_loader/         ← C++ accelerated .binpack loader (Numba)
│
├── server/
│   ├── main.py              ← FastAPI backend (UCI bridge, /move, /analyze-game)
│   └── openings.json        ← ~3,400 opening positions (FEN → name)
│
├── web/
│   └── src/app/             ← Next.js 15 frontend
│
├── game/
│   ├── game.py              ← Local pygame GUI for testing
│   ├── tournament.py        ← Automated tournament runner
│   └── elo_eval.py          ← Elo estimation script
│
├── Dockerfile               ← Hugging Face Spaces container definition
├── MECHANISM.md             ← Full technical deep-dive (beginner-friendly)
└── README.md
```

---

## Quick Start

**Run the engine locally (Windows):**
```bash
cd engine
build.bat
# Then interact via UCI:
deepcastle.exe
> uci
> setoption name EvalFile value output.nnue
> setoption name EvalFileSmall value small_output.nnue
> isready
> position startpos moves e2e4
> go movetime 1000
```

**Run the backend locally:**
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 7860
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `DEEPCASTLE_ENGINE_PATH` | `/app/engine_bin/deepcastle` | Path to engine binary |
| `NNUE_PATH` | `/app/engine_bin/output.nnue` | BigNet weights |
| `NNUE_SMALL_PATH` | `/app/engine_bin/small_output.nnue` | SmallNet weights |
| `ENGINE_HASH_MB` | `512` | Transposition table size |
| `RAM_CLEANUP_THRESHOLD_MB` | `300` | RAM threshold for hash clear |
| `RAM_CLEANUP_INTERVAL_SEC` | `60` | Background cleanup interval |

---

## Known Limitations

- **Evaluation capacity gap**: BigNet L1=256 vs Stockfish 18's L1=1024. Increasing to L1=1024 with more training data would close the remaining Elo gap.
- **Single-threaded search**: Currently uses 1 search thread. Multi-threading infrastructure exists in the codebase; the `Threads` UCI option can be increased.
- **Training data scale**: Trained on 100M positions vs the billions used by the Stockfish team. Rare/endgame positions may be underrepresented.
- **Cold start latency**: First request to Hugging Face Spaces wakes a sleeping container. Mitigated by GitHub Actions health-check pinging.
- **Cloud NPS ceiling**: ~400k–600k NPS on cloud CPU vs ~5M+ on a modern desktop. SSE4.1 SIMD compilation provides a practical baseline.
- **No WDL blending**: Training uses pure score labels (λ=1.0). Win/Draw/Loss outcome blending is planned via `start_lambda`/`end_lambda` in `TrainingConfig`.

---

## Credits

- **Training framework**: [official-stockfish/nnue-pytorch](https://github.com/official-stockfish/nnue-pytorch)
- **Training dataset**: `large_gensfen_multipvdiff_100_d9.binpack` from the [official Stockfish NNUE training datasets](https://github.com/official-stockfish/nnue-pytorch/wiki/Training-datasets)
- **Search engine base**: Derived from [Stockfish](https://github.com/official-stockfish/Stockfish) C++ source (GPLv3)
- **Incbin**: [graphitemaster/incbin](https://github.com/graphitemaster/incbin) (Unlicense)
