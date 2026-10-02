# Plan: Marvel Super Heroes, in two parallel streams

Target: the whole Marvel release as Arena has it (on Arena since 23 June 2026):

- **Stream A, Brawl precons:** the four 100-card Marvel Super Heroes Commander (MSC) precons, played as **Brawl**, Arena's 1v1 Commander.
- **Stream B, main set:** the 276-card Marvel Super Heroes (MSH) set, done like Bloomburrow: our own two-colour 60-card decks, every rare and mythic, then boosters.

The two streams are worked on at the same time by two agents, each in its own worktree. Read **Shared rules** first, then
only your own stream.

## Shared rules (both streams)

### Before you start

- Read `CLAUDE.md` (Arena is the reference), the done criteria in `docs/deck-plan.md`, and how Bloomburrow was built (phase 8
  there, `packages/cards/src/blb/`, `packages/cards/src/bloomburrow.ts`). Follow the same patterns.
- Card text comes from Scryfall (`pnpm cards:fetch`). Decklists come from `https://mtg.wtf/deck/msc/<slug>`, checked against mtg.wiki
  through the MediaWiki API.

### Branches

- `marvel` is the integration branch, cut from `bloomburrow`.
- Stream A works on `marvel-brawl`, Stream B on `marvel-msh`, each in its own git worktree, both cut from `marvel`.
- Commit at the end of each sub-phase, with tests, typecheck and lint green. The user merges into `marvel`. Before starting the next
  sub-phase, merge `marvel` into your branch so you pick up the other stream's work.

### Who owns what

Each mechanic is built by **one** stream. If you need something the other stream owns and it isn't on `marvel` yet, do another part
of your phase first. Don't build a second version.

| Built by A | Built by B |
|---|---|
| Brawl format: command zone, commander tax, colour identity, "your commander" | Power-up |
| Cycling (B's landcycling/typecycling extend it) | Teamwork |
| Sagas | Transform (double-faced cards) |
| Phasing | **Connive** (A's Doom Prevails needs it, so A does that deck last) |
| Damage replacement and redirection | Sneak |
| "Cast as though it had flash" | Investigate / Clue, improvise, enrage, boast, extort |
| Goad, mayhem, unearth, multikicker, overload, melee | Landcycling, typecycling |
| Rebound, cascade, discover, escalate, metalcraft | |

### Shared files

- **Engine vocabulary** (`packages/engine/src/types.ts`, `effects.ts`): add new effect kinds and fields in a block for your
  mechanic, with a comment naming it. Don't reorder or reformat existing code, so merges stay simple.
- **`packages/cards/scripts/fetch-scryfall.ts`:** A adds the `msc` set, `saga` layout and Marvel names (`flavor_name`); B adds
  `msh` and the `transform` layout. Both are small edits; merge them by hand if they conflict.
- **`packages/cards/src/generated/scryfall.json`:** never merge by hand. After a merge, run `pnpm cards:fetch` and commit the result.
- **`packages/cards/src/decks.ts`, `pool.ts`, `behaviors.ts`:** add your own lists and blocks (A: `MARVEL_BRAWL_DECKS`, B:
  `MARVEL_DECKS`). Touch the shared arrays only to add them.
- Card behaviour goes in its own folders: A in `packages/cards/src/msc/`, B in `packages/cards/src/msh/`.

### Done criteria (every sub-phase)

As in `docs/deck-plan.md`:

- Every card in the deck is implemented; the coverage test fails otherwise.
- Unit tests for each new mechanic.
- The random-game fuzz test passes with the new decks.
- The arena script (`pnpm arena`) runs bot vs bot without errors and with sensible win rates.
- The deck is playable in the web UI, with an Arena-style prompt for any new choice.

At the end of each sub-phase, record any simplifications in that stream's **Simplifications** list at the bottom of this file.

---

## Stream A: Brawl and the four precons (`marvel-brawl`)

### Brawl rules (as on Arena)

- 1v1 only, **25 starting life**, no commander damage.
- 100-card singleton (basic lands excepted), with one legendary creature as commander. Every card must fit the commander's colour identity.
- The commander starts in the **command zone** and can be cast from there. Each earlier cast from the command zone adds {2} to the cost (commander tax).
- If the commander would go to the graveyard or exile, or into the hand or library, its owner may put it into the command zone instead (Arena asks).
- The first mulligan is free.

### The precons

"Cards" counts the different non-basic cards in each deck. We already have 1 to 4 of each deck's cards, so effectively all of them are new.

| Deck (mtg.wtf slug) | Commander | Colours | Cards | Main mechanics |
|---|---|---|---|---|
| Avengers Assemble (`avengers-assemble`) | Captain America, Team Leader | W/U/R | 84 | Heroes, +1/+1 counters, equipment, flash enablers |
| Wakanda Forever (`wakanda-forever`) | T'Challa, the Black Panther | G/W | 76 | Artifacts (24), equipment (6), crew, metalcraft, affinity |
| The Fantastic Four (`the-fantastic-four`) | Invisible Woman | W/U/R/G | 83 | 23 sorceries, rebound (8), flashback, cascade, discover, escalate |
| Doom Prevails (`doom-prevails`) | Doctor Doom, King of Latveria | U/B/R | 85 | Connive (9, from B), goad, mayhem, unearth, sagas |

The four decks have 295 different non-basic cards in total, and 20 of them appear in more than one deck: Sol Ring, Arcane Signet,
Command Tower, Path of Ancestry, Exotic Orchard, Terramorphic Expanse, Talismans, dual lands. 9a does these once.

13 reprints carry a Marvel name in the decklist (e.g. "S.H.I.E.L.D. Spy Satellite" is Fellwar Stone, "Raise Repulsor Shields" is Raise the
Palisade). Store the Oracle name and show the Marvel name, as the printed card does.

The collector's editions have the same lists as the regular decks and are skipped.

### 9a: Brawl format and the shared staples

Engine (`packages/engine`):

- `ZoneName` gains `'command'`; each player gets a command zone. `setup.ts` takes a commander per player and puts it there.
- Casting from the command zone, with the tax tracked per commander (number of casts from there so far).
- The "put it into the command zone instead" replacement, as a decision for the owner.
- Game option `format: 'brawl'`: 25 life and a free first mulligan.
- "Your commander" in card text (Jocasta, Bastion Protector, Command Tower, Arcane Signet, Path of Ancestry, Tome of Legends, Folk Hero).
- Colour identity: mana cost plus mana symbols in the rules text. Command Tower and Arcane Signet make mana of the commander's colours.
- Cycling (for cycling lands and spells in the precons).

Cards (`packages/cards`):

- `Decklist` gains `commander?: string`, `series: 'brawl'` and `set: 'msc'`. A test checks every Brawl deck has 100 cards, is singleton and fits its colour identity.
- `fetch-scryfall.ts`: the `msc` set, `saga` layout, Marvel names.
- The shared staples: mana rocks (Sol Ring, Arcane Signet, Talismans, Fellwar Stone, Thought Vessel) and lands (Command Tower,
  Exotic Orchard, Path of Ancestry; check-, slow-, pain-, snarl- and cycling lands; Terramorphic Expanse, Evolving Wilds).
- A test-only Brawl deck from existing cards plus the staples, so the format is tested before any precon lands.

Web (`apps/web`):

- A command-zone slot by each player's portrait, as on Arena, showing the commander and its current tax.
- A **Brawl** entry on Home with its own deck picker. Brawl decks only play Brawl decks.
- A prompt for "move to the command zone?".
- DeckView handles 100 cards: grouped by type, commander on top.

Bots (`packages/ai`): cast the commander from the command zone like a normal spell, with the tax included in its cost. Always send
it back to the command zone. Use 25 life in evaluation.

### 9b: Avengers Assemble (W/U/R)

- Damage replacement: Thor (+1 damage to opponents and their permanents) and Heroic Sacrifice (all your damage redirected to one creature).
- "Cast spells as though they had flash": Quicksilver while tapped, Captain Mar-Vell's Cosmic Awareness.
- "Untap it the first time it becomes tapped this turn" (Captain America, Living Legend).
- Phasing (Vision).
- Base P/T from equipment (Hulkbuster Armor) and "Equip Hero".
- Exile face down, then cast free (Scarlet Witch). "Costs less if a creature is attacking you" (Heroic Return, Avenge).
- Hero cost reduction and Hero-only mana (Director Nick Fury, Avengers Tower).

After 9b, Avengers Assemble plays the test deck from 9a.

### 9c: Wakanda Forever (G/W)

- 24 artifacts, 6 with equip, 3 vehicles. Crew already exists, so the work is mainly equip variants and auto-attach.
- Metalcraft, affinity for artifacts.
- The Bead cards (AV / Prime / Communication Bead) and the vibranium cards as `custom` handlers.

### 9d: The Fantastic Four (W/U/R/G)

- 23 sorceries: rebound (exile it, cast it again at your next upkeep), cascade, discover, escalate.
- Flashback already exists; check it covers this deck.
- The first four-colour deck: tests colour identity and the bots' mana with four colours.

### 9e: Doom Prevails (U/B/R)

Last, because it needs connive from Stream B (10a).

- Goad: in 1v1, the goaded creature attacks each combat if able.
- Mayhem, unearth, multikicker, overload, melee.
- Sagas (Age of Ultron, Kang Dynasty): lore counters, chapter triggers, sacrifice after the last chapter.
- The mercenary and contraband one-offs (Hire a Mercenary, Sell Contraband, Buy Information) as `custom` handlers.

After 9e, the arena script runs every Brawl matchup of the four precons. Aim for 35 to 65% each.

### Stream A out of scope

- Multiplayer (paper Commander with 3 or 4 players) and commander damage: Arena's Brawl has neither.
- Brawl deck building: the precons are played as printed.

---

## Stream B: Marvel Super Heroes main set (`marvel-msh`)

Like Bloomburrow (phase 8 in `docs/deck-plan.md`):

- Our own two-colour 60-card decks (36 spells, 24 lands), shown in their own deck section, with `set: 'msh'`.
- They play against the Foundations and Bloomburrow decks.
- Card behaviour goes in `packages/cards/src/msh/`, one file per pair of decks plus others/mythics, merged in `packages/cards/src/marvel.ts`.

The set: 276 non-basic cards (91 common, 100 uncommon, 60 rare, 25 mythic).

Most keywords exist already: flying, flash, vigilance, reach, trample, lifelink, deathtouch, haste, menace, first/double strike,
indestructible, hexproof, ward, equip, crew, Treasure, Food, scry, surveil, mill, fight, prowess, landfall, flashback, convoke.
Named abilities such as "Radar Sense" or "Street Justice" are just labels with no rules of their own.

### 10a: the set mechanics and the first two decks: done

Done: connive, power-up, teamwork (with a board prompt to pick the creatures to tap), double-faced cards (the five Marvel ones are
modal: either face can be cast, and the front transforms; hover shows the other face, a permanent flips as it transforms), the
set's gain-lands, and two decks: **Heroes Unite** (R/W teamwork and power-up, with Monica Rambeau) and **Villainous Schemes** (U/B
connive villains). Bot vs bot over 160 games against the ten Foundations starter decks: Heroes Unite 50%, Villainous Schemes 47%.


- **Power-up** (24 cards): an activated ability usable once per card. Its cost is reduced by the card's mana cost if it entered
  this turn. (E.g. Abomination: "Power-up {5}{R/G}{R/G}: put a +1/+1 counter on him; he fights up to one target creature".)
- **Teamwork** (12 cards): an optional additional cost of tapping any number of your creatures with total power N or more, which
  improves the spell. It needs a prompt to pick the creatures, and Agent Maria Hill cares about "becomes tapped to pay a teamwork cost".
- **Connive** (11 cards here; Stream A needs it too): draw a card, then discard a card; if it was a nonland card, put a +1/+1 counter
  on the creature. Do it early in 10a and get it merged into `marvel` soon.
- **Transform** (6 cards): double-faced cards in the engine, the Scryfall import (`transform` layout) and the card UI (show the other face, flip animation as on Arena).
- Two decks whose themes use these mechanics, e.g. Heroes/teamwork and villains/connive.

### 10b: the rest of the decks

- About ten decks in total, one per colour pair, built around the set's themes, as Bloomburrow did with its animal decks.
- New along the way: sneak (cast for its sneak cost by returning an unblocked attacker to hand; it enters tapped and attacking),
  landcycling and typecycling (extending Stream A's cycling), investigate/Clue, improvise, enrage, boast, extort.
- Bot vs bot across the Foundations starter decks: aim for 45 to 65% per deck, as in phase 8.

### 10c: every rare and mythic, then boosters

- All 60 rares and 25 mythics, including those not in any of our decks.
- MSH boosters in Expedition and Season, as was done for Bloomburrow.

---

## Simplifications to revisit

### Stream A

(Filled in as sub-phases ship.)

### Stream B

10a:

- Teamwork: bots (and free casts) let the engine pick the creatures to tap: ones that want tapping (Agent Maria Hill), then
  summoning-sick ones, then the biggest; mana creatures are spared when possible. The heuristic bot never pays teamwork on its own
  turn before combat, since its evaluation can't see the lost attack.
- Power-up: the cost shown in the ability menu is the printed one, not the reduced one. Wonder Man's extra activation, Hulk's
  {3} discount and Kang's "power-up abilities can't be activated" are not built yet (10c).
- Transform: after a permanent transforms, "activate only once" bookkeeping is by ability index, so it isn't reset or remapped
  between faces (no current card cares).
- K'un-Lun Warrior (not in a deck now) offers only the discard, not "sacrifice an artifact".
- Baron Strucker's "you may have it connive. Do this only once each turn" triggers once each turn even if you decline.
- Leader, Super-Genius's connive replacement is not built (10c).
