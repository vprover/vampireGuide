#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR=${BUILD_DIR:-build-ems}

rm -rf "$BUILD_DIR"
export EM_CACHE="${EM_CACHE:-$PWD/.emcache}"

# Async-friendly wasm32 build; keep it light but enlarge stacks for Asyncify.
CXXFLAGS="-O2 -fexceptions -fno-strict-aliasing"

# SINGLE LINE, NO NEWLINES. Asyncify only the async readline hook.
LDFLAGS="-sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=67108864 -sASYNCIFY_IMPORTS='[\"__asyncjs__vampire_async_readline\"]' -sASYNCIFY_IGNORE_INDIRECT=0 -sSTACK_SIZE=67108864 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=2147483648 -sENVIRONMENT=web -sMODULARIZE=1 -sEXPORT_ES6=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 -sASSERTIONS=2 -sEXPORTED_RUNTIME_METHODS='[\"callMain\",\"ccall\",\"cwrap\",\"FS\",\"Asyncify\",\"UTF8ToString\",\"stringToUTF8\",\"lengthBytesUTF8\"]' -sEXPORTED_FUNCTIONS='[\"_main\",\"_emscripten_force_exit\"]'"

emcmake cmake -S . -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_CXX_FLAGS="$CXXFLAGS" \
  -DCMAKE_EXE_LINKER_FLAGS="$LDFLAGS"

emmake make -C "$BUILD_DIR" -j"$(nproc)"
