---
sidebar_position: 1
title: Introduction to TPTP
---

import VampireRunner from '@site/src/components/VampireRunner';

# Introduction to TPTP & Automated Reasoning

Welcome! This guide introduces the **TPTP** language (Thousands of Problems for Theorem Provers) and lets you **run problems live** using the Vampire theorem prover below.

---

## What is TPTP?

TPTP is a standard language and library for sharing logic problems. In the **FOF** (First-Order Form) dialect, each statement is a named formula with a role:

```tptp
fof(name, role, formula).
```

**Common roles**

- `axiom`: Assumed to be true (background knowledge)
- `hypothesis`: Optional premise
- `conjecture`: The statement we want to prove (or refute)

**Quantifiers & Connectives (FOF)**

- Universal: `! [X] : φ`  
- Existential: `? [X] : φ`  
- Connectives: `&` (and), `|` (or), `~` (not), `=>` (implies), `<=>` (iff)

---

## Example: Who Killed Agatha? (PUZ001+1)

Here’s a classic TPTP puzzle. Read it, then **run it below** in Vampire.

```tptp
% Minimal PUZ001+1.p
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
fof(goal, conjecture, killed(agatha,agatha)).
```

### Try it now

<VampireRunner
  defaultProblem={
`% Minimal PUZ001+1.p
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
fof(goal, conjecture, killed(agatha,agatha)).`
  }
/>

---

## Tips for Writing Your Own Problems

- Keep function and predicate names **lowercase** (`lives(agatha)`), variables **uppercase** (`X`, `Y`).
- Each formula ends with a **period**.
- Start small: add a few `axiom`s, then a single `conjecture`.
- If Vampire times out, try adding `--time_limit 2` in the arguments box.

---

## Next Steps

- Learn more: **FOF syntax essentials**  
- Add arithmetic or equality reasoning  
- Explore proof outputs and strategies (`--proof on`, `--show_options on`)
