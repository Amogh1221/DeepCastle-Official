#!/bin/bash
echo "----------------------------------------------------"
echo "Compiling Deepcastle Engine for Linux..."
echo "----------------------------------------------------"

# Navigate to src
cd src

# Compile using Stockfish Makefile
# profile-build is faster but takes longer to compile. 
# For a quick build, use 'make -j build ARCH=x86-64-modern'
make -j build ARCH=x86-64-modern

# Move binary to engine root
mv stockfish ../deepcastle_linux

echo "----------------------------------------------------"
echo "Build complete! Binary at engine/deepcastle_linux"
echo "----------------------------------------------------"
