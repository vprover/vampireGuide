// src/prism-tptp.js
// A reasonably complete Prism grammar for TPTP (FOF/TFF/THF/CNF)
// Works with Docusaurus via src/theme/prism-include-languages.js

export default function (Prism) {
  const roles =
    '(?:axiom|hypothesis|definition|assumption|lemma|theorem|corollary|conjecture|negated_conjecture|plain|type|interpretation|fi_domain|fi_functors|fi_predicates|unknown)';

  // $-prefixed defined words and $$-prefixed system words
  const dollarWord = /\$[A-Za-z0-9_]+\b/;
  const dollarDollarWord = /\$\$[A-Za-z0-9_]+\b/;

  Prism.languages.tptp = {
    // ---------------- Comments (order matters: system -> defined -> regular) ---------------
    comment: [
      // system comments: %$$... and /*$$ ... */
      {
        pattern: /%[$]{2}.*$/m,
      },
      {
        pattern: /\/\*[$]{2}[\s\S]*?\*\//,
      },
      // defined comments: %$... and /*$ ... */
      {
        pattern: /%[$].*$/m,
      },
      {
        pattern: /\/\*[$][\s\S]*?\*\//,
      },
      // regular comments: %... and /* ... */
      {
        pattern: /%.*/m,
      },
      {
        pattern: /\/\*[\s\S]*?\*\//,
      },
    ],

    // ---------------- Strings / distinct objects ----------------
    // Distinct objects are double-quoted; single-quoted atoms below
    string: {
      pattern: /"(?:\\.|[^"\\])*"/,
      greedy: true,
    },

    // ---------------- Booleans ($true / $false) ----------------
    boolean: {
      pattern: /\$(?:true|false)\b/,
      alias: 'constant',
    },

    // ---------------- Numbers: int, real (with exponent), rational ----------------
    number: [
      // rationals like 123/45 (denominator must be positive integer)
      /\b\d+\/[1-9]\d*\b/,
      // reals like 1.23, 1.23e-4, 2e10
      /\b\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?\b/,
    ],

    // ---------------- Keywords (languages, include, roles) ----------------
    keyword: [
      // Languages + include
      /\b(?:tpi|thf|tff|tcf|fof|cnf|include)\b/,
      // Roles (the :== list)
      new RegExp(`\\b${roles}\\b`),
    ],

    // ---------------- Defined/system words (other $-prefixed tokens) ----------------
    // Some of these are types or built-in functors/predicates; we mark them as 'symbol'
    symbol: [
      {
        pattern: dollarDollarWord, // $$system_word
        alias: 'builtin',
      },
      {
        pattern: dollarWord, // $defined_word (types, arithmetic ops, etc.)
        alias: 'builtin',
      },
    ],

    // ---------------- Variables (Uppercase identifiers) ----------------
    variable: {
      pattern: /\b[A-Z][A-Za-z0-9_]*\b/,
      alias: 'variable',
    },

    // ---------------- Atoms / identifiers ----------------
    // Lowercase atoms, single-quoted atoms, back-quoted UpperWords
    atom: [
      // function/predicate name when followed by '('
      {
        // e.g., predicate(args) or functor(args)
        pattern: /\b[a-z][A-Za-z0-9_]*\b(?=\s*\()/,
        alias: 'function',
      },
      // plain lower atoms
      {
        pattern: /\b[a-z][A-Za-z0-9_]*\b/,
      },
      // single-quoted atoms: '...'
      {
        pattern: /'(?:\\.|[^'\\])*'/,
        greedy: true,
      },
      // back-quoted UpperWord: `FooBar`
      {
        pattern: /`[A-Z][A-Za-z0-9_]*`/,
        greedy: true,
      },
    ],

    // ---------------- Operators / Connectives / Punctuation ----------------
    // Connectives and special operators from the grammar
    operator: [
      // multi-char first
      /<=>|=>|<=|<~>|~\||~&|-->|!>|\?\*|<<|==|:=|!=/,
      // quantifiers and THF bits
      /[@][=]|@@\+|@@-|@[\+\-]|\^|[!?]/,
      // equality
      /=/,
      // set of simple operators frequently used
      /[&|~*+<>]/,
      // '@' apply (kept after multi-char)
      /@/,
      // colon used in quantification/typing
      /:/,
    ],

    // Generic punctuation
    punctuation: /[()[\],.]/,
  };
}
