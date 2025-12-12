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

// Find a base URL that serves the runner assets.
const BASE_CACHE_KEY = 'vampireRunner.baseUrl';
const ensureSlash = (p) => p.endsWith('/') ? p : (p + '/');
async function findWorkingBaseUrl(){
  const cached = sessionStorage.getItem(BASE_CACHE_KEY);
  if (cached) return ensureSlash(cached);

  const candidates = [];
  const docusaurusBase = typeof window!=='undefined' && window.__docusaurus && window.__docusaurus.baseUrl;
  if (docusaurusBase) candidates.push(docusaurusBase);

  const baseTag = typeof document!=='undefined' ? document.querySelector('base')?.getAttribute('href') : null;
  if (baseTag) candidates.push(baseTag);

  if (typeof location !== 'undefined') {
    candidates.push(new URL('./', location.href).pathname);
  }

  candidates.push('/vampireGuide/');
  candidates.push('/');

  const seen = new Set();
  const base = (candidates.map(ensureSlash).find(b => (seen.has(b) ? false : (seen.add(b), true))) || '/');
  sessionStorage.setItem(BASE_CACHE_KEY, base);
  return base;
}
async function getWorkingBaseUrl(){
  const base = await findWorkingBaseUrl();
  return ensureSlash(base);
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
  const [args, setArgs]   = useState('--manual_cs on --show_new on --proof on');
  const [out, setOut]     = useState('Ready.');
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [pendingInput, setPendingInput]   = useState('');
  const pendingResolveRef = useRef(null);
  const [running, setRunning] = useState(false);
  const outCodeRef        = useRef(null);
  const latestOutRef      = useRef('Ready.');

  // Re-highlight output whenever it changes (or when Prism arrives)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    highlightNowOrWhenReady(outCodeRef.current);
  }, [out, outputLanguage]);

  useEffect(() => {
    latestOutRef.current = out;
  }, [out]);

  // Append a line to the transcript (one big string for highlighting)
  const appendLine = (text) => {
    setOut(prev => {
      const next = prev ? `${prev}\n${text}` : text;
      latestOutRef.current = next;
      return next;
    });
  };

  const handleRequestInput = (promptText) => {
    const promptLine = promptText || '>';
    appendLine(promptLine);
    setPendingPrompt(promptLine);
    setPendingInput('');
    return new Promise((resolve) => {
      pendingResolveRef.current = resolve;
    });
  };

  const submitPromptResponse = () => {
    if (!pendingResolveRef.current) return;
    const answer = pendingInput;
    appendLine(`> ${answer}`);
    pendingResolveRef.current(answer);
    pendingResolveRef.current = null;
    setPendingPrompt(null);
    setPendingInput('');
  };

  const handleKeyDown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      submitPromptResponse();
    }
  };

  async function onRun() {
    setRunning(true);
    setOut('Running…');
    setPendingPrompt(null);
    setPendingInput('');
    if (pendingResolveRef.current) {
      pendingResolveRef.current('');
      pendingResolveRef.current = null;
    }
    try {
      const base = await getWorkingBaseUrl();
      // Use webpackIgnore so the URL can be absolute at runtime
      const mod = await import(/* webpackIgnore: true */ (base + 'vampire-runner/script.js'));
      const runRaw = mod.runVampireRaw || mod.runVampire || mod.default;
      if (typeof runRaw !== 'function') {
        setOut('Error: runVampireRaw() not found in script.js');
        setRunning(false);
        return;
      }
      const { code } = await runRaw({
        tptp,
        args,
        onStdout: (msg) => String(msg ?? '').split('\n').forEach(appendLine),
        onStderr: (msg) => String(msg ?? '').split('\n').forEach(line => appendLine(`[err] ${line}`)),
        requestInput: handleRequestInput,
      });
      const exitCode = typeof code === 'number' ? code : 0;
      appendLine(`(exit ${exitCode})`);

      // Best-effort clipboard copy to speed up sharing logs
      if (navigator?.clipboard?.writeText) {
        setTimeout(() => {
          navigator.clipboard.writeText(latestOutRef.current).catch(() => {});
        }, 0);
      }
    } catch (e) {
      setOut(`Error: ${e?.message || e}`);
    } finally {
      if (pendingResolveRef.current) {
        pendingResolveRef.current('');
        pendingResolveRef.current = null;
      }
      setPendingPrompt(null);
      setPendingInput('');
      setRunning(false);
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
              placeholder={`Example:\n  --manual_cs on --show_new on --proof on`}
            />
          </div>
        )}
      </div>

      <p><button className="vr-run" onClick={onRun} disabled={running}>Run Vampire</button></p>

      {pendingPrompt && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label>Input required (prompt: {pendingPrompt})</label>
          <input
            type="text"
            value={pendingInput}
            onChange={e => setPendingInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', padding: '0.4rem', fontFamily: 'monospace' }}
            autoFocus
          />
          <button className="vr-run" onClick={submitPromptResponse} style={{ marginTop: '0.35rem' }}>
            Send
          </button>
        </div>
      )}

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
