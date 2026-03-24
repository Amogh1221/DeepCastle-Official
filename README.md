# DEEPCASTLE v7
![Deepcastle Logo](game/DClogo.png)

### The Neural Chess Powerhouse
Deepcastle v7 is a high-performance chess engine based on the Stockfish core, featuring a custom-trained NNUE (Neural Network efficiently updatable) architecture. It achieves high-performance play by combining the powerful **Official Stockfish C++ Search Engine** with a custom-trained **NNUE (Efficiently Updatable Neural Network)** evaluation brain.

---

## ❤️ Credits and References

DeepCastle is built upon the incredible work of the global computer chess community. We would like to give primary credit to:

-   **The Stockfish Developers**: For the legendary [Stockfish C++ Search Engine](https://github.com/official-stockfish/Stockfish), which provides the world-class bitboard architecture, search algorithms, and incremental update logic used in DeepCastle v7.
-   **The Lichess Team**: For providing the massive open-source [database of evaluations](https://database.lichess.org/) used to train the DeepCastle neural network.
-   **NNUE-Pytorch**: For the training framework used to develop the custom neural network weights.

---

## 🧠 Theory of Operation

DeepCastle v7 is a hybrid system where two major components work together:

### 1. The Search Engine (C++ / Stockfish-based)
The "muscle" of the engine is the official Stockfish backend. It handles the raw calculation, looking millions of moves ahead into the future.
-   **Bitboard Architecture**: Uses 64-bit integers to represent the board, allowing for extremely fast move generation.
-   **PVS (Principal Variation Search)**: A highly optimized version of alpha-beta pruning that significantly reduces the number of positions the computer needs to look at.
*   **Transposition Table**: A massive in-memory hash table that remembers previous calculations, preventing the engine from repeating work.
*   **Iterative Deepening**: A strategy that searches level by level (plies), ensuring the bot always has its "best move so far" ready if time runs out.

### 2. The NNUE Evaluation (Neural Network)
The "brain" of the engine is the **NNUE**. Unlike traditional "hand-written" rules, this model learned to evaluate chess positions by studying over **350 million grandmaster-level positions** evaluated by Stockfish.

*   **Features (HalfKAv2_hm)**: The neural network looks at the board from the perspective of the **King**. It captures how every piece on the board relates to the position of its own King.
*   **Efficient Updates**: Because only one or two pieces move at a time, the network uses an "Accumulator" to incrementally update its evaluation in microseconds rather than re-calculating the entire board from scratch.
*   **Architecture**: DeepCastle v7 uses a multi-layered network with **SqrCReLU** activations and **Product Pooling**, allowing it to detect complex "interactions" (like a strong bishop paired with a weak pawn structure).

---

## 📈 Training Pipeline

The `training` folder contains the full codebase used to develop the DeepCastle neural weights.

### 1. The Dataset
We use a **32GB `.binpack`** datasource containing ~354 million positions. The network learns to predict the **Win-Draw-Loss (WDL)** probability of these positions using a **Power MSE Loss** function.

### 2. Training Loop
Training is performed on an **RTX 3060 GPU** and typically takes 2-4 days. We use the **Ranger21 Optimizer**, which combines lookahead and gradient centralization for maximum stability.
```bash
python training/train.py <path_to_data>.binpack --features "HalfKAv2_hm^" --l1 1024 --batch-size 16384 --max-epochs 400
```

### 3. Model Export
After training, the PyTorch model is quantized into high-performance integers (`int8`/`int16`) and exported as a binary `.nnue` file.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.10+**: For the GUI and training scripts.
- **MSVC (Visual Studio)** or **GCC**: For compiling the C++ engine.

### 2. Compiling the Engine
DeepCastle creates its own `deepcastle.exe` from source. Navigate to the `engine` folder and run the build script:
```bash
cd engine
build.bat
```

### 3. Playing
Run the `game.py` file inside the `game` folder to start the graphical interface:
```bash
cd game
python game.py
```

---

## 📂 Repository Structure

*   `engine/`: **The Core Search Engine.** Contains the Stockfish-based C++ source code and the `build.bat` script.
*   `game/`: **The Graphical Interface.** Contains the Python/Pygame code for the playable board and the UCI interface.
*   `test/`: **Benchmarking Tools.** Contains `elo_bench.py` for testing the engine's rating against Stockfish.
*   `training/`: **Brain Development.** The full Python pipeline for training and exporting custom NNUE models.

---
*Created by Amogh Gupta*
