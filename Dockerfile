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

# Copy ALL files from the repository (to get the NNUE and server files)
COPY . .

# ============================================================
# GOD-TIER ENGINE BUILD (Self-Healing Source Hijack)
# ============================================================
# 1. Clone a fresh, clean Stockfish repository (avoids missing local scripts)
RUN echo "Cloning fresh engine source..." && \
    git clone --depth 1 https://github.com/official-stockfish/Stockfish.git /app/clean_engine

# 2. Overwrite the engine with your custom Deepcastle network (if it exists)
RUN if [ -f "/app/engine/output.nnue" ]; then \
        echo "Successfully found custom Deepcastle NNUE. Hijacking clean source..."; \
        cp /app/engine/output.nnue /app/clean_engine/src/deepcastle.nnue; \
    fi

# 3. Build the engine in the clean directory
# We use ARCH=x86-64-sse41-popcnt (Very compatible with cloud)
# We disable the network fetch (since we provide it)
WORKDIR /app/clean_engine/src
RUN make -j$(nproc) build ARCH=x86-64-sse41-popcnt && \
    mkdir -p /app/engine && \
    cp stockfish /app/engine/deepcastle && \
    echo "Engine build complete!"

# ============================================================
# FALLBACK: Linux Binary (Alternative Mirror)
# ============================================================
WORKDIR /app/engine
RUN if [ ! -f "deepcastle" ]; then \
    echo "Using Failsafe: Downloading Rock-Solid Linux Release SF 16.1..."; \
    wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    tar -xvf stockfish-ubuntu-x86-64-sse41-popcnt.tar.xz && \
    cp stockfish/stockfish-ubuntu-x86-64-sse41-popcnt deepcastle && \
    rm -rf stockfish*; \
    fi && chmod +x deepcastle

# Ensure NNUE exists in the engine directory for runtime
# (Deepcastle v7 uses output.nnue) 
RUN if [ ! -f "output.nnue" ]; then \
    echo "Brain missing. Downloading specialized NNUE..." && \
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
