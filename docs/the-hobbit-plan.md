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

The rows marked missing (amass, Recruit, Storied, the cycling family) were built in 20a; see "Phase 20a" below for the names.

## Phases

- **20a**: engine groundwork for the missing mechanics above (amass Goblins, Recruit, Storied and the enduring story,
  Halflingcycling / typecycling), with tests, bot handling and Arena-style prompts. **Done**, see "Phase 20a" below.
- **20b**: every card, one agent per build group in worktrees (`scripts/data/hob-groups.json`, `scripts/hob-status.ts`,
  `src/hob/<group>.ts`, registered in `src/the-hobbit.ts`). Groups (front-face names): white 28, blue 28, black 27, red 29,
  green 28, multicolour 26 (gold and hybrid), colorless 22 (artifacts and lands); 188 in all. Back faces (adventure
  spells) go in each group's `_BACKS`; tokens used by one card live in the group file, shared ones are in `hob/tokens.ts`.
  White (28/28, done): engine pieces in `engine/src/hob-white-effects.ts` (Kíli's free first equip `firstEquipFree`, Eagles' Birds,
  Stone by Sunlight's artifact, Roads' exiled Plains, Bilbo's spell lock) plus hooks marked `// The Hobbit (20b white)`:
  the `ownedBySourceController` filter, `becomesArtifact` continuous effect, `exileWithSource` search, a player target for
  `searchLibrary.forControllerOf`. Tests `cards/test/hob-white*.test.ts`, `ai/test/hob-white.test.ts`.
  - **Black done** (27/27): engine pieces in `engine/src/hob-black-effects.ts` (Inside Information, Supper for Spiders, Master of
    Lake-town) and hooks marked `// The Hobbit (20b black)` (the `playerLosesLife` trigger, `cardsLeaveYourGraveyard` with a filter, the
    `targetWasControlledByYou` condition, a token's last power/controller for Azog, the `lifeForMana` cast, the odd/even spell filter);
    tests `cards/test/hob-black*.test.ts`.
  - Blue (20b) **done**, 28/28: engine pieces in `engine/src/hob-blue-effects.ts` and hooks marked `// The Hobbit (20b blue)`
    (Equipment that grants abilities, `creatureOnly` triggers-twice, `spellsFromOutsideHandCostLess`, `castFromYourGraveyard`,
    `youActivateCreatureAbility`, `sharesCardTypeWithPrevious`, `graveyardsWithAtLeast`, pump `whileSource`/`preventDamageDealt`).
- **20c**: Arena's Jump In packets for HOB (`scripts/data/arena-jumpin-packets.json`, if Arena has them) and the untapped.gg
  trophy decks (`scripts/data/hob-trophy-decks.*`), one per colour pair.
- **20d**: boosters in Expedition, Season and Sealed from `HOB_BOOSTER_LIST`.

## Wiring done (20 wiring)

`SET_PREFERENCE` ends with `hob`; `fetch-booster-list.ts` knows `hob`; `src/the-hobbit.ts` merges `src/hob/*.ts` (empty
stubs) and is registered in `behaviors.ts`, `pool.ts` (`THE_HOBBIT_POOL`), `index.ts`, `cards.test.ts`; the `'hob'` set key is
in `decks.ts`, `jumpin.ts`, `JumpIn.tsx` and `jumpInMatch.ts`. `pnpm cards:fetch` takes cards by pool name, so HOB cards
appear in `generated/scryfall.json` as their behaviours are added (the cached bulk file already has set `hob`).

## Phase 20a: engine groundwork

**Done** (10 October 2026; engine in `engine/src/hob-20a.ts` plus hooks marked `// The Hobbit (20a)`, tests
`engine/test/hob-20a-*.test.ts` with the fixture cards in `hob-fixtures.ts`, `ai/test/hob-20a.test.ts`, `web/test/hob-notes.test.ts`,
`cards/test/hob-vocab.test.ts`; card builders in `cards/src/hob-vocab.ts`). Every engine name is in `engine/src/types.ts` (search
"The Hobbit (20a)"). **Nothing to register for the keywords**: `Recruit`, `Storied` and `Halflingcycling` are in
`KEYWORDS_AS_ABILITIES` (`build.ts`); `Amass` and the other cycling names were known already. The tokens `hob-goblin-army-token` and
`hob-human-soldier-token` (`hob/tokens.ts`, `HOB_SHARED_TOKENS`) are the ones amass and recruit make; the builders only name them, so
`the-hobbit.ts` must register `HOB_SHARED_TOKENS` (it does not need anything else).

Import from `../hob-vocab.ts` (in `src/hob/*.ts`). The example is the card the builder was made for.

### Amass

`amassGoblins(n, who?)` / `amass(subtype, n, { who?, token? })` (an effect). "Amass Goblins N": with no Army you control, a 0/0 black
Goblin Army token first; then you choose an Army creature you control (a prompt when there are several: "Amass Goblins 2: choose an
Army"), it gets N +1/+1 counters and becomes a Goblin for good. The effects after it see that Army as `'chosen'`. N is a number or
any Amount. It goes through `createToken`, so token doublers (Bard, King of Dale) work: two Armies are made and you choose one. Amass 0
makes the token (which dies as a 0/0 at the next state-based check). `amass('Zombie', 1)` replaces the old Lazotep Plating effect
(`u15bAmass` is gone); another type (Orc) needs `{ token }` (no Orc Army is in the set). It emits an `amassed` event (the log says
"amasses Goblins 2").

- Goblin-town Flunkies: `when({ on: 'etb' }, [amassGoblins(1)])`; Fearsome Goblin Pair: a `dies` trigger with `amassGoblins(4)`;
  Rhovanion Rampager: `dies` with `amassGoblins({ powerOf: 'self' })` (last known power); Misty Mountains Raider: `{ on: 'youAttack' }`;
  Bothersome Noisemaker: `{ on: 'castSpell', filter: 'noncreature' }`; Along the Crooked Way: the `cardsLeaveYourGraveyard` trigger.
- Rage into the Valley: `draw 1, loseLife 1, amassGoblins(2)`; Down, Down to Goblin-town chapter II and the Adventure spells
  (Clap! Snap!): `amassGoblins(1)`, `amassGoblins(2)`.
- Tidings of War: `{ kind: 'if', condition: { kind: 'castFromGraveyard' }, then: [amassGoblins(3)], else: [amassGoblins(1)] }` with
  `flashback`. **`castFromGraveyard` now also holds as the spell resolves** (it was for cast triggers only); Moment of Glory and
  Plunder the Trollshaws ("if this spell was cast from a graveyard, ... instead") use the same condition.
- Goblin Plate Mail: `when({ on: 'etb' }, [amassGoblins(1), { kind: 'attach', to: 'chosen' }])` (attaches this Equipment to the amassed Army).
- Azog, Moria's Ruin: `[{ kind: 'destroy', what: t0 }, amassGoblins({ powerOf: t0 }, { controllerOf: 0 })]`, then the "if you controlled
  it, draw a card" part. `powerOf` a destroyed target is its last known power; `who` is the player who amasses (an opponent chooses
  among their own Armies). Bolg of the North's "excess damage" amount is **not built** (a one-off for 20b).

### Recruit

`recruit` (an effect, no arguments) = draw a card, then discard a card (your choice, from the whole hand); if it was a nonland card,
create a 1/1 white Human Soldier (`hob-human-soldier-token`). Nothing is discarded from an empty hand, and then no token. `discard`
got `thenIfNonland: EffectDef[]` (effects that follow only if a nonland card was discarded), which recruit uses.

- Patient Instructor, Long Lake Nuisance, Esgaroth Garrison: `when({ on: 'etb' }, [recruit])`; Lake-town Lookout: a `dies` trigger;
  Bard's Company: an `etb` and an `attacks` trigger; Great Gilded Boat: `{ on: 'youAttack' }`.
- The Mountain-king's Return chapter I: `[recruit]`; Celebrate the Mountain-king: a second `etb` trigger with `[recruit]`; Sound the
  Trumpets: `counter`, then an `if` (the countered spell's mana value 2 or less) with `[recruit]`; The Queen of Dale: a
  `castSpell` trigger with `filter: 'firstNoncreature'` for the opponent's spells (check `whose`) and `[recruit]`.

### Storied and the enduring story

- `storied` (an ability): the static `{ kind: 'storied' }`. While a permanent with it is on the battlefield, its controller gets the
  designation (`PlayerState.enduringStory`) as soon as they control three different artifact, legendary and/or Saga permanents (the
  Storied permanent may be one of them; a legendary artifact counts once). It is not a trigger and doesn't use the stack: it is
  checked with the state-based actions (so before the legend rule or 0 toughness take a third permanent away), and it can't be lost.
  Three artifacts without a Storied permanent earn nothing, even if one arrives later. The log says "p1 has an enduring story" and
  the player badge shows a book with a tooltip.
- `enduringStory` (a condition, `{ kind: 'enduringStory' }`): the designation, or the situation that gives it, for the permanent's
  controller. It plugs into every `condition` there is:
  - `storyPump(power, toughness, keywords?)` (a `while` static): Óin the Brave `storyPump(1, 0, ['haste'])`; Ori, Keeper of Songs
    `storyPump(1, 0, ['vigilance'])`.
  - `storyAnthem(power, toughness, filter?)` (an `anthem` static): Fíli the Pathfinder `storyAnthem(1, 1)`.
  - `attackTax` has `condition`: Dáin, Lord of the Iron Hills
    `{ kind: 'static', effect: { kind: 'attackTax', amount: 1, condition: enduringStory } }`.
  - `doesntUntap` has `unless`: Bombur, Gentle Dreamer `{ kind: 'doesntUntap', unless: enduringStory }`.
  - `storyTriggersTwice('Dwarf')`: Bifur, Melodic Rider ("if a triggered ability of a Dwarf you control triggers, that ability
    triggers an additional time"; includes Bifur itself; the engine name is `subtypeTriggersTwice { subtype, condition? }`).
  - `ifEnduringStory(then, else?)` (an `if` effect): Balin, Loremaster's "if you have an enduring story, Balin deals X damage".
  - Thorin Oakenshield's "artifacts and creatures you control have ward {1}": an `anthem` static (`affects: 'creaturesYouControl'`, `anyPermanent: true`,
    `filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] }`, `power: 0, toughness: 0`) with `condition: enduringStory` and
    `keywords: ['wardOne']` (the granted ward {1} keyword); tested with a fixture.
  - **Not built** (one-offs for 20b): Kíli's "you may pay {0} rather than the equip cost of the first equip ability you activate each turn".
- The tooltip of a Storied card says where the story stands ("Not yet: 2 of the 3 artifacts, legendaries and/or Sagas." / "You have
  an enduring story."). The `Enduring Story` card of the set is only the designation's marker, not a token: nothing to build.

### Landcycling, Mountaincycling, Halflingcycling

`landcycling(cost)`, `basicLandcycling(cost)`, `subtypecycling(subtype, cost)`, `typecycling(name, cost, search)` (abilities; `cost` is a
mana string like `'{2}'`): "{cost}, Discard this card: Search your library for a [land / basic land / <subtype>] card, reveal it, put
it into your hand, then shuffle." Activated from the hand (`fromHand`; the discard is a cost). Last Light of Durin's Day
`subtypecycling('Mountain', '{2}')`; Hobbit Hole `subtypecycling('Halfling', '{4}')` (beside its land abilities: "{T}, Sacrifice this land:
search for a basic land, onto the battlefield tapped"). Plain `Cycling` is `cycling(cost)` in `fin/helpers.ts`.

### Other vocabulary the set shares (all existing, listed so nobody rebuilds it)

- `sacrificeLandForCounters(cost, subtypes)` (new): the five two-colour lands' "{2}{W}{U}, {T}, Sacrifice this land: Put two +1/+1
  counters on target Human you control. Activate only as a sorcery." Lake-town `('{2}{W}{U}', ['Human'])`, Mirkwood
  `('{2}{B}{G}', ['Bear', 'Spider', 'Wolf'])`, Iron Hills `['Dwarf']`, Goblin-town `['Goblin', 'Orc']`, Elvenking's Halls `['Elf']`. The
  land enters tapped (`entersTapped`) and taps for its two colours as usual.
- Drawing: the `drawSecondCard` trigger (Bard the Bowman, Lakeshore Apothecary, Master's Councillors; Gleaming Splendor with
  `whose: 'opponents'`) and the `cardsDrawnThisTurn` condition (Lake-town Toymaker); Bard, King of Dale's replacements exist.
- `lookAndTake` with an `anyOf` filter: Dáin's Company, Boughside Wanderers ("rest on the bottom in a random order").
- Triggers twice: `equippedTriggersTwice` (Wizard's Staff); granted ward {1}: the `wardOne` keyword (Dwarven Mattock, Thorin Oakenshield).
- Equipment attached as it enters: `{ kind: 'attach', to, what? }` (Dwarven Mattock, Dwarven Shortsword, Iron Hills Stalwart, Dáin Ironfoot).
- Ferocious (`controlsCreature` with `minPower: 4`), Landfall, Treasure, Crew, Kicker, Flashback, Gift, Behold: as in the table above.

### Bots

The evaluation counts the enduring story and the way to it (`WEIGHTS.enduringStory`, `WEIGHTS.storyProgress`, only with a Storied
permanent to use them); recruit's discard and amass's Army are chosen by the usual simulation; a bot with nothing better to do in
its second main phase cycles a dead card (`chooseCycling` in `ai/src/heuristic.ts`: a spell costing more than its lands plus two,
or a land with six in play; a land search is skipped with seven lands in play and hand). That applies to every set's cycling cards.

## Phase 20b: green (done)

All 28 green cards (`src/hob/green.ts`, tests `hob-green*.test.ts`). Custom effects in `engine/src/hob-green-effects.ts`
(Cantankerous Keepers, Part in Friendship, Through the Forest Gate with its land picker, Beorn the Fierce's Bear type, Beorn's
Hospitality, Down in the Valley); hooks marked `// The Hobbit (20b green)`: `GameObject.hobLandsPT` / `hobGainedAbilities`
(`types.ts`, `context.ts`, `characteristics.ts`), the Gate picker in `ai/src/heuristic.ts` and `simulate.ts`.

## Phase 20b: colorless group

**Done** (22/22; `cards/src/hob/colorless.ts`, tests `cards/test/hob-colorless.test.ts`). Engine hooks, all marked `// The Hobbit (20b colorless)`:
Amount `{ powerOf: 'attached' }` (Glamdring, `characteristics.ts`); cost flag `discardNamesLegendaryPermanent` (Key to the Side-Door,
`legal.ts`); `searchLibrary.rememberFound` makes the card found `'chosen'` for the effects after it (Elven Passage, `stack.ts`/`effects.ts`);
custom effects `hobBlackArrow` and `hobGleamOfDeath` in `engine/src/hob-colorless-effects.ts`. Hone counters are `namedCounters 'hone'`
read by an `attached` static (`namedCountersOnSource`). Giant's Boulder's {1},{T} mana is a `manaAbility` (used by hand: activate it, then cast).
## Phase 20b: multicolour (done)

All 26 cards (`cards/src/hob/multicolour.ts`; tests `cards/test/hob-multicolour*.test.ts`, `ai/test/hob-multicolour.test.ts`). Engine: one-offs in
`engine/src/hob-multicolour-effects.ts` (custom effects, `HOB_MULTICOLOUR_EXPANDERS` = custom effects that turn into other effects when they
come up, used for Silvan Rally's and Bolg's prompts), hooks marked `// The Hobbit (20b multicolour)`: statics `cantAttackUnless`,
`everyExtraDrawBecomes` (Bard, King of Dale), `graveyardElfAbilities` (Thranduil, the Elvenking), `extraLandDrop.condition`; condition
`treasureManaSpent` (Smaug); `counterPutOnYourCreature` got `filter`/`byYou`; `discard.landToBattlefieldTapped` (Silvan Reveler); landfall
triggers from the graveyard; `notCreatureAs` (Tom, Bert, and William come back as an artifact); hone counters grant +1/+0 (Dwalin).
## Phase 20b: red (done)

All 29 red cards, `cards/src/hob/red.ts` (tests `hob-red.test.ts`, `hob-red-2.test.ts`; one-off effects in `engine/src/hob-red-effects.ts`).
Engine pieces added (marked `// The Hobbit (20b red)`): `reflexiveTrigger.subject` (Dáin Ironfoot: "when you do, attach it"), the
`putFromHandOrLibrary` effect (Last Light: hand and library together, a library pick shuffles; `sacrificeSource` for "sacrifice it. If you
do"), `GameObject.playableIf` (Flameshape's face-down exiled cards, hidden from the opponent in `redactFor`, playable while you control a
Wizard), and `attacking` on the `totalPowerOfCreaturesYouControl` amount (Desert Were-Worm). Custom effects: `hobBalinDiscardDraw`,
`hobThorinAttach` (reflexive damage only if an Equipment actually became attached), `hobGetawayBarrel`, `hobFlameshape`. Tokens: Axe and
Stone Boulder live in `red.ts`.
