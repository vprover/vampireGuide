// src/pages/proof-search-visualization.jsx
import React, {useCallback, useEffect, useRef, useState} from 'react';
import Layout from '@theme/Layout';
import ProofSearchCanvas from '../components/ProofSearchCanvas';
import styles from './proof-search-visualization.module.css';

const EXAMPLES = {
  socrates: `fof(all_men_mortal, axiom,
  ![X] : (man(X) => mortal(X)) ).

fof(socrates_man, axiom,
  man(socrates) ).

fof(socrates_mortal, conjecture,
  mortal(socrates) ).`,
  trivial: `fof(a, axiom, p).
fof(b, conjecture, p).`,
  puz001: `%------------------------------------------------------------------------------
% File     : PUZ001+1 : TPTP v6.4.0. Released v2.0.0.
% Domain   : Puzzles
% Problem  : Dreadbury Mansion
% Version  : Especial.
%            Theorem formulation : Reduced > Complete.
% English  : Someone who lives in Dreadbury Mansion killed Aunt Agatha.
%            Agatha, the butler, and Charles live in Dreadbury Mansion,
%            and are the only people who live therein. A killer always
%            hates his victim, and is never richer than his victim.
%            Charles hates no one that Aunt Agatha hates. Agatha hates
%            everyone except the butler. The butler hates everyone not
%            richer than Aunt Agatha. The butler hates everyone Aunt
%            Agatha hates. No one hates everyone. Agatha is not the
%            butler. Therefore : Agatha killed herself.
%
% Refs     : [Pel86] Pelletier (1986), Seventy-five Problems for Testing Au
%          : [Hah94] Haehnle (1994), Email to G. Sutcliffe
% Source   : [Hah94]
% Names    : Pelletier 55 [Pel86]
%
% Status   : Theorem
% Rating   : 0.07 v6.4.0, 0.12 v6.3.0, 0.04 v6.2.0, 0.12 v6.1.0, 0.20 v6.0.0, 0.26 v5.5.0, 0.07 v5.3.0, 0.19 v5.2.0, 0.00 v5.0.0, 0.08 v4.1.0, 0.13 v4.0.0, 0.12 v3.7.0, 0.14 v3.5.0, 0.00 v3.4.0, 0.08 v3.3.0, 0.11 v3.2.0, 0.22 v3.1.0, 0.17 v2.7.0, 0.00 v2.5.0, 0.33 v2.4.0, 0.33 v2.2.1, 0.00 v2.1.0
% Syntax   : Number of formulae    :   14 (   6 unit)
%            Number of atoms       :   24 (   5 equality)
%            Maximal formula depth :    5 (   3 average)
%            Number of connectives :   16 (   6   ~;   2   |;   1   &)
%                                         (   0 <=>;   7  =>;   0  <=;   0  <~>)
%                                         (   0  ~|;   0  ~&)
%            Number of predicates  :    5 (   0 propositional; 1-2 arity)
%            Number of functors    :    3 (   3 constant; 0-0 arity)
%            Number of variables   :   12 (   0 sgn;  10   !;   2   ?)
%            Maximal term depth    :    1 (   1 average)
% SPC      : FOF_THM_RFO_SEQ
%
% Comments : Modified by Geoff Sutcliffe.
%          : Also known as "Who killed Aunt Agatha"
%------------------------------------------------------------------------------
%----Problem axioms
fof(pel55_1,axiom,
    ( ? [X] :
        ( lives(X)
        & killed(X,agatha) ) )).

fof(pel55_2_1,axiom,
    ( lives(agatha) )).

fof(pel55_2_2,axiom,
    ( lives(butler) )).

fof(pel55_2_3,axiom,
    ( lives(charles) )).

fof(pel55_3,axiom,
    ( ! [X] :
        ( lives(X)
       => ( X = agatha
          | X = butler
          | X = charles ) ) )).

fof(pel55_4,axiom,
    ( ! [X,Y] :
        ( killed(X,Y)
       => hates(X,Y) ) )).

fof(pel55_5,axiom,
    ( ! [X,Y] :
        ( killed(X,Y)
       => ~ richer(X,Y) ) )).

fof(pel55_6,axiom,
    ( ! [X] :
        ( hates(agatha,X)
       => ~ hates(charles,X) ) )).

fof(pel55_7,axiom,
    ( ! [X] :
        ( X != butler
       => hates(agatha,X) ) )).

fof(pel55_8,axiom,
    ( ! [X] :
        ( ~ richer(X,agatha)
       => hates(butler,X) ) )).

fof(pel55_9,axiom,
    ( ! [X] :
        ( hates(agatha,X)
       => hates(butler,X) ) )).

fof(pel55_10,axiom,
    ( ! [X] :
      ? [Y] : ~ hates(X,Y) )).

fof(pel55_11,axiom,
    (  agatha != butler )).

fof(pel55,conjecture,
    ( killed(agatha,agatha) )).

%------------------------------------------------------------------------------`,
};

const DEFAULT_PROBLEM = EXAMPLES.socrates;

const DEFAULT_ARGS = '--manual_cs on --show_everything on --proof on --avatar off';

const TAG_CLAUSE_RE = /^\s*\[(\w+)\]\s*([a-z_]+):\s*(\d+)\.\s*(.*)$/i;
const SELECT_RE = /\bselected\s+clause\s+(\d+)/i;
const REDUCE_RE = /^\s*\[SA\]\s*(forward reduce|backward reduce|forward subsumption|backward subsumption|subsumption|tautology deletion|redundancy deletion|simplified):\s*(\d+)\./i;
const isDebugEdges = () => typeof window !== 'undefined' && Boolean(window.__VampVizDebug);

function highlightNowOrWhenReady(el) {
  if (!el || typeof window === 'undefined') return;
  const tryHl = () => {
    if (window.Prism && typeof window.Prism.highlightElement === 'function') {
      window.Prism.highlightElement(el);
    }
  };
  tryHl();
  window.addEventListener('load', tryHl, {once: true});
}

function LiveCode({value, onChange, className = 'language-tptp', minHeight = '18rem'}) {
  const codeRef = useRef(null);

  useEffect(() => {
    if (!codeRef.current) return;
    const current = codeRef.current.textContent ?? '';
    if (current !== (value || '')) {
      codeRef.current.textContent = value || '';
      highlightNowOrWhenReady(codeRef.current);
    }
  }, [value]);

  const handleInput = () => {
    if (!codeRef.current) return;
    onChange(codeRef.current.textContent || '');
  };

  return (
    <pre className={`prism-live ${className}`} style={{minHeight, margin: 0}}>
      <code
        ref={codeRef}
        contentEditable
        spellCheck={false}
        onInput={handleInput}
        style={{outline: 'none', display: 'block', whiteSpace: 'pre'}}
      />
    </pre>
  );
}

function normalizePhaseStatus(phase) {
  if (!phase) return 'new';
  if (phase.includes('active')) return 'active';
  if (phase.includes('passive')) return 'passive';
  if (phase.includes('selected')) return 'selected';
  if (phase.includes('new')) return 'new';
  return 'new';
}

function normalizeClauseText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pickSmallestId(ids) {
  if (!ids || !ids.length) return '';
  const numeric = ids.every((id) => /^\d+$/.test(id));
  if (numeric) {
    return ids.map(Number).sort((a, b) => a - b)[0].toString();
  }
  return ids.slice().sort()[0];
}

const BASE_CACHE_KEY = 'vampireRunner.baseUrl.v2';
const ensureSlash = (p) => (p.endsWith('/') ? p : p + '/');
async function getWorkingBaseUrl() {
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
  candidates.push('/vampireGuide/');
  if (typeof location !== 'undefined') candidates.push(new URL('./', location.href).pathname);
  candidates.push('/');

  const seen = new Set();
  const normalized = candidates
    .map(ensureSlash)
    .filter(p => (seen.has(p) ? false : (seen.add(p), true)));
  const base = normalized[0] || '/';
  sessionStorage.setItem(BASE_CACHE_KEY, base);
  return base;
}

export default function ProofSearchVisualization() {
  const [tptp, setTptp] = useState(DEFAULT_PROBLEM);
  const [args, setArgs] = useState(DEFAULT_ARGS);
  const [output, setOutput] = useState('Ready.');
  const [clauses, setClauses] = useState([]);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [running, setRunning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [runToken, setRunToken] = useState(0);
  const [layoutMode, setLayoutMode] = useState('sequential');
  const pendingResolveRef = useRef(null);
  const clauseMapRef = useRef(new Map());
  const edgeMapRef = useRef(new Map());
  const [edges, setEdges] = useState([]);
  const flushTimerRef = useRef(null);
  const outputRef = useRef('Ready.');
  const outputCodeRef = useRef(null);
  const runIdRef = useRef(0);
  const cancelRunRef = useRef(null);
  const szsDoneRef = useRef(false);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    highlightNowOrWhenReady(outputCodeRef.current);
  }, [output]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  const flushOutput = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setOutput(outputRef.current);
    }, 50);
  };

  const appendOutput = (line) => {
    const prev = outputRef.current || '';
    outputRef.current = prev ? `${prev}\n${line}` : line;
    flushOutput();
  };

  const resetRunState = () => {
    clauseMapRef.current.clear();
    edgeMapRef.current.clear();
    setClauses([]);
    setEdges([]);
    setSelectedId(null);
    setAwaitingInput(false);
    setManualInput('');
    outputRef.current = '';
    setOutput('');
  };

  const upsertClause = (id, text, status) => {
    const key = String(id);
    const map = clauseMapRef.current;
    const existing = map.get(key);
    const next = {
      id: key,
      text: text ?? existing?.text ?? '',
      status: status ?? existing?.status ?? 'new',
      subsumed: existing?.subsumed ?? false,
    };
    map.set(key, next);
  };

  const markSubsumed = (id) => {
    const key = String(id);
    const map = clauseMapRef.current;
    const existing = map.get(key);
    map.set(key, {
      id: key,
      text: existing?.text ?? '',
      status: existing?.status ?? 'new',
      subsumed: true,
    });
  };

  const commitClauses = () => {
    const rawClauses = Array.from(clauseMapRef.current.values());
    const grouped = new Map();
    rawClauses.forEach((clause) => {
      const textKey = normalizeClauseText(clause.text || '');
      const entry = grouped.get(textKey) || {
        text: clause.text || '',
        ids: [],
        statusById: new Map(),
        subsumedById: new Map(),
      };
      entry.ids.push(String(clause.id));
      entry.statusById.set(String(clause.id), clause.status || 'new');
      entry.subsumedById.set(String(clause.id), Boolean(clause.subsumed));
      grouped.set(textKey, entry);
    });

    const idToDisplay = new Map();
    const displayClauses = [];
    const allowed = new Set(['new', 'passive', 'active']);
    const selectedKey = selectedId ? String(selectedId) : null;
    grouped.forEach((entry) => {
      const passiveIds = entry.ids.filter((id) => entry.statusById.get(id) === 'passive');
      const activeIds = entry.ids.filter((id) => entry.statusById.get(id) === 'active');
      const newIds = entry.ids.filter((id) => entry.statusById.get(id) === 'new');
      const displayPool = passiveIds.length
        ? passiveIds
        : (activeIds.length ? activeIds : newIds);
      if (!displayPool.length) {
        return;
      }
      const displayId = pickSmallestId(displayPool);
      const status = passiveIds.length
        ? 'passive'
        : (activeIds.length ? 'active' : 'new');
      const subsumed = entry.subsumedById.get(displayId) || false;
      entry.ids.forEach((id) => idToDisplay.set(id, displayId));
      displayClauses.push({
        id: displayId,
        text: entry.text,
        status,
        subsumed,
      });
    });

    const displayEdges = [];
    edgeMapRef.current.forEach((edge) => {
      const from = idToDisplay.get(String(edge.from));
      const to = idToDisplay.get(String(edge.to));
      if (!from || !to || from === to) return;
      const key = `${from}->${to}`;
      if (!displayEdges.some((e) => e.key === key)) {
        displayEdges.push({from, to, key});
      }
    });

    setClauses(displayClauses);
    setEdges(displayEdges.map(({from, to}) => ({from, to})));
    if (isDebugEdges()) {
      console.debug('[viz] clauses', displayClauses.length, 'edges', displayEdges.length);
    }
  };

  const addEdges = (toId, parentIds) => {
    if (!parentIds || !parentIds.length) return;
    parentIds.forEach((parentId) => {
      const from = String(parentId);
      const to = String(toId);
      if (!from || from === to) return;
      const key = `${from}->${to}`;
      if (!edgeMapRef.current.has(key)) {
        edgeMapRef.current.set(key, {from, to});
      }
    });
  };

  const handleClauseSelection = useCallback((id) => {
    if (!pendingResolveRef.current) return;
    const value = String(id);
    pendingResolveRef.current(value);
    pendingResolveRef.current = null;
    setAwaitingInput(false);
    setSelectedId(value);
    setManualInput('');
  }, []);

  const handleManualSubmit = () => {
    if (!pendingResolveRef.current || !manualInput.trim()) return;
    const value = manualInput.trim();
    pendingResolveRef.current(value);
    pendingResolveRef.current = null;
    setAwaitingInput(false);
    setSelectedId(value);
    setManualInput('');
  };

  const parseOutputLine = (line) => {
    const reduceMatch = line.match(REDUCE_RE);
    if (reduceMatch) {
      markSubsumed(reduceMatch[2]);
    }
    const tagged = line.match(TAG_CLAUSE_RE);
    if (tagged) {
      const tag = tagged[1]?.toUpperCase?.() || '';
      const phase = tagged[2].toLowerCase();
      const id = tagged[3];
      let text = tagged[4];
      let bracket = '';
      const bracketMatches = Array.from(text.matchAll(/\[([^\]]+)\]/g));
      if (bracketMatches.length) {
        bracket = bracketMatches[bracketMatches.length - 1][1];
        text = text.replace(/\s*\[[^\]]+\]\s*$/, '');
      }
      if (tag === 'SA') {
        const status = normalizePhaseStatus(phase);
        if (status === 'new') {
          upsertClause(id, text, status);
          const parentIds = bracket
            ? Array.from(bracket.matchAll(/\b(\d+)\b/g)).map(m => m[1])
            : [];
          addEdges(id, parentIds);
          if (isDebugEdges() && parentIds.length) {
            console.debug('[viz] edge', id, '<-', parentIds, bracket);
          }
        } else if (status === 'passive' || status === 'active') {
          upsertClause(id, text, status);
        }
      }
      return true;
    }
    const selectedMatch = line.match(SELECT_RE);
    if (selectedMatch) {
      setSelectedId(selectedMatch[1]);
    }
    return false;
  };

  const onRun = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunToken(runId);
    if (cancelRunRef.current) {
      cancelRunRef.current();
      cancelRunRef.current = null;
    }
    resetRunState();
    setRunning(true);
    szsDoneRef.current = false;

    try {
      const base = await getWorkingBaseUrl();
      const mod = await import(/* webpackIgnore: true */ (base + 'vampire-runner/script.js'));
      const runRaw = mod.runVampireRaw || mod.runVampire || mod.default;
      if (typeof runRaw !== 'function') {
        appendOutput('Error: runVampireRaw() not found in script.js');
        setRunning(false);
        return;
      }

      const { code } = await runRaw({
        tptp,
        args,
        onStdout: (msg) => {
          if (runIdRef.current !== runId) return;
          const text = String(msg ?? '');
          text.split('\n').forEach((line) => {
            if (line.trim()) parseOutputLine(line);
            appendOutput(line);
            if (!szsDoneRef.current && hasSZSStatus(line)) {
              szsDoneRef.current = true;
              setRunning(false);
            }
          });
          commitClauses();
        },
        onStderr: (msg) => {
          if (runIdRef.current !== runId) return;
          const text = String(msg ?? '');
          text.split('\n').forEach((line) => appendOutput(`[err] ${line}`));
        },
        requestInput: (_promptText) => {
          if (runIdRef.current !== runId) return new Promise(() => {});
          setAwaitingInput(true);
          return new Promise((resolve) => {
            pendingResolveRef.current = resolve;
          });
        },
        onReady: (ready) => {
          if (ready && typeof ready.cancel === 'function') {
            cancelRunRef.current = ready.cancel;
          }
        },
      });

      if (runIdRef.current === runId) {
        appendOutput(`(exit ${typeof code === 'number' ? code : 0})`);
      }
    } catch (err) {
      appendOutput(`[err] ${err?.message || err}`);
    } finally {
      if (runIdRef.current === runId) {
        pendingResolveRef.current = null;
        setAwaitingInput(false);
        setRunning(false);
        cancelRunRef.current = null;
        flushOutput();
      }
    }
  };

  const hasSZSStatus = (line) => /\bSZS\s+status\b/i.test(line);

  return (
    <Layout title="Proof Search Visualization" description="Interactive visualization of Vampire clause selection.">
      <div className={`container ${styles.page}`}>
        <div className={styles.hero}>
          <h1>Proof Search Visualization</h1>
          <p className={styles.hint}>
            Run Vampire in manual clause-selection mode and explore the evolving clause graph. Click a node
            when prompted to select the next clause.
          </p>
        </div>

        <div className={styles.layout}>
          <div className={styles.canvasCard}>
            <div className={styles.canvasStage}>
            <ProofSearchCanvas
              clauses={clauses}
              edges={edges}
              selectedId={selectedId}
              awaitingInput={awaitingInput}
              resetToken={runToken}
              layoutMode={layoutMode}
              onSelect={awaitingInput ? handleClauseSelection : undefined}
            />
            </div>
            <div className={styles.layoutControls}>
              <span className={styles.layoutLabel}>Layout</span>
              <div className={styles.layoutButtons}>
                <button
                  type="button"
                  className={`${styles.layoutButton} ${layoutMode === 'radial' ? styles.layoutButtonActive : ''}`}
                  onClick={() => setLayoutMode('radial')}
                >
                  Radial
                </button>
                <button
                  type="button"
                  className={`${styles.layoutButton} ${layoutMode === 'sequential' ? styles.layoutButtonActive : ''}`}
                  onClick={() => setLayoutMode('sequential')}
                >
                  Sequential
                </button>
              </div>
            </div>
            <div className={styles.canvasFooter}>
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={styles.dot} style={{background: '#ff9fb2'}} />
                  New
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.dot} style={{background: '#b62929'}} />
                  Active
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.dot} style={{background: '#8a8a8a'}} />
                  Passive
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.dot} style={{background: '#f97316'}} />
                  Selected
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.dot} ${styles.subsumedDot}`} />
                  Subsumed
                </span>
              </div>
              <div className={styles.hint}>
                {awaitingInput ? 'Waiting for your clause choice…' : 'Awaiting run'}
              </div>
            </div>
          </div>

          <div className={styles.panelGrid}>
            <div className={styles.panel}>
              <div className={styles.problemHeader}>
                <label htmlFor="viz-problem">Problem (TPTP)</label>
                <div className={styles.exampleButtons}>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={() => setTptp(EXAMPLES.socrates)}
                  >
                    Socrates
                  </button>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={() => setTptp(EXAMPLES.trivial)}
                  >
                    Trivial
                  </button>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={() => setTptp(EXAMPLES.puz001)}
                  >
                    PUZ001+1
                  </button>
                </div>
              </div>
              <textarea
                id="viz-problem"
                className={styles.hiddenInput}
                value={tptp}
                onChange={(e) => setTptp(e.target.value)}
              />
              <div className={styles.liveCode}>
                <LiveCode value={tptp} onChange={setTptp} className="language-tptp" minHeight="14rem" />
              </div>

              <label htmlFor="viz-args">Args</label>
              <input
                id="viz-args"
                className={`${styles.argsInput} ${styles.mono}`}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />

              <div className={styles.runRow}>
                <button className={styles.runButton} onClick={onRun} disabled={running}>
                  {running ? 'Running…' : 'Run Vampire'}
                </button>
                <span className={styles.statusTag}>
                  {running ? 'Live run' : 'Idle'}
                </span>
              </div>
              <p className={styles.hint}>
                Tip: Use <code className={styles.mono}>--show_everything on</code> for the fullest clause stream.
              </p>
            </div>

            <div className={styles.panel}>
              <label>Output</label>
              <pre className={styles.output}>
                <code ref={outputCodeRef} className={`language-tptp ${styles.mono}`}>
                  {output}
                </code>
              </pre>

              <div className={styles.promptRow}>
                <input
                  className={`${styles.smallInput} ${styles.mono}`}
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder={awaitingInput ? 'Enter clause id…' : 'Waiting for prompt…'}
                  disabled={!awaitingInput}
                />
                <button className={styles.runButton} onClick={handleManualSubmit} disabled={!awaitingInput}>
                  Send
                </button>
              </div>
              <div className={styles.hint}>
                You can click a clause node or type an id to answer the prompt.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
