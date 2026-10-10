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
| "Whenever you create a token" (Rosie Cotton, Mirkwood Bats with "or sacrifice"); "tokens plus an additional Food" (Peregrin Took) | the token trigger was **missing** (built in 21a); `youSacrifice` with a filter exists; Peregrin Took's replacement exists (`plusFoodToken` static) |
| "If a creature died under your control this turn" (Faramir Field Commander, Sméagol, Gimli Mournful Avenger "two or more") | exists: `{ kind: 'amountAtLeast', amount: { count: 'creaturesYouLostThisTurn' }, min: 1 }` (`creatureDiedThisTurn` counts every player's creatures: don't use it) |
| **Legendary matters** (36 mention it): "legendary creature you control" conditions, costs and lands | `supertypes: ['Legendary']` filter and `controlsCreature` exist; "enters tapped unless you control a legendary creature" (5 lands: The Shire, Mines of Moria, Minas Tirith, Barad-dûr, Rivendell) = `entersTappedIf` with a `not` condition; a builder is **missing**; "Legendary instant" casting limit (Isildur's Fateful Strike), "cast legendary spells as though they had flash" (Gandalf the White): **one-off** |
| **Historic** (3: Lost to Legend, Glóin, Samwise Gamgee) | no keyword; `anyOf` artifact / Legendary / Saga filter works (The Hobbit's storied); a `historic` filter builder is **missing** |
| **Sagas** (7: Book of Mazarbul, Fall of Gil-galad, Scroll of Isildur, War of the Last Alliance, There and Back Again, The Bath Song, One Ring to Rule Them All) | exist (`saga: N`, chapter abilities; The Hobbit); "for as long as you control this Saga" duration (Scroll of Isildur, There and Back Again) and Tom Bombadil's lore-counter checks: **one-off** |
| **Equipment** (7 cards, 3 more mention it) | exists (equip, attach as it enters, `equipCostsLess`, granted abilities); "activate equip any time you could cast an instant" (Forge Anew): **one-off** |
| Crew (1: Grond) | exists; "as long as it's your turn and you control an Army, it's an artifact creature" is a conditional `becomeCreature`: check at 21b |
| Second spell each turn (4: Saruman of Many Colors, Storm of Saruman, Saruman the White, Lotho) | exists (`castSpell` second-spell filter, `anyPlayerSecondSpell`) |
| Typecycling (1: Lórien Revealed, Islandcycling {1}) | exists (`subtypecycling('Island', '{1}')`, The Hobbit) |
| Affinity for Humans (1: Riders of the Mark) | exists (`affinity`) |
| Keywords: flying 12, haste 13, trample 10, vigilance 8, indestructible 10, deathtouch 6, first strike 6, menace 6, lifelink 5, flash 8, ward 7, double strike 2, hexproof 3, reach, defender | all exist; ward with a non-mana cost (Saruman of Many Colors: discard, Sauron: sacrifice) is a rare: check at 21d |
| Counters: +1/+1 (27), hope / verse / burden / influence (named counters), stun (2), indestructible counter (2), first strike / vigilance / lifelink counters (Aragorn, Arwen) | +1/+1 and named counters exist; keyword counters (flying, indestructible, ...) grant their keyword (`characteristics.ts`); stun partly (`stunCountersMinusX`); one-offs for the rares |
| "When you do" reflexive triggers (6: Gorbag, Shire Shirriff, Eastfarthing Farmer, Foray of Orcs, Grishnákh, Nimble Hobbit) | exists (`reflexiveTrigger`) |
| Fight (3), copy a spell (6), gain control (3), flicker (2: Slip On the Ring, Meneldor), modal choose one (5), extra combat / extra turn (Éomer, Lost Isle Calling), phasing (King of the Oathbreakers) | exist (phasing has no "becomes the target" or "phases in" trigger: one-off) |
| Cost changes: "costs {N} less if it targets ..." (Banish from Edoras, Bitter Downfall), per-permanent reductions (Esquire, Balrog, Mirror of Galadriel, Éowyn Lady of Rohan) | exist (`costReductionIfTarget`, `costReductionIf`, `costReduction`) |
| Halfling (20 creatures), Elf (13), Human (29) tribal checks (Meriadoc, Saradoc, Celeborn, Riders of the Mark, Rally at the Hornburg) | subtype filters exist |
| Deck rule "a deck can have up to nine cards named Nazgûl" | **one-off**: no deck-size exception exists; packets have one Nazgûl, so nothing needs it before the deck builder or boosters |
| Tokens (see `ltr/tokens.ts`): Orc Army 20, Food 16, Human Soldier 8 (reuse `hob-human-soldier-token`), Treasure 9, Spirit 2 (`ltr-spirit-token`); one-card tokens: Tentacle, Halfling, Ballistic Boulder, Smaug | shared tokens made in the wiring |

## Phase 21a: engine groundwork

**Done** (engine in `engine/src/ltr-21a.ts` plus hooks marked `// Lord of the Rings (21a)`; names in `engine/src/types.ts` (search
"Lord of the Rings (21a)"); tests `engine/test/ltr-21a-{ring,abilities,triggers,scry-tokens}.test.ts` with `ltr-fixtures.ts`,
`ai/test/ltr-21a.test.ts`, `cards/test/ltr-vocab.test.ts`, `web/test/ltr-notes.test.ts`). Card builders are in
`cards/src/ltr-vocab.ts`; import them in `src/ltr/*.ts` from `'../ltr-vocab.ts'`. **Nothing to register**: `ltr-orc-army-token`,
`ltr-spirit-token` and `ltr-the-ring` are in `LTR_SHARED_TOKENS` (`ltr/tokens.ts`, already merged by `lord-of-the-rings.ts`). Rules from
the comprehensive rules (701.54) as summarised on mtg.wiki (The Ring tempts you).

### The Ring tempts you (36 cards)

- `ringTempts` (an effect; the Ring tempts the controller): you get the Ring if you have none, it gains its next ability (to four, the
  count goes on), you choose a creature you control as Ring-bearer, then "whenever the Ring tempts you" abilities trigger. One creature:
  chosen without a prompt. Several: the prompt "Choose your Ring-bearer" (click a creature; the source itself is on offer, and so is the
  current Ring-bearer: you choose every time). None: nobody is chosen and the Ring still tempts you (abilities that trigger on it do).
  Effects after it in the same list happen after the temptation (`[draw 1, ringTempts]` / `[ringTempts, mill ...]`). Sam's Desperate Rescue,
  Slip On the Ring, Claim the Precious, Rangers of Ithilien (after gaining control), Took Reaper (`dies` trigger), Relentless Rohirrim and
  Uruk-hai Berserker (`etb`), Glorious Gale (inside an `if`), Gollum's Bite (an activated ability from the graveyard), ... all just use it.
- The Ring emblem is `PlayerState.ring = { tempted, bearer? }` (public). **Its four abilities are rules of the engine, not card text**:
  1 the Ring-bearer is legendary (the engine adds the supertype to it, so the legend rule, `supertypes: ['Legendary']` filters and
  "legendary creature you control" conditions all see it) and can't be blocked by creatures with greater power; 2 attacking, draw then discard
  (a trigger "of The Ring" on the stack); 3 a trigger for each creature that blocks it, the blocker is sacrificed at end of combat; 4 combat
  damage to a player, each opponent loses 3. They need no card to do anything. A Ring-bearer stops being one when it leaves the battlefield or
  another player gains control of it (state-based), and it does not become one again if it returns.
- `whenRingTempts(effects, { condition?, targets?, optional?, fromGraveyard? })` (trigger `ringTempts`): the creature chosen this time
  (none if nobody) is the trigger's `'subject'`. Faramir, Field Commander `condition: chosenOtherThanThis`; Aragorn, Company Leader and
  Galadriel the same; Sauron the Dark Lord (optional `may` discard hand, draw four), Sméagol, Nazgûl (counters on each Wraith you control);
  **Ringwraiths** `fromGraveyard: true` with `{ kind: 'returnSource', to: 'hand' }`.
- `whenRingBearerChosen(effects, opts)` (trigger `ringBearerChosen`): Call of the Ring, every time a creature is chosen.
- Conditions: `chosenOtherThanThis` ("a creature other than <this>", reads the subject), `isRingBearer` ("as long as / unless <this> is your
  Ring-bearer": Sauron the Necromancer's `if` effect, a `while` static), `hasRingBearer` / `noRingBearer` (Dúnedain Rangers: landfall with
  `condition: noRingBearer`), `ringTemptedTimes(4)` (Frodo, Sauron's Bane's "four or more times").
- `ringBearer` (a Ref: "your Ring-bearer", nothing without one) and `ringBearerPower` (an Amount, 0 without one): One Ring to Rule Them All
  chapter I `[ringTempts, { kind: 'mill', who: 'eachPlayer', count: ringBearerPower }]`.
- Player badge: the Ring with its level (0-4) and a tooltip (times tempted, Ring-bearer, the abilities so far, the next one); the Ring-bearer's
  card has the label "Ring-bearer" and a tooltip note listing what the Ring does for it; the Ring's abilities stack as the token card "The Ring".
- Bots: the evaluation counts the Ring level and how well its bearer carries it (`WEIGHTS.ringLevel`, `ringBearer`: a creature that can attack,
  has power, flies), so the bot picks its biggest attacker, never a defender.

### Amass Orcs (20 cards)

`amassOrcs(amount, who?)` = `amass('Orc', amount, { token: 'ltr-orc-army-token' })` (rules and `'chosen'` as in the Hobbit section). X forms:
Shagrat `{ count: 'permanentsYouControl', filter: { subtype: 'Equipment', attachedToSource: true } }`; Assault on Osgiliath `{ x: ... }`; Fall of
Cair Andros `{ event: 'amount' }` in a `opponentCreaturesDealtExcessNoncombat` trigger; Barad-dûr's {X}{X}{B} is an activated ability with X.
"When you do, ... X damage where X is the amassed Army's power" (Foray of Orcs, Grishnákh): `[amassOrcs(2), { kind: 'reflexiveTrigger',
ability: <index of the { on: 'reflexive' } ability>, subject: 'chosen' }]` and `{ powerOf: 'subject' }` in the reflexive ability (tested).
Assault's "Goblins and Orcs you control gain double strike and haste": a `pump` to `{ each: 'creature', controller: 'you', filter: { subtypes:
['Goblin', 'Orc'] } }` with `keywords: ['doubleStrike', 'haste']` (tested).

### Scry, tokens, legendary, historic

- `whenYouScry(effects, opts)` (trigger `youScry`): a scry only, not a surveil (the `scried` event has `surveil`), with `cardsLookedAt` (an
  Amount) = cards looked at while scrying (fewer than N with a short library): Chance-Met Elves, Nimrodel Watcher, Celeborn, Elvish
  Mariner, Glorfindel, Council's Deliberation (`fromGraveyard`), Galadriel, Elrond, Lost Isle Calling. `oncePerTurn: true` for "triggers
  only once each turn".
- `whenYouCreateToken(effects, { filter?, targets? })` (trigger `youCreateToken`): once for each token created under your control (the token is
  the subject; amass's Army token counts). Rosie Cotton (target "other than Rosie": `targets: [{ what: 'creature', controller: 'you', filter:
  { other: true } }]`), Mirkwood Bats (plus a second ability `{ on: 'youSacrifice', filter: { token: true } }`).
- `legendaryCreature`, `historic` (CardFilters), `entersTappedUnlessLegendary` (spread into a land's behaviour: The Shire, Mines of Moria,
  Minas Tirith, Barad-dûr, Rivendell).

### Not covered (one-offs for 21b / 21d)

Pippin's Bravery ("may sacrifice a Food, if you do ... otherwise"), Nimble Hobbit (sacrifice a Food or pay {2}{W}, when you do), Shire Shirriff
(may sacrifice a token, when you do), Lembas (Food card), Elanor's "if you sacrificed a Food this turn", Grond's conditional creature, Forge Anew's
instant-speed equip, ward with a non-mana cost, stun counters (The Watcher, Scroll of Isildur), phasing triggers (King of the Oathbreakers), Tom
Bombadil, mana-spending riders (Pelargir Survivor, Delighted Halfling, Sharkey, Shadow of the Enemy), "legendary instant" casting limit, cast
legendary spells with flash (Gandalf the White), Radagast / Doors of Durin / Horn of the Mark look-and-take variants, Nazgûl's nine-copies deck
rule. Triggered abilities' intervening "if" are checked as they trigger only (engine-wide), which matters for none of the Ring cards except in
rare double-landfall cases of Dúnedain Rangers.

## Phase 21b: red (done)

All 24 red packet cards (`ltr/red.ts`, tests `cards/test/ltr-red.test.ts` and `ltr-red-2.test.ts`; no tokens of its own: Orc Army and
Treasure are shared, the Human Soldier is `hob-human-soldier-token`). Engine one-offs are in `engine/src/ltr-red-effects.ts`, with hooks
marked `// Lord of the Rings (21b red)`:

- **Fear, Fire, Foes!**: `ltrDamageUnpreventable` sets `turn.ltrDamageUnpreventable` (cleared at the next turn's start; read by `prevented`,
  by the Diamond Weapon check in `dealDamage` and by combat damage), `ltrDamageSameController` deals the "1 damage to each other creature
  with the same controller" to the creatures the target's controller controls.
- **Battle-Scarred Goblin**: `ltrDamageBlockers` (1 damage to each creature blocking it when the trigger resolves).
- **Smite the Deathless**: `ContinuousEffect.loseKeywords` ("loses indestructible until end of turn", applied with the other removals in
  `characteristics.ts`), made by `ltrLoseIndestructible`; the exile is the existing `exileIfDies` pump.
- **Olog-hai Crusher**: static `cantBlockUnless` (beside `cantAttackUnless`).
- **Grishnákh, Brash Instigator**: card filter `maxPowerOfSubject` ("power less than or equal to the amassed Army's power"); the Army is
  the reflexive trigger's subject. Targets are rechecked on resolution against the Army (`checkTargets` passes `item.subject` as
  `ltrSubjectId`, read only by this filter; its last known power if it has left).
- **Riders of the Mark**: `ltrRidersReturn` (returns it, then makes Human Soldiers equal to its toughness as it left).
- **Éomer**: custom condition `ltrControlsGreatestPower` (a tie for the greatest power counts).

Notable: Gimli, Counter of Kills deals its damage to `eachOpponent` ("that creature's controller" is always the one opponent in a
two-player game). Other cards use only existing vocabulary (`amassOrcs`, `ringTempts`, reflexive triggers, `discardToCast`,
`legendaryKeywords`, `costReduction` for affinity).
