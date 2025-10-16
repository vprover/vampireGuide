#!/usr/bin/env bash
set -euo pipefail

# 1. Clone the Vampire repo if not already present
if [[ ! -d vampire ]]; then
  echo "Cloning Vampire..."
  git clone https://github.com/vprover/vampire.git
else
  echo "Repo 'vampire' already exists, skipping clone."
fi

# 2. Copy smallWasmBuild.sh into the repo
echo "Copying smallWasmBuild.sh..."
cp -f smallWasmBuild.sh vampire/

# 3. Apply patch/edit script to CMakeLists.txt
echo "Editing CMakeLists.txt..."
./editCMakeLists.sh vampire/CMakeLists.txt

# 4. cd into vampire
cd vampire

# 5. Run build script
echo "Running smallWasmBuild.sh..."
chmod +x smallWasmBuild.sh
./smallWasmBuild.sh

# 6. Copy build artifacts back to parent directory
echo "Copying build artifacts..."
cp build-ems64/vampire.js build-ems64/vampire.wasm ../docusaurus-site/static/vampire-runner/

echo "Done! Built files are in docusaurus-site/static/vampire-runner."

