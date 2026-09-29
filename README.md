# MTG

Single-player Magic: The Gathering client with bot opponents. Mono-red vs. mono-green, Foundations-era cards.

```
packages/engine   pure TS rules engine (no DOM/Node), deterministic, headless
packages/cards    card pool, Scryfall loader, behaviors, decklists, sim script
apps/web          (later) Vite + React UI
```

## Commands

pnpm isn't installed globally here; prefix with `corepack` (or run `corepack enable` once).

```bash
corepack pnpm install
corepack pnpm test            # vitest, all packages
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm cards:fetch     # re-generate packages/cards/src/generated/scryfall.json
corepack pnpm sim -- 200      # random-vs-random games; add --log for a play-by-play
```

TypeScript is pinned to 6.x because typescript-eslint doesn't support TS 7 yet.

## Engine design

- **API**: `createEngine(cardDb)` returns `newGame`, `getLegalActions(state, player)` and
  `applyAction(state, action) → { state, events }`. UI, bots and tests use only these.
- **State** is plain JSON-serializable data. Card definitions are not in state; objects
  reference them by `defId`. `applyAction` clones the state (a hand-written
  `cloneState`) and mutates the copy. `applyActionInPlace` skips the clone, for
  simulations that clone once per playout. Random play runs about 200k actions/s.
- **Determinism**: the only randomness is `state.rng` (xoshiro128\*\*). The same seed and
  actions always give the same game; recorded actions replay exactly.
- **Hidden information**: `redactFor(state, viewer)` hides both libraries and the
  opponent's hand (`defId: '?'`) and wipes the seed and RNG. `redactEvents` does the same
  for event streams. `determinize(redacted, decklists, seed)` fills hidden cards with a
  random assignment consistent with the decklists, so bots can simulate. Object ids are
  assigned after the opening shuffle, so they don't reveal decklist order.
- **Decisions**: `state.decision` always says who must act and what kind of choice it is
  (priority, declare attackers/blockers, trigger targets, mulligan, discard). Attacks and
  blocks are declared one creature at a time (`addAttacker` … `confirmAttackers`), which
  keeps the legal-action list small for bots.
- **Object identity**: objects keep their id across zones; `zcc` (zone-change counter)
  goes up on each move, so `ObjectRef {id, zcc}` targets go stale correctly (rule 400.7).
- **Mana** is auto-paid (lands before creatures); `payWith` lets the UI choose. There is
  no floating mana pool yet, because nothing in the pool needs it.
- **Combat damage** is auto-assigned: lethal damage to each blocker in order, the excess
  to the player with trample. (Current rules have no damage assignment order.)
- **Triggers** are collected from the event stream and put on the stack in APNAP order
  whenever a player would receive priority.
- **Card behavior** is declarative (`TargetSpec`, `EffectDef`, `TriggerDef`, `StaticDef`)
  with a `custom` escape hatch registered via `createEngine(db, { customEffects })`.
  Printed characteristics come from Scryfall; `packages/cards/src/behaviors.ts` holds only
  rules text. A test fails if a card with rules text has no behavior.
- `@mtg/engine/testing` has `buildScenario` and `GameDriver` for mid-game test setups.

## Known gaps / next steps

- Manual combat damage assignment, and ordering several simultaneous triggers (both
  automatic for now).
- Speed: the main remaining hotspot is `characteristics()` (power/toughness and keyword
  lookups, which allocate a keyword set on every call). Cache it if a search bot needs
  more speed.
- Determinization treats everything hidden as unknown. A player's knowledge of their own
  mulligan bottoms isn't tracked.
- Token art: tokens are defined by hand and have no Scryfall image yet.
- Broken Wings is modeled as "destroy target creature with flying" (no artifacts or
  enchantments in the pool).
