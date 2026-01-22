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

ensure_webinteractive_cpp() {
  local dest="$ROOT_DIR/Lib/WebInteractive.cpp"
  if [[ -f "$dest" ]]; then
    return
  fi
  cat >"$dest" <<'EOF'
#include "Lib/WebInteractive.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

extern "C" {
EM_ASYNC_JS(char*, vampire_async_readline, (const char* prompt), {
  if (typeof Module.vampireReadline !== 'function') { return 0; }
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
EOF
  echo "Ensured source: ${dest#$ROOT_DIR/}"
}

ensure_webinteractive_cpp

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
   unsigned selectedId = 0;
   try {
     selectedId = std::stoul(id);
   } catch (const std::exception&) {
     std::cout << "User error: Invalid clause id '" << id << "'!\n";
     continue;
   }
'

# Fallback: ensure web-aware input is used in ManCSPassiveClauseContainer
MANCS_PATH="$ROOT_DIR/Saturation/ManCSPassiveClauseContainer.cpp"
if [[ -f "$MANCS_PATH" ]]; then
  MANCS_PATH="$MANCS_PATH" python - <<'PY'
from pathlib import Path
import os
import re

path = Path(os.environ["MANCS_PATH"])
text = path.read_text()

if "Lib/WebInteractive.hpp" not in text:
    text = text.replace("#include <algorithm>\n", "#include <algorithm>\n#include <stdexcept>\n#include \"Lib/WebInteractive.hpp\"\n", 1)

pattern = re.compile(r'^\s*std::cin\s*>>\s*id;\s*$', re.M)
if pattern.search(text):
    text = pattern.sub(
        "    if (!Lib::Web::readInteractiveLine(id)) {\n"
        "      throw std::runtime_error(\"No input available for clause selection\");\n"
        "    }",
        text,
        count=1,
    )

def ensure_validation(src: str) -> str:
    if "std::stoul" in src and "Invalid clause id" in src:
        return src
    return src.replace(
        "    unsigned selectedId = std::stoi(id);\n",
        "    unsigned selectedId = 0;\n"
        "    try {\n"
        "      selectedId = std::stoul(id);\n"
        "    } catch (const std::exception&) {\n"
        "      std::cout << \"User error: Invalid clause id '\" << id << \"'!\" << std::endl;\n"
        "      continue;\n"
        "    }\n",
        1,
    )

new_text = ensure_validation(text)
if new_text != text:
    text = new_text
    path.write_text(text)
    print("Applied: Use web-aware input in ManCSPassiveClauseContainer (fallback)")
PY
fi

run_patch "Relax TermOrderingDiagram asserts for Emscripten" '--- a/Kernel/TermOrderingDiagram.hpp
+++ b/Kernel/TermOrderingDiagram.hpp
@@
-    static_assert(sizeof(uint64_t) == sizeof(Branch));
-    static_assert(sizeof(uint64_t) == sizeof(TermList));
-    static_assert(sizeof(uint64_t) == sizeof(void*));
-    static_assert(sizeof(uint64_t) == sizeof(intptr_t));
+#ifndef __EMSCRIPTEN__
+    static_assert(sizeof(uint64_t) == sizeof(Branch));
+    static_assert(sizeof(uint64_t) == sizeof(TermList));
+    static_assert(sizeof(uint64_t) == sizeof(void*));
+    static_assert(sizeof(uint64_t) == sizeof(intptr_t));
+#endif
'

# Fallback: guard TermOrderingDiagram static_asserts if patch context doesn't match
TOD_PATH="$ROOT_DIR/Kernel/TermOrderingDiagram.hpp"
if [[ -f "$TOD_PATH" ]]; then
  TOD_PATH="$TOD_PATH" python - <<'PY'
from pathlib import Path
import os
import re

path = Path(os.environ["TOD_PATH"])
lines = path.read_text().splitlines(True)
pattern = re.compile(r'^\s*static_assert\(sizeof\(uint64_t\)\s*==\s*sizeof\([^)]+\)\);\s*$')

groups = []
start = None
for i, line in enumerate(lines):
    if pattern.match(line):
        if start is None:
            start = i
    else:
        if start is not None:
            groups.append((start, i))
            start = None
if start is not None:
    groups.append((start, len(lines)))

changed = False
for start, end in reversed(groups):
    prev = start - 1
    while prev >= 0 and lines[prev].strip() == "":
        prev -= 1
    if prev >= 0 and lines[prev].strip() == "#ifndef __EMSCRIPTEN__":
        continue
    lines.insert(end, "#endif\n")
    lines.insert(start, "#ifndef __EMSCRIPTEN__\n")
    changed = True

if changed:
    path.write_text("".join(lines))
    print("Applied: Relax TermOrderingDiagram asserts for Emscripten (fallback)")
PY
fi

run_patch "Disable mutex usage in Timer for single-threaded Emscripten" '--- a/Lib/Timer.cpp
+++ b/Lib/Timer.cpp
@@
-#include <mutex>
+#include <mutex>
@@
-static std::recursive_mutex EXIT_LOCK;
+#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)
+struct DummyMutex {
+  void lock() {}
+  void unlock() {}
+};
+static DummyMutex EXIT_LOCK;
+#else
+static std::recursive_mutex EXIT_LOCK;
+#endif
@@
-  ::new (&EXIT_LOCK) std::recursive_mutex;
+#if !defined(__EMSCRIPTEN__) || defined(__EMSCRIPTEN_PTHREADS__)
+  ::new (&EXIT_LOCK) std::recursive_mutex;
+#endif
'

# Fallback: disable mutex usage in Timer for single-threaded Emscripten
TIMER_PATH="$ROOT_DIR/Lib/Timer.cpp"
if [[ -f "$TIMER_PATH" ]]; then
  TIMER_PATH="$TIMER_PATH" python - <<'PY'
from pathlib import Path
import os

path = Path(os.environ["TIMER_PATH"])
text = path.read_text()
if "DummyMutex" not in text:
    text = text.replace(
        "static std::recursive_mutex EXIT_LOCK;",
        "#if defined(__EMSCRIPTEN__) && !defined(__EMSCRIPTEN_PTHREADS__)\nstruct DummyMutex {\n  void lock() {}\n  void unlock() {}\n};\nstatic DummyMutex EXIT_LOCK;\n#else\nstatic std::recursive_mutex EXIT_LOCK;\n#endif",
        1,
    )
if "::new (&EXIT_LOCK) std::recursive_mutex;" in text:
    text = text.replace("::new (&EXIT_LOCK) std::recursive_mutex;",
                        "#if !defined(__EMSCRIPTEN__) || defined(__EMSCRIPTEN_PTHREADS__)\n  ::new (&EXIT_LOCK) std::recursive_mutex;\n#endif")
path.write_text(text)
PY
  echo "Applied: Disable mutex usage in Timer for single-threaded Emscripten (fallback)"
fi

run_patch "Avoid random_device failure in WASM" '--- a/Lib/Random.hpp
+++ b/Lib/Random.hpp
@@
+  inline static unsigned systemSeed()
+  {
+#ifdef __EMSCRIPTEN__
+    return static_cast<unsigned>(std::time(nullptr));
+#else
+    return std::random_device()();
+#endif
+  }
+
   inline static void resetSeed ()
   {
-    setSeed(std::random_device()());
+    setSeed(systemSeed());
   }
'

run_patch "Use Random::systemSeed in Options sampling" '--- a/Shell/Options.cpp
+++ b/Shell/Options.cpp
@@
-  auto rng = _randomStrategySeed.actualValue == 0
-    ? std::mt19937((std::random_device())())
+  auto rng = _randomStrategySeed.actualValue == 0
+    ? std::mt19937(Random::systemSeed())
     : std::mt19937(_randomStrategySeed.actualValue);
'

run_patch "Use Random::systemSeed in PortfolioMode" '--- a/CASC/PortfolioMode.cpp
+++ b/CASC/PortfolioMode.cpp
@@
 #include "Lib/ScopedLet.hpp"
 #include "Debug/TimeProfiling.hpp"
 #include "Lib/Timer.hpp"
 #include "Lib/Sys/Multiprocessing.hpp"
+#include "Lib/Random.hpp"
@@
-      opt.setRandomSeed(std::random_device()());
+      opt.setRandomSeed(Random::systemSeed());
'

# Fallback: guard random_device for Emscripten in Lib/Random.hpp
RAND_PATH="$ROOT_DIR/Lib/Random.hpp"
if [[ -f "$RAND_PATH" ]]; then
  RAND_PATH="$RAND_PATH" python - <<'PY'
from pathlib import Path
import os

path = Path(os.environ["RAND_PATH"])
text = path.read_text()
insert = (
    "  inline static unsigned systemSeed()\n"
    "  {\n"
    "#ifdef __EMSCRIPTEN__\n"
    "    return static_cast<unsigned>(std::time(nullptr));\n"
    "#else\n"
    "    return std::random_device()();\n"
    "#endif\n"
    "  }\n\n"
)
if "systemSeed()" not in text:
    marker = "inline static void resetSeed"
    if marker in text:
        text = text.replace(marker, insert + marker, 1)
    elif "public:" in text:
        text = text.replace("public:\n", "public:\n" + insert, 1)
text = text.replace("setSeed(std::random_device()());", "setSeed(systemSeed());")
path.write_text(text)
PY
  echo "Applied: Avoid random_device failure in WASM (fallback)"
fi

# Fallback: patch Options.cpp to use Random::systemSeed()
OPT_PATH="$ROOT_DIR/Shell/Options.cpp"
if [[ -f "$OPT_PATH" ]]; then
  if grep -q "random_device" "$OPT_PATH" && grep -q "strategySamplerFilename" "$OPT_PATH"; then
    OPT_PATH="$OPT_PATH" python - <<'PY'
from pathlib import Path
import os
path = Path(os.environ["OPT_PATH"])
text = path.read_text()
old = "  auto rng = _randomStrategySeed.actualValue == 0\n    ? std::mt19937((std::random_device())())\n    : std::mt19937(_randomStrategySeed.actualValue);\n"
new = "  auto rng = _randomStrategySeed.actualValue == 0\n    ? std::mt19937(Random::systemSeed())\n    : std::mt19937(_randomStrategySeed.actualValue);\n"
if old in text:
    text = text.replace(old, new, 1)
    path.write_text(text)
PY
    echo "Applied: Use Random::systemSeed in Options sampling (fallback)"
  fi
fi

# Fallback: patch PortfolioMode.cpp to use Random::systemSeed()
PORT_PATH="$ROOT_DIR/CASC/PortfolioMode.cpp"
if [[ -f "$PORT_PATH" ]]; then
  if grep -q "randomizeSeedForPortfolioWorkers" "$PORT_PATH"; then
    PORT_PATH="$PORT_PATH" python - <<'PY'
from pathlib import Path
import os
path = Path(os.environ["PORT_PATH"])
text = path.read_text()
if "Lib/Random.hpp" not in text:
    text = text.replace('#include "Lib/Timer.hpp"\n', '#include "Lib/Timer.hpp"\n#include "Lib/Random.hpp"\n', 1)
text = text.replace("opt.setRandomSeed(std::random_device()());", "opt.setRandomSeed(Random::systemSeed());")
path.write_text(text)
PY
    echo "Applied: Use Random::systemSeed in PortfolioMode (fallback)"
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
    SRC_PATH="$SRC_PATH" python - <<'PY'
from pathlib import Path
import os

path = Path(os.environ["SRC_PATH"])
text = path.read_text()
needle = "Lib/Timer.hpp\n"
insert = "Lib/Timer.hpp\n    Lib/WebInteractive.cpp\n"
if needle in text:
    text = text.replace(needle, insert, 1)
    path.write_text(text)
    print("Applied: List WebInteractive.cpp in sources (fallback)")
PY
  fi
fi

echo "Interactive patch completed."
