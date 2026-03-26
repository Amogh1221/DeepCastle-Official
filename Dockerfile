# Use Python 3.12 slim
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    make \
    g++ \
    wget \
    git \
    findutils \
    curl \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL files from the repository
COPY . .

# DEBUG: List all files to see what actually arrived from GitHub
RUN echo "--- REPOSITORY CONTENT DEBUG ---" && \
    ls -R /app && \
    echo "---------------------------------"

# ============================================================
# DUAL-BRAIN ENGINE BUILD
# ============================================================
RUN echo "Cloning fresh engine source..." && \
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine

WORKDIR /app/clean_engine/src
RUN make -j$(nproc) build ARCH=x86-64-modern && \
    mkdir -p /app/engine && \
    cp stockfish /app/engine/deepcastle && \
    chmod +x /app/engine/deepcastle

# ============================================================
# LAUNCHER PREPARATION (The Search & Destroy Fix)
# ============================================================
WORKDIR /app
RUN echo "Searching for Launcher (main.py)..." && \
    LAUNCHER_PATH=$(find /app -name "main.py" | head -n 1) && \
    if [ -n "$LAUNCHER_PATH" ]; then \
        echo "Found launcher at: $LAUNCHER_PATH. Copying to root..."; \
        cp "$LAUNCHER_PATH" /app/launcher.py; \
    else \
        echo "CRITICAL ERROR: main.py not found in the repository!"; \
        exit 1; \
    fi

# ============================================================
# BRAIN PLACEMENT (The Neural Sync)
# ============================================================
WORKDIR /app/engine

# Download your trained brain directly from HF Space to be 100% sure it exists
RUN wget -q https://huggingface.co/spaces/Amogh1221/deepcastle-api/resolve/main/output.nnue -O /app/engine/output.nnue

# Also download failsafe stockfish brains (backup)
RUN wget -q https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue && \
    wget -q https://tests.stockfishchess.org/api/nn/nn-47fc8b7fff06.nnue

# ============================================================
# BACKEND SETUP
# ============================================================
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn python-chess pydantic websockets

# Set PYTHONPATH to include all potential source directories
ENV PYTHONPATH="/app:/app/server"
EXPOSE 7860

# START: Use the guaranteed launcher in the root
CMD ["python3", "/app/launcher.py"]
