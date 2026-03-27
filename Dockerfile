# Use Python 3.12 slim
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    make \
    g++ \
    wget \
    curl \
    xz-utils \
    findutils \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL files from the repository
COPY . .

# ============================================================
# CUSTOM DEEPCASTLE ENGINE BUILD
# Supports both repo layouts:
# 1) /app/engine/src (full repo)
# 2) /app/src        (HF minimal repo)
# ============================================================
RUN if [ -d /app/engine/src ]; then BUILD_DIR=/app/engine/src; \
    elif [ -d /app/src ]; then BUILD_DIR=/app/src; \
    else echo "Engine source dir not found"; exit 1; fi && \
    cd "$BUILD_DIR" && \
    make -j$(nproc) build ARCH=x86-64-sse41-popcnt && \
    mkdir -p /app/engine_bin && \
    cp stockfish /app/engine_bin/deepcastle && \
    chmod +x /app/engine_bin/deepcastle

# ============================================================
# LAUNCHER PREPARATION
# ============================================================
WORKDIR /app
RUN LAUNCHER_PATH=$(find /app -name "main.py" | head -n 1) && \
    cp "$LAUNCHER_PATH" /app/launcher.py

# ============================================================
# BRAIN PLACEMENT
# ============================================================
# Map your custom brains for the server
RUN if [ -f /app/output.nnue ]; then cp /app/output.nnue /app/engine_bin/output.nnue; fi && \
    if [ -f /app/small_output.nnue ]; then cp /app/small_output.nnue /app/engine_bin/small_output.nnue; fi

# Force permissions
RUN chmod -R 777 /app/engine_bin

# ============================================================
# BACKEND SETUP
# ============================================================
RUN if [ -f /app/server/requirements.txt ]; then \
      pip install --no-cache-dir -r /app/server/requirements.txt; \
    else \
      pip install --no-cache-dir fastapi "uvicorn[standard]" websockets python-chess pydantic; \
    fi

# Explicit Paths
ENV ENGINE_PATH=/app/engine_bin/deepcastle
ENV DEEPCASTLE_ENGINE_PATH=/app/engine_bin/deepcastle
ENV STOCKFISH_ENGINE_PATH=/usr/games/stockfish
ENV NNUE_PATH=/app/engine_bin/output.nnue
ENV NNUE_SMALL_PATH=/app/engine_bin/small_output.nnue
ENV PYTHONPATH="/app:/app/server"

EXPOSE 7860

# START
CMD ["python3", "/app/launcher.py"]