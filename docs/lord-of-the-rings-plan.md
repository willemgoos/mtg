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

Counts are cards among the 204 (from the oracle text in the Scryfall bulk file; `scripts/ltr-status.ts` lists the groups).
"Engine today" is the state when the wiring was done; rows marked **missing** are built in 21a (see "Phase 21a" once it is
done), rows marked **one-off** stay with the card's 21b/21d agent.

Types: Human 29, Halfling 20, Soldier 18, Elf 13, Noble 12, Knight 11, Avatar 9, Warrior 9, Peasant 8, Saga 7, Equipment 7, Orc 6,
Citizen 6, Wizard 5, Dwarf 5, Goblin 4, Treefolk 3, Wraith 3 (all creature types are in `creature-types.ts`). 61 legendary
creatures, 12 legendary artifacts, 6 legendary lands, 1 legendary enchantment, 1 legendary instant.

| Mechanic (cards) | Engine today |
| --- | --- |
| **The Ring tempts you** (36: Sam's Desperate Rescue, Slip On the Ring, Claim the Precious, Rangers of Ithilien, Samwise the Stouthearted, Scroll of Isildur, Gollum's Bite, Took Reaper, The Ring Goes South, Relentless Rohirrim, Rohirrim Lancer, Elrond Lord of Rivendell, War of the Last Alliance, Call of the Ring, Gollum Patient Plotter, Witch-king of Angmar, Inherited Envelope, Boromir, Bombadil's Song, Sauron's Ransom, Glorious Gale, Mirrormere Guardian, Uruk-hai Berserker, There and Back Again, One Ring to Rule Them All, Enraged Huorn, Horses of the Bruinen, Nazgûl, Frodo, Sméagol, Faramir, Aragorn, Galadriel, Sauron, Ringwraiths, Dúnedain Rangers) | **missing**: the Ring emblem and its four abilities, choosing a Ring-bearer (rule 701.54), the effect |
| "Whenever the Ring tempts you" triggers (7: Faramir Field Commander, Sauron the Dark Lord, Sméagol, Aragorn Company Leader, Nazgûl, Galadriel of Lothlórien, Ringwraiths from the graveyard) | **missing**: no such trigger event |
| "If you chose a creature other than this one as your Ring-bearer" (3: Faramir, Aragorn, Galadriel) | **missing** |
| "Whenever you choose a creature as your Ring-bearer" (Call of the Ring); "if you don't control a Ring-bearer" (Dúnedain Rangers); "unless Sauron is your Ring-bearer" (Sauron the Necromancer); "the Ring has tempted you four or more times" (Frodo); "your Ring-bearer's power" (One Ring to Rule Them All) | **missing** (events, conditions, an amount) |
| **Amass Orcs** (20: Gríma, Book of Mazarbul, Swarming of Moria, Warg Rider, Saruman's Trickery, Saruman the White, Mordor Muster, Gothmog, Orcish Medicine, Dunland Crebain, Easterling Vanguard, Orcish Bowmasters, March from the Black Gate, Sauron the Dark Lord, Shagrat, Assault on Osgiliath, Fall of Cair Andros, Foray of Orcs, Grishnákh, Barad-dûr) | general `amass(subtype, n, { token })` exists (`hob-20a.ts`, `amassGoblins`); the **Orc Army token** is made in the wiring (`ltr-orc-army-token`); a card builder `amassOrcs` is **missing**. X forms: Shagrat (X = Equipment attached), Assault on Osgiliath (X), Fall of Cair Andros (X = excess damage, trigger `opponentCreaturesDealtExcessNoncombat` exists), Barad-dûr ({X}{X}{B}); "when you do ... the amassed Army's power" (Foray of Orcs, Grishnákh) uses `reflexiveTrigger` + `'chosen'` |
| "An Army you control" (Sauron DL combat damage, March from the Black Gate attacks, Grond as long as you control an Army, Warg Rider/Mordor Trebuchet/Gorbag/Moria Marauder "Goblin or Orc") | filters by subtype exist (`subtype`, `subtypes`); group grants "Goblins and Orcs you control gain double strike and haste" (Assault on Osgiliath) are a pump on `each creature` with a `subtypes` filter; **one-off** |
| **Food** (16 make one; 20 mention it) | Food token, `food-token`, `foodToGraveyard`, `count: 'permanents'` with a Food filter, cost `sacrificePermanent` / `sacrificeArtifacts` + filter all exist; "You may sacrifice a Food. If you do ... otherwise" (Pippin's Bravery, Nimble Hobbit with "or pay {2}{W}", Shire Shirriff with a token) has no single effect: **one-off** per card; Lembas is an artifact card with the Food subtype (own ETB and shuffle-into-library replacement): **one-off** |
| **Treasure** (9) | exists (`treasure-token`); goad (Glóin) exists |
| **Scry** (24 mention it; "whenever you scry": Chance-Met Elves, Nimrodel Watcher, Celeborn, Elvish Mariner, Glorfindel, Council's Deliberation, Lost Isle Calling, Galadriel, Elrond Master of Healing) | `scry` effect exists; the trigger `youScryOrSurveil` also fires for surveil and has no amount; "cards looked at while scrying" (Elrond Master of Healing, Celeborn, Elvish Mariner) **missing**; a scry-only trigger **missing** |
| "Whenever you create a token" (Rosie Cotton, Mirkwood Bats with "or sacrifice"); "tokens plus an additional Food" (Peregrin Took) | **missing** (no token-created trigger; `youSacrifice` with a filter exists) |
| "If a creature died under your control this turn" (Faramir Field Commander, Sméagol, Gimli Mournful Avenger "two or more") | `creatureDiedThisTurn` counts every player's creatures: a per-player version is **missing** |
| **Legendary matters** (36 mention it): "legendary creature you control" conditions, costs and lands | `supertypes: ['Legendary']` filter and `controlsCreature` exist; "enters tapped unless you control a legendary creature" (5 lands: The Shire, Mines of Moria, Minas Tirith, Barad-dûr, Rivendell) = `entersTappedIf` with a `not` condition; a builder is **missing**; "Legendary instant" casting limit (Isildur's Fateful Strike), "cast legendary spells as though they had flash" (Gandalf the White): **one-off** |
| **Historic** (3: Lost to Legend, Glóin, Samwise Gamgee) | no keyword; `anyOf` artifact / Legendary / Saga filter works (The Hobbit's storied); a `historic` filter builder is **missing** |
| **Sagas** (7: Book of Mazarbul, Fall of Gil-galad, Scroll of Isildur, War of the Last Alliance, There and Back Again, The Bath Song, One Ring to Rule Them All) | exist (`saga: N`, chapter abilities; The Hobbit); "for as long as you control this Saga" duration (Scroll of Isildur, There and Back Again) and Tom Bombadil's lore-counter checks: **one-off** |
| **Equipment** (7 cards, 3 more mention it) | exists (equip, attach as it enters, `equipCostsLess`, granted abilities); "activate equip any time you could cast an instant" (Forge Anew): **one-off** |
| Crew (1: Grond) | exists; "as long as it's your turn and you control an Army, it's an artifact creature" is a conditional `becomeCreature`: check at 21b |
| Second spell each turn (4: Saruman of Many Colors, Storm of Saruman, Saruman the White, Lotho) | exists (`castSpell` second-spell filter, `anyPlayerSecondSpell`) |
| Typecycling (1: Lórien Revealed, Islandcycling {1}) | exists (`subtypecycling('Island', '{1}')`, The Hobbit) |
| Affinity for Humans (1: Riders of the Mark) | exists (`affinity`) |
| Keywords: flying 12, haste 13, trample 10, vigilance 8, indestructible 10, deathtouch 6, first strike 6, menace 6, lifelink 5, flash 8, ward 7, double strike 2, hexproof 3, reach, defender | all exist; ward with a non-mana cost (Saruman of Many Colors: discard, Sauron: sacrifice) is a rare: check at 21d |
| Counters: +1/+1 (27), hope / verse / burden / influence (named counters), stun (2), indestructible counter (2), first strike / vigilance / lifelink counters (Aragorn, Arwen) | +1/+1 and named counters exist; stun and keyword counters partly (`stunCountersMinusX`, `keywordCountersFrom`); one-offs for the rares |
| "When you do" reflexive triggers (6: Gorbag, Shire Shirriff, Eastfarthing Farmer, Foray of Orcs, Grishnákh, Nimble Hobbit) | exists (`reflexiveTrigger`) |
| Fight (3), copy a spell (6), gain control (3), flicker (2: Slip On the Ring, Meneldor), modal choose one (5), extra combat / extra turn (Éomer, Lost Isle Calling), phasing (King of the Oathbreakers) | exist (phasing has no "becomes the target" or "phases in" trigger: one-off) |
| Cost changes: "costs {N} less if it targets ..." (Banish from Edoras, Bitter Downfall), per-permanent reductions (Esquire, Balrog, Mirror of Galadriel, Éowyn Lady of Rohan) | exist (`costReductionIfTarget`, `costReductionIf`, `costReduction`) |
| Halfling (20 creatures), Elf (13), Human (29) tribal checks (Meriadoc, Saradoc, Celeborn, Riders of the Mark, Rally at the Hornburg) | subtype filters exist |
| Deck rule "a deck can have up to nine cards named Nazgûl" | **one-off**: no deck-size exception exists; packets have one Nazgûl, so nothing needs it before the deck builder or boosters |
| Tokens (see `ltr/tokens.ts`): Orc Army 20, Food 16, Human Soldier 8 (reuse `hob-human-soldier-token`), Treasure 9, Spirit 2 (`ltr-spirit-token`); one-card tokens: Tentacle, Halfling, Ballistic Boulder, Smaug | shared tokens made in the wiring |
