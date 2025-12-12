// static/vampire-runner/script.js

const BASE_CACHE_KEY = 'vampireRunner.baseUrl';

function ensureSlash(path) {
  return path.endsWith('/') ? path : path + '/';
}

function getBaseUrl() {
  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return ensureSlash(cached);

  const candidates = [];
  const docusaurusBase = typeof window !== 'undefined' && window.__docusaurus && window.__docusaurus.baseUrl;
  if (docusaurusBase) candidates.push(docusaurusBase);

  const baseTag = typeof document !== 'undefined' ? document.querySelector('base')?.getAttribute('href') : null;
  if (baseTag) candidates.push(baseTag);

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
export async function runVampireRaw({ tptp, args, onStdout, onStderr, requestInput }) {
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

  const Module = {
    noInitialRun: true,
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
    vampireReadline: requestInput
      ? (prompt) => Promise.resolve(requestInput(String(prompt ?? '')))
      : undefined,
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

    try { mod.FS.mkdir('/work'); } catch {}
    mod.FS.writeFile('/work/input.p', new TextEncoder().encode(String(tptp ?? '')));

    const argv = parseArgs(String(args ?? ''));
    if (!argv.some(x => x.endsWith('.p') || x.startsWith('/'))) {
      argv.push('/work/input.p');
    }

    const runner = mod.Asyncify?.handleAsync
      ? mod.Asyncify.handleAsync(() => mod.callMain(argv))
      : mod.callMain(argv);

    try {
      const ret = await runner;
      finish(typeof ret === 'number' ? ret : 0);
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
