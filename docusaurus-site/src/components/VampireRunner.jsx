import React, { useState } from 'react';

/** ---------- Robust baseUrl detection ---------- */
const BASE_CACHE_KEY = 'vampireRunner.baseUrl';

async function headIsJs(url) {
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
  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return cached.endsWith('/') ? cached : cached + '/';

  const candidates = new Set();

  const docusaurusBase =
    typeof window !== 'undefined' &&
    window.__docusaurus &&
    window.__docusaurus.baseUrl;
  if (docusaurusBase) candidates.add(docusaurusBase);

  const baseTag =
    typeof document !== 'undefined' &&
    document.querySelector('base')?.getAttribute('href');
  if (baseTag) candidates.add(baseTag);

  const parts =
    typeof location !== 'undefined'
      ? location.pathname.split('/').filter(Boolean)
      : [];
  for (let i = parts.length; i >= 0; i--) {
    const prefix = '/' + parts.slice(0, i).join('/') + (i ? '/' : '');
    candidates.add(prefix || '/');
  }

  candidates.add('/vampireGuide/');
  candidates.add('/');

  for (const base0 of candidates) {
    const base = base0.endsWith('/') ? base0 : base0 + '/';
    const swOk = await headIsJs(base + 'coi-serviceworker.min.js');
    const glueOk = await headIsJs(base + 'vampire-runner/script.js');
    if (swOk && glueOk) {
      sessionStorage.setItem(BASE_CACHE_KEY, base);
      return base;
    }
  }

  throw new Error('Could not locate baseUrl that serves Vampire Runner assets.');
}

async function getWorkingBaseUrl() {
  const base = await findWorkingBaseUrl();
  return base.endsWith('/') ? base : base + '/';
}

export default function VampireRunner({
  showArgs = true,
  outputMaxHeight = '20rem',
  defaultProblem = '',       // 🔹 NEW PROP
}) {
  const [tptp, setTptp] = useState(defaultProblem);   // 🔹 start blank unless prop provided
  const [args, setArgs] = useState('');
  const [out, setOut] = useState('Ready.');

  async function onRun() {
    setOut('Running…');
    try {
      const base = await getWorkingBaseUrl();
      const mod = await import(/* webpackIgnore: true */ (base + 'vampire-runner/script.js'));
      const run = mod.runVampire || mod.default;
      if (typeof run !== 'function') {
        setOut('Error: runVampire() not found');
        return;
      }
      const result = await run({ tptp, args });
      setOut(result);
    } catch (e) {
      setOut(`Error: ${e?.message || e}`);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 980, margin: '0 auto' }}>
      <style>{`
        textarea{width:100%;height:18rem}
        // pre{white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:8px}
        .vampireRun{padding:.5rem .9rem}
        .row{display:flex;gap:16px;align-items:stretch}
        label{display:block;font-weight:600;margin:.4rem 0}
      `}</style>

      <div className="row">
        <div style={{ flex: 4 }}>
          <label htmlFor="tptp">TPTP problem</label>
          <textarea
            id="tptp"
            value={tptp}
            onChange={(e) => setTptp(e.target.value)}
            placeholder="Paste TPTP here..."
          />
        </div>

        {showArgs && (
          <div style={{ flex: 2 }}>
            <label htmlFor="args">Vampire command-line arguments</label>
            <textarea
              id="args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={`Example:\n  --proof on --time_limit 1`}
            />
          </div>
        )}
      </div>

      <p>
        <button class="vampireRun" onClick={onRun}>Run Vampire</button>
      </p>

      <pre id="out" style={{ maxHeight: outputMaxHeight, overflow: 'auto', marginTop: 0 }}>
        {out}
      </pre>
    </div>
  );
}
