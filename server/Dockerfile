# Use official Python image as a base
FROM python:3.11-slim

# Install system dependencies for Stockfish compilation
RUN apt-get update && apt-get install -y \
    build-essential \
    g++ \
    make \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the engine source and compile it for Linux
COPY engine /app/engine
WORKDIR /app/engine/src
RUN make -j build ARCH=x86-64-modern
RUN mv stockfish ../deepcastle_linux

# Return to base app dir
WORKDIR /app

# Copy the server code
COPY server /app/server
WORKDIR /app/server

# Install Python requirements
RUN pip install --no-cache-dir -r requirements.txt

# Environment variables
ENV ENGINE_PATH="/app/engine/deepcastle_linux"
ENV NETWORK_BIG="/app/engine/nn-9a0cc2a62c52.nnue"
ENV NETWORK_SMALL="/app/engine/nn-47fc8b7fff06.nnue"

# Download networks if they don't exist yet (Fallback)
RUN if [ ! -f $NETWORK_BIG ]; then \
    curl -L https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue -o $NETWORK_BIG; \
    fi
RUN if [ ! -f $NETWORK_SMALL ]; then \
    curl -L https://tests.stockfishchess.org/api/nn/nn-47fc8b7fff06.nnue -o $NETWORK_SMALL; \
    fi

# Expose the API port
EXPOSE 8000

# Start the server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
