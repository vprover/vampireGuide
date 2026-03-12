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

function HighlightedClause({value, className = '', preClassName = ''}) {
  const codeRef = useRef(null);

  useEffect(() => {
    if (!codeRef.current) return;
    codeRef.current.textContent = value || '';
    highlightNowOrWhenReady(codeRef.current);
  }, [value]);

  return (
    <pre className={`${styles.highlightedClause} ${preClassName}`.trim()}>
      <code ref={codeRef} className={`language-tptp ${className}`.trim()} />
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

function compareClauseIds(a, b) {
  const aStr = String(a);
  const bStr = String(b);
  const numeric = /^\d+$/.test(aStr) && /^\d+$/.test(bStr);
  if (numeric) return Number(aStr) - Number(bStr);
  return aStr.localeCompare(bStr);
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

function parseInferenceRule(raw) {
  const cleaned = String(raw || '')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'other';
}

function summarizeRules(inferences) {
  const counts = new Map();
  inferences.forEach((item) => {
    counts.set(item.rule, (counts.get(item.rule) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([rule, count]) => ({rule, count}))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
}

function shortClause(text, max = 88) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
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
  const [showHelp, setShowHelp] = useState(false);
  const [centerToken, setCenterToken] = useState(0);
  const [inferenceEvents, setInferenceEvents] = useState([]);
  const [inferenceRuleFilter, setInferenceRuleFilter] = useState('all');
  const [selectedInferenceKey, setSelectedInferenceKey] = useState(null);
  const [showProblemPanel, setShowProblemPanel] = useState(true);
  const [showOutputPanel, setShowOutputPanel] = useState(true);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const canvasShellRef = useRef(null);
  const resizeStateRef = useRef(null);
  const pendingResolveRef = useRef(null);
  const clauseMapRef = useRef(new Map());
  const edgeMapRef = useRef(new Map());
  const inferenceRef = useRef([]);
  const [edges, setEdges] = useState([]);
  const flushTimerRef = useRef(null);
  const outputRef = useRef('Ready.');
  const outputCodeRef = useRef(null);
  const runIdRef = useRef(0);
  const cancelRunRef = useRef(null);
  const szsDoneRef = useRef(false);
  const negatedRef = useRef(new Set());
  const centeredRunRef = useRef(false);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    if (!awaitingInput || centeredRunRef.current) return;
    centeredRunRef.current = true;
    setCenterToken((prev) => prev + 1);
  }, [awaitingInput]);

  useEffect(() => {
    highlightNowOrWhenReady(outputCodeRef.current);
  }, [output]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  useEffect(() => {
    const handleMove = (event) => {
      const state = resizeStateRef.current;
      const shell = canvasShellRef.current;
      if (!state || !shell) return;
      const nextHeight = Math.max(180, Math.round(state.startHeight + (event.clientY - state.startY)));
      shell.style.height = `${nextHeight}px`;
    };
    const handleUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  useEffect(() => {
    if (!showHelp) return;
    const handleKey = (ev) => {
      if (ev.key === 'Escape') setShowHelp(false);
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [showHelp]);

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
    negatedRef.current.clear();
    centeredRunRef.current = false;
    setClauses([]);
    setEdges([]);
    setSelectedId(null);
    setAwaitingInput(false);
    setManualInput('');
    outputRef.current = '';
    setOutput('');
    inferenceRef.current = [];
    setInferenceEvents([]);
    setInferenceRuleFilter('all');
    setSelectedInferenceKey(null);
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
      negated: existing?.negated ?? negatedRef.current.has(key),
    };
    map.set(key, next);
  };

  const markNegated = (id) => {
    const key = String(id);
    negatedRef.current.add(key);
    const map = clauseMapRef.current;
    const existing = map.get(key);
    if (existing) {
      map.set(key, {...existing, negated: true});
    }
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
    const rawIds = rawClauses.map((clause) => String(clause.id));
    const rawParents = new Map();
    edgeMapRef.current.forEach((edge) => {
      const from = String(edge.from);
      const to = String(edge.to);
      if (!rawParents.has(to)) rawParents.set(to, []);
      rawParents.get(to).push(from);
    });
    const rawDepth = new Map(rawIds.map((id) => [id, 0]));
    for (let iter = 0; iter < rawIds.length; iter += 1) {
      let changed = false;
      rawIds.forEach((id) => {
        const parents = rawParents.get(id);
        if (!parents || !parents.length) return;
        let maxParent = 0;
        parents.forEach((parentId) => {
          if (rawDepth.has(parentId)) {
            maxParent = Math.max(maxParent, rawDepth.get(parentId) || 0);
          }
        });
        const next = maxParent + 1;
        if (next > (rawDepth.get(id) || 0)) {
          rawDepth.set(id, next);
          changed = true;
        }
      });
      if (!changed) break;
    }
    const grouped = new Map();
    rawClauses.forEach((clause) => {
      const textKey = normalizeClauseText(clause.text || '');
      const entry = grouped.get(textKey) || {
        text: clause.text || '',
        ids: [],
        statusById: new Map(),
        subsumedById: new Map(),
        negatedById: new Map(),
        minDepth: Infinity,
      };
      entry.ids.push(String(clause.id));
      entry.statusById.set(String(clause.id), clause.status || 'new');
      entry.subsumedById.set(String(clause.id), Boolean(clause.subsumed));
      entry.negatedById.set(String(clause.id), Boolean(clause.negated));
      entry.minDepth = Math.min(entry.minDepth, rawDepth.get(String(clause.id)) || 0);
      grouped.set(textKey, entry);
    });

    const idToDisplay = new Map();
    const displayClauses = [];
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
        : (activeIds.length ? 'active' : 'passive');
      const subsumed = entry.ids.some((id) => entry.subsumedById.get(id));
      const negated = entry.ids.some((id) => entry.negatedById.get(id));
      entry.ids.forEach((id) => idToDisplay.set(id, displayId));
      displayClauses.push({
        id: displayId,
        text: entry.text,
        status,
        subsumed,
        negated,
        layoutDepth: Number.isFinite(entry.minDepth) ? entry.minDepth : 0,
      });
    });

    const nextDisplayIdMap = Object.fromEntries(idToDisplay.entries());
    const projectedInferences = inferenceRef.current.map((item, index) => {
      const childDisplayId = nextDisplayIdMap[String(item.childId)] || String(item.childId);
      const parentDisplayIds = Array.from(
        new Set(item.parentIds.map((id) => nextDisplayIdMap[String(id)] || String(id)))
      );
      const edgeKeys = parentDisplayIds
        .filter((id) => id && id !== childDisplayId)
        .map((id) => `${id}->${childDisplayId}`);
      const derivationKey = `${childDisplayId}::${parentDisplayIds.slice().sort(compareClauseIds).join('|')}`;
      return {
        item,
        index,
        childDisplayId,
        parentDisplayIds,
        edgeKeys,
        derivationKey,
      };
    });

    const primaryDerivationKeyByChild = new Map();
    projectedInferences.forEach((proj) => {
      const childId = String(proj.childDisplayId);
      if (!primaryDerivationKeyByChild.has(childId)) {
        primaryDerivationKeyByChild.set(childId, proj.derivationKey);
      }
    });

    const displayEdgeMeta = new Map();
    projectedInferences.forEach((proj) => {
      const isPrimary = primaryDerivationKeyByChild.get(String(proj.childDisplayId)) === proj.derivationKey;
      if (!isPrimary) return;
      proj.edgeKeys.forEach((key) => {
        if (!displayEdgeMeta.has(key)) {
          const [from, to] = key.split('->');
          if (!from || !to || from === to) return;
          displayEdgeMeta.set(key, {from, to, key});
        }
      });
    });
    const displayEdges = Array.from(displayEdgeMeta.values());

    const displayIds = displayClauses.map((clause) => String(clause.id));
    const displayParents = new Map();
    displayEdges.forEach((edge) => {
      const from = String(edge.from);
      const to = String(edge.to);
      if (!displayParents.has(to)) displayParents.set(to, []);
      displayParents.get(to).push(from);
    });
    const displayDepthById = new Map(displayIds.map((id) => [id, 0]));
    for (let iter = 0; iter < displayIds.length; iter += 1) {
      let changed = false;
      displayIds.forEach((id) => {
        const parents = displayParents.get(id);
        if (!parents || !parents.length) return;
        let maxParent = 0;
        parents.forEach((parentId) => {
          if (displayDepthById.has(parentId)) {
            maxParent = Math.max(maxParent, displayDepthById.get(parentId) || 0);
          }
        });
        const next = maxParent + 1;
        if (next > (displayDepthById.get(id) || 0)) {
          displayDepthById.set(id, next);
          changed = true;
        }
      });
      if (!changed) break;
    }
    const rowOrderById = new Map();
    const depthGroups = new Map();
    displayIds.forEach((id) => {
      const depth = displayDepthById.get(id) || 0;
      const group = depthGroups.get(depth) || [];
      group.push(id);
      depthGroups.set(depth, group);
    });
    depthGroups.forEach((ids) => {
      ids
        .slice()
        .sort(compareClauseIds)
        .forEach((id, index) => {
          rowOrderById.set(id, index);
        });
    });
    const normalizedInferences = projectedInferences.map(({item, index, childDisplayId, parentDisplayIds, edgeKeys, derivationKey}) => {
      return {
        ...item,
        index,
        derivationKey,
        childDepth: rawDepth.get(String(item.childId)) || 0,
        childDisplayDepth: displayDepthById.get(String(childDisplayId)) || 0,
        childDisplayRow: rowOrderById.get(String(childDisplayId)) || 0,
        childDisplayId,
        parentDisplayIds,
        edgeKeys,
      };
    });
    const groupedInferences = [];
    const groupByPrimaryKey = new Map();
    const childPrimaryKey = new Map();
    normalizedInferences.forEach((item) => {
      const primaryKey = primaryDerivationKeyByChild.get(String(item.childDisplayId));
      if (primaryKey) {
        childPrimaryKey.set(item.key, primaryKey);
      }
      if (item.derivationKey !== primaryKey) return;
      const group = {
        ...item,
        alternatives: [],
      };
      groupByPrimaryKey.set(primaryKey, group);
      groupedInferences.push(group);
    });
    const seenAlternativeKeys = new Set();
    normalizedInferences.forEach((item) => {
      const primaryKey = childPrimaryKey.get(item.key);
      if (!primaryKey || item.derivationKey === primaryKey) return;
      const uniqueAltKey = `${primaryKey}::${item.derivationKey}`;
      if (seenAlternativeKeys.has(uniqueAltKey)) return;
      seenAlternativeKeys.add(uniqueAltKey);
      const group = groupByPrimaryKey.get(primaryKey);
      if (!group) return;
      group.alternatives.push(item);
    });

    setClauses(displayClauses);
    setEdges(displayEdges.map(({from, to}) => ({from, to})));
    setInferenceEvents(groupedInferences);
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
    if (/negated conjecture/i.test(line)) {
      const idMatch = line.match(/:\s*(\d+)\.\s/);
      if (idMatch) {
        markNegated(idMatch[1]);
      }
    }
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
      if (bracket) {
        if (/negated conjecture/i.test(bracket)) {
          markNegated(id);
        } else {
          const refs = Array.from(bracket.matchAll(/\b(\d+)\b/g)).map((m) => m[1]);
          if (refs.some((ref) => negatedRef.current.has(String(ref)))) {
            markNegated(id);
          }
        }
      }
      if (tag === 'SA') {
        const status = normalizePhaseStatus(phase);
        if (status === 'new') {
          upsertClause(id, text, status);
          const parentIds = bracket
            ? Array.from(bracket.matchAll(/\b(\d+)\b/g)).map(m => m[1])
            : [];
          addEdges(id, parentIds);
          if (bracket && parentIds.length) {
            inferenceRef.current.push({
              key: `${id}:${bracket}:${inferenceRef.current.length}`,
              childId: String(id),
              childText: text,
              parentIds: parentIds.map(String),
              parentTexts: parentIds.map((pid) => clauseMapRef.current.get(String(pid))?.text || ''),
              rule: parseInferenceRule(bracket),
              raw: bracket,
            });
          }
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
  const statsInferences = inferenceEvents.filter((item) => item.rule !== 'cnf transformation');
  const ruleSummary = summarizeRules(statsInferences);
  const filteredInferences = (inferenceRuleFilter === 'all'
    ? statsInferences
    : statsInferences.filter((item) => item.rule === inferenceRuleFilter))
    .slice()
    .sort((a, b) => {
      const depthDiff = (b.childDisplayDepth || 0) - (a.childDisplayDepth || 0);
      if (depthDiff !== 0) return depthDiff;
      const rowDiff = (b.childDisplayRow || 0) - (a.childDisplayRow || 0);
      if (rowDiff !== 0) return rowDiff;
      const rawDepthDiff = (b.childDepth || 0) - (a.childDepth || 0);
      if (rawDepthDiff !== 0) return rawDepthDiff;
      return (b.index || 0) - (a.index || 0);
    });
  const selectedInference = filteredInferences.find((item) => item.key === selectedInferenceKey)
    || filteredInferences[0]
    || null;
  const passiveCount = clauses.filter((clause) => clause.status === 'passive').length;
  const activeCount = clauses.filter((clause) => clause.status === 'active').length;
  const subsumedCount = clauses.filter((clause) => clause.subsumed).length;
  const focusedNodes = showStatsPanel && selectedInference
    ? Array.from(new Set([...selectedInference.parentDisplayIds, selectedInference.childDisplayId]))
    : [];
  const focusedEdges = showStatsPanel && selectedInference
    ? selectedInference.edgeKeys.map((key) => {
      const [from, to] = key.split('->');
      return {from, to};
    })
    : [];
  const categoryNodes = showStatsPanel && inferenceRuleFilter !== 'all'
    ? Array.from(
      new Set(
        filteredInferences.flatMap((item) => [...item.parentDisplayIds, item.childDisplayId])
      )
    )
    : [];
  const categoryEdges = showStatsPanel && inferenceRuleFilter !== 'all'
    ? Array.from(
      new Set(filteredInferences.flatMap((item) => item.edgeKeys))
    ).map((key) => {
      const [from, to] = key.split('->');
      return {from, to};
    })
    : [];
  const onToggleKeyDown = (event, toggle) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle((value) => !value);
    }
  };
  const handleResizeStart = (event) => {
    const shell = canvasShellRef.current;
    if (!shell) return;
    resizeStateRef.current = {
      startY: event.clientY,
      startHeight: shell.getBoundingClientRect().height,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  };

  return (
    <Layout title="Proof Search Visualization" description="Interactive visualization of Vampire clause selection.">
      <div className={`container ${styles.page}`}>
        <div className={styles.hero}>
          <h1>Proof Search Visualization</h1>
          <p className={styles.hint}>
            Run Vampire in manual clause-selection mode and explore the evolving clause graph.
            <br />
            Click a node to select the next clause.
          </p>
        </div>

        <div className={styles.layout}>
          <div
            ref={canvasShellRef}
            className={styles.canvasShell}
          >
            <div className={styles.canvasCard}>
              <div className={styles.canvasStage}>
              <ProofSearchCanvas
                clauses={clauses}
                edges={edges}
                selectedId={selectedId}
                awaitingInput={awaitingInput}
                resetToken={runToken}
                layoutMode={layoutMode}
                centerToken={centerToken}
                focusedNodes={focusedNodes}
                focusedEdges={focusedEdges}
                categoryNodes={categoryNodes}
                categoryEdges={categoryEdges}
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
                    <span className={`${styles.dot} ${styles.legendDotActive}`} />
                    Active
                  </span>
                  <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.legendDotPassive}`} />
                    Passive
                  </span>
                  <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.legendDotSelected}`} />
                    Selected
                  </span>
                  <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.subsumedDot}`} />
                    Subsumed
                  </span>
                  <span className={styles.legendItem}>
                    <span className={`${styles.dot} ${styles.negatedDot}`} />
                    Negated conjecture
                  </span>
                </div>
                <div className={styles.hint}>
                  {awaitingInput ? 'Waiting for your clause choice…' : 'Awaiting run'}
                </div>
              </div>
            </div>
            <div
              className={styles.resizeHandle}
              onPointerDown={handleResizeStart}
              role="presentation"
            >
              <span className={styles.resizeGrip} />
            </div>
          </div>

          <div className={`${styles.panel} ${styles.statsPanel}`}>
            <div
              className={styles.panelHeader}
              role="button"
              tabIndex={0}
              aria-expanded={showStatsPanel}
              onClick={() => setShowStatsPanel((value) => !value)}
              onKeyDown={(event) => onToggleKeyDown(event, setShowStatsPanel)}
            >
              <span className={styles.collapseButton} aria-hidden="true">
                <span className={`${styles.collapseChevron} ${showStatsPanel ? styles.collapseChevronOpen : ''}`} />
              </span>
              <div className={styles.statsHeaderCopy}>
                <h3 className={styles.statsTitle}>Proof Search Stats</h3>
                {showStatsPanel && (
                  <p className={styles.statsSubtitle}>
                    Live counts by inference rule. Select a rule or inference to highlight it in the graph.
                  </p>
                )}
              </div>
              <div className={styles.statsTotals}>
                <span className={styles.statPill}>{clauses.length} Clauses Shown</span>
                <span className={styles.statPill}>{filteredInferences.length} Inferences Shown</span>
                <span className={styles.statPill}>{passiveCount} Passive Clauses</span>
                <span className={styles.statPill}>{activeCount} Active Clauses</span>
                <span className={styles.statPill}>{subsumedCount} Subsumed Clauses</span>
              </div>
            </div>
            {showStatsPanel && (
              <>
                <div className={styles.ruleChips}>
                  <button
                    type="button"
                    className={`${styles.ruleChip} ${inferenceRuleFilter === 'all' ? styles.ruleChipActive : ''}`}
                    onClick={() => {
                      setInferenceRuleFilter('all');
                      setSelectedInferenceKey(null);
                    }}
                  >
                    All ({statsInferences.length})
                  </button>
                  {ruleSummary.map(({rule, count}) => (
                    <button
                      key={rule}
                      type="button"
                      className={`${styles.ruleChip} ${inferenceRuleFilter === rule ? styles.ruleChipActive : ''}`}
                      onClick={() => {
                        setInferenceRuleFilter(rule);
                        setSelectedInferenceKey(null);
                      }}
                    >
                      {rule} ({count})
                    </button>
                  ))}
                </div>
                <div className={styles.statsGrid}>
                  <div className={styles.inferenceList}>
                    {filteredInferences.length ? (
                      filteredInferences.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`${styles.inferenceItem} ${selectedInference?.key === item.key ? styles.inferenceItemActive : ''}`}
                          onClick={() => setSelectedInferenceKey(item.key)}
                        >
                          <span className={styles.inferenceRule}>{item.rule}</span>
                          <span className={styles.inferenceIds}>
                            {item.parentDisplayIds.join(', ')} -&gt; {item.childDisplayId}
                          </span>
                          <HighlightedClause
                            value={shortClause(item.childText)}
                            preClassName={styles.inferenceSnippet}
                            className={styles.inferenceSnippetCode}
                          />
                        </button>
                      ))
                    ) : (
                      <div className={styles.emptyState}>No inferences parsed yet.</div>
                    )}
                  </div>

                  <div className={styles.inferenceDetail}>
                    {selectedInference ? (
                      <>
                        <div className={styles.detailTop}>
                          <span className={styles.detailRule}>{selectedInference.rule}</span>
                          <span className={styles.detailIds}>
                            {selectedInference.parentDisplayIds.join(', ')} -&gt; {selectedInference.childDisplayId}
                          </span>
                        </div>
                        <div className={styles.detailBlock}>
                          <div className={styles.detailLabel}>Source annotation</div>
                          <code className={styles.detailCode}>{selectedInference.raw}</code>
                        </div>
                        <div className={styles.detailBlock}>
                          <div className={styles.detailLabel}>Parent clauses</div>
                          {selectedInference.parentDisplayIds.map((id, index) => (
                            <div key={`${selectedInference.key}:${id}:${index}`} className={styles.detailClause}>
                              <span className={styles.detailClauseId}>{id}</span>
                              <HighlightedClause
                                value={selectedInference.parentTexts[index] || '(clause text unavailable)'}
                                preClassName={styles.detailClauseText}
                              />
                            </div>
                          ))}
                        </div>
                    <div className={styles.detailBlock}>
                      <div className={styles.detailLabel}>Derived clause</div>
                      <div className={styles.detailClause}>
                        <span className={styles.detailClauseId}>{selectedInference.childDisplayId}</span>
                        <HighlightedClause value={selectedInference.childText} preClassName={styles.detailClauseText} />
                      </div>
                    </div>
                    {selectedInference.alternatives?.length ? (
                      <div className={styles.detailBlock}>
                        <div className={styles.detailLabel}>Alternative inferences</div>
                        <div className={styles.altInferenceList}>
                          {selectedInference.alternatives.map((alt) => (
                            <div key={alt.key} className={styles.altInferenceItem}>
                              <div className={styles.altInferenceTop}>
                                <span className={styles.altInferenceRule}>{alt.rule}</span>
                                <span className={styles.altInferenceIds}>
                                  {alt.parentDisplayIds.join(', ')} -&gt; {alt.childDisplayId}
                                </span>
                              </div>
                              <code className={styles.detailCode}>{alt.raw}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className={styles.detailHint}>
                      The clause stream exposes the inference rule and participating clauses. Explicit substitutions are only shown when Vampire prints them.
                    </div>
                      </>
                    ) : (
                      <div className={styles.emptyState}>
                        Pick a rule or inference to inspect its parent clauses and derived clause.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.panelGrid}>
            <div className={styles.panel}>
              <div
                className={styles.panelHeader}
                role="button"
                tabIndex={0}
                aria-expanded={showProblemPanel}
                onClick={() => setShowProblemPanel((value) => !value)}
                onKeyDown={(event) => onToggleKeyDown(event, setShowProblemPanel)}
              >
                <div className={styles.panelHeaderMain}>
                  <span className={styles.collapseButton} aria-hidden="true">
                    <span className={`${styles.collapseChevron} ${showProblemPanel ? styles.collapseChevronOpen : ''}`} />
                  </span>
                  <label htmlFor="viz-problem">Problem (TPTP)</label>
                </div>
                <div className={styles.exampleButtons}>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTptp(EXAMPLES.socrates);
                    }}
                  >
                    Socrates
                  </button>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTptp(EXAMPLES.trivial);
                    }}
                  >
                    Trivial
                  </button>
                  <button
                    className={styles.exampleButton}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTptp(EXAMPLES.puz001);
                    }}
                  >
                    PUZ001+1
                  </button>
                </div>
              </div>
              {showProblemPanel && (
                <>
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
                    <button className={styles.runButton} onClick={onRun}>
                      Run Vampire
                    </button>
                    <button className={styles.helpButton} type="button" onClick={() => setShowHelp(true)}>
                      Help
                    </button>
                    <span className={styles.statusTag}>
                      {running ? 'Live run' : 'Idle'}
                    </span>
                  </div>
                  <div className={styles.hintStack}>
                    <p className={styles.hint}>
                      Tip: Use <code className={styles.mono}>--show_everything on</code> for the fullest clause stream.
                    </p>
                    <p className={styles.hint}>
                      Tip: Remove <code className={styles.mono}>--manual_cs on</code> to let Vampire select clauses automatically.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className={styles.panel}>
              <div
                className={styles.panelHeader}
                role="button"
                tabIndex={0}
                aria-expanded={showOutputPanel}
                onClick={() => setShowOutputPanel((value) => !value)}
                onKeyDown={(event) => onToggleKeyDown(event, setShowOutputPanel)}
              >
                <div className={styles.panelHeaderMain}>
                  <span className={styles.collapseButton} aria-hidden="true">
                    <span className={`${styles.collapseChevron} ${showOutputPanel ? styles.collapseChevronOpen : ''}`} />
                  </span>
                  <label>Output</label>
                </div>
              </div>
              {showOutputPanel && (
                <>
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
                    You can double‑click a passive clause node or type an id to answer the prompt.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {showHelp && (
        <div className={styles.modalBackdrop} onClick={() => setShowHelp(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h3>Interactive Proof Search Help</h3>
              <button className={styles.modalClose} type="button" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                This page lets you run Vampire in the browser and explore the clause stream visually.
              </p>
              <ol className={styles.modalList}>
                <li>Paste or choose a TPTP problem using the buttons at the top.</li>
                <li>Adjust arguments. For interactive mode keep <code className={styles.mono}>--manual_cs on</code>.</li>
                <li>Press <strong>Run Vampire</strong> to start the proof search.</li>
                <li>New/active/passive clauses appear as nodes; arrows show inference links.</li>
                <li>Hover (or tap) a node to see its clause text.</li>
                <li>Drag nodes to rearrange the layout.</li>
                <li>Double‑click a passive node to select it during manual clause selection.</li>
              </ol>
              <hr className={styles.modalRule} />
              <h4>Navigation</h4>
              <ul className={styles.modalList}>
                <li><strong>Zoom (desktop):</strong> Ctrl + scroll wheel.</li>
                <li><strong>Zoom (mobile):</strong> pinch with two fingers.</li>
                <li><strong>Pan (desktop):</strong> drag empty space.</li>
                <li><strong>Pan (mobile):</strong> two‑finger drag.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
