# MTG

Single-player Magic: The Gathering client with bot opponents. Mono-red vs. mono-green, Foundations-era cards.

```
packages/engine   pure TS rules engine (no DOM/Node), deterministic, headless
packages/cards    card pool, Scryfall loader, behaviors, decklists, sim script
packages/ai       bots (heuristic lookahead, random) and a bot-vs-bot match runner
apps/web          Vite + React UI: play against the heuristic bot
```

## Commands

pnpm isn't installed globally here; prefix with `corepack` (or run `corepack enable` once).

```bash
corepack pnpm install
corepack pnpm dev             # play in the browser at http://localhost:5173
corepack pnpm test            # vitest, all packages
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm cards:fetch     # re-generate packages/cards/src/generated/scryfall.json
corepack pnpm sim -- 200      # random-vs-random games; add --log for a play-by-play
corepack pnpm arena -- 40     # bot-vs-bot win rates; `-- --log 3` shows one game
```

TypeScript is pinned to 6.x because typescript-eslint doesn't support TS 7 yet.

## Sandstone arena

Matches use the authored Blender sandstone ruin behind the card UI. Open
Settings ? Arena detail to choose Balanced (default), Low, or Static; the choice
persists locally. Reduced-motion preferences stop ambient motion and arena
reactions. Unavailable or lost WebGL contexts fall back to a matching bundled still.

The damaged masonry scene is in `art/arena/sandstone-arena-damaged.blend`.
`art/arena/export_arena.py` bakes the procedural materials and lighting into two
unlit meshes (a 2048px floor texture and a 4096px scenery atlas), then exports
`apps/web/public/arena/sandstone-arena.glb`. Run it with Blender in background
mode, for example: `blender --background --python art/arena/export_arena.py`.
The runtime loads it lazily, keeps the still visible while loading, and avoids
real-time shadow passes. Balanced and Low vary pixel density and ambient effects.
`arenaScene.ts` owns rendering and cleanup; `arena.ts` maps existing visual cues
to bounded spell and combat reactions without changing game state.

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
- **Combat damage** is auto-assigned in the attacker's interest: it kills the most
  powerful blockers it can afford, and with trample the rest goes to the player once
  every blocker has lethal damage. (Current rules have no damage assignment order.)
- **Triggers** are collected from the event stream and put on the stack in APNAP order
  whenever a player would receive priority.
- **Card behavior** is declarative (`TargetSpec`, `EffectDef`, `TriggerDef`, `StaticDef`)
  with a `custom` escape hatch registered via `createEngine(db, { customEffects })`.
  Printed characteristics come from Scryfall; `packages/cards/src/behaviors.ts` holds only
  rules text. A test fails if a card with rules text has no behavior.
- `@mtg/engine/testing` has `buildScenario` and `GameDriver` for mid-game test setups.

## AI

Bots implement `chooseAction(view, player)` and only ever see `redactFor(state, player)`.
Hidden cards become an inert placeholder, so bots don't know or guess your decklist.
`playMatch` runs bot-vs-bot games and checks every action against the real engine.

The **heuristic bot** is a one-ply lookahead. For each legal action it simulates to the end
of the stack (or of combat) against a passive opponent and scores the result: life on a
log scale, creature value from power/toughness/keywords, and cards in hand. Until-end-of-turn
pumps don't count, so tricks are only used when they change a fight.

- **Attacks** are chosen greedily (plus an all-in check), with the opponent's blocks
  predicted by a rule-based policy and a penalty for leaving itself open to a lethal
  counterattack.
- **Blocks** are chosen per attacker by simulating no block, single blocks and double blocks.

In 40-game runs it beats the random bot about 95% of the time. In the heuristic mirror,
green beats red about 64% of the time.

The **search bot** (`createSearchBot(db, decklists, { rollouts, timeMs })`) is determinized
Monte Carlo search. Unlike the heuristic bot, it knows both decklists, as if it knew the
format. For each playout it samples the hidden cards from the decklists (`determinize`),
applies a candidate option, lets the heuristic bot play both sides for about two turns,
and scores the result.

- **Candidates:** casts and abilities (the heuristic keeps the best two target choices per
  card), passing, and whole attack or block plans (the heuristic's plan, none, all-in,
  single attackers, one-change variations).
- **Budget:** spread with successive halving, and all candidates are compared on the same
  sampled worlds.
- **When it searches:** only in its main phase, in combat, or in response to something
  on the stack. Otherwise it plays like the heuristic bot.

In the web app the opponent (Apprentice = heuristic, Master = search) runs in a Web Worker
so the board stays smooth while it thinks.

## Known gaps / next steps

- AI: search is flat (it compares root options by playouts; there's no tree below the
  root), and playouts use the heuristic's passive opponent model. The heuristic bot is
  also the main cost; a cheaper playout policy would allow more playouts.

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
