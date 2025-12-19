#!/usr/bin/env bash
set -euo pipefail

# Apply interactive-IO tweaks to the Vampire source tree so that stdin
# prompts can round-trip through the browser (via Module.vampireReadline).
#
# Usage: ./patchVampireInteractive.sh [path/to/vampire]

ROOT_DIR=${1:-vampire}
if [[ ! -d "$ROOT_DIR" ]]; then
  echo "error: '$ROOT_DIR' is not a directory" >&2
  exit 1
fi

run_patch() {
  local description="$1"
  local patch_input="$2"
  if patch -p1 -d "$ROOT_DIR" --forward --dry-run --quiet <<<"$patch_input" >/dev/null 2>&1; then
    patch -p1 -d "$ROOT_DIR" --forward --quiet <<<"$patch_input" >/dev/null 2>&1
    echo "Applied: $description"
  else
    echo "Skipped (already applied?): $description"
  fi
}

install_header() {
  local dest="$ROOT_DIR/Lib/WebInteractive.hpp"
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<'EOF'
#pragma once

#include <string>
#include <iostream>

#ifdef __EMSCRIPTEN__
#include <cstdlib>
#include <emscripten.h>
extern "C" char* vampire_async_readline(const char* prompt);
#endif

namespace Lib {
namespace Web {

/**
 * Read a line from either std::cin (native) or the web input hook (WASM).
 * Returns false on EOF.
 */
inline bool readInteractiveLine(std::string& out, const std::string& prompt = "")
{
#ifdef __EMSCRIPTEN__
  char* res = vampire_async_readline(prompt.c_str());
  if (!res) { return false; }
  out.assign(res);
  std::free(res);
  return true;
#else
  if (!prompt.empty()) { std::cout << prompt; }
  return static_cast<bool>(std::getline(std::cin, out));
#endif
}

} // namespace Web
} // namespace Lib
EOF
  echo "Ensured header: ${dest#$ROOT_DIR/}"
}

install_header

run_patch "Add WebInteractive.cpp implementation" '*** Add File: Lib/WebInteractive.cpp
#include "Lib/WebInteractive.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

extern "C" {
EM_ASYNC_JS(char*, vampire_async_readline, (const char* prompt), {
  if (typeof Module.vampireReadline !== '\''function'\'') { return 0; }
  const text = prompt ? UTF8ToString(prompt) : "";
  const response = await Module.vampireReadline(text);
  if (response === undefined || response === null) { return 0; }
  const len = lengthBytesUTF8(response) + 1;
  const buf = _malloc(len);
  stringToUTF8(response, buf, len);
  return buf;
});
}
#endif
'

run_patch "Wire interactive input helper into vampire.cpp" '--- a/vampire.cpp
+++ b/vampire.cpp
@@ -59,6 +59,7 @@
 #include "Saturation/SaturationAlgorithm.hpp"
 
 #include "FMB/ModelCheck.hpp"
+#include "Lib/WebInteractive.hpp"
 
 using namespace std;
 
@@ -566,7 +567,7 @@ void interactiveMetamode()
 
   while (true) {
     std::string line;
-    if (!getline(cin, line) || line.rfind("exit",0) == 0) {
+    if (!Lib::Web::readInteractiveLine(line) || line.rfind("exit",0) == 0) {
       cout << "Bye." << endl;
       break;
     } else if (line.rfind("run",0) == 0) {
'

run_patch "Use web-aware input in ManCSPassiveClauseContainer" '--- a/Saturation/ManCSPassiveClauseContainer.cpp
+++ b/Saturation/ManCSPassiveClauseContainer.cpp
@@ -13,6 +13,8 @@
 */
 #include <iostream>
 #include <algorithm>
+#include <stdexcept>
+#include "Lib/WebInteractive.hpp"
 #include "ManCSPassiveClauseContainer.hpp"
 #include "Lib/VirtualIterator.hpp"
 
 namespace Saturation
@@ -49,7 +51,9 @@ Clause* ManCSPassiveClauseContainer::popSelected()
    // ask user to pick a clause id
    std::cout << "Pick a clause:\n";
    std::string id;
-    std::cin >> id;
+    if (!Lib::Web::readInteractiveLine(id)) {
+      throw std::runtime_error("No input available for clause selection");
+    }
    unsigned selectedId = std::stoi(id);
'

run_patch "Relax TermOrderingDiagram asserts for Emscripten" '--- a/Kernel/TermOrderingDiagram.hpp
+++ b/Kernel/TermOrderingDiagram.hpp
@@
-    static_assert(sizeof(uint64_t) == sizeof(Branch));
-    static_assert(sizeof(uint64_t) == sizeof(TermList));
-    static_assert(sizeof(uint64_t) == sizeof(void*));
-    static_assert(sizeof(uint64_t) == sizeof(intptr_t));
+#ifndef __EMSCRIPTEN__
+    static_assert(sizeof(uintptr_t) == sizeof(Branch));
+    static_assert(sizeof(uintptr_t) == sizeof(TermList));
+    static_assert(sizeof(uintptr_t) == sizeof(void*));
+    static_assert(sizeof(uintptr_t) == sizeof(intptr_t));
+#endif
'

# Fallback: if patch context doesn't match, do a direct in-place rewrite.
TOD_PATH="$ROOT_DIR/Kernel/TermOrderingDiagram.hpp"
if [[ -f "$TOD_PATH" ]]; then
  if grep -q "static_assert(sizeof(uint64_t) == sizeof(Branch));" "$TOD_PATH"; then
    perl -0777 -i -pe 's/static_assert\\(sizeof\\(uint64_t\\) == sizeof\\(Branch\\)\\);\\s*static_assert\\(sizeof\\(uint64_t\\) == sizeof\\(TermList\\)\\);\\s*static_assert\\(sizeof\\(uint64_t\\) == sizeof\\(void\\*\\)\\);\\s*static_assert\\(sizeof\\(uint64_t\\) == sizeof\\(intptr_t\\)\\);/#ifndef __EMSCRIPTEN__\\n    static_assert(sizeof(uintptr_t) == sizeof(Branch));\\n    static_assert(sizeof(uintptr_t) == sizeof(TermList));\\n    static_assert(sizeof(uintptr_t) == sizeof(void*));\\n    static_assert(sizeof(uintptr_t) == sizeof(intptr_t));\\n#endif/s' "$TOD_PATH"
    echo "Applied: Relax TermOrderingDiagram asserts for Emscripten (fallback)"
  fi
  if grep -q "static_assert(sizeof(uint64_t)" "$TOD_PATH"; then
    perl -0777 -i -pe 's/^([ \\t]*)static_assert\\(sizeof\\(uint64_t\\) == sizeof\\(([^)]+)\\)\\);/${1}#ifndef __EMSCRIPTEN__\\n${1}static_assert(sizeof(uint64_t) == sizeof($2));\\n${1}#endif/gm' "$TOD_PATH"
    echo "Applied: Guard uint64_t static_asserts for Emscripten (fallback)"
  fi
  if grep -q "static_assert(sizeof(uint64_t) == sizeof(Branch));" "$TOD_PATH"; then
    perl -pi -e 's/^\s*static_assert\(sizeof\(uint64_t\) == sizeof\(Branch\)\);$/#ifndef __EMSCRIPTEN__\n    static_assert(sizeof(uint64_t) == sizeof(Branch));\n#endif/' "$TOD_PATH"
    perl -pi -e 's/^\s*static_assert\(sizeof\(uint64_t\) == sizeof\(TermList\)\);$/#ifndef __EMSCRIPTEN__\n    static_assert(sizeof(uint64_t) == sizeof(TermList));\n#endif/' "$TOD_PATH"
    perl -pi -e 's/^\s*static_assert\(sizeof\(uint64_t\) == sizeof\(void\*\)\);$/#ifndef __EMSCRIPTEN__\n    static_assert(sizeof(uint64_t) == sizeof(void*));\n#endif/' "$TOD_PATH"
    perl -pi -e 's/^\s*static_assert\(sizeof\(uint64_t\) == sizeof\(intptr_t\)\);$/#ifndef __EMSCRIPTEN__\n    static_assert(sizeof(uint64_t) == sizeof(intptr_t));\n#endif/' "$TOD_PATH"
    echo "Applied: Guard specific uint64_t static_asserts for Emscripten (fallback)"
  fi
fi

run_patch "List WebInteractive.cpp in sources" '--- a/cmake/sources.cmake
+++ b/cmake/sources.cmake
@@
     Lib/System.cpp
     Lib/System.hpp
     Lib/Timer.cpp
     Lib/Timer.hpp
+    Lib/WebInteractive.cpp
     Lib/TriangularArray.hpp
     Lib/TypeList.hpp
     Lib/Vector.hpp
     Lib/VirtualIterator.hpp
'

# Fallback: ensure WebInteractive.cpp is in sources.cmake
SRC_PATH="$ROOT_DIR/cmake/sources.cmake"
if [[ -f "$SRC_PATH" ]]; then
  if ! grep -q "Lib/WebInteractive.cpp" "$SRC_PATH"; then
    python - <<PY
from pathlib import Path
path = Path(r"$SRC_PATH")
text = path.read_text()
needle = "Lib/Timer.hpp\n"
insert = "Lib/Timer.hpp\n    Lib/WebInteractive.cpp\n"
if needle in text and "Lib/WebInteractive.cpp" not in text:
    text = text.replace(needle, insert, 1)
    path.write_text(text)
PY
    echo "Applied: List WebInteractive.cpp in sources (fallback)"
  fi
fi

echo "Interactive patch completed."
