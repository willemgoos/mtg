# Plan: Lorwyn Eclipsed (ECL), decks and Jump In

Target: the Lorwyn Eclipsed main set (on Arena since 20 January 2026) in the same form as Reality Fracture: every card
in the set, Arena's ten Jump In packets, ten two-colour 60-card decks, Arena's two Theme Decks, then boosters. **No
Commander decks** (ECC: Dance of the Elements, Blight Curse; paper only).

One branch, `lorwyn-eclipsed`, one sub-phase at a time, each committed when its done criteria hold. Read
`docs/reality-fracture-plan.md` and `docs/final-fantasy-plan.md` first: this plan reuses their rules and wiring and
doesn't repeat them.

## Rules

Same as the FRA plan: done criteria, engine vocabulary in its own commented block (`// Lorwyn Eclipsed (18a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`. Rules text always
comes from the Scryfall oracle text, never from memory. **No shortcuts**: a card does exactly what its text says, or it
stays out (see `docs/marvel-jumpstart-handoff.md` for the wording given to agents). Anything not exact goes in
`docs/shortcuts.md`.

## The set (Scryfall, 9 October 2026)

- 268 main-set cards, collector numbers 1–268 (81 common, 100 uncommon, 65 rare, 22 mythic); basics 269–283, everything
  above is alternate art.
- Layouts: 261 normal, 7 `transform` (Brigid, Eirdu, Oko, Sygg, Grub, Ashling, Trystan: "At the beginning of your first
  main phase, you may pay {X}. If you do, transform …" on both faces).
- 10 cards are already in the pool and keep their earlier printing (Run Away Together, Unexpected Assistance, Auntie's
  Sentence, Sear, Tend the Sprigs, Evolving Wilds, the four shocklands): `ecl` goes last in `SET_PREFERENCE`.

## Mechanics

| Mechanic | Cards | Engine today | Phase |
| --- | --- | --- | --- |
| **Blight N** (put N -1/-1 counters on a creature you control): costs, optional additional costs with "if this spell's additional cost was paid", effects | 24 | -1/-1 counters exist (FRA); one blight card (Brawl) | 18a |
| -1/-1 counters elsewhere ("enters with two -1/-1 counters", "remove a counter") | ~48 mention them | exist | 18b |
| **Changeling** | 16 | exists | 18b |
| **Vivid** (number of colours among permanents you control) | 14 | similar counts exist | 18a |
| **Behold** a type (and "behold … and exile it") | 12 | exists (Marvel, FRA) | 18a for the exile variant |
| **Evoke** | 5 (the Elemental Incarnations) plus 2 mentions | none | 18a |
| **First-main-phase transform** (the 7 two-faced legends) | 7 | transform exists | 18a |
| Persist, wither, conspire | a few | none or partial | 18a |
| "Gains all creature types" (Oko) | 1 | none | 18b |
| Convoke, flash, stun counters, surveil, mill, landcycling, typecycling, Treasure, emblems | many | exist | 18b |

## Phase 18a: engine groundwork

Shared vocabulary every card group needs, built first in one pass so 18b agents only write cards: blight (cost,
optional additional cost, "if blighted" condition, effect), vivid amount, evoke, persist, wither, conspire, the
first-main-phase transform trigger, behold-and-exile. Each with unit tests and bot handling (when to blight, when to
evoke).

## Phase 18b: every card

`scripts/data/ecl-groups.json` assigns every card to a group; `scripts/ecl-status.ts` shows what's left. One file per
group in `src/ecl/`, registered in `src/lorwyn-eclipsed.ts`, so parallel agents never edit the same registry lines. One
agent per group, each in its own worktree, merged into `lorwyn-eclipsed`.

## Phase 18c: decks and Jump In

- **Ten Jump In packets** with Arena's names, colours and themes (from Draftsim's list; Arena never published the card
  lists, so the cards are our picks: twelve ECL cards with one rare or mythic, plus eight lands):

  | Packet | Colour | Theme |
  | --- | --- | --- |
  | Kithkin | W/G | Kithkin typal |
  | Merfolk | W/U | Merfolk typal |
  | Elemental | U/R | Elemental typal |
  | Goblins | B/R | Goblin typal |
  | Elves | B/G | Elf typal |
  | Flashy | U/B | Flash matters |
  | Burdened | W | -1/-1 counters |
  | Blighted | B | Blight |
  | Giant | R | Giant typal |
  | Vivid | G | Vivid |

- **Ten 60-card decks**, one per colour pair, `set: 'ecl'`, built from human-made lists (the archetype example decks
  from Wizards' draft overview and MTGAZone's archetype guide, scaled to 60 like the starter decks), each 45–65% against
  the ten Foundations starter decks. The allied pairs are the five tribes (G/W Kithkin, W/U Merfolk, U/R Elementals, B/R
  Goblins, B/G Elves); the enemy pairs follow their signpost uncommons (W/B Reaping Willow, R/W Hovel Hurler, R/G Noggle
  Robber, G/U Glister Bairn, U/B Voracious Tome-Skimmer).
- **Arena's two Theme Decks** (exact lists from mtg.wiki `Lorwyn_Eclipsed/Theme_Decks`, `source: 'arena'`): Pirates
  (U/R, needs 12 cards from other sets) and Angels (W/G, needs 7).

## Phase 18d: boosters

`PackSet` `'ecl'` in Expedition and a Season pack kind, sheets from the ECL booster list.

## Simplifications to revisit

(none yet)
