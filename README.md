# <a href="https://vprover.github.io/vampireGuide">Vampire Guide</a>

This repository contains source code and documentation for VampireGuide,
an online platform for the first-order theorem prover Vampire.



---
### Web Assembly (WASM) build of Vampire:
- `buildVampireWasm.sh` clones the <a href="https://github.com/vprover/vampire">vampire repository</a> and uses these scripts to finish building the `vampire.wasm` and `vampire.js` files
  - `editCMakeLists.sh` - edits the CMakeLists.txt cmake vampire build file to support Emscripten/WASM build.
  - `smallWasmBuild.sh` - runs emcmake to build a wasm version of vampire for running in the browser.
- `vampire-runner.js` provides the user-friendly JS interface for calling Vampire in the browser.
