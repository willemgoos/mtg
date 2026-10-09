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

| Mechanic                                                                                                                                                 | Cards                                          | Engine today                                        | Phase                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ------------------------- |
| **Blight N** (put N -1/-1 counters on a creature you control): costs, optional additional costs with "if this spell's additional cost was paid", effects | 24                                             | -1/-1 counters exist (FRA); one blight card (Brawl) | 18a                       |
| -1/-1 counters elsewhere ("enters with two -1/-1 counters", "remove a counter")                                                                          | ~48 mention them                               | exist                                               | 18b                       |
| **Changeling**                                                                                                                                           | 16                                             | exists                                              | 18b                       |
| **Vivid** (number of colours among permanents you control)                                                                                               | 14                                             | similar counts exist                                | 18a                       |
| **Behold** a type (and "behold … and exile it")                                                                                                          | 12                                             | exists (Marvel, FRA)                                | 18a for the exile variant |
| **Evoke**                                                                                                                                                | 5 (the Elemental Incarnations) plus 2 mentions | none                                                | 18a                       |
| **First-main-phase transform** (the 7 two-faced legends)                                                                                                 | 7                                              | transform exists                                    | 18a                       |
| Persist, wither, conspire                                                                                                                                | a few                                          | none or partial                                     | 18a                       |
| "Gains all creature types" (Oko)                                                                                                                         | 1                                              | none                                                | 18b                       |
| Convoke, flash, stun counters, surveil, mill, landcycling, typecycling, Treasure, emblems                                                                | many                                           | exist                                               | 18b                       |

## Phase 18a: engine groundwork

Shared vocabulary every card group needs, built first in one pass so 18b agents only write cards: blight (cost,
optional additional cost, "if blighted" condition, effect), vivid amount, evoke, persist, wither, conspire, the
first-main-phase transform trigger, behold-and-exile. Each with unit tests and bot handling (when to blight, when to
evoke).

**Core done** (9 October 2026; engine in `engine/src/ecl-18a.ts` plus hooks marked `// Lorwyn Eclipsed (18a)`, tests
`engine/test/ecl-18a*.test.ts` with the fixture cards in `ecl-fixtures.ts`, `ai/test/ecl-18a.test.ts`,
`web/test/ecl-interaction.test.ts`, `cards/test/ecl-vocab.test.ts`; card builders in `cards/src/ecl-vocab.ts`). The names
below are what 18b card agents use. Every name is in `engine/src/types.ts` (search "Lorwyn Eclipsed (18a)"); the example is the
card or card text it was built for. The `// Lorwyn Eclipsed (18a)` comments in `build.ts` mean `Persist` and `Wither` are mapped
keywords and `Evoke`, `Conspire`, `Vivid` are labels (the rules text lives in the behaviour, as for any `KEYWORDS_AS_ABILITIES`).

### Blight N

The player always chooses the creature (a creature they control; a cost with no creature to blight isn't offered). Blighting a
creature to death is legal. The counters are the named counter `'-1/-1'` (`o.counters['-1/-1']`), which already counts in
power/toughness and cancels against +1/+1 counters.

| Where                                     | Name                                                                                                                                                                                                          | Example                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ability cost                              | `cost: { blight: N, ... }` (action field `blight`: the creature)                                                                                                                                              | Gristle Glutton `cost: { tapSelf: true, blight: 1 }`; from the graveyard (Evershrike's Gift) with `fromGraveyard: true`, `sorcerySpeed: true`; Champion of the Weird `{ life: 1, blight: 2 }`                                                                                     |
| Mandatory additional cost                 | `blightToCast: N`                                                                                                                                                                                             | "As an additional cost, blight 2"                                                                                                                                                                                                                                                 |
| Either/or additional cost                 | `blightOrPay: { amount: 1, pay: { generic: 3, colored: {} } }`                                                                                                                                                | Bogslither's Embrace, Wild Unraveling (`{ amount: 2, pay: {1} }`)                                                                                                                                                                                                                 |
| X additional cost                         | `blightX: true`; X is `{ x: true }`; X is limited to the greatest toughness among your creatures                                                                                                              | Soul Immolation: `damage { amount: { x: true }, to: 'eachOpponent' }` and `to: { each: 'creature', controller: 'opponent' }`                                                                                                                                                      |
| Optional additional cost                  | `kicker: { cost: ZERO, blight: N }` (builder `optionalBlight(N)`); "if the additional cost was paid" is `{ kind: 'wasKicked' }` and now works for instants and sorceries                                      | Cinder Strike `if { condition: wasKicked, then: [damage 4], else: [damage 2] }`, Burning Curiosity, Requiting Hex                                                                                                                                                                 |
| Optional cost that changes the modes      | `kicker: { cost: ZERO, blight: 2, spell: combineSpells([mode0, mode1]) }` (`combineSpells` is exported from `@mtg/engine`)                                                                                    | Pyrrhic Strike ("choose both instead")                                                                                                                                                                                                                                            |
| Effect                                    | `{ kind: 'blight', amount, who?, optional?, then?, otherwise? }` (builders `blight`, `mayBlight`); `who`: `'controller'` (default), `'eachOpponent'`, `{ target: n }`; mandatory with one creature: no prompt | Dream Seizer `mayBlight(1, [discard each opponent])`; High Perfect Morcant `blight(1, { who: 'eachOpponent' })`; Champion of the Weird's ability `targets: [{ what: 'player', controller: 'opponent' }]`, `blight(2, { who: { target: 0 } })`; Shadow Urchin attacks: `blight(1)` |
| "The blighted creature"                   | Ref `'chosen'` (builder constant `BLIGHTED`) inside `then`                                                                                                                                                    | Grub, Notorious Auntie `tokenCopy { of: 'chosen', attacking: true, ... }`; Blighted Blackthorn                                                                                                                                                                                    |
| "If you don't" / "If you can't"           | `otherwise: [...]`                                                                                                                                                                                            | Gutsplitter Gang `mayBlight(2, [], [loseLife 3])`                                                                                                                                                                                                                                 |
| "When you do"                             | `then: [{ kind: 'reflexiveTrigger', ability: i }]`                                                                                                                                                            | Warren Torchmaster                                                                                                                                                                                                                                                                |
| "You may pay {2}. If you don't, blight 2" | `{ kind: 'payOrElse', who: 'controller', cost, otherwise: [blight(2)] }`                                                                                                                                      | Chaos Spewer                                                                                                                                                                                                                                                                      |
| "If it isn't your main phase"             | `{ kind: 'not', condition: { kind: 'yourStep', steps: ['main1', 'main2'] } }`                                                                                                                                 | Dose of Dawnglow                                                                                                                                                                                                                                                                  |

No card says "whenever you blight", so there is no trigger for it (the engine emits a `blighted` event if one is ever needed).
Blighting is never "putting counters on an opponent's creature": `who: 'eachOpponent'` makes the opponent choose among their creatures.

### Vivid

`{ count: 'vivid' }` (constant `VIVID` in `ecl-vocab.ts`) is the number of colors among permanents you control. It is an ordinary
`Amount`, so it goes wherever an amount does:

- cost reduction: `costReduction: VIVID` (Wildvine Pummeler, Rime Chill); the cost is read as the spell is cast;
- characteristic: `powerEquals: VIVID` (Squawkroaster);
- effects: `draw { amount: VIVID }` (Shinestriker), `gainLife`/`loseLife { amount: VIVID }` (Luminollusk, Shimmercreep),
  `damage { amount: VIVID }` (Explosive Prodigy), `pump { power: VIVID, toughness: VIVID }` (Glister Bairn, Prismabasher),
  `createToken { count: VIVID }` (Kithkeeper), `searchLibrary { upTo: VIVID }` (Prismatic Undercurrents).

Not covered by an Amount: "reveal cards until you reveal X permanent cards" (Aurora Awakener) and Sanar's "exile a card of each
of those colors"; those need card-specific effects (18b).

### Evoke

- `evoke: <ManaCost>` on the card (builder `evoke(cost)`); all five Incarnations have a hybrid mana evoke cost
  (`{ generic: 0, colored: {}, hybrid: [['R','W'],['R','W']] }`). It appears as its own cast action (`evoked: true`); the UI label
  is "Evoke {R/W}{R/W}". An evoked permanent is sacrificed by a trigger the engine queues when it enters (it goes on the stack
  under the creature's own enter triggers, so they resolve first).
- `{ kind: 'wasEvoked' }`: "if it was evoked" (use `{ kind: 'not', condition: ... }` for "if it wasn't").
- "If {W}{W} was spent to cast it": `{ kind: 'manaSpentColors', colors: { W: 2 } }` (builder `enterIfSpent({ W: 2 }, effects)`).
  The mana is split into colors once, as it is paid: the split with the most colors at two or more mana (so a card with a {W}{W}
  and a {B}{B} trigger gets whichever the payer's lands can make, not both when they can't); at most two of a color are counted.
  An evoked Incarnation keeps it: evoking with {W}{W} still gets the {W}{W} enter trigger.

### Persist, wither, conspire

- Keywords `'persist'` and `'wither'` (`keywords: ['wither']`). Persist is checked as the creature dies, together with the others
  dying at the same moment (Isilu): a nontoken creature with persist and no -1/-1 counters comes back with one.
- Granted: Isilu `static anthem { affects: 'otherCreaturesYouControl', filter: { nontoken: true }, power: 0, toughness: 0, keywords: ['persist'] }`;
  Rhys `pump { to: { target: 0 }, power: 0, toughness: 0, keywords: ['persist'] }`; Barbed Bloodletter `pump { keywords: ['wither'] }`.
- Wither damage to a creature is -1/-1 counters (no damage marked); damage to players and planeswalkers is normal.
  Spinerock Tyrant: `copySpell { what: 'subject', withWither: true, newTargets: true }` inside a `may`.
- Conspire: `conspire: true` on a card, or the static `{ kind: 'noncreatureSpellsHaveConspire' }` (Raiding Schemes). Casting
  offers a second action with `conspire: true`; the two creatures (untapped, sharing a color with the spell) are chosen one at a
  time after the spell is on the stack (`conspire` decision), then a copy is made with new targets. Creatures that must tap for
  the mana aren't offered.

### The two-faced legends (first-main-phase transform)

- `firstMainTransform(cost)` on both faces: `triggered { trigger: { on: 'beginningOfMain', which: 1 }, cost, effects: [transform self] }`.
  "You may pay" prompts only when the mana is available.
- Front faces: `entersOrTransforms(effects, targets?)` = `{ on: 'etbOrTransforms' }` ("Whenever this creature enters or
  transforms into Brigid"); back faces: `transformsInto(effects, targets?)` = `{ on: 'transforms' }`. Both are read from the
  face the permanent shows after the change.
- Ashling, Rimebound: "add two mana of any one color, spend this mana only to cast spells with mana value 4 or greater": a
  `choose` over the five colors, each option `addMana { mana: [['R'], ['R']], onlyFor: 'MV4Plus' }`.
- Brigid, Doun's Mind: two mana abilities (`amountOf`, produces G / produces W). Oko: loyalty counters stay on transform (same
  object).
- Eirdu: static `{ kind: 'creatureSpellsHaveConvoke' }`; a convoking creature now pays for {1} or one mana of its colors.

### Behold

- `beholdOrPay` (existing) for "behold a Kithkin or pay {2}": `beholdOrPay: { filter: { subtype: 'Kithkin' }, pay: {2} }`.
- Behold and exile (the Champions): `beholdExile: { subtype: 'Kithkin' }` on the card; one cast action per distinct choice
  (`beholdCard`: a permanent you control or a card in hand, exiled as the cost) plus
  `returnBeheldWhenLeaves` = `triggered { trigger: { on: 'leavesBattlefield' }, effects: [{ kind: 'returnBeholdExiled' }] }`.
  A token that was exiled is simply gone. Countered, the exiled card stays exiled.
- Flashback with behold (Kindle the Inner Flame): `flashback: <cost>` plus `flashbackBehold: { filter: { subtype: 'Elemental' }, count: 3 }`.
- Celestial Reunion: `kicker: { cost: ZERO, beholdChosenType: 2 }`, and in its search
  `searchLibrary { filter: { types: ['Creature'], maxManaValue: 'x' }, to: 'hand', battlefieldIfChosenType: true, reveal: true }`.
  After the spell is cast the type is chosen, then the creatures one at a time (`beholdType` decision; hand cards are revealed).

### Gains/loses all creature types

`{ kind: 'allCreatureTypes', what, duration: 'permanent' | 'endOfTurn' }` (Oko's +2 permanent; Glamer Gifter until end of turn,
together with `pump { setBase: true, power: 4, toughness: 4 }`), `{ kind: 'loseCreatureTypes', what }` (Nameless Inversion, until
end of turn), and on Equipment `attached { ..., allCreatureTypes: true }` (Stalactite Dagger). They work with changelings, the
creature-type lords and later type-setting effects by timestamp. A changeling that died is every type for "whenever a Goblin you
control dies" (Boggart Mischief).

### -1/-1 counters elsewhere

- Enters with counters: `entersWithNamedCounters: { '-1/-1': 2 }` (builder `entersWithMinusCounters(2)`).
- Put: `namedCounters { name: '-1/-1', amount, to }` (Blight Rot, Darkness Descends with `to: { each: 'creature' }`, Bile-Vial
  Boggart's trigger, Nightmare Sower).
- Remove as an effect: `{ kind: 'removeCounters', from: 'self', name: '-1/-1', count? }`; without `name` it is "a counter of any
  kind" and the player picks the kind when there are several (Slumbering Walker). `{ kind: 'removeAnyNumberOfCounters', from }`
  takes counters off one at a time until the player says done (Rhys).
- Remove as a cost: `cost: { removeAnyCounters: N, mana }` (builder `withRemovedCounters(N, { mana })`); the action lists the
  kinds taken (`removeKinds`), one action per way, normally exactly one.
- Conditions: `hasMinusCounter` = `{ kind: 'sourceNamedCounters', name: '-1/-1', min: 1 }` ("while this creature has a -1/-1
  counter"); `{ kind: 'sourceHadNamedCounter', name: '-1/-1' }` for dies triggers ("if it had a -1/-1 counter on it": Retched
  Wretch, with `returnSource { to: 'battlefield', losesAbilitiesGains: [] }`); `{ kind: 'putCounterOnCreatureThisTurn' }` (Lasting
  Tarfire).
- Creatures with counters dying: `trigger: { on: 'creatureYouControlDies', filter: { hasCounters: true } }` with
  `{ event: 'amount' }` = the counters of every kind it had ("exile that many cards": Shadow Urchin).
- Dawnhand Dissident: `exileGraveyardCard { what, track: true }` remembers the card, and the static
  `{ kind: 'castExiledWithSelf', filter: { types: ['Creature'] }, removeCounters: 3, yourTurnOnly: true }` lets you cast your
  own tracked cards by removing counters from among your creatures (chosen one at a time, `payCounters` decision).

### Bots and interface

- Heuristic and search bots: a blight cost or choice is scored like any other action (the simulation sees the counters), so they
  blight creatures that survive or don't matter, take the optional blight when it kills something worth more, and evoke only when the
  enter effect is worth the card. Conspire's creatures, Celestial Reunion's type and Dawnhand's counters are chosen by evaluation
  (`ai/src/choices.ts` `chooseBeholdType` for the type). Action counts: a blight cost multiplies the casts by the creatures you control
  (about 5 to 10); everything else is step by step.
- Interface: the blight creature is clicked on the board like a sacrifice ("choose a creature to put the -1/-1 counters on");
  "Blight 1 / Pay {3}", "Evoke {..}", "Conspire", "Behold X and exile it" are cast-menu choices; optional blight and the
  "you may pay {G}: transform" prompt show their cost; Conspire, Celestial Reunion and Dawnhand have their own click prompts.

### Not covered (18b card-specific work)

- Aurora Awakener ("reveal cards until you reveal X permanent cards, put any number onto the battlefield") and Sanar, Innovative
  First-Year ("for each of those colors, you may exile a card of that color from among the revealed cards") are vivid cards whose
  effects are card-specific; the amount (`VIVID`) is there, the effects are built in 18b with a `chooseCustom` or custom effect and a test.
- Cards that only use older vocabulary (changeling, convoke, stun counters, surveil, mill, Treasure, emblems, landcycling) are left
  to the groups. "Add two mana of any one color" for an effect is a `choose` over the five colors (see Ashling).

## Phase 18b: every card

`scripts/data/ecl-groups.json` assigns every card to a group; `scripts/ecl-status.ts` shows what's left. One file per
group in `src/ecl/`, registered in `src/lorwyn-eclipsed.ts`, so parallel agents never edit the same registry lines. One
agent per group, each in its own worktree, merged into `lorwyn-eclipsed`.

**Done** (10 October 2026): all 268 cards, none left out (eight agents, about 600 tests in `cards/test/ecl-*.test.ts`).
Each group's custom handlers are in `engine/src/ecl-<group>-effects.ts`. Merging unified a few pieces built twice: one
`turn.creaturesEntered` log (cloned for the search bot's simulations), one same-target rule for modal "choose two" spells
(`modeStart` and `ofMode`), one `Ability:<type>` tag scheme for type-restricted mana (Eclipsed Realms, Flamebraider), and
`Kindred` became a card type. Two "tap N untapped creatures" costs remain (`tapUntapped` with a filter, multi-b;
`tapCreatures`, Kithkeeper and crew): worth folding into one. Cards that aren't exact are in `docs/shortcuts.md`.

## Phase 18c: decks and Jump In

- **Ten Jump In packets: Arena's own** (`ARENA_ECL_PACKETS`, `source: 'arena'`, "Lorwyn Eclipsed · Arena" group), from
  [MTGABuddy's list](https://mtgabuddy.com/en/jump-in-packet-list) (`scripts/data/arena-jumpin-packets.json`): the fixed
  cards and lands Arena lists (Temple Garden, Hallowed Fountain, Steam Vents, Blood Crypt, Overgrown Tomb, basics) plus its
  random slots. Packets have 18 or 19 cards, not 20. Arena's colours differ from the first guess (the table):

  | Packet    | Colour | Theme           |
  | --------- | ------ | --------------- |
  | Kithkin   | W/G    | Kithkin typal   |
  | Merfolk   | W/U    | Merfolk typal   |
  | Elemental | U/R    | Elemental typal |
  | Goblins   | B/R    | Goblin typal    |
  | Elves     | B/G    | Elf typal       |
  | Flashy    | U      | Flash matters   |
  | Burdened  | W      | -1/-1 counters  |
  | Blighted  | B      | Blight          |
  | Giant     | R      | Giant typal     |
  | Vivid     | G      | Vivid           |

  **Random slots** (`Packet.slots`: per slot a list of `{ card, weight }` alternatives, weights in percent): when a Jump In
  deck is built with a random source, `jumpInId(a, b, random)` deals one alternative per slot and writes the choices into
  the deck id, `jump-in:a+b~0110` (one digit per slot, a's slots then b's, each digit the index of the dealt
  alternative). The id alone says which cards the deck has, so saved games, replays and expedition runs rebuild the same
  deck. `jumpInId(a, b)` without a random source (bots enumerating pairs, `JUMP_IN_DECKS`, old saved ids) uses the
  likeliest alternative of each slot (`defaultDeal`). The lobby deals when a series starts (rematches keep the cards), the
  Expedition Jump In pick deals when the second packet is taken. The packet list and preview show each slot as its
  alternatives with their chance ("50% Sunderflock / 50% Ashling's Command"). Our older BLB and FDN Arena packets are
  still fixed lists but can use `slots` later.

  **Arena's packets measured** (fixed official lists, not tuned; heuristic bot, 300 games each, the packet plus a random
  one against two random packets from every set, random slots dealt per game, seats alternating): Kithkin 44.0%, Merfolk
  43.7%, Elemental 50.7%, Goblins 41.0%, Elves 47.0%, Flashy 39.0%, Burdened 53.7%, Blighted 53.3%, Giant 43.0%, Vivid
  53.3%. (Our earlier self-picked lists scored 43-60%.) A pair of Arena ECL packets is 36-38 cards, not 40.

- **Ten 60-card decks**, one per colour pair, `set: 'ecl'`, built from human-made lists (the archetype example decks
  from Wizards' draft overview and MTGAZone's archetype guide, scaled to 60 like the starter decks), each 45–65% against
  the ten Foundations starter decks. The allied pairs are the five tribes (G/W Kithkin, W/U Merfolk, U/R Elementals, B/R
  Goblins, B/G Elves); the enemy pairs follow their signpost uncommons (W/B Reaping Willow, R/W Hovel Hurler, R/G Noggle
  Robber, G/U Glister Bairn, U/B Voracious Tome-Skimmer).
- **Arena's two Theme Decks** (exact lists from mtg.wiki `Lorwyn_Eclipsed/Theme_Decks`, `source: 'arena'`): Pirates
  (U/R, needs 12 cards from other sets) and Angels (W/G, needs 7).

**Arena's Theme Decks done** (`ecl/theme-decks.ts` for the 16 cards from other sets, `ecl/theme-deck-lists.ts`):
Pirates 55%, Angels 71% against the ten Foundations starters (fixed official lists, not tuned). Explore now asks top or
graveyard, and crew lets the player pick the creatures.

**18c part 1 done** (`ecl/decks-1.ts`, tests `ecl-decks-1.test.ts`, packets in `jumpin.ts`). Decks, bot vs bot, 20 games per
seat against each of the fourteen `source: 'arena'` starter decks: Clachan Banner (G/W Kithkin, face Brigid, Clachan's
Heart) 60.7%, Wanderwine Tide (W/U Merfolk, face Sygg, Wanderwine Wisdom) 50.9%. Both keep the MTGAZone skeleton's cards
scaled by 1.5 (G/W: 36 spells; W/U filled with Adept Watershaper, Champions of the Shoal, Disruptor of Currents, Sygg and
Tributary Vaulter); lands are basics plus Guildgates, Evolving Wilds, Hushwood Verge, Thriving Isle and Eclipsed Realms (ECL
has no dual lands but that one). Packets (about 300 games each against random packets of every set): Kithkin (W/G,
Brigid, Clachan's Heart) 60%, Merfolk (W/U, Deepway Navigator) 48%, Burdened (W, Slumbering Walker) 60%, Vivid (G, Aurora
Awakener) 54%. Two bot/engine fixes found on the way: the heuristic bot no longer double-blocks Safewright Cavalry ("can't be
blocked by more than one creature"), and an activated ability with "tap another creature" no longer lists a creature that
is also the only mana source as the one to tap.

**Goblins, Elves and Elementals done** (`ecl/decks-2.ts`, `ecl-*` packets in `jumpin.ts`, test `ecl-decks-2.test.ts`).
Scaled from MTGAZone's Rakdos Goblins, Golgari Elves and Izzet Elementals skeletons (36 spells, 24 lands, one Blood
Crypt / Overgrown Tomb / Steam Vents, Eclipsed Realms and Evolving Wilds). Bot vs bot, 20 games per seat against the ten
Foundations starter decks: Boggart Rampage (B/R, Grub, Storied Matriarch) 46.0%, Gilt-Leaf Hunt (B/G, High Perfect
Morcant) 60.5%, Kulrath Tempest (U/R, Ashling, Rekindled) 49.8%. Packets (our packet plus a random one against two
random packets, 300 games): Elemental (Ashling, Rekindled) 43.0%, Goblins (Grub, Storied Matriarch) 44.7%, Elves (High
Perfect Morcant) 48.0%. Mischievous Sneakling is U/B hybrid, so the Goblins deck leaves it out.

**18c, enemy pairs and three packets done** (`ecl/decks-3.ts`, tests `ecl-decks-3.test.ts`). Bot vs bot, 20 games per seat
against each of the ten Foundations starters (400 games): Willow's Reprieve (W/B, Emptiness) 46.8%, Hurlers and Giants (R/W,
Bre of Clan Stoutarm) 50.5%, Treasure Trove Titans (R/G, Aurora Awakener) 61.3%, Prismatic Wilds (G/U, Wistfulness) 50.5%,
Twilight Ambush (U/B, Bitterbloom Bearer) 47.8%. The first U/B lists (small flash creatures plus tricks and counters) sat at
30-40%: the bot plays flash cards in its main phase anyway, so bodies and removal matter more than the tricks. Packets
(`ecl-flashy`, `ecl-blighted`, `ecl-giant`; 300 games each against random packets from every set): Flashy (U/B, Glen Elendra
Guardian) 42.7%, Blighted (B, Champion of the Weird) 48.3%, Giant (R, Goliath Daydreamer) 60.0%. Bug found by these games:
the heuristic bot planned double blocks against "can't be blocked by more than one creature" (Safewright Cavalry) and the
engine rejected them; `combatStats` now reports `maxBlockers` and `planBlocks` respects it.

## Phase 18d: boosters

`PackSet` `'ecl'` in Expedition and a Season pack kind, sheets from the ECL booster list.

**Done**: `lorwynEclipsedBoosterSheets()`, `PackSet` `'ecl'` in Expedition, Season pack kind `lorwynEclipsed` with the ten
`ecl-*` decks as starters, Sealed, the deck builder's set names and card search. The wrapper shows Eirdu, Carrier of Dawn.

## Simplifications to revisit

See the Lorwyn Eclipsed section of `docs/shortcuts.md`.
