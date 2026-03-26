# DEEPCASTLE v7
![Deepcastle Logo](game/DClogo.png)

> A super-grandmaster level chess engine built from scratch — featuring a custom-trained NNUE neural brain fused into a Stockfish-derived search core, deployed as a full-stack web application.

---

## 🏆 What is DeepCastle?

**Deepcastle v7** is a fully custom-built, high-performance chess engine and web application. Its key innovation is a **custom-trained NNUE (Efficiently Updatable Neural Network)** — a neural network that the engine uses to evaluate chess positions — fused into a Stockfish-derived alpha-beta search core.

Unlike simply running Stockfish, DeepCastle uses its **own trained neural brain** (`output.nnue`) to make all positional judgments. The result: an engine estimated at **~3,604 Elo**, operating in super-grandmaster / top-engine territory.

**Play against it live:** [deepcastle.vercel.app](https://deep-castle-official.vercel.app/)

---

## ♟️ Engine Features

The DeepCastle engine is a complete chess engine with the following capabilities:

### 🔍 Search Algorithm
- **Principal Variation Search (PVS)** — A highly optimized variant of minimax search with alpha-beta pruning, which dramatically reduces the number of positions evaluated while finding the same best move.
- **Iterative Deepening** — The engine searches progressively deeper (depth 1, 2, 3… N), using the results of each shallower search to guide the next, making it faster overall.
- **Aspiration Windows** — Narrows the search window around the expected score to prune more aggressively.
- **Late Move Reductions (LMR)** — Reduces search depth for moves that are unlikely to be good, saving computation for promising lines.
- **Null Move Pruning** — If the engine can "pass" (do nothing) and still beat beta, it prunes the subtree. Great for detecting zugzwang-free positions.
- **Futility Pruning** — Skips moves in losing positions near the leaf nodes that cannot improve the score.
- **Delta Pruning** — In quiescence search, skips captures that cannot raise alpha by a material threshold.

### 🧠 Evaluation (NNUE Neural Network)
- **Custom HalfKP NNUE** (`output.nnue`) — The entire positional evaluation is driven by a fully custom-trained neural network, **not** Stockfish's default brain.
- **Architecture:** `HalfKP → 256 (L1) → 31 (L2) → 32 (L3) → 1`. The network is tiny (6.2 MB) but evaluated in microseconds using integer SIMD arithmetic.
- **8 Layer Stacks (Buckets)** — The network switches between different sub-networks depending on the number of pieces on the board (opening vs endgame).
- **PSQT Shortcut** — A direct piece-square table learned as part of the neural network, giving instant positional bonuses for piece placement.
- **Dual Perspective** — Separately evaluates the board from White's and Black's point of view, then combines them.

### 🚀 Performance Features
- **Transposition Table (TT)** — Caches previously searched positions to avoid redundant computation. Uses Zobrist hashing for collision-resistant lookups.
- **Move Ordering** — Intelligently orders moves (captures first, killer moves, history heuristics) so alpha-beta pruning is maximally effective.
- **Killer Move Heuristic** — Remembers moves that caused cutoffs at each depth level and tries them first.
- **History Heuristic** — Tracks which quiet moves historically caused beta-cutoffs and prefers them.
- **Quiescence Search** — After the main search tree terminates, continues searching only captures and checks until a "quiet" position is reached, avoiding the horizon effect.
- **Multi-threaded Search (Lazy SMP)** — Can search using multiple CPU threads in parallel, each sharing the same transposition table.
- **Syzygy Endgame Tablebase Support** — Accesses pre-computed perfect endgame solutions for positions with ≤7 pieces (requires tablebases on disk).

### 🌐 UCI Protocol Compatibility
The engine is fully **UCI (Universal Chess Interface)** compatible, meaning it works with any chess GUI, tournament software (CuteChess, Arena, etc.) or testing framework (FastChess, SPRT testing).

### Key UCI Options:
| Option | Description |
|---|---|
| `EvalFile` | Path to the `.nnue` brain file (set to `output.nnue`) |
| `Hash` | Size of the transposition table in MB |
| `Threads` | Number of parallel search threads |
| `MoveOverhead` | Safety buffer in ms for time management |
| `SyzygyPath` | Path to Syzygy endgame tablebases |

---

## 🏗️ Technical Architecture

Deepcastle v7 uses a **decoupled 3-tier architecture** for maximum performance:

```
┌─────────────────────────────────────────────────────────────┐
│  User Browser (Vercel)                                      │
│  Next.js Frontend — react-chessboard, chess.js, eval bar   │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTPS POST /move (FEN + time)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Hugging Face Spaces (Docker)                               │
│  FastAPI Backend — receives FEN, spawns engine via UCI      │
└────────────────────────┬────────────────────────────────────┘
                         │  stdin/stdout UCI
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  DeepCastle C++ Engine                                      │
│  deepcastle (Linux ELF) + output.nnue (custom brain)        │
└─────────────────────────────────────────────────────────────┘
```

### 1. 🖥️ The Interface (Frontend — Vercel)
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS with a **Glassmorphism** design language
- **Hosting:** Vercel (Edge-optimized for low-latency rendering)
- **Key Features:**
  - Chess.com-style click-to-move and drag-to-move
  - Dynamic Evaluation Bar (real-time engine win probability)
  - Animated Move Log with Search Stats (depth, nodes, NPS, score, PV)
  - Mobile-responsive, high-performance chessboard

### 2. ⚙️ The Powerhouse (Backend — Hugging Face)
- **Brain Hub:** Hosted on **Hugging Face Spaces** using Docker
- **Resources:** 16 GB RAM / Multi-vCPU environment
- **API Layer:** **FastAPI (ASGI)** serving UCI bridge over HTTPS
- **Protocol:** Spawns the C++ engine as a subprocess, communicates via UCI stdin/stdout, and serializes the result to JSON for the frontend

### 3. 🧠 The Brain (Engine Logic)
The "Soul" of Deepcastle lies in its **Custom-Trained NNUE** fused into a Stockfish search core:
- **Custom Neural Brain (`output.nnue`):** A fully custom-trained NNUE — this alone drives all positional evaluation.
- **Stockfish Search Infrastructure:** PVS, LMR, Null Move Pruning, aspiration windows, and all the advanced search techniques listed above.
- **Loaded at runtime** via the `EvalFile` UCI option.

---

## 🧠 Theory of Operation

### How a Move is Processed (End-to-End)
1. **Input:** User clicks a piece on the Next.js board.
2. **Validation:** `chess.js` checks the move is legal.
3. **Request:** The current board (as a FEN string) is sent via HTTPS POST to the Hugging Face API.
4. **Engine Boot:** FastAPI spawns the DeepCastle C++ binary, loads `output.nnue` into memory.
5. **Search:** The engine runs Iterative Deepening PVS for the allocated time (e.g. 1.0s), using the custom NNUE to evaluate every leaf node.
6. **Return:** Best move, score (in centipawns), depth, nodes per second, and principal variation are returned to the UI.
7. **Update:** The board plays the engine's move; the evaluation bar and move log update instantly.

---

## 📊 Benchmarks (vs Stockfish 18)

In official match testing against **Stockfish 18** (the world's #1 chess engine), Deepcastle v7 demonstrated near-impenetrable defensive stability.

| Metric | Result |
|---|---|
| Score | **0W – 1L – 21D** (22 games) |
| Draw Ratio | **95.5%** |
| Estimated Elo | **~3,604** |
| Elo Difference vs SF18 | **−15.8 ± 30.3** |
| LOS | 15.9% |

> The single loss was a forced White mate in a rare line. All other 21 games were technical draws (repetition, insufficient material, or stalemate). This places Deepcastle statistically within **-15 Elo** of the world's strongest engine.

---

## 📉 Training Pipeline (Summary)

The `training/` folder contains the full pipeline used to develop the DeepCastle neural weights.

> 💡 **New to NNUE training?** See **[MECHANISM.md](MECHANISM.md)** for a complete beginner-to-expert walkthrough — covering what NNUE is, how the data is collected, what the network architecture means, how training works, and how the `.nnue` binary is built.

| Stage | Details |
|---|---|
| **Feature Set** | HalfKP — 20,480 sparse inputs per side (King × Piece × Square) |
| **Training Dataset** | `large_gensfen_multipvdiff_100_d9.binpack` — 100M+ Stockfish self-play positions at depth 9 |
| **Dataset Source** | [official-stockfish/nnue-pytorch Training Datasets](https://github.com/official-stockfish/nnue-pytorch/wiki/Training-datasets) |
| **Architecture** | L1=256, L2=31, L3=32, 8 layer stacks (by piece count), PSQT shortcut |
| **Optimizer** | Ranger21 with symmetric sigmoid loss |
| **Output** | `engine/output.nnue` — 6.2 MB quantized int8/int16 binary brain |

---

## 📂 Repository Structure

```
DeepCastle-Official/
├── engine/
│   ├── output.nnue          ← 6.2MB trained NNUE brain (custom weights)
│   ├── src/                 ← C++ source (Stockfish-derived search + NNUE loader)
│   ├── build.bat            ← Windows build script
│   └── build_linux.sh       ← Linux/Docker build script
│
├── training/
│   ├── deepcastle_v7.py     ← Neural network definition + training loop
│   ├── export_nnue.py       ← Converts PyTorch checkpoint → .nnue binary
│   ├── config.py            ← Hyperparameters (LR, epochs, batch size…)
│   ├── data_loader/         ← C++ accelerated .binpack data loader
│   ├── model/               ← Model modules (features, layers, quantization)
│   └── scripts/             ← Training shell scripts (easy_train.py, etc.)
│
├── server/
│   └── main.py              ← FastAPI backend (UCI bridge, /move endpoint)
│
├── web/
│   └── src/app/page.tsx     ← Next.js frontend (Chess.com-style UI)
│
├── game/
│   ├── game.py              ← Local GUI for testing (pygame)
│   ├── tournament.py        ← Automated tournament runner
│   └── elo_eval.py          ← Elo calculation script
│
├── Dockerfile               ← Hugging Face Spaces container definition
├── MECHANISM.md             ← Full technical deep-dive (beginner-friendly)
└── README.md                ← This file
```

---

## 🚀 Architecture Deep-Dive

For the full end-to-end technical explanation — including:
- **What NNUE is and how it works** (explained from first principles)
- **How the training dataset was generated**
- **How the neural network is designed, trained, and quantized**
- **How the C++ engine compiles and uses the brain file**
- **How the cloud deployment works**

→ See **[MECHANISM.md](MECHANISM.md)**

---

## ⚡ Quick Start (Local Engine Use)

To run the engine locally (Windows):
```bash
# 1. Build the engine
cd engine
build.bat

# 2. Test via UCI (interactive)
deepcastle.exe
# type: uci
# type: setoption name EvalFile value output.nnue
# type: isready
# type: position startpos moves e2e4
# type: go movetime 1000
```

To run the web server locally:
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## 🙏 Credits & Acknowledgements

- **Training framework:** Based on the [official-stockfish/nnue-pytorch](https://github.com/official-stockfish/nnue-pytorch) training infrastructure.
- **Training dataset:** `large_gensfen_multipvdiff_100_d9.binpack` from the [official Stockfish NNUE training datasets](https://github.com/official-stockfish/nnue-pytorch/wiki/Training-datasets).
- **Search engine base:** Derived from [Stockfish](https://github.com/official-stockfish/Stockfish) C++ source (GPLv3).
- **Incbin:** [graphitemaster/incbin](https://github.com/graphitemaster/incbin) — UNLICENCE.

---
