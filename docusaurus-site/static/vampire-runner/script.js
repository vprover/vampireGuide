// static/vampire-runner/script.js

const BASE_CACHE_KEY = 'vampireRunner.baseUrl.v2';

function ensureSlash(path) {
  return path.endsWith('/') ? path : path + '/';
}

function getBaseUrl() {
  const candidates = [];
  const docusaurusBase = typeof window !== 'undefined' && window.__docusaurus && window.__docusaurus.baseUrl;
  if (docusaurusBase) {
    const base = ensureSlash(docusaurusBase);
    sessionStorage.setItem(BASE_CACHE_KEY, base);
    return base;
  }

  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return ensureSlash(cached);

  const baseTag = typeof document !== 'undefined' ? document.querySelector('base')?.getAttribute('href') : null;
  if (baseTag) candidates.push(baseTag);

  // Prefer the known site root before falling back to the current page path (e.g. /docs/)
  candidates.push('/vampireGuide/');

  if (typeof location !== 'undefined') {
    candidates.push(new URL('./', location.href).pathname);
  }

  candidates.push('/');

  const seen = new Set();
  const normalized = candidates
    .map(ensureSlash)
    .filter(p => (seen.has(p) ? false : (seen.add(p), true)));

  const base = normalized[0] || '/';
  sessionStorage.setItem(BASE_CACHE_KEY, base);
  return base;
}

// ---------- argv helpers ----------
export function parseArgs(str) {
  const argv = [];
  let i = 0, cur = '', q = null;
  while (i < str.length) {
    const ch = str[i++];
    if (q) {
      if (ch === q) q = null;
      else if (ch === '\\' && i < str.length) cur += str[i++];
      else cur += ch;
    } else {
      if (ch === '"' || ch === "'") q = ch;
      else if (/\s/.test(ch)) { if (cur) { argv.push(cur); cur = ''; } }
      else cur += ch;
    }
  }
  if (cur) argv.push(cur);
  return argv;
}

export function shellQuote(argv) {
  return argv.map(a =>
    /^[A-Za-z0-9@%_+=:,./-]+$/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'"
  ).join(' ');
}

// ---------- Runner APIs ----------
function isTruthy(val) {
  if (val == null) return false;
  const v = String(val).toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function readBoolArg(argv, i) {
  const next = argv[i + 1];
  if (next == null || String(next).startsWith('-')) {
    return true;
  }
  return isTruthy(next);
}

function isInteractiveArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--manual_cs') {
      return readBoolArg(argv, i);
    }
    if (argv[i] === '--interactive') {
      return readBoolArg(argv, i);
    }
  }
  return false;
}

function buildArgv(tptp, args) {
  const argv = parseArgs(String(args ?? ''));
  if (!argv.some(x => x.endsWith('.p') || x.startsWith('/'))) {
    argv.push('/work/input.p');
  }
  return argv;
}

async function runVampireInWorker({ tptp, args, onStdout, onStderr, requestInput, onReady }) {
  const base = getBaseUrl();
  const workerUrl = base + 'vampire-runner/worker.js';
  const worker = new Worker(workerUrl, { type: 'module' });

  const stdoutBuf = [];
  const stderrBuf = [];
  let resolveRun;
  let resolved = false;
  const done = new Promise((resolve) => (resolveRun = resolve));
  const finish = (code) => {
    if (resolved) return;
    resolved = true;
    resolveRun({
      stdout: stdoutBuf.join('\n'),
      stderr: stderrBuf.join('\n'),
      code
    });
  };

  worker.onmessage = async (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'stdout') {
      const line = String(msg.data ?? '');
      stdoutBuf.push(line);
      onStdout?.(line);
      return;
    }
    if (msg.type === 'stderr') {
      const line = String(msg.data ?? '');
      stderrBuf.push(line);
      onStderr?.(line);
      return;
    }
    if (msg.type === 'requestInput') {
      if (typeof requestInput !== 'function') {
        worker.postMessage({ type: 'input', value: '' });
        return;
      }
      try {
        const answer = await requestInput(String(msg.prompt ?? ''));
        worker.postMessage({ type: 'input', value: answer ?? '' });
      } catch {
        worker.postMessage({ type: 'input', value: '' });
      }
      return;
    }
    if (msg.type === 'done') {
      finish(typeof msg.code === 'number' ? msg.code : 0);
      worker.terminate();
      return;
    }
    if (msg.type === 'fatal') {
      const line = String(msg.message ?? 'FATAL');
      stderrBuf.push(line);
      onStderr?.(line);
      finish(-1);
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    const line = String(err?.message || err);
    stderrBuf.push(line);
    onStderr?.(line);
    finish(-1);
    worker.terminate();
  };

  const argv = buildArgv(tptp, args);
  const canReadline = typeof requestInput === 'function';
  const interactive = isInteractiveArgs(argv) && canReadline;
  worker.postMessage({
    type: 'run',
    tptp: String(tptp ?? ''),
    argv,
    interactive,
    enableReadline: canReadline
  });

  if (typeof onReady === 'function') {
    onReady({
      cancel: () => {
        if (!resolved) {
          finish(-1);
        }
        worker.terminate();
      }
    });
  }

  return done;
}

export async function runVampireRaw({ tptp, args, onStdout, onStderr, requestInput, onReady }) {
  if (typeof Worker !== 'undefined') {
    return runVampireInWorker({ tptp, args, onStdout, onStderr, requestInput, onReady });
  }
  const base = getBaseUrl();

  const glueUrl = base + 'vampire-runner/vampire.js';
  const createVampire = (await import(/* webpackIgnore: true */ glueUrl)).default;

  const stdoutBuf = [];
  const stderrBuf = [];
  let resolveRun;
  let resolved = false;
  const done = new Promise((resolve) => (resolveRun = resolve));
  const finish = (code) => {
    if (resolved) return;
    resolved = true;
    resolveRun({
      stdout: stdoutBuf.join('\n'),
      stderr: stderrBuf.join('\n'),
      code
    });
  };

  const argv = buildArgv(tptp, args);
  const canReadline = typeof requestInput === 'function';
  const isInteractive = isInteractiveArgs(argv) && canReadline;
  let inputPending = false;
  const stdin = () => null;
  const Module = {
    noInitialRun: true,
    noExitRuntime: false,
    locateFile: (path) => base + 'vampire-runner/' + path,
    print:  (s) => {
      const msg = String(s);
      stdoutBuf.push(msg);
      onStdout?.(msg);
    },
    printErr: (s) => {
      const msg = String(s);
      stderrBuf.push(msg);
      onStderr?.(msg);
    },
    vampireReadline: canReadline
      ? async (prompt) => {
          inputPending = true;
          try {
            return await Promise.resolve(requestInput(String(prompt ?? '')));
          } finally {
            inputPending = false;
          }
        }
      : undefined,
    stdin,
    input: stdin,
    onExit: (code) => finish(code),
    onAbort: (what) => {
      const msg = String(what ?? 'abort');
      stderrBuf.push(msg);
      onStderr?.(msg);
      finish(-1);
    }
  };

  try {
    const mod = await createVampire(Module);
    if (typeof onReady === 'function') {
      onReady(mod);
    }

    try { mod.FS.mkdir('/work'); } catch {}
    mod.FS.writeFile('/work/input.p', new TextEncoder().encode(String(tptp ?? '')));

    const ret = mod.callMain(argv);
    try {
      const awaited = ret && typeof ret.then === 'function' ? await ret : ret;
      if (!isInteractive || !inputPending) {
        finish(typeof awaited === 'number' ? awaited : 0);
      }
    } catch (e) {
      if (e && e.name === 'ExitStatus' && typeof e.status === 'number') {
        finish(e.status);
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e && e.name === 'ExitStatus' && typeof e.status === 'number') {
      finish(e.status);
    } else {
      const detail = e?.stack || e?.message || String(e);
      const msg = 'FATAL: ' + detail;
      stderrBuf.push(msg);
      onStderr?.(msg);
      finish(-1);
    }
  }

  return done;
}

export async function runVampire({ tptp, args, onStdout, onStderr, requestInput }) {
  const { stdout, stderr, code } = await runVampireRaw({ tptp, args, onStdout, onStderr, requestInput });
  const combined = [stdout, stderr].filter(Boolean).join('\n');
  return combined || `(exit ${code})`;
}

export function clearBaseUrlCache() {
  sessionStorage.removeItem(BASE_CACHE_KEY);
}
