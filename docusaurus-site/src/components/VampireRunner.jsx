import React, { useEffect, useState } from 'react';

export default function VampireRunner() {
  const [tptp, setTptp] = useState(`% Minimal PUZ001+1.p
fof(someone_killed_agatha, axiom, ( ? [X] : ( lives(X) & killed(X,agatha) ) )).
fof(agatha_lives, axiom,  lives(agatha)).
fof(butler_lives, axiom,  lives(butler)).
fof(charles_lives, axiom, lives(charles)).
fof(only_three, axiom, ( ! [X] : ( lives(X) => (X = agatha | X = butler | X = charles) ) )).
fof(killer_hates, axiom,  ( ! [X,Y] : ( killed(X,Y) => hates(X,Y) ) )).
fof(killer_not_richer, axiom, ( ! [X,Y] : ( killed(X,Y) => ~ richer(X,Y) ) )).
fof(charles_rule, axiom, ( ! [X] : ( hates(agatha,X) => ~ hates(charles,X) ) )).
fof(agatha_hates_all_but_butler, axiom, ( ! [X] : ( X != butler => hates(agatha,X) ) )).
fof(butler_hates_not_richer, axiom, ( ! [X] : ( ~ richer(X,agatha) => hates(butler,X) ) )).
fof(butler_hates_agatha_hates, axiom, ( ! [X] : ( hates(agatha,X) => hates(butler,X) ) )).
fof(no_total_haters, axiom, ( ! [X] : ? [Y] : ~ hates(X,Y) )).
fof(agatha_ne_butler, axiom, agatha != butler).
fof(goal, conjecture, killed(agatha,agatha)).`);
  const [args, setArgs] = useState('');
  const [out, setOut] = useState('Loading…');

  // Register COOP/COEP SW for WASM threads (safe to no-op if not present)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/coi-serviceworker.min.js').catch(() => {});
    }
    setOut('Ready.');
  }, []);

  async function onRun() {
    setOut('Running…');
    try {
      // Loads from /static (see next file). Must export runVampire()
      const mod = await import('/vampire-runner/script.js');
      const run = mod.runVampire;
      if (typeof run !== 'function') {
        setOut('Error: runVampire() not found in /vampire-runner/script.js');
        return;
      }
      const result = await run({ tptp, args });
      setOut(result);
    } catch (e) {
      setOut(`Error: ${e && e.message ? e.message : String(e)}`);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 980, margin: '0 auto' }}>
      <style>{`
        textarea{width:100%;height:12rem}
        pre{white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:8px}
        button{padding:.5rem .9rem}
        .my-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
        label{display:block;font-weight:600;margin:.4rem 0}
        code.kbd{background:#eee;padding:.1rem .3rem;border-radius:4px}
      `}</style>

      <div className="my-row">
        <div>
          <label htmlFor="tptp">TPTP problem</label>
          <textarea
            id="tptp"
            value={tptp}
            onChange={(e) => setTptp(e.target.value)}
            placeholder="Paste TPTP here..."
          />
        </div>
        <div>
          <label htmlFor="args">Vampire command-line arguments</label>
          <textarea
            id="args"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder={`Example:\n  --proof on --time_limit 1`}
          />
        </div>
      </div>

      <p>
        <button id="run" onClick={onRun}>Run Vampire</button>
      </p>

      <pre id="out">{out}</pre>
    </div>
  );
}
