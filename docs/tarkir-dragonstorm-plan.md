# Plan: Tarkir: Dragonstorm (TDM)

Target: the Tarkir: Dragonstorm main set (on Arena since 8 April 2025): every card in the set, Arena's ten Jump In
packets (exact contents, random slots included), ten human-made 7–0 draft trophy decks (one per colour pair, from
untapped.gg, like the Bloomburrow, Foundations, Marvel and Final Fantasy draft decks), then boosters. **No decks of our
own** (the user's rule: Arena's lists first, human-made next). **No Brawl** (Arena's five Tarkir store decks need about
190 cards from outside the set) and no Commander decks.

One branch, `tarkir-dragonstorm`, one sub-phase at a time. Read `docs/lorwyn-eclipsed-plan.md` first: this plan reuses
its rules, wiring and agent setup and doesn't repeat them.

## Rules

Same as Lorwyn Eclipsed: engine vocabulary in its own commented block (`// Tarkir: Dragonstorm (19a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, rules text from
the Scryfall oracle text. **No shortcuts**: a card does exactly what its text says, or it stays out (wording in
`docs/marvel-jumpstart-handoff.md`). Anything not exact goes in `docs/shortcuts.md`.

## The set

271 booster cards (`is:booster` on Scryfall), about 23 already in the pool. Five three-colour clans (Abzan WBG, Jeskai
URW, Sultai BGU, Mardu RWB, Temur GUR), each with a mythic dragon legend; 27 dragons, all with flying. Omen cards
(Scryfall layout `adventure`, 13): a creature with an Omen spell side; the spell is shuffled into its owner's library
instead of going to the graveyard.

## Mechanics (19a)

| Mechanic | Engine today |
| --- | --- |
| Omen (adventure-like split card; the spell shuffles into the library) | adventures exist (Final Fantasy) |
| Flurry ("whenever you cast your second spell each turn") | spells-cast counts exist |
| Renew (activated ability from the graveyard, exile this card as a cost, sorcery speed) | graveyard abilities exist |
| Endure N (put N +1/+1 counters on it, or create an N/N white Spirit token) | new, small |
| Mobilize N (attacks: create N tapped and attacking 1/1 red Warriors, sacrificed at the next end step) | "tapped and attacking" exists |
| Harmonize (cast from the graveyard; tap a creature to reduce the cost by its power; then exile) | flashback exists |
| Behold a Dragon (and "if a Dragon was beheld") | behold exists |
| Three-colour mana: tri-lands, Monuments, bots paying three colours | two-colour support exists |

## Phases

- **19a**: engine groundwork for the mechanics above, with tests, bot handling and Arena-style prompts. **Core done**, see "Phase 19a" below.
- **19b**: every card, one agent per colour group in worktrees (`scripts/data/tdm-groups.json`, `scripts/tdm-status.ts`,
  `src/tdm/<group>.ts`, registered in `src/tarkir-dragonstorm.ts`).
- **19c**: Arena's ten Jump In packets (`scripts/data/arena-jumpin-packets.json`, from MTGABuddy) and the untapped.gg
  trophy decks. **Done**, see "Status and handoff".
- **19d**: boosters in Expedition, Season and Sealed. **Done**, see "Status and handoff".

## Phase 19a: engine groundwork

**Core done** (10 October 2026; engine in `engine/src/tdm-19a.ts` plus hooks marked `// Tarkir: Dragonstorm (19a)`, tests
`engine/test/tdm-19a-*.test.ts` with the fixture cards in `tdm-fixtures.ts`, `ai/test/tdm-19a.test.ts`,
`web/test/tdm-interaction.test.ts`, `cards/test/tdm-vocab.test.ts`; card builders in `cards/src/tdm-vocab.ts`). The names below are
what 19b card agents use. Every engine name is in `engine/src/types.ts` (search "Tarkir: Dragonstorm (19a)"); the example is the card
or card text it was built for.

**Wiring the set needs** (19b): register `TDM_VOCAB_TOKENS` in the set file next to the set's own tokens: the 0/0 white Spirit
`tdm-spirit-token` that endure makes and the 1/1 red Warrior `tdm-warrior-token` of mobilize (other Spirits and Warriors in the set,
Salt Road Skirmish's, can use the same ids). `KEYWORDS_AS_ABILITIES` in `build.ts` has Mobilize, Endure and Harmonize; Flurry and Renew
are named abilities ("Flurry —"), Decayed is a keyword, and Ureni's protections are mapped (`protectionWhite`, `protectionBlack`).
`index.ts` derives the Siege definitions (below).

### Omen

No flag and no builder: Scryfall's layout is `adventure`, so the fetch script already makes two records, the creature (with
`adventure: true` and `back` = the Omen spell) and the Omen spell (`Sorcery — Omen` or `Instant — Omen`, `front` = the creature).
Write the creature's behaviour under the creature's name and the spell's behaviour under the spell's name, like the Final Fantasy
Adventures (`fin/lands.ts`). Casting: the hand offers the creature and the Omen as separate cast actions (`back: true` for the Omen;
the cast menu says "Omen: Claim Territory ({2}{G})"). When the Omen resolves the card is shuffled into its owner's library (a
`shuffled` event; it is the creature card again); countered or fizzled it goes to the graveyard instead. "Also shuffle this card" in
the text is that same shuffle. `{X}` works as usual (Exude Toxin: `manaCost` `{X}{B}{B}`, `{ x: true }`). Mana for "a Dragon spell or
an Omen spell" (Maelstrom of the Spirit Dragon) is two sets of `mana` abilities with `onlyFor: 'Dragon'` and `onlyFor: 'Omen'` (a
spell's subtypes are its tags).

### Flurry and the spells-cast counts

- `flurry(effects, targets?)` = `{ on: 'castSpell', filter: 'second' }` ("Flurry — Whenever you cast your second spell each turn"): the
  caster's second spell this turn; copies and the opponent's spells don't count. Devoted Duelist
  `flurry([damage 1 to eachOpponent])`; Wayspeaker Bodyguard `flurry([tap target], [{ what: 'creature', controller: 'opponent' }])`;
  Poised Practitioner `flurry([counters +1/+1 on self, scry 1])`.
- Taigam, Master Opportunist: `flurry([{ kind: 'copySpell', what: 'subject' }, { kind: 'suspend', what: 'subject', time: 4 }])`
  copies the spell, then takes the original off the stack (not countered) into exile with four time counters; it is suspended, so it
  is cast free when the last counter comes off (a creature with haste).
- `{ kind: 'spellsCastThisTurn', min?, max?, filter?, who? }` (condition) and `{ count: 'spellsCastThisTurn', filter? }` (amount): the
  spells cast this turn (default yours; `filter` by `types`, `notTypes`, `subtype` of the spell). Read while a spell is being cast
  (cost reductions) the count does not include it yet; read afterwards (cast triggers, enters) it does. Focus the Mind / Rally the
  Monastery `costReductionIf: { condition: { kind: 'spellsCastThisTurn', min: 1 }, amount: 2 }`; Highspire Bell-Ringer
  `spellsCostLessIf { filter: {}, condition: { kind: 'spellsCastThisTurn', min: 1, max: 1 }, amount: 1 }`; Effortless Master
  `entersWithCountersAmount: { if: { kind: 'spellsCastThisTurn', min: 2 }, then: 2, else: 0 }`; Sage of the Skies a `castSelf`
  trigger with `condition: { kind: 'spellsCastThisTurn', min: 2 }` and `copySpell { what: 'subject' }`; Narset
  `draw { amount: { count: 'spellsCastThisTurn' } }`; Eshki an `all` of two conditions, `filter: { types: ['Creature'] }` and
  `filter: { notTypes: ['Creature'] }`.

### Renew

`renew(cost, targets, effects, extraCost?)` = `activated { fromGraveyard: true, sorcerySpeed: true, cost: { mana, exileSelf: true } }`
(Adorned Crocodile: `renew(mana('{B}'), [{ what: 'creature' }], [counters +1/+1 on { target: 0 }])`). The keyword counters of the other
Renew cards are named counters: `namedCounters { name: 'flying' | 'lifelink' | 'trample' | 'deathtouch' | 'reach' | 'decayed', amount: 1,
to }` (they grant the keyword by themselves). Exiling the card as the cost is a card leaving your graveyard (the
`cardsLeaveYourGraveyard` trigger of Kheru Goldkeeper and Kishla Skimmer: add `condition: { kind: 'yourTurn' }` and `oncePerTurn: true`;
Essence Anchor and Attuned Hunter read the `cardsLeftGraveyardThisTurn` condition).

- Rot-Curse Rakshasa, "{X}{B}{B}: a decayed counter on each of X target creatures": `targets: [{ what: 'creature', xTargets: true }]`
  on the ability and `cost.mana.x: 1`; the effects reach the targets as `{ targetsFrom: 0 }` (`namedCounters { name: 'decayed', amount: 1,
  to: { targetsFrom: 0 } }`). The activation action carries `x` (1 up to the number of creatures there are to target); once the ability
  is on the stack the `abilityTargets` decision picks the X targets one at a time (`chooseTargets` with the targets so far plus one;
  the board highlights candidates like any targeting).
- Decayed: the keyword `'decayed'` (`keywords: ['decayed']`, or a decayed counter): it can't block, and when it attacks it is
  sacrificed at the beginning of the end of combat step (a delayed trigger, `DelayedTrigger.at: 'endCombat'`).

### Endure N

`endure(amount, what?)` = `{ kind: 'endure', amount, what?: Ref }`: the controller chooses (a `chooseOption` prompt: "Put 2 +1/+1
counters on X" / "Create a 2/2 white Spirit creature token"); if the creature isn't on the battlefield any more only the token is
made, without a prompt. `what` is `'self'` (default) or `'subject'` (the creature that caused the trigger). Examples: Fortress Kin-Guard
etb `endure(1)`; Anafenza, Unyielding Lineage `otherCreatureDies { controller: 'you', nontoken: true }` with `endure(2)`; Sinkhole
Surveyor attacks `[loseLife 1, endure(1)]`; Descendant of Storms an `attacks` trigger with `cost: {1}{W}` ("you may pay") and
`endure(1)`; Krumar Initiate `activated { sorcerySpeed: true, cost: { mana: {X}{B}, tapSelf: true, lifeX: true } }` with
`endure({ x: true })` (`lifeX` is "pay X life", X no more than your life); Warden of the Grove `otherCreatureEtb { controller: 'you',
filter: { nontoken: true } }` with `endure({ allCountersOn: 'self' }, 'subject')` (`{ allCountersOn: Ref }` counts counters of every
kind). `createToken` got `pt: Amount` (a 0/0 definition whose size is set as it is made: Abzan Monument's
`pt: { count: 'greatestToughnessYouControl' }`, Severance Priest) and `endure` has `token?` (default `tdm-spirit-token`).

### Mobilize N

`mobilize(n)` = `triggered { on: 'attacks' }` with `createToken { token: TDM_WARRIOR, count: n, tapped: true, attacking: true,
sacrificeAt: 'nextEndStep' }` (`n` is a number or any Amount: Avenger of the Fallen
`mobilize({ count: 'cardsInGraveyard', types: ['Creature'] })`). The tokens enter attacking the opponent (never declared, so no
attack triggers) and a delayed trigger sacrifices each at the next end step. `sacrificeAt: 'nextEndStep'` works on any `createToken`
(War Effort's `youAttack` trigger; Salt Road Skirmish with `hasteThisTurn: true`); `keywordsThisTurn: ['menace', 'haste']` is "they gain
menace and haste until end of turn" (Mardu Monument). Zurgo, Thunder's Decree: the static
`{ kind: 'cantBeSacrificed', filter: { token: true, subtype: 'Warrior' }, duringYourEndStep: true }` (an effect or a cost can't
sacrifice such a permanent; costs don't list it). Bone-Cairn Butcher: an `anthem` with `filter: { attacking: true, token: true }` and
`keywords: ['deathtouch']`. Dalkovan Encampment: `activated { cost: {2}{W}, {T} }` with `emblem { until: 'endOfTurn', ability: triggered {
on: 'youAttack' } createToken ... }` (an emblem now sees `youAttack`, once for the whole attack).

### Harmonize

`harmonize(cost)` = `{ flashback: cost, harmonize: true }` on the card (Unending Whisper `harmonize(mana('{5}{U}'))`; Nature's Rhythm keeps
its {X}). Cast from the graveyard, it is exiled afterwards like flashback. Every way of paying is a cast action: one without a tap, and
one for each kind of untapped creature you control with power (`harmonizeTap`: the creature; creatures that look alike are one
choice, weakest first) whose tap takes generic mana off the cost. The creature is tapped as the spell is cast and isn't also tapped for
mana; the reduction is its power in generic mana, never more than the generic part. The cast menu says "Harmonize {5}{U}, tapping no
creature" and "Harmonize: tap Goblin (power 2) to pay less". Songcrafter Mage: `grantHarmonize` (`{ kind: 'custom', handler:
'grantHarmonize' }`, target `{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }`): the card may be cast
from the graveyard this turn for its mana cost, tapping a creature the same way, then it is exiled.

### Behold a Dragon

All on existing behold support, with `DRAGON = { subtype: 'Dragon' }` and builders: `beholdDragonOrPay(pay)` ("behold a Dragon or pay
{1}": Caustic Exhale; one cast action per card you could behold, a hand card is revealed); `mayBeholdDragon(flash?)` ("you may behold a
Dragon as an additional cost": Dispelling, Osseous and Piercing Exhale, with `dragonWasBeheld` = `{ kind: 'wasKicked' }` for "if a
Dragon was beheld"; `flash: true` is Molten Exhale, a sorcery with flash if you behold); `mayBeholdDragonThen(effects)` ("when this
enters, you may behold a Dragon. If you do, ...": Sarkhan, Dragon Ascendant; a prompt for the card or "Don't behold", nothing is asked
when there is nothing to behold, a hand card is revealed); `controlsDragon` = `{ kind: 'controlsCreature', filter: DRAGON }` ("if you
control a Dragon": Embermouth Sentinel; a mana ability's `condition` for Mox Jasper). `returnWhenDragonEnters` is the Dragonstorm
enchantments' second ability (`otherCreatureEtb` of a Dragon you control, `bounce self`).

### The Sieges ("As this enchantment enters, choose Abzan or Mardu")

`enterChoices: [{ label: 'Abzan', abilities: [...] }, { label: 'Mardu', abilities: [...] }]` on the card (its own `abilities` stay).
`index.ts` (`withEnterChoice`, `enterChoiceVariants` in `tdm-vocab.ts`) gives the card an enters trigger that asks and makes one hidden
definition per choice (`variantOf`, id `hollowmurk-siege--abzan`); the permanent becomes that definition (it shows the same card) and
is the plain card again anywhere but the battlefield. All abilities of a choice work as written, statics and triggers alike. The
choice is made as the enters trigger resolves (an opponent can respond to the trigger first): see `docs/shortcuts.md`.

### Three colours, the Devotees, protection

- Tri-lands, Monuments: nothing new (three `mana` abilities on one land; the Monuments' activations are `activated { sorcerySpeed,
  cost: { mana, tapSelf, sacrificeSelf } }`). Engine tests pay {R}{W}{B} with a tri-land and basics, with two tri-lands and a basic, a
  four-mana three-colour activation, and the twobrid costs ({2/R}{2/W}{2/B}).
- Devotees: `devoteeMana(['U', 'R', 'W'])` = `activated { manaAbility: true, oncePerTurn: true, cost: { mana: {1} }, effects: [addMana
  [['U', 'R', 'W']]] }`. A mana ability whose cost is mana: it doesn't use the stack, and the mana (one of the three colours, picked as
  it is spent) waits in the pool. It is not used automatically while paying: the player activates it first (the heuristic bot does when
  that makes a card in hand castable).
- Protection from white and from black (Ureni): the keywords `protectionWhite` and `protectionBlack` (no targeting, blocking, damage,
  enchanting or equipping by sources of that colour).
- `colorsName` names three-colour decks (Abzan, Jeskai, Sultai, Mardu, Temur, and the shards) and a Jump In packet may have three colours.
  Expedition and Sealed read a deck's colours with `mainColors` (19d): a third colour counts once the deck has four spells of it.
  The deck suggester (`deckCompletion.ts`) still builds two colours and a splash.

### Bots and interface

- Bots: the Omen side is scored like any cast (an Omen cast this turn counts as three-quarters of a card in the evaluation, since it comes
  back), so it is cast when the creature is out of reach or the spell is worth more than the card it takes from the hand; harmonize
  never taps a creature before the bot's own attack and takes the weakest one that makes the spell affordable; endure, "may behold",
  Sieges and X targets are chosen by evaluation; a Devotee is used by rule. Land choice and tapping already keep the flexible land for
  last, and a tapped tri-land is played first only when nothing can be cast this turn anyway.
- Interface: "Omen: Name (cost)" in the cast menu, "Harmonize: tap X to pay less" and "Harmonize {cost}, tapping no creature", the
  endure/behold/Siege prompts through the option menu, Rot-Curse Rakshasa's X targets through the targeting overlay, and tooltips for
  Mobilize, Endure, Harmonize, Behold, Flurry, Renew, Omen and Decayed.

### Not covered (19b card-specific work)

One-off engine pieces the card agents build with a test, as in Lorwyn's 18b: Teval ("spells you cast have delve"), Dracogenesis (Dragon
spells free), Neriv (doubling damage of creatures that entered this turn), Windcrag Siege's Mardu half (attack-caused triggers twice),
Kotis, Ugin's cast triggers, Call the Spirit Dragons, Karakyk Guardian ("hasn't dealt damage yet"), All-Out Assault's extra combat and
main phase, Breaching Dragonstorm, Mardu Siegebreaker, Flamehold Grappler. Tempest Hawk's "any number of copies" is already handled
(`copyLimit` in `season.ts`).

## Status and handoff (10 October 2026)

- **19a done.** **19b done**: all 271 cards (eight agents, merged on `tarkir-dragonstorm`; all `tdm-*` tests pass).
  `pnpm --filter @mtg/cards exec tsx scripts/tdm-status.ts` shows 271/271. Rules gaps are in `docs/shortcuts.md`.
- Merging unified a few duplicates (one single-graveyard target check, one `divide.atLeastOne`); the fetch script now gives
  adventure and Omen faces their colours; `PRINTING_OVERRIDES` in `pool.ts` pins the tri-lands and Craterhoof to TDM.
- Lorwyn Eclipsed's Jump In packets are now Arena's own (random slots, topped up to 40); that is on this branch too.
- **19c done.** `ARENA_TDM_PACKETS` in `jumpin.ts`: Arena's ten packets (five clans, three colours each, and five
  mono-colour themes), 13 cards each with their random slots; the pair is topped up to 40 with basics by mana symbols.
  `TARKIR_DRAGONSTORM_TROPHY_DECKS` in `decks.ts`: the seven decodable untapped.gg decks (Boros, Simic, Mardu, Sultai,
  Jeskai, Temur and a five-colour Jeskai; 7–1 or 7–2, none went 7–0), shown as "Tarkir: Dragonstorm draft decks". Bot games in
  `ai/test/tdm-decks.test.ts`.
- **No Abzan deck.** No public human Abzan list was found: untapped.gg shows only its eight curated decks (every page and
  locale), AetherHub's meta page gives card percentages, not lists, and 17lands has Abzan trophy decks but its API terms forbid
  use outside 17lands.com. Following the rule (no decks of our own), Abzan has no trophy deck.
- **19d done.** `tarkirDragonstormBoosterSheets()` (the 271 `is:booster` cards at their TDM rarity, reprints included), `PackSet`
  `'tdm'` in Expedition and Sealed, Season pack kind `tarkirDragonstorm` (no TDM starters: there are no decks of our own), the deck
  builder's set names and card search. The wrapper shows Ugin, Eye of the Storms. `mainColors` in `expedition.ts` keeps a third
  colour with at least four spells (`THIRD_COLOUR_SPELLS`), so clan decks get rare offers, land upgrades and pips in all three
  colours; fewer is a splash and stays out.
- **Tarkir: Dragonstorm is complete** (19a–19d). Merge `tarkir-dragonstorm` into `main` when it has been played.
- **Brawl test timing (checked).** The random Brawl games took about 360 s here against 236 s on `main`. Games that play out
  the same on both branches are about 40% slower: `def` and `manaSources` (both on every legal-action check) pick up Lorwyn
  Eclipsed and Tarkir checks per object. `def` now reads its colour and Aura-grant fields only once a state flag says some
  object has them (`colorChanges`, `auraGrants`); that is about 5% overall. The Brawl test limit is now 480 s. `fra-decks-3` (Grave Harvest) and `save-game` also time out on this branch
  (they did before these fixes). A wider speed pass
  (Lavaleaper's battlefield scan in `manaSources`, per-object reads in `legal.ts`) could win back the rest.

## Simplifications to revisit

See the Tarkir: Dragonstorm section of `docs/shortcuts.md`.
