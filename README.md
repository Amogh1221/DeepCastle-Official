# DeepCastle v7: Official Repository

DeepCastle is a state-of-the-art chess application combining a high-performance C++ engine with a modern Python/Pygame user interface and **NNUE (Efficiently Updatable Neural Network)** evaluation.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have Python 3.10+ and a C++ compiler (MSVC/GCC).
Install the required Python dependencies:
```bash
pip install -r requirements.txt
```

### 2. How to Play
Navigate to the `game` folder and run the interface:
```bash
cd game
python game.py
```

---

## 🧠 Theory of Operation

### 1. The Search Engine (C++)
The core engine is built on a **Bitboard** architecture, allowing for extremely fast move generation (millions of nodes per second). Key search algorithms include:
*   **Iterative Deepening**: Progressively searches deeper plies while managing a precise time budget.
*   **PVS (Principal Variation Search)**: An optimized alpha-beta pruning variant that assumes the first move searched is likely the best.
*   **Transposition Table**: Uses Zobrist hashing to remember previously searched positions, significantly reducing redundant calculations.
*   **Move Ordering**: Employs MVV-LVA (Most Valuable Victim - Least Valuable Aggressor), Killer Moves, and History Heuristics to search the most promising branches first.

### 2. NNUE Evaluation
DeepCastle uses an **NNUE** architecture for its position evaluation. Unlike traditional hand-crafted evaluation functions, NNUE learns from millions of grandmaster games.
*   **Architecture**: A shallow, quantized neural network optimized for CPU execution.
*   **Accumulator**: Incremental updates track piece-square features during moves, ensuring the neural network doesn't need to re-calculate from scratch every time.
*   **Features**: Uses the `HalfKAv2` feature set, which encodes the relationship between the pieces and the king's position.

---

## 📈 Training Pipeline

The `training` folder contains the full pipeline used to develop the DeepCastle brain.

### 1. Training Command
To train the model using a `.binpack` datasource:
```bash
python training/train.py <path_to_data>.binpack --features "HalfKAv2_hm^" --l1 256 --l2 32 --l3 32 --batch-size 16384 --max-epochs 400 --gpus 1
```

### 2. Exporting the Model
Once training is complete, convert the PyTorch checkpoint to a high-performance `.nnue` file for the C++ engine:
```bash
python training/export_nnue.py checkpoints/last.ckpt output.nnue
```

---

## 📂 Repository Structure

*   `game/`: Contains the playable application (`game.py`), the engine interface (`deepcastle.py`), and the compiled engine (`deepcastle.exe`).
*   `engine/`: Contains the C++ source code for the `deepcastle.exe` chess engine (based on Official Stockfish). You can generate the `deepcastle.exe` binary by running `engine/build.bat`.
*   `training/`: Full codebase for NNUE training, including model definitions and data loading scripts.
*   `requirements.txt`: Python package dependencies.

---
*Created by Amogh Gupta*
