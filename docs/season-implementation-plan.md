# Season implementation plan

Based on [agreed design](season-mode.md). Pack research is in the
[Arena reference](season-arena-reference.md). This roadmap tracks implementation
and validation status below.

## Implementation status — 2026-09-30

Phase 1's state and persistence layer is implemented in
`apps/web/src/game/season.ts` and `seasonStorage.ts`, with 33 focused tests in
`apps/web/test/season.test.ts` and `seasonStorage.test.ts`.

- Versioned independent saves, stable collectible IDs, initial starters/coins,
  deck validation/editing, one-time starter purchases, pack inventory, crafting,
  resolved pack reward accounting, wildcard tracks, Vault claims, and coin rewards.
- Named save create/switch/rename/confirmed reset APIs and validated backup
  export/import into separate saves. Reset retains monotonically increasing
  transaction IDs so old callbacks cannot affect a new match or pack.
- One complete persistence write per transaction. Invalid data and write failures
  are reported; existing durable data is preserved.
- Match foundation snapshots both decks and records deterministic engine actions.
  Restoring replays and validates those actions, including the human fifth-turn
  concession gate. Pack receipts/RNG and match reward receipts persist together
  with collection changes; duplicate callbacks cannot pay again.

Validation: all 337 tests pass with `corepack pnpm exec vitest run --testTimeout=20000`;
the default five-second timeout was exceeded by an existing AI simulation under the
full suite. Workspace typechecks and `corepack pnpm exec eslint apps packages` pass.
Root-wide lint reports 100 errors in existing `.scratch` files. Those files and
unrelated UI working-tree changes were not modified.

Phase 2's hub and playable match integration are now delivered (see below).
Phase 3's sampler and shop/reveal/crafting UI are now delivered (see below).
The sampler is explicitly an approximation using a partial supported sheet,
not a full Arena-equivalent pack generator. A full game-engine rules change
may require a save-version migration because active matches restore by replay.

## Phase 2 status — 2026-09-30

Implemented `components/Season.tsx`, its scoped stylesheet, and `game/seasonMatch.ts`.
Home has a Season entry. The hub exposes named save creation/switching/renaming,
confirmed reset, backup export/import, and deck create/copy/edit/select controls.
Imported saves receive a distinct display name. Deck drafts can be saved incomplete,
but Play requires a legal selected deck. Shared collection copies are not consumed.

Matches queue from the ten supported starters with independent 25/50/25 bot skill
selection and persisted engine seed/play order. Each action goes through Season's
repository before the visible board advances, bypassing the existing global match
autosave. Terminal action and reward resolve in the same storage transaction.
Concessions and abandonment use the human fifth-turn gate. Pause/reload preserves
the selected opponent and deck snapshots, and reconstructs the game log from actions.
The error screen can retry from durable progress after a write failure.

Validation:

- All 341 tests pass with the documented 20-second timeout, including four new
  match-integration tests (37 Season tests in total).
- Workspace typechecks, `eslint apps packages`, and the production web build pass.
  The build reports a large-bundle advisory; root lint's existing scratch-file
  errors are unchanged.
- Browser checks: starter selection, copy/edit without consuming collection,
  keyboard editing, random queue, pause/reload/resume, 0-coin early concession,
  50-coin eligible concession, and no repeated payout after reload.
- Browser checks: multiple saves, independent backup import, cancelled and confirmed
  resets, incomplete deck blocking, and a simulated storage quota failure followed
  by successful retry. The eligible-concession check used a deterministic engine
  action fixture to reach the fifth human turn before exercising the real UI.
- Visually inspected the hub at large desktop and 1100×720 sizes. Home can scroll
  when the additional Season entry exceeds the available height.

The initial roster still consists of starters; calibrated deck-strength selection
and the twenty additional curated builds remain Phase 4. No shop or crafting UI
is exposed yet. Existing Quick Play, Gauntlet, and Expedition APIs retain their
default autosave and result behavior.

## Phase 3 status — 2026-09-30

Implemented `game/seasonPacks.ts` and `components/SeasonEconomy.tsx`. The hub has
Shop, Packs, and Collection views, wildcard balances/tracks, and repeatable Vault
claims that preserve overflow. Starters show full contents, owned quantities,
prices, and excess-copy treatment before purchase. Purchases enforce affordability
and one-time starter ownership. Collection filters support search, ownership,
rarity, and color with pagination; crafting previews its card, quantity, matching
wildcard balance, and cost. Deck editing offers the same crafting workflow and
receives new owned copies immediately.

Pack opening persists eight resolved rewards before individual/all-card reveal.
The last receipt can be viewed again after reload. Seeded sampling has same-rarity
rare/mythic protection, Vault/coin duplicate conversions, six-pack tracks, and
increasing wildcard chances calibrated to the published averages. Miss counters
and receipt bonus details are additive optional fields, preserving older saves.
The full algorithm and fidelity limits are in the Arena reference.

Added a reproducible Foundations inventory script and identity manifests. There
are 517 FDN names: 224 registered, 293 missing. Of 271 regular Arena pack
candidates, 133 are registered and in prototype packs. Ten SPG cards are inventoried
separately, none supported, so their slot is disabled. This is an inventory of
registered coverage, not certification of every existing card's rules behavior;
actual missing-card implementation batches remain outstanding.

Validation: all 349 tests pass, including eight pack tests and a seeded 60,000-pack
rate check. Workspace typechecks, application/package lint, and production build
pass (the existing large-bundle advisory remains). Browser checks cover purchases
to zero balance, persisted pack receipts after reload without another grant,
keyboard reveal, collection filtering/pagination, rarity-aware crafting from the
hub and deck editor, starter previews/repeat blocking, and two Vault claims with
overflow. A simulated quota failure leaves the pack unopened and storage unchanged;
retry succeeds. Funds/wildcards/Vault points for starter and overflow browser checks
were seeded into a temporary QA save. Desktop and 1100×720 views were inspected;
the hub now has a bounded scroll container for its longer contents.

## Existing foundations

Inspected 2026-09-30:

| Existing code                                                               | Reuse and required change                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/DeckBuilder.tsx`                                   | Shared builder accepts card counts and unlimited basics. Add Season ownership/copy-limit validation and crafting controls. This component currently has uncommitted changes; integrate with them. |
| `apps/web/src/components/PackOpening.tsx`                                   | Reuse visual presentation where practical. Current API is tied to Expedition and selecting cards to keep; Season grants every reward.                                                             |
| `apps/web/src/game/expedition.ts`                                           | Current pack generator uses 12 cards and a partial FDN printing filter. Build separate Season pack rules rather than treating this as Arena pack logic.                                           |
| `apps/web/src/game/saved.ts`                                                | Saves one global match under `mtg.savedGame`. Introduce per-Season-save match ownership and a versioned restore path.                                                                             |
| `apps/web/src/game/useGame.ts`                                              | Already accepts custom player card arrays. Opponent lookup uses registered deck IDs; add curated Season lists and a mode-aware persistence/result boundary.                                       |
| `apps/web/src/game/bot.worker.ts`                                           | Easy, heuristic, and search bots are available. Start by mapping these to the agreed skill buckets, then validate their behavior.                                                                 |
| `packages/cards/src/pool.ts`, `behaviors.ts`, and `generated/scryfall.json` | Extend cards in verified batches. Imported metadata and registered behavior alone do not prove correct gameplay.                                                                                  |
| `packages/cards/test/cards.test.ts`                                         | Existing coverage/deck legality tests provide a base for pool and deck manifest checks.                                                                                                           |
| `packages/ai/scripts/arena.ts`                                              | Existing bot runner alternates starting players and exercises deck pairings. Extend it for Season roster analysis.                                                                                |

Do not replace existing Quick Play, Gauntlet, or Expedition behavior. Add Season as
its own mode and reuse shared UI deliberately. Preserve unrelated working-tree edits.

## Milestone 1 — Persistent saves and collection model

Own new Season state/storage modules under `apps/web/src/game/`, plus focused tests.

- Define stable IDs and a versioned save schema: name, timestamps, coins, owned
  card counts, purchased starters, decklists, wildcard balances/tracks, Vault points,
  pack inventory, RNG state, and any active match/result transaction.
- Implement pure state transitions for initialization, deck editing, purchases,
  crafting, pack rewards, and match resolution. Use stable collectible IDs rather
  than artwork-printing IDs for ownership.
- Create named saves with one selected starter and 400 coins. Support switching,
  renaming, and confirmed resetting, with no fixed application save limit.
- Add backup export/import. Validate schema, card references, and quantities before
  importing into a new save. Keep the original save and rejected backup intact.
- Persist each transaction as one complete next state. Surface storage failures
  before reporting that coins, purchases, or progress were saved.

Acceptance: reload preserves distinct saves; backup round-trip preserves progress;
malformed/unsupported backups do not overwrite data; editing one deck does not
consume collection copies or alter another deck.

## Milestone 2 — Playable Season loop

Own a Season hub component, result integration in `App.tsx`/`useGame.ts`, and
per-save match restoration. Build on Milestone 1.

- Add Season entry, selected deck, coin balance, deck editing, and Play/Resume.
- Validate 60-card minimum, owned quantities, copy limits, and explicit exceptions
  before starting a game. Snapshot both decklists and bot settings for the match.
- Initially use the ten existing starters as the opponent roster; persist opponent,
  seed, match identity, and selected skill before the first action.
- Randomly select easy/heuristic/search at the agreed 25/50/25 weights. Treat this
  mapping as a starting implementation, subject to comparative bot tests.
- Track how many player turns have begun. The concession gate is the player's fifth
  turn, not global turn number five; handle either starting player and future extra
  turns correctly.
- Resolve rewards once: win 100, ordinary loss/draw 50; concession/abandonment 50
  only after the agreed threshold. Closing or switching saves pauses the match.
- Keep terminal game state until the result and reward are durably recorded, then
  clear the active match. Replaying a callback or reopening a result cannot pay twice.

Acceptance: play, finish, receive coins, edit, and play again; reload mid-game
restores the same match; reload at the result cannot lose or double rewards;
concession tests cover both sides of the fifth-turn boundary for both play orders.

## Milestone 3 — Shop, packs, and crafting

Own Season economy/pack modules and shop/collection UI. Reuse existing builder and
pack visuals without adopting Expedition's keep-selection rules.

- Sell 200-coin Foundations packs and the remaining nine starters once each for
  1,000 coins. Preview starter contents and apply the agreed duplicate treatment.
- Implement eight-slot packs, wildcards, progress tracks, Vault, and protected
  rare/mythic rewards using the reference and an explicitly documented sampler.
- Commit generated pack contents/RNG progression together with reward processing
  so interrupted reveal animations cannot reroll or lose cards.
- Grant all rewards; visuals reveal already committed results. If packs can remain
  unopened, store inventory and resolve each pack identity at most once.
- Provide collection filters for owned/unowned cards and rarity-aware crafting.
  Display costs and owned quantities before spending a wildcard.
- Keep the partial prototype pool explicit. Expand pack eligibility only when the
  corresponding mechanics are supported; full release uses the verified manifest.

Acceptance: purchases cannot overspend or repeat a starter grant; crafting charges
one matching wildcard per copy; duplicate protection preserves rarity; Vault
overflow survives reload; reward tracks advance once per opened pack. Test exact
boundaries and seeded distributions rather than relying only on random smoke runs.

## Parallel content track — Complete Foundations

Begin inventory during Milestone 1; deliver content batches alongside milestones
2–3. This is work that can be scheduled alongside Season development, not a request
to launch delegated agents.

1. Refresh the FDN audit by card identity/name; list missing cards, current behavior
   simplifications, and separately required Special Guests. Preserve the dated
   coverage snapshot in the design document.
2. Group cards by mechanics and engine dependencies, prioritizing regular booster
   cards and mechanics needed by planned opponents. Do not simply import all data
   and expose unsupported cards as playable.
3. For each batch, implement card behavior, necessary player choices, AI choices,
   focused rules tests, and coverage checks. Run relevant fuzz simulations.
4. Expand prototype pack sheets and curated lists only after the batch passes.
5. Verify all 517 unique FDN names from the audit, including already-present cards
   with simplified behavior, for the complete-release goal. Reconcile pool changes
   and separate SPG scope explicitly.

Completion means correct rules, usable choices, and reasonable bot usage, not
merely an empty list of missing metadata.

## Milestone 4 — Curated roster and matchmaking

Own the Season opponent registry and analysis tooling; add twenty curated decks
to the ten starters, using supported cards from the full legal pool.

- Give each list a stable ID, strategy, mana curve/base, archetype tags, and an
  estimated strength. Include distinct strategies, not cosmetic substitutions.
- For every list, check legality, implementation coverage, and meaningful bot use
  of its central plan. Fix AI limitations or adjust lists that bots cannot pilot.
- Use the ten starters as reference opponents. Begin with 40 seeded games per list
  against an appropriate reference selection, alternating who starts, and report
  win rates, draws/timeouts, turns, and bot decision latency. This is screening,
  not proof of balance; expand samples only for unresolved findings.
- Estimate strength using simulation results and deck features; validate features
  against edited player decks. Rare count or collection size alone is insufficient.
- Weight deck selection toward similar strength with some variation, then sample
  bot skill independently at 25/50/25. Provide a nearest-available fallback when
  the roster has no close match; persist selection across reloads.
- Playtest starter, partially upgraded, and developed decks against the resulting
  mix. Tune strength bands, selection weights, and AI budgets from evidence.

Acceptance: thirty viable registered lists; no unsupported cards or invalid actions;
documented sample results; reproducible pairing selection; fresh starters and
unusual custom decks can queue without being stranded.

## Milestone 5 — Complete-release validation

- Exercise a new save end to end: choose starter, buy/open packs, craft, edit,
  play, concede, resume, switch saves, export/import, and reset only the chosen save.
- Test interruption points around purchases, pack rewards, match results, and Vault
  claims. Preserve coins and cards consistently across storage and reload failures.
- Run `corepack pnpm test`, `corepack pnpm typecheck`, and `corepack pnpm lint`.
  Record pre-existing failures separately; build the web app with
  `corepack pnpm --filter @mtg/web build` when UI integration is complete.
- Run relevant bot/fuzz coverage for newly added mechanics and roster validation.
  Browser playtesting covers desktop usability, keyboard controls, and save recovery.
- Check actual rewards and pack frequency at different win rates. Initial averages:
  50% wins yields 75 coins/game, or about 2.67 games/pack; a starter costs about
  13.33 games at that rate. Starting funds are separate from these averages.
- Document fidelity limits before claiming full Arena pack parity, including any
  wildcard approximation, Special Guests gap, or Golden Pack omission.

## First implementation slice

Milestones 1–3 are delivered: persistence, playable matches, and the economy UI.
Next implement Foundations content batches and Milestone 4's curated roster and
matchmaking. The content track below is in progress; completing the Season UI
does not complete Foundations support. Milestone 5 remains complete-release validation.

## Foundations content batch status — 2026-09-30

Added 131 previously missing FDN cards with explicit behavior definitions or
printed vanilla/keyword rules. Current coverage is **355 of 517 unique FDN names**;
**162 remain missing**. See the regenerated [inventory](foundations-inventory.md)
for the current list. This batch does not complete the full-set rules-fidelity goal.

The batch includes sweepers, Equipment/Auras, tribal bonuses, filtered tutors,
graveyard recursion, flashback/kicker, counter-based bonuses, and modal triggers.
New engine primitives support generic card filters, dynamic counts/cost reductions,
player-selected graveyards, attached-object references, targeted graveyard returns,
and resolution-time optional abilities. The board and bots handle those choices.
Both the importer and pack sampler exclude cards without an implemented behavior;
regular booster eligibility comes from the manifest rather than all FDN products.

Validation: all 387 tests in 35 files pass, including 32 batch rules/simulation
tests. Seeded games span all batch definitions and replay their action journals
to identical final states. Workspace typechecks, `eslint apps packages`, the
production web build, and `git diff --check` pass. The build retains its large-chunk
advisory. A separate browser context verified Solemn Simulacrum's optional ability
prompt, the decline option, and accepting into a library search without page errors.
No existing browser match or saved progress was changed by that check.

The remaining track needs substantial engine work: planeswalkers/loyalty and
combat targets, X costs and divided targets, explicit mana generation, copy effects,
control changes and characteristic replacement, replacement/prevention effects,
delayed triggers, color/type choices, and specialized additional costs. Register
these only after their choices, rules, and bot handling work; existing card behavior
also still requires the full fidelity audit described above. Rules changes that
alter prior action replay need a saved-match compatibility decision before release.
