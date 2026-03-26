# Use Python 3.12 slim
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    xz-utils \
    findutils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL files from the repository
COPY . .

# ============================================================
# OFFICIAL STOCKFISH 17 BINARY (Ultra-Stable)
# ============================================================
RUN mkdir -p /app/engine && \
    wget -O stockfish.tar.xz https://github.com/official-stockfish/Stockfish/releases/download/sf_17/stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    tar -xvf stockfish.tar.xz && \
    cp stockfish/stockfish-ubuntu-x86-64-sse41-popcnt /app/engine/deepcastle && \
    chmod +x /app/engine/deepcastle && \
    rm -rf stockfish stockfish.tar.xz

# ============================================================
# LAUNCHER PREPARATION
# ============================================================
RUN LAUNCHER_PATH=$(find /app -name "main.py" | head -n 1) && \
    cp "$LAUNCHER_PATH" /app/launcher.py

# ============================================================
# BRAIN PLACEMENT
# ============================================================
# Map your custom brain (output.nnue) correctly for the server
RUN find /app -maxdepth 1 -name "*.nnue" -exec cp {} /app/engine/output.nnue \; || echo "No custom NNUE found."

# Clear permissions for the engine folder
RUN chmod -R 777 /app/engine

# ============================================================
# BACKEND SETUP
# ============================================================
RUN pip install --no-cache-dir fastapi uvicorn chess==1.11.2 pydantic

# Explicit Paths
ENV ENGINE_PATH=/app/engine/deepcastle
ENV NNUE_PATH=/app/engine/output.nnue
ENV PYTHONPATH="/app:/app/server"

EXPOSE 7860

# START
CMD ["python3", "/app/launcher.py"]