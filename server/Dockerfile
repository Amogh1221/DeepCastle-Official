# Use Python 3.12 slim for smaller image
FROM python:3.12-slim

# Install compilation tools and dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    make \
    g++ \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the whole repository
COPY . .

# Build the C++ Engine (Removing the non-existent 'build' target)
WORKDIR /app/engine/src
RUN make -j$(nproc) ARCH=x86-64-sse41-popcnt
RUN cp stockfish /app/engine/deepcastle

# Fallback: Download the official NNUE if output.nnue is missing (to prevent crash)
# Note: Deepcastle v7 uses a specific neural network.
WORKDIR /app/engine
RUN if [ ! -f "output.nnue" ]; then \
    wget https://tests.stockfishchess.org/api/nn/nn-ae6a455a-c521-4f11-923f-5626359074df.nnue -O output.nnue; \
    fi

# Setup Python environment
WORKDIR /app/server
RUN pip install --no-cache-dir fastapi uvicorn python-chess pydantic

# Expose Hugging Face mandatory port
EXPOSE 7860

# Run FastAPI on 0.0.0.0:7860 (Hugging Face default)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
