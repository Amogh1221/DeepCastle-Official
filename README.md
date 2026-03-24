# DEEPCASTLE v7
![Deepcastle Logo](game/DClogo.png)

## 🏆 The Neural Chess Powerhouse
Deepcastle v7 is a high-performance chess engine and distributed web application. It combines a **Stockfish-based C++ Search Core** with a **Custom-Trained NNUE (Dual-Network)** architecture, deployed across a professional hybrid-cloud infrastructure.

---

## 🏗️ Technical Architecture
Deepcastle v7 is built using a modern, decoupled architecture to ensure maximum performance and a premium user experience.

### 1. The Interface (Frontend - Vercel)
*   **Framework:** Next.js 15 (App Router)
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
The "Soul" of Deepcastle lies in its **Dual-NNUE Hybrid Architecture**:
*   **Custom-Trained Neural Network (Big Brain):** Your primary trained `.nnue` file acts as the `EvalFile`. This is used for complex positional understanding and long-term strategy. It was trained on 350M+ grandmaster positions.
*   **Stockfish Optimized Network (Small Brain):** A secondary `EvalFileSmall` network used for ultra-fast tactical verification in simple positions, maintaining the engine’s speed in bullet/blitz contexts.
*   **Search muscle:** Principal Variation Search (PVS) with advanced pruning (LMR, Null Move Pruning) and a optimized Transposition Table.

---

## 🧠 Theory of Operation

### Data Flow Path:
1.  **Input:** User makes a move on the **Next.js** board.
2.  **Request:** The move (in UCI/FEN format) is sent via HTTPS POST to the **Hugging Face API**.
3.  **Calculation:** The **FastAPI** worker receives the FEN, boots the **Deepcastle C++ Engine**, and loads the **Dual-Brains** into memory.
4.  **Search:** The engine searches to the specified depth/time using your custom NNUE for evaluation.
5.  **Return:** The "Best Move" plus technical stats (Depth, NPS, Nodes, Score, PV) are returned to the UI.
6.  **Update:** The Vercel board updates instantly, displaying the bot's response and search analysis.

---

## 📈 Training Pipeline
The `training` folder contains the full codebase used to develop the DeepCastle neural weights.
*   **Features (HalfKAv2_hm)**: Perspective-aware king-centric features.
*   **Dataset**: 32GB `.binpack` (~354M positions).
*   **Engine Target:** Custom C++ weights tailored for the Stockfish bitboard system.

---

## 📂 Repository Structure
*   `web/`: **Next.js Frontend.** The premium user interface code.
*   `server/`: **FastAPI Backend.** The bridge between the web and the engine.
*   `engine/`: **The Core C++ Engine.** C++ source code and build scripts.
*   `training/`: **NNUE Development.** Python pipeline for training custom models.
*   `Dockerfile`: The master instructions for the cloud build.

---

## 🚀 Deployment Guide
For full instructions on setting up your own instance of the Deepcastle Cloud, see **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**.

---
*Developed by Amogh Gupta & Antigravity AI*
