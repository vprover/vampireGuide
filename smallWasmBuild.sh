#!/usr/bin/env bash
set -euo pipefail

rm -rf build-ems64

# --- compile flags (must include -mwasm64 for 64-bit pointers) ---
CXXFLAGS="-Oz -fwasm-exceptions -fno-strict-aliasing -pthread -sMEMORY64=1"

# --- link flags: SINGLE LINE, NO NEWLINES ---
LDFLAGS="-sMEMORY64=1 -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=4 -sPROXY_TO_PTHREAD=1 -sEXIT_RUNTIME=1 -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=16777216 -sINITIAL_MEMORY=805306368 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648 -sFORCE_FILESYSTEM=1 -sWASM_BIGINT=1 -sASSERTIONS=1 -sENVIRONMENT=web -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORTED_RUNTIME_METHODS='[\"callMain\",\"FS\",\"ccall\",\"cwrap\"]' -sEXPORTED_FUNCTIONS='[\"_main\",\"_emscripten_force_exit\"]'"

emcmake cmake -S . -B build-ems64 \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_CXX_FLAGS="$CXXFLAGS" \
  -DCMAKE_EXE_LINKER_FLAGS="$LDFLAGS"

emmake make -C build-ems64 -j"$(nproc)"

