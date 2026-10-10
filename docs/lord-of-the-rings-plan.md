# Plan: The Lord of the Rings: Tales of Middle-earth Jumpstart (LTR)

Target: the 20 official paper **LotR Jumpstart** packets (Volume 1: Courageous, Tricksy, Mordor, Marauders, Journey;
Volume 2: Mortals, Cunning, Orcish, Riders, Elven; two versions of each), exact contents, random slot included, in the Jump
In picker as "The Lord of the Rings · Jumpstart". Arena never had LotR Jump In packets, so these are the official lists
(the user's rule: official lists first). The LTR main set is on Arena, and every card here is too. **Not in scope:** the rest
of the main set, boosters, draft decks (possible later phases).

One branch, `lord-of-the-rings`, one sub-phase at a time. Read `docs/the-hobbit-plan.md` first (and
`docs/tarkir-dragonstorm-plan.md` behind it): this plan reuses their rules, wiring and agent setup and doesn't repeat them.
Much of the Middle-earth vocabulary exists from The Hobbit (amass, Food, Treasure, Halflings, legendary checks,
typecycling): reuse it, don't rebuild it.

## Rules

Same as The Hobbit: engine vocabulary in its own commented block (`// Lord of the Rings (21a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, rules text from
the Scryfall oracle text. **No shortcuts**: a card does exactly what its text says, or it stays out (wording in
`docs/marvel-jumpstart-handoff.md`). Anything not exact goes in `docs/shortcuts.md`.

## The packets

`packages/cards/scripts/data/ltr-jumpstart-packets.json` (from MTGJSON's Jumpstart decks, checked against Wizards'
[booster contents](https://magic.wizards.com/en/news/announcements/the-lord-of-the-rings-tales-of-middle-earth-jumpstart-booster-contents)).
Each packet lists 19 cards: 10 commons/uncommons, 1 new-to-Magic Jumpstart rare (the same per theme, both versions), 8 basics
(2 foil + 6). The **20th card is one random rare or mythic rare from the LTR main set** (`randomRares`, the 80 main-set rares
and mythics, collector numbers 1–281). Wizards doesn't say whether it matches the theme's colour; we deal it from the rares
of the packet's colour (mono-colour rares of that colour), as a `slots` entry with equal weights. **Assumption, recorded here.**
The ten Jumpstart rares are LTR collector numbers 282–286 and 824–828.

## Build groups

`packages/cards/scripts/data/ltr-groups.json` (204 cards; Reprieve is already in the pool):

| Group | Cards | Phase |
| --- | --- | --- |
| white, blue, black, red, green | 23, 22, 25, 24, 25 (the fixed packet cards) | 21b |
| colorless | 5 (fixed packet cards) | 21b |
| white-rare … green-rare | 8 each (random slot) | 21d |
| multicolour-rare | 25 (random slot) | 21d |
| colorless-rare | 15 (random slot) | 21d |

## Phases

- **21 wiring**: `src/lord-of-the-rings.ts` merging `src/ltr/<group>.ts` stubs, registered like The Hobbit (`behaviors.ts`,
  `pool.ts` `LORD_OF_THE_RINGS_POOL`, `index.ts`, `cards.test.ts`); `ltr` in `SET_PREFERENCE` (after `hob`, so reprints keep
  their earlier printing; check none moves); `scripts/ltr-status.ts` (like `hob-status.ts`); `'ltr'` in `Packet.set`; the
  shared tokens (Orc Army, Food exists, …) in `src/ltr/tokens.ts`; the mechanics table below filled in.
- **21a**: engine groundwork: **the Ring tempts you** (rule 701.54: choose a Ring-bearer, the four Ring abilities in order,
  "whenever the Ring tempts you" and "is your Ring-bearer" checks, the emblem shown on the player badge), Orc amass on the
  existing amass, plus whatever else the mechanics table marks missing. Tests, bot handling, Arena-style prompts.
- **21b**: the 124 fixed packet cards, one Sonnet agent per colour in worktrees (colorless goes with white).
- **21c**: `LTR_JUMPSTART_PACKETS` in `jumpin.ts` (20 packets, `source` official, the random slot from the rares built so
  far), the picker group, Quick match. **First point the user can play.**
- **21d**: the 80 rares and mythics of the random slot, by group; each joins the slot once built.

## Mechanics (21a)

To be filled in by the wiring agent: every keyword and repeated rules pattern in the 204 cards, with what the engine has.
