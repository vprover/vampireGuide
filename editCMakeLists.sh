#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  apply_wasm_threads_patch.sh [--dry-run] /path/to/CMakeLists.txt

This script rewrites the file to include:
  - Emscripten-specific Threads::Threads stub (replacing find_package(Threads REQUIRED))
  - Forces BUILD_SHARED_LIBS OFF under EMSCRIPTEN (before option(BUILD_SHARED_LIBS ...))
  - Makes -static linker flag conditional on NOT EMSCRIPTEN
  - Replaces 'COMMAND cmake' with 'COMMAND ${CMAKE_COMMAND}' in update_git_version target

Creates a timestamped backup alongside the original.
USAGE
}

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift || true
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

FILE="$1"
if [[ ! -f "$FILE" ]]; then
  echo "Error: '$FILE' not found." >&2
  exit 1
fi

ts() { date +"%Y%m%d-%H%M%S"; }

# Prepare replacement blocks
THREADS_BLOCK=$'# For WebAssembly build, we need a workaround for threading:\nif(EMSCRIPTEN)\n  message(STATUS "Emscripten: stub Threads::Threads (single-threaded)")\n  add_library(Threads::Threads INTERFACE IMPORTED)\n  set(Threads_FOUND TRUE CACHE BOOL "" FORCE)\n  set(THREADS_PREFER_PTHREAD_FLAG FALSE CACHE BOOL "" FORCE)\n  set(CMAKE_THREAD_LIBS_INIT "" CACHE STRING "" FORCE)\nelse()\n  find_package(Threads REQUIRED)\nendif()'

STATIC_WASM_BLOCK=$'# force static build in WebAssembly context\nif(EMSCRIPTEN)\n  set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)\nendif()'

STATIC_LINK_BLOCK=$'  if(NOT EMSCRIPTEN)\n    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -static")\n  endif()'

TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

# Pass 1: main structured transforms via awk
awk -v threads_block="$THREADS_BLOCK" \
    -v static_wasm_block="$STATIC_WASM_BLOCK" \
    -v static_link_block="$STATIC_LINK_BLOCK" '
BEGIN {
  inserted_static_wasm = 0
}
{
  # 1) Replace lone find_package(Threads REQUIRED) with EMSCRIPTEN-aware block
  if ($0 ~ /^find_package\(Threads REQUIRED\)[[:space:]]*$/) {
    print threads_block
    next
  }

  # 2) Insert the EMSCRIPTEN static BUILD_SHARED_LIBS block immediately
  #    before the first occurrence of option(BUILD_SHARED_LIBS ...)
  if (!inserted_static_wasm && $0 ~ /^option\(BUILD_SHARED_LIBS[[:space:]]/) {
    print static_wasm_block
    print ""  # keep a blank line like in the diff
    inserted_static_wasm = 1
    print $0
    next
  }

  # 3) Replace hard -static with NOT EMSCRIPTEN guarded version
  if ($0 ~ /^[[:space:]]*set\(CMAKE_EXE_LINKER_FLAGS[[:space:]]*-static\)[[:space:]]*$/) {
    print static_link_block
    next
  }

  # 4) In the update_git_version target, replace "COMMAND cmake" with "COMMAND ${CMAKE_COMMAND}"
  if ($0 ~ /COMMAND[[:space:]]+cmake[[:space:]]+-DVAMPIRE_SOURCE_DIR=\$\{CMAKE_SOURCE_DIR\}/) {
    sub(/COMMAND[[:space:]]+cmake/, "COMMAND ${CMAKE_COMMAND}")
    print
    next
  }

  # Default: passthrough
  print
}
' "$FILE" > "$TMP_OUT"

# See if anything changed
if cmp -s "$FILE" "$TMP_OUT"; then
  echo "No changes needed; file already matches the desired diff."
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run: showing unified diff of proposed changes:"
  diff -u --label "original/$FILE" --label "modified/$FILE" "$FILE" "$TMP_OUT" || true
  exit 0
fi

# Backup and write
BKP="${FILE}.bak.$(ts)"
cp -p -- "$FILE" "$BKP"
mv -- "$TMP_OUT" "$FILE"
trap - EXIT

echo "Patched: $FILE"
echo "Backup saved as: $BKP"

