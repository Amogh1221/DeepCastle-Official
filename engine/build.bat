@echo off
echo ----------------------------------------------------
echo Compiling Deepcastle Engine from Stockfish source...
echo ----------------------------------------------------

:: Call Visual Studio Build Tools environment
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

:: Compile the engine
cl /O2 /std:c++17 /EHsc /D USE_NNUE ^
    src\*.cpp ^
    src\nnue\*.cpp ^
    src\nnue\features\*.cpp ^
    src\syzygy\*.cpp ^
    /Fe:deepcastle.exe /link /MACHINE:X64

:: Clean up build artifacts
del *.obj

echo ----------------------------------------------------
echo Downloading Default Big Network if not present...
echo ----------------------------------------------------
if not exist "nn-9a0cc2a62c52.nnue" (
    powershell -Command "Invoke-WebRequest -Uri 'https://tests.stockfishchess.org/api/nn/nn-9a0cc2a62c52.nnue' -OutFile 'nn-9a0cc2a62c52.nnue'"
)

echo Build and setup process complete! deepcastle.exe is ready!
