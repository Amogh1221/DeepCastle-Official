# ─── Base ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y \
    build-essential make g++ wget git curl xz-utils findutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# ─── Build Stockfish (Ultra-Compatible ARCH) ──────────────────────────────────
RUN git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine
WORKDIR /app/clean_engine/src
# x86-64 is the MOST compatible build for any cloud environment (Hugging Face)
RUN make -j$(nproc) build ARCH=x86-64 && \
    mkdir -p /app/engine && \
    cp stockfish /app/engine/deepcastle && \
    chmod +x /app/engine/deepcastle

# ─── Find & place launcher ────────────────────────────────────────────────────
WORKDIR /app
RUN LAUNCHER=$(find /app -name "main.py" | head -n 1) && \
    if [ -n "$LAUNCHER" ]; then \
        echo "Launcher found: $LAUNCHER"; cp "$LAUNCHER" /app/launcher.py; \
    else \
        echo "CRITICAL: main.py not found!"; exit 1; \
    fi

# ─── NNUE files (Hard-linked for stability) ───────────────────────────────────
WORKDIR /app/engine
RUN wget -q https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue && \
    cp nn-9a0cc2a62c52.nnue brain.nnue

# ─── Python deps ──────────────────────────────────────────────────────────────
WORKDIR /app
RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    uvloop \
    python-chess \
    pydantic \
    websockets

# ─── Runtime config ───────────────────────────────────────────────────────────
ENV PYTHONPATH="/app:/app/server"
ENV ENGINE_PATH="/app/engine/deepcastle"
ENV NNUE_PATH="/app/engine/brain.nnue"

EXPOSE 7860

# Production Entry Point
CMD ["uvicorn", "launcher:app", "--host", "0.0.0.0", "--port", "7860"]