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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL files from the repository
COPY . .

# ============================================================
# CUSTOM DEEPCASTLE ENGINE BUILD (From your engine/src)
# ============================================================
WORKDIR /app/engine/src
# Use the exact command from build_linux.sh but without the invalid 'build' target
RUN make -j$(nproc) ARCH=x86-64-modern && \
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
# Map your custom brain (output.nnue) correctly for the server
RUN find /app -maxdepth 2 -name "*.nnue" -exec cp {} /app/engine_bin/output.nnue \; || echo "No custom NNUE found."

# Force permissions
RUN chmod -R 777 /app/engine_bin

# ============================================================
# BACKEND SETUP
# ============================================================
RUN pip install --no-cache-dir fastapi uvicorn chess==1.11.2 pydantic

# Explicit Paths
ENV ENGINE_PATH=/app/engine_bin/deepcastle
ENV NNUE_PATH=/app/engine_bin/output.nnue
ENV PYTHONPATH="/app:/app/server"

EXPOSE 7860

# START
CMD ["python3", "/app/launcher.py"]