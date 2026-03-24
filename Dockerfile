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

# ============================================================
# DUAL-BRAIN ENGINE BUILD (Deepcastle v7 Hybrid)
# ============================================================
# 1. Clone fresh Stockfish source for reliable compilation
RUN echo "Cloning fresh engine source..." && \
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine

# 2. Build the CPU-optimized binary
WORKDIR /app/clean_engine/src
RUN make -j$(nproc) build ARCH=x86-64-sse41-popcnt && \
    mkdir -p /app/engine && \
    cp stockfish /app/engine/deepcastle && \
    chmod +x /app/engine/deepcastle

# 3. Locate YOUR custom neural brain to set as the "Big Brain"
WORKDIR /app/engine
RUN echo "Mapping custom brains..." && \
    # Search for any uploaded NNUE file in the repo and use it as primary
    find /app -name "*.nnue" -exec cp {} /app/engine/custom_big.nnue \; || echo "No custom NNUE found."

# 4. Failsafe: Download specific Dual-Brains if they are missing
RUN if [ ! -f "nn-9a0cc2a62c52.nnue" ]; then \
    wget https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue; \
    fi && \
    if [ ! -f "nn-47fc8b7fff06.nnue" ]; then \
    wget https://tests.stockfishchess.org/api/nn/nn-47fc8b7fff06.nnue; \
    fi

# ============================================================
# BACKEND SETUP & LAUNCHER
# ============================================================
WORKDIR /app/server
RUN pip install --no-cache-dir fastapi uvicorn python-chess pydantic

# Mandatory Hugging Face Port
EXPOSE 7860

# EXPLICIT LAUNCHER: Tell the cloud exactly where to find the script
ENV PYTHONPATH=/app/server
CMD ["python3", "/app/server/main.py"]
