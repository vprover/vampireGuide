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

  // Prefer the known site root before falling back to the current page path (e.g. /docs/)
  candidates.push('/vampireGuide/');

  if (typeof location !== 'undefined') {
    candidates.push(new URL('./', location.href).pathname);
  }

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
  const [pendingInline, setPendingInline] = useState(false);
  const [pendingSpacer, setPendingSpacer] = useState('');
  const [pendingMatchText, setPendingMatchText] = useState('');
  const pendingResolveRef = useRef(null);
  const [running, setRunning] = useState(false);
  const outWrapRef        = useRef(null);
  const outCodeRef        = useRef(null);
  const latestOutRef      = useRef('Ready.');
  const cancelRunRef      = useRef(null);
  const runIdRef          = useRef(0);

  useEffect(() => {
    latestOutRef.current = out;
  }, [out]);

  // Re-highlight output whenever it changes (or when Prism arrives)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    highlightNowOrWhenReady(outCodeRef.current);
  }, [out, outputLanguage, pendingPrompt, pendingInput, pendingInline]);

  useEffect(() => {
    if (!outWrapRef.current) return;
    outWrapRef.current.scrollTop = outWrapRef.current.scrollHeight;
  }, [out, pendingPrompt, pendingInput, pendingInline]);

  useEffect(() => {
    if (!pendingPrompt) return;
    outWrapRef.current?.focus({ preventScroll: true });
  }, [pendingPrompt]);

  const visibleOut = (() => {
    if (!pendingPrompt) return out;
    const lastLineRaw = out.split('\n').slice(-1)[0] || '';
    const lastLine = lastLineRaw.replace(/\s+$/, '');
    const forceInline = pendingMatchText && lastLine.endsWith(pendingMatchText);
    if (pendingInline || forceInline) {
      return out + pendingSpacer + pendingInput;
    }
    const sep = out ? '\n' : '';
    return out + sep + (pendingPrompt || '> ') + pendingInput;
  })();

  // Append a line to the transcript (one big string for highlighting)
  const appendLine = (text) => {
    setOut(prev => {
      const next = prev ? `${prev}\n${text}` : text;
      latestOutRef.current = next;
      return next;
    });
  };

  const appendInline = (text) => {
    setOut(prev => {
      const next = (prev || '') + text;
      latestOutRef.current = next;
      return next;
    });
  };

  const handleRequestInput = (promptText) => {
    const raw = String(promptText ?? '');
    const trimmed = raw.replace(/\s+$/, '');
    const lastLineRaw = (latestOutRef.current || '').split('\n').slice(-1)[0] || '';
    const lastLine = lastLineRaw.replace(/\r/g, '').trim();
    const normalizedPrompt = trimmed.replace(/\r/g, '').trim();
    const inline = Boolean(normalizedPrompt) && lastLine.endsWith(normalizedPrompt);
    const spacer = inline && !/\s$/.test(lastLineRaw) ? ' ' : '';
    const promptLine = inline ? '' : (normalizedPrompt ? (normalizedPrompt + ' ') : '> ');
    setPendingPrompt(promptLine);
    setPendingInline(inline);
    setPendingSpacer(spacer);
    setPendingMatchText(normalizedPrompt);
    setPendingInput('');
    return new Promise((resolve) => {
      pendingResolveRef.current = resolve;
    });
  };

  const submitPromptResponse = () => {
    if (!pendingResolveRef.current) return;
    const answer = pendingInput;
    const lastLineRaw = (latestOutRef.current || '').split('\n').slice(-1)[0] || '';
    const lastLine = lastLineRaw.replace(/\s+$/, '');
    const forceInline = pendingMatchText && lastLine.endsWith(pendingMatchText);
    if (pendingInline || forceInline) {
      appendInline(`${pendingSpacer}${answer}`);
    } else {
      appendLine(`${pendingPrompt ?? '> '}${answer}`);
    }
    pendingResolveRef.current(answer);
    pendingResolveRef.current = null;
    setPendingPrompt(null);
    setPendingInput('');
    setPendingInline(false);
    setPendingSpacer('');
    setPendingMatchText('');
  };

  const handleKeyDown = (ev) => {
    if (!pendingPrompt) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      submitPromptResponse();
      return;
    }
    if (ev.key === 'Backspace') {
      ev.preventDefault();
      setPendingInput(prev => prev.slice(0, -1));
      return;
    }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      setPendingInput(prev => prev + ev.key);
    }
  };

  const handlePaste = (ev) => {
    if (!pendingPrompt) return;
    const text = ev.clipboardData?.getData('text');
    if (!text) return;
    ev.preventDefault();
    setPendingInput(prev => prev + text.replace(/\r/g, ''));
  };

  async function onRun() {
    const newRunId = runIdRef.current + 1;
    runIdRef.current = newRunId;
    if (cancelRunRef.current) {
      cancelRunRef.current();
      cancelRunRef.current = null;
    }
    setRunning(true);
    setOut('Running…');
    setPendingPrompt(null);
    setPendingInput('');
    if (pendingResolveRef.current) {
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
        onStdout: (msg) => {
          if (runIdRef.current !== newRunId) return;
          String(msg ?? '').split('\n').forEach(appendLine);
        },
        onStderr: (msg) => {
          if (runIdRef.current !== newRunId) return;
          String(msg ?? '').split('\n').forEach(line => appendLine(`[err] ${line}`));
        },
        requestInput: (promptText) => {
          if (runIdRef.current !== newRunId) return new Promise(() => {});
          return handleRequestInput(promptText);
        },
        onReady: (instance) => {
          if (runIdRef.current !== newRunId) {
            return;
          }
          cancelRunRef.current = () => {
            if (pendingResolveRef.current) {
              pendingResolveRef.current = null;
            }
          };
        },
      });
      if (runIdRef.current === newRunId) {
        const exitCode = typeof code === 'number' ? code : 0;
        appendLine(`(exit ${exitCode})`);
      }

      // Best-effort clipboard copy to speed up sharing logs
      if (navigator?.clipboard?.writeText) {
        setTimeout(() => {
          navigator.clipboard.writeText(latestOutRef.current).catch(() => {});
        }, 0);
      }
    } catch (e) {
      setOut(`Error: ${e?.message || e}`);
    } finally {
      if (runIdRef.current === newRunId) {
        if (pendingResolveRef.current) {
          pendingResolveRef.current = null;
        }
        setPendingPrompt(null);
        setPendingInput('');
        setRunning(false);
        cancelRunRef.current = null;
      }
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

      <p><button className="vr-run" onClick={onRun}>Run Vampire</button></p>

      <label>Output</label>
      <div
        ref={outWrapRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={() => outWrapRef.current?.focus()}
        style={{
          padding: '0.5rem',
          background: 'var(--prism-background-color, transparent)'
        }}
      >
        <pre style={{ margin: 0, maxHeight: outputMaxHeight, overflow: 'auto' }}>
          <code
            ref={outCodeRef}
            className={`language-${outputLanguage}`}
          >
            {visibleOut}
          </code>
        </pre>
      </div>
    </div>
  );
}
