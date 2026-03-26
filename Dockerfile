# ─── Base ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# System deps
RUN apt-get update && apt-get install -y \
    build-essential make g++ wget git curl xz-utils findutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# ─── Debug listing ────────────────────────────────────────────────────────────
RUN echo "--- REPOSITORY CONTENT ---" && ls -R /app && echo "--------------------------"

# ─── Build Stockfish ──────────────────────────────────────────────────────────
RUN git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine
WORKDIR /app/clean_engine/src
RUN make -j$(nproc) build ARCH=x86-64-modern && \
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

# ─── NNUE files ───────────────────────────────────────────────────────────────
RUN find /app -name "*.nnue" -exec cp {} /app/engine/custom_big.nnue \; 2>/dev/null || true

WORKDIR /app/engine
RUN if [ ! -f "nn-9a0cc2a62c52.nnue" ]; then \
        wget -q https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue; fi && \
    if [ ! -f "nn-47fc8b7fff06.nnue" ]; then \
        wget -q https://tests.stockfishchess.org/api/nn/nn-47fc8b7fff06.nnue; fi

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
ENV NNUE_PATH="/app/engine/output.nnue"

EXPOSE 7860

CMD ["python3", "/app/launcher.py"]