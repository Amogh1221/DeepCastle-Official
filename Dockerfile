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

# Copy EVERYTHING from the repository (to get the NNUE and server files)
COPY . .

# ============================================================
# GOD-TIER ENGINE BUILD (Verified Pathing)
# ============================================================
RUN echo "Cloning fresh engine source..." && \
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine

# 1. Search for output.nnue anywhere in the repo and copy it to the engine room
RUN echo "Relocating neural brain..." && \
    mkdir -p /app/engine && \
    find /app -name "*.nnue" -exec cp {} /app/engine/output.nnue \; || echo "No NNUE found in repo."

# 2. Build the engine
WORKDIR /app/clean_engine/src
RUN make -j$(nproc) build ARCH=x86-64-sse41-popcnt && \
    cp stockfish /app/engine/deepcastle && \
    chmod +x /app/engine/deepcastle && \
    echo "Engine build complete!"

# ============================================================
# FINAL CHECK: Ensure the Brain (NNUE) is exactly where it belongs
# ============================================================
WORKDIR /app/engine
# If it's still missing, download a guaranteed high-performance brain (v17/18 compatible)
RUN if [ ! -f "output.nnue" ]; then \
    echo "Brain missing. Downloading specialized NNUE (v17 Ref)..." && \
    wget https://github.com/official-stockfish/Stockfish/raw/master/src/nn-1111b1111b11.nnue -O output.nnue || \
    wget https://tests.stockfishchess.org/api/nn/nn-5af11540bbfe.nnue -O output.nnue; \
    fi

# ============================================================
# BACKEND SETUP
# ============================================================
WORKDIR /app/server
RUN pip install --no-cache-dir fastapi uvicorn python-chess pydantic

# Mandatory Hugging Face Port
EXPOSE 7860

# Start Engine API
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
