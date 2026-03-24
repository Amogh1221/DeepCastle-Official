# DEEPCASTLE v7
![Deepcastle Logo](game/DClogo.png)

## 🏆 The Neural Chess Powerhouse
Deepcastle v7 is a high-performance chess engine and distributed web application. It combines a **Stockfish-based C++ Search Core** with a **Custom-Trained HalfKP NNUE** evaluation function, deployed across a professional hybrid-cloud infrastructure.

---

## 🏗️ Technical Architecture
Deepcastle v7 is built using a modern, decoupled architecture to ensure maximum performance and a premium user experience.

### 1. The Interface (Frontend - Vercel)
*   **Framework:** Next.js 16 (App Router)
*   **Styling:** Tailwind CSS with a **Glassmorphism** design language.
*   **Hosting:** Vercel (Edge-optimized for low-latency UI rendering).
*   **Key Features:** 
    *   Dynamic Evaluation Bar (Real-time engine perspective).
    *   Animated Move Log with Search Statistics.
    *   Mobile-responsive high-performance chessboard.

### 2. The Powerhouse (Backend - Hugging Face)
*   **Brain Hub:** Hosted on **Hugging Face Spaces** using Docker containers.
*   **Resources:** 16GB RAM / Multi-vCPU environment.
*   **API Layer:** **FastAPI (ASGI)** serving UCI commands over high-speed HTTP.
*   **Protocol:** Bridging the web frontend to the raw C++ engine via the Universal Chess Interface (UCI) protocol.

### 3. The Brain (Engine Logic)
The "Soul" of Deepcastle lies in its **Custom-Trained NNUE** fused into a Stockfish search core:
*   **Custom Neural Brain (`output.nnue`):** A fully custom-trained NNUE using **HalfKP** features, trained on Stockfish self-play data (`large_gensfen_multipvdiff_100_d9.binpack`). Loaded at runtime via the `EvalFile` UCI option — this drives all positional evaluation.
*   **Stockfish Fallback NNUEs:** Two standard Stockfish nets are downloaded at Docker build time solely to prevent the engine from crashing on startup. The engine immediately replaces them with `output.nnue` once configured.
*   **Search Core:** Principal Variation Search (PVS) with advanced pruning (LMR, Null Move Pruning) and an optimized Transposition Table — powered by the Stockfish search infrastructure.

---

## 🧠 Theory of Operation

### Data Flow Path:
1.  **Input:** User makes a move on the **Next.js** board.
2.  **Request:** The move (in FEN format) is sent via HTTPS POST to the **Hugging Face API**.
3.  **Calculation:** The **FastAPI** worker receives the FEN, boots the **Deepcastle C++ Engine**, and loads `output.nnue` into memory.
4.  **Search:** The engine searches to the specified depth/time using the custom NNUE for evaluation.
5.  **Return:** The "Best Move" plus technical stats (Depth, NPS, Nodes, Score, PV) are returned to the UI.
6.  **Update:** The Vercel board updates instantly, displaying the bot's response and search analysis.

---

## 📊 Benchmarks (vs Stockfish 18)
In official match testing against **Stockfish 18** (the world's strongest chess entity), Deepcastle v7 has demonstrated near-impenetrable defensive stability and high-accuracy strategy.

*   **Estimated Rating:** **~3604 Elo**
*   **Draw Ratio:** **95.5%**
*   **Match Performance:** 21 Draws / 1 Loss / 0 Wins (over 22 games).
*   **Result:** Deepcastle is statistically **within -15 Elo** of the world champion engine, making it one of the strongest custom-trained neural engines available.

---

## 📉 Training Pipeline
The `training` folder contains the full codebase used to develop the DeepCastle neural weights.
*   **Feature Set (HalfKP):** King-centric perspective features — 20,480 inputs per side. Each feature encodes (King Square × Piece Type × Piece Square).
*   **Dataset:** `large_gensfen_multipvdiff_100_d9.binpack` — Stockfish self-play positions evaluated at depth 9, with multi-PV score differences ≤ 100 centipawns.
*   **Architecture:** L1=256, L2=31, L3=32 with 8 layer stacks (bucketed by piece count) and a PSQT shortcut. Trained using the Ranger21 optimizer and a symmetric sigmoid loss function.
*   **Output:** `engine/output.nnue` — a 6.2 MB quantized binary brain file compatible with the Stockfish NNUE loader.

---

## 📂 Repository Structure
*   `web/`: **Next.js Frontend.** The premium user interface code.
*   `server/`: **FastAPI Backend.** The bridge between the web and the engine.
*   `engine/`: **The Core C++ Engine.** C++ source code and build scripts.
*   `training/`: **NNUE Development.** Python pipeline for training custom models.
*   `Dockerfile`: The master instructions for the cloud build.

---

## 🚀 Architecture Deep-Dive
For full technical details on how the engine works end-to-end — from training data to cloud deployment — see **[MECHANISM.md](MECHANISM.md)**.

---
*Developed by Amogh Gupta & Antigravity AI*
