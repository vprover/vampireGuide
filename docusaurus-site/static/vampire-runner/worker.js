// static/vampire-runner/worker.js
let pendingInputResolve = null;

function requestInput(prompt) {
  return new Promise((resolve) => {
    pendingInputResolve = resolve;
    self.postMessage({ type: 'requestInput', prompt });
  });
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'input') {
    if (pendingInputResolve) {
      pendingInputResolve(String(msg.value ?? ''));
      pendingInputResolve = null;
    }
    return;
  }
  if (msg.type === 'run') {
    runOnce(msg).catch((e) => {
      const detail = e?.stack || e?.message || String(e);
      self.postMessage({ type: 'fatal', message: 'FATAL: ' + detail });
    });
  }
};

async function runOnce({ tptp, argv }) {
  const base = new URL('.', import.meta.url).href;
  const createVampire = (await import('./vampire.js')).default;

  const stdoutBuf = [];
  const stderrBuf = [];
  let resolved = false;
  const finish = (code) => {
    if (resolved) return;
    resolved = true;
    self.postMessage({ type: 'done', code, stdout: stdoutBuf.join('\n'), stderr: stderrBuf.join('\n') });
  };

  const stdin = () => null;
  const Module = {
    noInitialRun: true,
    noExitRuntime: true,
    locateFile: (path) => base + path,
    mainScriptUrlOrBlob: base + 'vampire.js',
    print: (s) => {
      const msg = String(s);
      stdoutBuf.push(msg);
      self.postMessage({ type: 'stdout', data: msg });
    },
    printErr: (s) => {
      const msg = String(s);
      stderrBuf.push(msg);
      self.postMessage({ type: 'stderr', data: msg });
    },
    vampireReadline: (prompt) => requestInput(String(prompt ?? '')),
    stdin,
    input: stdin,
    onExit: (code) => finish(code),
    onAbort: (what) => {
      const msg = String(what ?? 'abort');
      stderrBuf.push(msg);
      self.postMessage({ type: 'stderr', data: msg });
      finish(-1);
    }
  };

  const mod = await createVampire(Module);

  try { mod.FS.mkdir('/work'); } catch {}
  mod.FS.writeFile('/work/input.p', new TextEncoder().encode(String(tptp ?? '')));

  const args = Array.isArray(argv) ? argv.slice() : [];
  if (!args.some(x => x.endsWith('.p') || x.startsWith('/'))) {
    args.push('/work/input.p');
  }

  const ret = mod.callMain(args);
  try {
    const awaited = ret && typeof ret.then === 'function' ? await ret : ret;
    if (!Module.noExitRuntime) {
      finish(typeof awaited === 'number' ? awaited : 0);
    }
  } catch (e) {
    if (e && e.name === 'ExitStatus' && typeof e.status === 'number') {
      finish(e.status);
    } else {
      throw e;
    }
  }
}
