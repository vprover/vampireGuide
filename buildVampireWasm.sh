#!/usr/bin/env bash
set -euo pipefail

VAMPIRE_DIR=${VAMPIRE_DIR:-vampire}
# Pin to a known-good commit for reproducible builds; override via env if needed.
VAMPIRE_REF=${VAMPIRE_REF:-5a7e9a5e82bc89aa8303ae5033d1d22b555c6fd7}
VAMPIRE_RECLONE=${VAMPIRE_RECLONE:-0}

# 1. Clone the Vampire repo if not already present
if [[ "$VAMPIRE_RECLONE" == "1" && -d "$VAMPIRE_DIR" ]]; then
  echo "Removing existing '$VAMPIRE_DIR' for a clean clone..."
  rm -rf "$VAMPIRE_DIR"
fi

if [[ ! -d "$VAMPIRE_DIR" ]]; then
  echo "Cloning Vampire ($VAMPIRE_REF)..."
  git clone https://github.com/vprover/vampire.git "$VAMPIRE_DIR"
  if [[ -n "$VAMPIRE_REF" ]]; then
    git -C "$VAMPIRE_DIR" checkout "$VAMPIRE_REF"
  fi
else
  echo "Repo '$VAMPIRE_DIR' already exists, using it as-is."
  if [[ -n "$VAMPIRE_REF" ]]; then
    current_ref=$(git -C "$VAMPIRE_DIR" rev-parse HEAD)
    if [[ "$current_ref" != "$VAMPIRE_REF" ]]; then
      echo "Warning: '$VAMPIRE_DIR' is at $current_ref, expected $VAMPIRE_REF."
      echo "Set VAMPIRE_RECLONE=1 to reclone a clean copy at the pinned ref."
    fi
  fi
fi

BUILD_DIR=${BUILD_DIR:-build-ems}

# 2. Copy smallWasmBuild.sh into the repo
echo "Copying smallWasmBuild.sh..."
cp -f smallWasmBuild.sh "$VAMPIRE_DIR"/

# 3. Apply patch/edit script to CMakeLists.txt
echo "Editing CMakeLists.txt..."
./editCMakeLists.sh "$VAMPIRE_DIR"/CMakeLists.txt

# 3b. Apply interactive stdin/stdout hooks for the WASM build
echo "Applying interactive WASM patch..."
./patchVampireInteractive.sh "$VAMPIRE_DIR"

# 4. cd into vampire
cd "$VAMPIRE_DIR"

# 5. Run build script
echo "Running smallWasmBuild.sh..."
chmod +x smallWasmBuild.sh
BUILD_DIR="$BUILD_DIR" ./smallWasmBuild.sh

# 6. Copy build artifacts back to parent directory
echo "Copying build artifacts..."
cp "$BUILD_DIR"/vampire.js "$BUILD_DIR"/vampire.wasm ../docusaurus-site/static/vampire-runner/

echo "Done! Built files are in docusaurus-site/static/vampire-runner."

echo "Patching generated vampire.js for memory64 BigInt interop..."
python - <<'PY'
from pathlib import Path

def patch_file(path: Path):
    if not path.exists():
        return
    text = path.read_text()

    utf_old = 'var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>{assert(typeof ptr=="number",`UTF8ToString expects a number (got ${typeof ptr})`);return ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):""};'
    utf_new = "var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>{if(typeof ptr==='bigint'){ptr=Number(ptr);}else if(typeof ptr!=='number'){assert(false,`UTF8ToString expects a number (got ${typeof ptr})`);}return ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):\"\"};"
    if utf_old in text:
        text = text.replace(utf_old, utf_new, 1)

    ptr_old = 'var ptrToString=ptr=>{assert(typeof ptr==="number");if(ptr<0)ptr=2n**64n+BigInt(ptr);return"0x"+ptr.toString(16).padStart(16,"0")};'
    ptr_new = 'var ptrToString=ptr=>{if(typeof ptr==="bigint"){if(ptr<0)ptr+=2n**64n;}else if(typeof ptr==="number"){ptr=ptr<0?2n**64n+BigInt(ptr):BigInt(ptr);}else{assert(false,`ptrToString expects a number/bigint (got ${typeof ptr})`);}return"0x"+ptr.toString(16).padStart(16,"0")};'
    if ptr_old in text:
        text = text.replace(ptr_old, ptr_new, 1)

    # Wrap invoke_* indices to avoid BigInt table lookups exploding in JS.
    if "__ensureSafeWasmInvokes" not in text:
        snippet = """
// Injected: sanitize invoke_* indices for memory64/BigInt
let __wasmTableLenSnapshot = 0;
function __sanitizeWasmInvokeIndex(value){
  const len = (typeof wasmTable!=='undefined' && typeof wasmTable.length==='number') ? wasmTable.length : (__wasmTableLenSnapshot||0);
  if(len<=0){
    try{return Number(value);}catch(_ignore){return 0;}
  }
  __wasmTableLenSnapshot = len;
  let num;
  if(typeof value==='bigint'){
    const mod = value % BigInt(len);
    num = Number(mod < 0n ? mod + BigInt(len) : mod);
  }else{
    try{num=Number(value);}catch(_ignore){num=0;}
  }
  num = num % len;
  if(num<0) num += len;
  if(!Number.isFinite(num)){num=0;}
  return Math.trunc(num);
}
function __wrapWasmInvoke(imports,name){
  const original = imports[name];
  if(typeof original!=='function' || original.__wasmInvokeSanitized){
    return;
  }
  const wrapper = function(index,...rest){
    const sanitized = __sanitizeWasmInvokeIndex(index);
    return original.call(this,sanitized,...rest);
  };
  wrapper.__wasmInvokeSanitized = true;
  wrapper.isAsync = original.isAsync;
  imports[name] = wrapper;
}
function __ensureSafeWasmInvokes(imports){
  Object.keys(imports).forEach(name=>{
    if(name.startsWith('invoke_')){
      __wrapWasmInvoke(imports,name);
    }
  });
}
"""
        idx = text.find("function invoke_")
        if idx != -1:
            text = text[:idx] + snippet + text[idx:]

    get_imports = "function getWasmImports(){Asyncify.instrumentWasmImports(wasmImports);return{env:wasmImports,wasi_snapshot_preview1:wasmImports}}"
    get_with_ensure = "function getWasmImports(){Asyncify.instrumentWasmImports(wasmImports);__ensureSafeWasmInvokes(wasmImports);return{env:wasmImports,wasi_snapshot_preview1:wasmImports}}"
    if get_imports in text:
        text = text.replace(get_imports, get_with_ensure, 1)
    elif "function getWasmImports()" in text and "__ensureSafeWasmInvokes" in text:
        # best-effort regex swap
        import re
        text = re.sub(r"function getWasmImports\\(\\)\\{[^}]*Asyncify\\.instrumentWasmImports\\(wasmImports\\);return\\{env:wasmImports,wasi_snapshot_preview1:wasmImports}}",
                      get_with_ensure, text, count=1)

    ri_old = 'wasmTable=wasmExports["__indirect_function_table"];assert(wasmTable,"table not found in wasm exports");assignWasmExports(wasmExports);return wasmExports}'
    ri_new = 'wasmTable=wasmExports["__indirect_function_table"];assert(wasmTable,"table not found in wasm exports");__wasmTableLenSnapshot=wasmTable.length||__wasmTableLenSnapshot;__ensureSafeWasmInvokes(wasmImports);assignWasmExports(wasmExports);return wasmExports}'
    if ri_old in text and "__ensureSafeWasmInvokes" in text:
        text = text.replace(ri_old, ri_new, 1)

    path.write_text(text)
    print(f"Patched {path}")

for rel in ["vampire.js", "../docusaurus-site/static/vampire-runner/vampire.js"]:
    patch_file(Path(rel))
PY
