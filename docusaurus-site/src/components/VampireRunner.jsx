// src/components/VampireRunner.jsx
import React, {useEffect, useRef, useState} from 'react';

/** ---------------------- Utilities ---------------------- **/

// Tiny helper to (re)highlight an element when Prism is available
function highlightNowOrWhenReady(el) {
  if (!el) return;
  const tryHl = () => {
    if (window.Prism && typeof window.Prism.highlightElement === 'function') {
      window.Prism.highlightElement(el);
    }
  };
  // try immediately and also on load (covers deferred script order)
  tryHl();
  window.addEventListener('load', tryHl, { once: true });
}

// Find a base URL that serves your runner assets (coi-serviceworker + script.js).
// If you already solved this elsewhere, you can swap this out.
const BASE_CACHE_KEY = 'vampireRunner.baseUrl';
async function headIsJs(url){
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    return /javascript|ecmascript/.test(ct);
  } catch { return false; }
}
async function findWorkingBaseUrl(){
  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return cached.endsWith('/') ? cached : cached + '/';

  const candidates = new Set();
  const docusaurusBase = typeof window!=='undefined' && window.__docusaurus && window.__docusaurus.baseUrl;
  if (docusaurusBase) candidates.add(docusaurusBase);

  const baseTag = typeof document!=='undefined' && document.querySelector('base')?.getAttribute('href');
  if (baseTag) candidates.add(baseTag);

  const parts = typeof location!=='undefined' ? location.pathname.split('/').filter(Boolean) : [];
  for (let i=parts.length; i>=0; i--) {
    const prefix = '/' + parts.slice(0, i).join('/') + (i ? '/' : '');
    candidates.add(prefix || '/');
  }
  // common guesses
  candidates.add('/vampireGuide/');
  candidates.add('/');

  for (const base0 of candidates) {
    const base = base0.endsWith('/') ? base0 : base0 + '/';
    const swOk   = await headIsJs(base + 'coi-serviceworker.min.js');
    const glueOk = await headIsJs(base + 'vampire-runner/script.js');
    if (swOk && glueOk) {
      sessionStorage.setItem(BASE_CACHE_KEY, base);
      return base;
    }
  }
  throw new Error('Could not locate baseUrl that serves Vampire Runner assets.');
}
async function getWorkingBaseUrl(){
  const base = await findWorkingBaseUrl();
  return base.endsWith('/') ? base : base + '/';
}

/** ---------------------- LiveCode (Prism-Live editor) ---------------------- **/

function LiveCode({ value, onChange, className = 'language-tptp', minHeight = '18rem' }) {
  const codeRef = useRef(null);

  // Initialize content, and keep in sync with external changes
  useEffect(() => {
    if (!codeRef.current) return;
    const current = codeRef.current.textContent ?? '';
    if (current !== (value || '')) {
      codeRef.current.textContent = value || '';
      if (typeof window !== 'undefined') {
        highlightNowOrWhenReady(codeRef.current);
      }
    }
  }, [value]);

  // Bubble edits up
  function handleInput() {
    if (!codeRef.current) return;
    onChange(codeRef.current.textContent);
  }

  return (
    <pre
      className={`prism-live ${className}`}
      style={{ minHeight, margin: 0 }}
    >
      <code
        ref={codeRef}
        contentEditable
        spellCheck={false}
        onInput={handleInput}
        style={{ outline: 'none', display: 'block', whiteSpace: 'pre' }}
      />
    </pre>
  );
}

/** ---------------------- Main Component ---------------------- **/

export default function VampireRunner({
  showArgs = true,
  outputMaxHeight = '20rem',
  defaultProblem = `fof(a, axiom, p).
fof(b, conjecture, p).`,
  outputLanguage = 'tptp',
}) {
  const [tptp, setTptp]   = useState(defaultProblem);
  const [args, setArgs]   = useState('--proof on --time_limit 1');
  const [out, setOut]     = useState('Ready.');
  const outCodeRef        = useRef(null);

  // Re-highlight output whenever it changes (or when Prism arrives)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    highlightNowOrWhenReady(outCodeRef.current);
  }, [out, outputLanguage]);

  async function onRun() {
    setOut('Running…');
    try {
      const base = await getWorkingBaseUrl();
      // Use webpackIgnore so the URL can be absolute at runtime
      const mod = await import(/* webpackIgnore: true */ (base + 'vampire-runner/script.js'));
      const run = mod.runVampire || mod.default;
      if (typeof run !== 'function') {
        setOut('Error: runVampire() not found in script.js');
        return;
      }
      const result = await run({ tptp, args });
      setOut(String(result ?? ''));
    } catch (e) {
      setOut(`Error: ${e?.message || e}`);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 980, margin: '0 auto' }}>
      <style>{`
        .vr-row{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap}
        .vr-col{flex:1 1 320px;min-width:0}
        label{display:block;font-weight:600;margin:.5rem 0}
        textarea{width:100%;height:18rem}
        button.vr-run{padding:.5rem .9rem;border-radius:.5rem;border:1px solid #ccc;cursor:pointer}
        button.vr-run:hover{background:#eee}
      `}</style>

      <div className="vr-row">
        <div className="vr-col" style={{ flex: 3 }}>
          <label>TPTP problem (highlighted)</label>
          <LiveCode value={tptp} onChange={setTptp} className="language-tptp" />
        </div>

        {showArgs && (
          <div className="vr-col" style={{ flex: 2 }}>
            <label>Vampire command-line arguments</label>
            <textarea
              value={args}
              onChange={e => setArgs(e.target.value)}
              placeholder={`Example:\n  --proof on --time_limit 1`}
            />
          </div>
        )}
      </div>

      <p><button className="vr-run" onClick={onRun}>Run Vampire</button></p>

      <label>Output</label>
      <pre style={{ maxHeight: outputMaxHeight, overflow: 'auto', marginTop: 0 }}>
        <code
          ref={outCodeRef}
          className={`language-${outputLanguage}`}
        >
          {out}
        </code>
      </pre>
    </div>
  );
}
