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

# Copy the whole repository (to build the engine)
COPY . .

# Build the C++ Engine
WORKDIR /app/engine/src
RUN make -j$(nproc) build ARCH=x86-64-sse41-popcnt
RUN mv stockfish /app/engine/deepcastle

# Copy NNUE (It should be in the engine/ folder in the host)
# If it's missing, you can add a wget command here to download it from a URL.
# COPY ../engine/output.nnue /app/engine/output.nnue

# Setup Python environment
WORKDIR /app/server
RUN pip install --no-cache-dir fastapi uvicorn python-chess pydantic

# Expose Hugging Face mandatory port
EXPOSE 7860

# Run FastAPI on 0.0.0.0:7860 (Hugging Face default)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
