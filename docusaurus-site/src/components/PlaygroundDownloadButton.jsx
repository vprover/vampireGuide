// src/components/PlaygroundDownloadButton.jsx
import React, {useEffect, useState} from 'react';

export default function PlaygroundDownloadButton({ runnerId = 'playground-runner' }) {
  const [hasOutput, setHasOutput] = useState(false);
  const isMeaningfulOutput = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (trimmed === 'Ready.') return false;
    if (/^Running\.{0,3}$/.test(trimmed)) return false;
    const realPattern = /(SZS\s+status|\[SA\]|\[PP\]|\[err\]|\bPick a clause\b|\(exit\s+-?\d+\))/i;
    if (realPattern.test(trimmed)) return true;
    if (/[\r\n]/.test(trimmed)) return true;
    return true;
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const container = document.getElementById(runnerId);
    if (!container) return undefined;

    const readOutput = () => {
      const outputEl = container.querySelector('div[tabindex="0"] pre code');
      const outputText = outputEl?.textContent ?? '';
      setHasOutput(isMeaningfulOutput(outputText));
    };

    readOutput();

    const observer = new MutationObserver(() => readOutput());
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [runnerId]);
  const handleDownload = () => {
    if (!hasOutput) return;
    if (typeof document === 'undefined') return;
    const container = document.getElementById(runnerId);
    if (!container) return;
    const problem = container.querySelector('pre.prism-live code')?.textContent ?? '';
    const args = container.querySelector('textarea')?.value ?? '';
    const output = container.querySelector('div[tabindex="0"] pre code')?.textContent ?? '';
    const payload = { args, problem, output };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `vampire-playground-${stamp}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <div className="playground-actions">
        <button className="playground-download" type="button" onClick={handleDownload} disabled={!hasOutput}>
          Download Args, Problem, and Output
        </button>
      </div>
      <style>{`
        .playground-actions{
          display:flex;
          justify-content:flex-start;
          margin:0.75rem 0 1rem;
        }
        .playground-download{
          padding:.6rem 1.25rem;
          border-radius:8px;
          border:none;
          cursor:pointer;
          font-weight:600;
          color:#fff;
          background:linear-gradient(135deg,#c1121f,#4a0000);
          box-shadow:0 0 12px rgba(160,10,10,.25);
          transition:transform .2s ease,box-shadow .2s ease;
        }
        .playground-download:hover{
          transform:translateY(-1px);
          box-shadow:0 0 16px rgba(160,10,10,.35);
        }
        .playground-download:disabled{
          opacity:0.55;
          cursor:not-allowed;
          box-shadow:none;
          transform:none;
        }
      `}</style>
    </>
  );
}
