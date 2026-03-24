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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy ALL files from the repository
COPY . .

# ============================================================
# BULLETPROOF ENGINE BUILD (Optimized for Deepcastle v7)
# ============================================================
RUN echo "Commencing Engine Build..." && \
    MAKE_PATH=$(find . -name "Makefile" | head -n 1) && \
    if [ -n "$MAKE_PATH" ]; then \
        MAKE_DIR=$(dirname "$MAKE_PATH"); \
        cd "$MAKE_DIR" && \
        echo "Building in $MAKE_DIR..." && \
        make -j$(nproc) build ARCH=x86-64-sse41-popcnt || echo "Source build failed!"; \
        if [ -f "stockfish" ]; then \
            mkdir -p /app/engine && \
            cp stockfish /app/engine/deepcastle; \
        fi; \
    fi

# ============================================================
# FAILSAFE: Linux Binary (Reliable Mirror)
# ============================================================
WORKDIR /app/engine
RUN if [ ! -f "deepcastle" ]; then \
    echo "Using Failsafe: Downloading Rock-Solid Linux Release..."; \
    wget https://github.com/official-stockfish/Stockfish/releases/download/sf_17/stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    tar -xvf stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    cp stockfish/stockfish-ubuntu-x86-64-sse41-popcnt deepcastle && \
    rm -rf stockfish*; \
    fi && chmod +x deepcastle

# Fallback: NNUEoptimized brain
RUN if [ ! -f "output.nnue" ]; then \
    wget https://tests.stockfishchess.org/api/nn/nn-ae6a455a-c521-4f11-923f-5626359074df.nnue -O output.nnue; \
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
