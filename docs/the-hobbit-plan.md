# Plan: The Hobbit (HOB)

Target: The Hobbit main set (Scryfall `hob`, released 14 August 2026, on Arena): every card in the set, Arena's Jump In
packets if Arena has them (exact contents, random slots included), human-made 7–0 / 7–x draft trophy decks (one per colour
pair, from untapped.gg, like the Tarkir: Dragonstorm ones), then boosters. **No decks of our own** (the user's rule:
Arena's lists first, human-made next). **No Brawl** and no Commander decks.

One branch, `the-hobbit`, one sub-phase at a time. Read `docs/tarkir-dragonstorm-plan.md` first (and
`docs/lorwyn-eclipsed-plan.md` behind it): this plan reuses their rules, wiring and agent setup and doesn't repeat them.

## Rules

Same as Tarkir: Dragonstorm: engine vocabulary in its own commented block (`// The Hobbit (20a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, rules text from
the Scryfall oracle text. **No shortcuts**: a card does exactly what its text says, or it stays out (wording in
`docs/marvel-jumpstart-handoff.md`). Anything not exact goes in `docs/shortcuts.md`.

## The set

Collector numbers 1–198 are the main set: 75 common, 55 uncommon, 53 rare, 15 mythic. 189–198 are the ten basic lands
(five Plains..Forest, twice), so there are **188 nonbasic cards**: 65 common, 55 uncommon, 53 rare, 15 mythic. Layouts: 173
`normal`, 17 `adventure`, 8 `saga` (basics included in the normal count). 199–213 are not on Arena, 214–312 are alternate art
(both ignored), 313–320 are basics. Scryfall marks no card `booster: true`, so the booster list is the 188 nonbasic main-set
cards at their HOB rarity (`src/hob/booster-list.ts`, from `node scripts/fetch-booster-list.ts hob`). No card of the set was
in the pool before (no group `existing`); `hob` is last in `SET_PREFERENCE`, so reprints from other sets keep their earlier
printing. Tokens (Scryfall set `thob`): Goblin Army 0/0 black, Human Soldier 1/1 white, Dwarf 2/2 red, Dragon 6/6 red flying,
Bear 2/2, Elf 1/1, Wolf 2/2 (all green), Bird Soldier 4/4 flying, Stone Boulder 3/1 artifact Wall with defender, Axe
(artifact Equipment, +1/+0, equip {2}), Treasure (exists), plus the non-token cards Enduring Story and On an Adventure
(markers, see Storied and Adventures below).

## Mechanics (20a)

| Mechanic (cards) | Engine today |
| --- | --- |
| Adventure (17 cards) | exists (Final Fantasy, Bloomburrow): two records, creature plus spell side |
| Saga (8 cards) | exists (`saga: N`, chapter abilities) |
| Amass Goblins N (5: Down, Down to Goblin-town; Gathering of Darkness; Great Ugly-Looking Goblin; Rage into the Valley; Tidings of War; the 14 Goblin Army makers) | only a one-card effect for Zombies (`u15bAmass`); a general "amass <type> N" (Goblin Army token 0/0 `hob-goblin-army-token`, subtype added to an existing Army) is **missing** |
| Recruit (10: The Mountain-king's Return, Celebrate the Mountain-king, Esgaroth Garrison, Lake-town Lookout, The Queen of Dale, Great Gilded Boat, Long Lake Nuisance, Sound the Trumpets, Bard's Company, Patient Instructor) | **missing**: loot (draw, then discard), and if a nonland card was discarded create `hob-human-soldier-token`; loot and discard-then-check pieces exist, the combined step doesn't |
| Storied (9 Dwarves: Dáin, Lord of the Iron Hills; Fíli; Kíli; Ori; Balin; Bombur; Óin; Bifur; Thorin Oakenshield) | **missing**: "if you control three or more artifacts, legendaries and/or Sagas, you have an enduring story for the rest of the game" is a permanent per-player flag (Enduring Story card shown as a marker), set by an ETB/trigger check and read by later conditions |
| Landfall (10 cards) | exists (`{ on: 'landfall' }`) |
| Ferocious (6: Nighthowl Pursuer, Ravening Warg, Nasty Little Rabbit, Wargling, Wilderland Scrounger, The Chief Warg) | exists as a condition: `controlsCreature` with `filter.minPower: 4` (Secrets of Strixhaven uses the amount form) |
| Threshold (1: Most Decrepit Old Bird) | exists (`cardsInGraveyard` condition, "threshold-style" fields in `types.ts`) |
| Treasure (10 cards) | exists (`treasure-token`) |
| Behold an Elf (1: Elven Passage) | exists (Lorwyn Eclipsed `behold`, Tarkir's Dragon variants) |
| Gift (1: Bilbo's Gambit) | exists (`as: 'gift'`, Bloomburrow/Lorwyn) |
| Landcycling / Mountaincycling / Halflingcycling (2: Last Light of Durin's Day, Hobbit Hole) | plain cycling exists (activated from hand); the names `Landcycling` and `Mountaincycling` are known ability names in `build.ts` but there is no builder that searches for the type; **Halflingcycling is missing** (search for a Halfling card) |
| Equip (15 cards) | exists |
| Crew (1: Great Gilded Boat) | exists |
| Kicker (1: The Eagles Are Coming!) | exists |
| Flashback (3: Moment of Glory, Plunder the Trollshaws, Tidings of War) | exists |
| Affinity (1: Cantankerous Keepers) | exists as cost reduction per matching permanent (`types.ts` "affinity") |
| Ward (2: Gandalf, Wandering Wizard; Lake-town Mariners) | exists |

## Phases

- **20a**: engine groundwork for the missing mechanics above (amass Goblins, Recruit, Storied and the enduring story,
  Halflingcycling / typecycling), with tests, bot handling and Arena-style prompts.
- **20b**: every card, one agent per build group in worktrees (`scripts/data/hob-groups.json`, `scripts/hob-status.ts`,
  `src/hob/<group>.ts`, registered in `src/the-hobbit.ts`). Groups (front-face names): white 28, blue 28, black 27, red 29,
  green 28, multicolour 26 (gold and hybrid), colorless 22 (artifacts and lands); 188 in all. Back faces (adventure
  spells) go in each group's `_BACKS`; tokens used by one card live in the group file, shared ones are in `hob/tokens.ts`.
- **20c**: Arena's Jump In packets for HOB (`scripts/data/arena-jumpin-packets.json`, if Arena has them) and the untapped.gg
  trophy decks (`scripts/data/hob-trophy-decks.*`), one per colour pair.
- **20d**: boosters in Expedition, Season and Sealed from `HOB_BOOSTER_LIST`.

## Wiring done (20 wiring)

`SET_PREFERENCE` ends with `hob`; `fetch-booster-list.ts` knows `hob`; `src/the-hobbit.ts` merges `src/hob/*.ts` (empty
stubs) and is registered in `behaviors.ts`, `pool.ts` (`THE_HOBBIT_POOL`), `index.ts`, `cards.test.ts`; the `'hob'` set key is
in `decks.ts`, `jumpin.ts`, `JumpIn.tsx` and `jumpInMatch.ts`. `pnpm cards:fetch` takes cards by pool name, so HOB cards
appear in `generated/scryfall.json` as their behaviours are added (the cached bulk file already has set `hob`).
