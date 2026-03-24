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
# BULLETPROOF ENGINE BUILD
# ============================================================
RUN echo "Searching for Makefile..." && \
    MAKE_PATH=$(find . -name "Makefile" | head -n 1) && \
    if [ -n "$MAKE_PATH" ]; then \
        echo "Found Makefile at: $MAKE_PATH"; \
        MAKE_DIR=$(dirname "$MAKE_PATH"); \
        cd "$MAKE_DIR" && \
        make -j$(nproc) ARCH=x86-64-modern || echo "Compilation failed!"; \
        if [ -f "stockfish" ]; then \
            cp stockfish /app/engine/deepcastle; \
            echo "Successfully built engine from source!"; \
        fi; \
    else \
        echo "No Makefile found in the repository!"; \
    fi

# ============================================================
# FAILSAFE: DOWNLOAD LINUX BINARY IF SOURCE FAILED
# ============================================================
WORKDIR /app/engine
RUN if [ ! -f "deepcastle" ]; then \
    echo "Using Failsafe: Downloading pre-compiled high-performance Linux brain..."; \
    wget https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64-modern.tar.xz && \
    tar -xvf stockfish-ubuntu-x86-64-modern.tar.xz && \
    cp stockfish/stockfish-* deepcastle && \
    rm -rf stockfish*; \
    fi && chmod +x deepcastle

# Fallback: Download official NNUE if output.nnue is missing
RUN if [ ! -f "output.nnue" ]; then \
    echo "Neural network missing. Downloading optimized brain..." && \
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
