// static/vampire-runner/script.js

// ---------- Base URL detection (robust) ----------
const BASE_CACHE_KEY = 'vampireRunner.baseUrl';

async function urlLooksJs(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    return /javascript|ecmascript/.test(ct);
  } catch {
    return false;
  }
}

async function findWorkingBaseUrl() {
  // 1) cached
  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return cached.endsWith('/') ? cached : cached + '/';

  // 2) obvious candidates
  const candidates = [];

  // from Docusaurus
  const docusaurusBase = (window.__docusaurus && window.__docusaurus.baseUrl) || null;
  if (docusaurusBase) candidates.push(docusaurusBase);

  // <base href>
  const baseTag = document.querySelector('base')?.getAttribute('href');
  if (baseTag) candidates.push(baseTag);

  // current path prefixes (e.g., '/', '/vampireGuide/', '/vampireGuide/docs/')
  const path = location.pathname;
  const parts = path.split('/').filter(Boolean); // e.g., ['vampireGuide', 'docs', 'page']
  const prefixes = ['/' ];
  for (let i = 0; i < parts.length; i++) {
    const prefix = '/' + parts.slice(0, i + 1).join('/') + '/';
    prefixes.push(prefix);
  }
  // Prefer longest first (most specific), then shorter
  prefixes.reverse().forEach(p => { if (!candidates.includes(p)) candidates.push(p); });

  // ensure trailing slash + unique
  const seen = new Set();
  const normalized = candidates
    .map(b => (b.endsWith('/') ? b : b + '/'))
    .filter(b => (seen.has(b) ? false : (seen.add(b), true)));

  // 3) probe each: require SW AND glue to be reachable
  for (const base of normalized) {
    const swOk   = await urlLooksJs(base + 'coi-serviceworker.min.js');
    const glueOk = await urlLooksJs(base + 'vampire-runner/vampire.js');
    if (swOk && glueOk) {
      sessionStorage.setItem(BASE_CACHE_KEY, base);
      return base;
    }
  }

  // 4) last resort: try the most likely two explicitly
  const fallbacks = ['/', '/vampireGuide/'];
  for (const b of fallbacks) {
    const swOk   = await urlLooksJs(b + 'coi-serviceworker.min.js');
    const glueOk = await urlLooksJs(b + 'vampire-runner/vampire.js');
    if (swOk && glueOk) {
      sessionStorage.setItem(BASE_CACHE_KEY, b);
      return b;
    }
  }

  throw new Error('Could not locate baseUrl that serves coi-serviceworker.min.js and vampire-runner/vampire.js');
}

async function getBaseUrl() {
  const base = await findWorkingBaseUrl();
  return base.endsWith('/') ? base : base + '/';
}

// ---------- COI (cross-origin isolation) ----------
async function ensureCOI() {
  if (self.crossOriginIsolated) return;

  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers unavailable; cannot enable crossOriginIsolated.');
  }

  const base = await getBaseUrl();
  const swUrl = base + 'coi-serviceworker.min.js';
  const FLAG = 'coi-reloaded-once';

  // sanity check (already done in finder, but keep for clarity)
  const ok = await urlLooksJs(swUrl);
  if (!ok) throw new Error(`COI SW not found at ${swUrl}`);

  await navigator.serviceWorker.register(swUrl, { scope: base });
  await navigator.serviceWorker.ready;

  // If this load isn’t yet controlled, reload once so COOP/COEP apply
  if (!navigator.serviceWorker.controller && !sessionStorage.getItem(FLAG)) {
    sessionStorage.setItem(FLAG, '1');
    location.reload();
    await new Promise(() => {}); // never returns
  }

  if (!self.crossOriginIsolated) {
    throw new Error('Not crossOriginIsolated after SW registration. Check console for COEP-blocked assets.');
  }
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
export async function runVampireRaw({ tptp, args }) {
  // 1) Ensure COI and discover correct baseUrl
  await ensureCOI();
  const base = await getBaseUrl();

  // 2) Import Emscripten glue straight from /static, bypass bundler
  const glueUrl = base + 'vampire-runner/vampire.js';
  const createVampire = (await import(/* webpackIgnore: true */ glueUrl)).default;

  let stdoutBuf = [];
  let stderrBuf = [];
  let resolveRun;
  const done = new Promise((resolve) => (resolveRun = resolve));

  const Module = {
    noInitialRun: true,

    // Make sure wasm/pthread worker resolve relative to our static folder
    locateFile: (path) => base + 'vampire-runner/' + path,

    // Helps pthread workers derive the main script URL correctly
    mainScriptUrlOrBlob: glueUrl,

    print:  (s) => stdoutBuf.push(String(s)),
    printErr: (s) => stderrBuf.push(String(s)),
    onExit: (code) => {
      resolveRun({
        stdout: stdoutBuf.join('\n'),
        stderr: '',
        // stderr: stderrBuf.join('\n'), // <-- stderr is hidden...this hides errors about webassembly that aren't really errors from vampire.
        code
      });
    },
  };

  try {
    const mod = await createVampire(Module);

    // Ensure /work exists
    try { mod.FS.mkdir('/work'); } catch {}

    // Write input file
    mod.FS.writeFile('/work/input.p', new TextEncoder().encode(String(tptp ?? '')));

    // Build argv; ensure positional file present
    const argv = parseArgs(String(args ?? ''));
    if (!argv.some(x => x.endsWith('.p') || x.startsWith('/'))) {
      argv.push('/work/input.p');
    }

    try {
      mod.callMain(argv);
    } catch {
      // Some builds throw on non-zero exit; output still delivered via onExit
    }
  } catch (e) {
    resolveRun({
      stdout: '',
      stderr: 'FATAL: ' + (e?.message || String(e)),
      code: -1
    });
  }

  return done;
}

export async function runVampire({ tptp, args }) {
  const { stdout, stderr } = await runVampireRaw({ tptp, args });
  const combined = [stdout, stderr].filter(Boolean).join('\n');
  return combined || '(no output)';
}

// ---------- Utilities: reset cached base if needed ----------
export function clearBaseUrlCache() {
  sessionStorage.removeItem(BASE_CACHE_KEY);
}
