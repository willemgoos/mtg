# Plan: Final Fantasy (FIN), main set then Brawl precons

Target: the Final Fantasy release as Arena has it (on Arena since 10 June 2025):

- **Phase 11, main set:** the Final Fantasy (FIN) set, done like Bloomburrow and Marvel Stream B: our own two-colour 60-card
  decks, every rare and mythic, Jump In packets, then boosters.
- **Phase 12, Brawl precons:** the Final Fantasy Commander (FIC) decks as Arena sells them, played as **Brawl**, like Marvel
  Stream A.

One branch, `final-fantasy` (cut from `main`), one sub-phase at a time, each committed when its done criteria hold.

## Rules

- **Done criteria (every sub-phase):**
  - every listed card implemented; the coverage test fails otherwise
  - unit tests for each new mechanic (`packages/cards/test/fin-*.test.ts`, engine tests where the engine changes)
  - the random-game fuzz test passes
  - `pnpm arena` runs without errors, with each new deck at 45â€“65% against the ten Foundations starter decks
  - every new choice has an Arena-style prompt in the web UI
- Engine vocabulary for a new mechanic goes in its own commented block in `packages/engine/src/types.ts` and `effects.ts`
  (`// Final Fantasy (11a): job select`). Don't reorder existing code. One-off cards get `custom` handlers.
- `pnpm typecheck`, `pnpm lint` and `pnpm test` before every commit; commit at the end of each sub-phase.
- Card data only through `pnpm cards:fetch`; never edit `generated/scryfall.json` by hand.
- Record simplifications as you go, below.

## Wiring (done in step 0)

- `packages/cards/src/pool.ts`: `fin` and `fic` in `SET_PREFERENCE` (after `msc`, so reprints keep their Foundations or
  core-set printing), and `FINAL_FANTASY_POOL` from `FINAL_FANTASY_BEHAVIORS`.
- `packages/cards/src/final-fantasy.ts`: merges `fin/*` (empty until 11a); merged into `BEHAVIORS` in `behaviors.ts`.
- Still to do as the cards arrive: `'fin'` and `'fic'` in the `set` union of `decks.ts` and the Packet `set` union of
  `jumpin.ts` (11a/11c), `PackSet` and `SHEETS` in `apps/web/src/game/expedition.ts` and `season.ts` (11c).
- **Fetch script:** `fetch-scryfall.ts` skips the `adventure` and `meld` layouts today. 11a adds `adventure` (one record
  per face, the land naming its Adventure, as for double-faced cards). 11c adds `meld` (the two halves as normal cards,
  the melded back as a back face, as `transform` does).

## The set (checked against Scryfall, bulk data of 29 September 2026)

- 293 nonbasic booster cards (90 common, 110 uncommon, 74 rare, 20 mythic; Scryfall counts the 10 common Town lands as
  commons), plus Ragnarok, Divine Deliverance (the melded back), plus six basics (the five and Wastes).
- 12 more cards only in the Starter Kit (`starterdeck` promo type, numbers 426â€“563: Cloud, Planet's Champion; Sephiroth,
  Planet's Heir; Beatrix; Rosa; Ultimecia, Temporal Threat; Seymour Flux; Lightning; Xande; Judgment Bolt; Deadly Embrace;
  Magitek Scythe; Ultima Weapon). They belong to the Starter Kit (11d), not to boosters.
- "Through the Ages" (FCA, 64 reprints): out of scope.
- **Names:** FIN cards print their Final Fantasy names; no FIN card has a `flavor_name` (one FIC card does), so no name
  mapping is needed.
- Layouts: 256 normal, 27 transform, 15 saga, 5 adventure, 3 meld.
- 109 legendary creatures: many decks will run several legends (the legend rule matters more than in earlier sets).

## Mechanic inventory

Counts are booster cards (293 plus the melded back). "Engine" says where it stands today, checked by grepping
`packages/engine/src` and `packages/cards/src`.

### New

| Mechanic                         | Cards                                                                                                           | What it needs                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Job select**                   | 16 Equipment (25 Equipment in all)                                                                              | ETB trigger: create a 1/1 colourless Hero creature token, then attach this to it. Hero tokens also come from two other cards (18 Hero-token texts in all). Equip, attach and Hero as a creature type exist; the trigger and the token kind are new.                                                                                                                                                              |
| **Tiered**                       | 6 instants (Restoration Magic, Ice Magic, Thunder Magic, Fire Magic, Vincent's Limit Break, Tifa's Limit Break) | "Choose one additional cost": each mode has its own extra mana cost ({0} for the first). Like `modes`, but the mode is picked before paying and adds its cost; close to Seasons' per-mode `paws`. Prompt: Arena shows the modes with their costs. Vincent's Limit Break picks a base P/T, not an effect.                                                                                                         |
| **Saga creatures** ("Summon: X") | 23 (15 saga layout, 8 as transform backs, e.g. Esper Origins' Summon: Esper Maduin)                             | Our Sagas are generic (`saga: N`, lore counters at entry and precombat main, sacrificed after the last chapter). Check that a creature Saga gets summoning sickness, combat and chapter triggers, and is sacrificed after the last chapter even when it's a creature. New: removing lore counters (Garnet), "return target Saga card" (Rydia), and Sagas that transform at the end (Summon: Alexander, Bahamut). |
| **Town** (land subtype)          | 23 Town lands (12 common, 3 uncommon, 8 rare) and about 10 cards that count or fetch Towns                      | Subtypes come from the type line already; new are the counts ("for each Town you control"), "Affinity for Towns" (affinity exists, for artifacts) and "search for a basic land or Town card".                                                                                                                                                                                                                    |
| **Adventure lands**              | 5 rare Towns (Ishgard, Jidoor, Lindblum, Midgar, Zanarkand)                                                     | A land with an Adventure (a sorcery or instant). Cast the Adventure from hand; it resolves into exile; you may later play the land from exile (using your land drop). Adventures don't exist in the engine yet: new casting option, an "on an adventure" exile zone flag, playing a land from exile, a fetch-script layout.                                                                                      |
| **Meld**                         | 1 pair (Vanille + Fang into Ragnarok, Divine Deliverance)                                                       | New, but one pair: do it as a `custom` exile-and-create of the melded card in 11c, plus the fetch layout.                                                                                                                                                                                                                                                                                                        |
| **Hideaway**                     | 1 (Clive's Hideaway)                                                                                            | Hideaway 4: exile one of the top four face down; play it free later under a condition. One card, so `custom` unless other sets need it.                                                                                                                                                                                                                                                                          |
| **Finality counters**            | Esper Origins                                                                                                   | Exists (context, stack, spells). Esper Origins also puts a sorcery onto the battlefield transformed: new, `custom`.                                                                                                                                                                                                                                                                                              |
| **Stun counters**                | 6                                                                                                               | Exist: the untap replacement is in `context.ts`. Check "put X stun counters" (Omega) as an effect.                                                                                                                                                                                                                                                                                                               |
| **Named ability labels**         | about 45 ("Stagger â€”", "Protect â€”", "Summon â€”", "Limit Break" names, etc.)                                | Labels with no rules (Scryfall lists some as keywords). Nothing to build.                                                                                                                                                                                                                                                                                                                                        |

### Reused (already in the engine)

Transforming DFCs (27: 19 legendary creatures, 5 Sidequest enchantments, a land, a sorcery, an artifact; conditions such as
"if you control four or more Birds" are new amounts or conditions, not a new mechanic), Sagas (lore counters), Equipment and
equip (27 equip texts), Vehicles and crew (9), affinity (3, extended to Towns), landcycling and typecycling (5 basic
landcycling commons, 8 cycling texts), landfall (10), flashback (14), Treasure (10), Food (2-3), surveil (11), mill (10),
kicker (2), ward (3), prowess, fight, flash, defender, double strike (6 texts), lifelink, deathtouch, menace, reach,
trample, vigilance, haste, first strike, indestructible, "can't be countered", gain control (Zidane), Wizard tokens with a
cast trigger (3, like Foundations' Wizards).

Not in FIN: Classes, planeswalkers, plain (non-creature) Sagas, the monarch, connive, power-up, teamwork.

### Themes (from the ten two-colour signpost uncommons)

| Pair | Theme                           | Signposts                                               |
| ---- | ------------------------------- | ------------------------------------------------------- |
| W/U  | artifacts and Heroes            | Cid, Timeless Artificer; Tidus, Blitzball Star          |
| U/B  | surveil and big graveyard turns | Ultimecia, Time Sorceress; Locke Cole                   |
| B/R  | noncreature spells              | Black Waltz No. 3; Garland, Knight of Cornelia          |
| R/G  | landfall                        | Gladiolus Amicitia; Rydia, Summoner of Mist             |
| G/W  | Sagas and Summons               | Garnet, Princess of Alexandria; Rinoa Heartilly         |
| W/B  | creatures and artifacts dying   | Judge Magister Gabranth; Rufus Shinra                   |
| U/R  | expensive noncreature spells    | Shantotto, Tactician Magician; The Emperor of Palamecia |
| B/G  | permanents in the graveyard     | Exdeath, Void Warlock; Cloud of Darkness                |
| R/W  | Equipment and job select        | Giott, King of the Dwarves; Zidane, Tantalus Thief      |
| G/U  | lands and Towns                 | Ignis Scientia; Omega, Heartless Evolution              |

## Phase 11: FIN main set (like Bloomburrow and MSH Stream B)

Our own two-colour 60-card decks (36 spells, 24 lands), shown in their own deck section, with `set: 'fin'`. They play
against the Foundations, Bloomburrow and MSH decks. Card behaviour in `packages/cards/src/fin/`, one file per pair of decks
plus `others.ts`, `rares.ts`, `mythics.ts`, `sagas.ts`, `lands.ts`, merged in `final-fantasy.ts`. Tests in
`packages/cards/test/fin-*.test.ts`.

### 11a: the set mechanics and the first two decks: done

Done: job select (a `jobSelect` effect: the 1/1 colourless Hero token `fin-hero-token`, then the Equipment attached; Equipment
grant their job's creature type and Dragoon's Lance its your-turn flying), tiered (`tiered` costs beside `modes`, one cast
option per tier; the cast menu shows "Thundara â€” {3}"), Saga creatures (they were already generic; new are `removeLore`,
`addLore` and Garnet's `removeLoreFromAny` with an optional "choose a Saga" prompt and a Done button, blink `transformed`
for Dion and Crystal Fragments, Bahamut's "exile, then return front face up", Esper Origins entering transformed with a
finality counter), Towns (all 12 common and 3 uncommon Town lands; "basic land or Town" is a card filter, Town counts are a
`permanentsYouControl` filter), and adventure lands (the fetch script writes the `adventure` layout as two records, the land
naming its Adventure as its back face and marked `adventure`; the Adventure is cast from hand like a modal back face, goes
on an adventure in exile as it resolves (`onAdventure`), and the land can then be played from exile with the land drop; the
UI offers "Play <land>" or "Adventure: <name> (cost)" and shows the exiled land beside the hand, as Arena does). All five
adventure lands are implemented. Transforming back faces now have `noManaCost` (they can't be cast from hand).

Two decks: **Heroes' Arsenal** (R/W Equipment and job select: Giott, Zidane, Machinist's Arsenal) and **Eidolons' Call** (G/W
Sagas and Summons: Garnet, Rinoa, Dion, Summon: Titan, Esper Origins). Bot vs bot over 160 games against the ten Foundations
starter decks: Heroes' Arsenal 54%, Eidolons' Call 54%.

Plan:

- Job select, with the Hero token.
- Tiered, with an Arena-style mode-and-cost prompt.
- Saga creatures: chapter abilities on a creature, sacrifice after the last chapter, transform after the last chapter,
  lore-counter removal.
- Town: counts, affinity for Towns, "basic land or Town" searches. Every common and uncommon Town land.
- Adventure lands: the fetch-script layout, casting the Adventure, exile "on an adventure", playing the land from exile,
  and the hover/zone UI (Arena shows the exiled card in a side pile with a "play" highlight).
- Two decks: **R/W Equipment and job select** and **G/W Sagas and Summons** (the two themes that use the most new rules).
- `'fin'` in the `set` union of `decks.ts`.

### 11b: the rest of the decks

Eight more, one per colour pair, from the themes above (W/U artifacts, U/B surveil, B/R noncreature spells, R/G landfall,
W/B sacrifice, U/R big spells, B/G graveyard permanents, G/U Towns). New rules on commons and uncommons go in as they come;
rare-only mechanics wait for 11c. Each deck 45â€“65% against the ten Foundations starter decks.

11b (group A) done: four decks, card behaviour in `fin/artifacts-graveyard.ts` (W/U and U/B gold cards),
`fin/spells-landfall.ts` (B/R and R/G gold cards) and `fin/shared-a.ts` (every mono-coloured and colourless card, plus the
Robot Warrior and Horror tokens). Bot vs bot over 160 games against the ten Foundations starter decks:
**Highwind Workshop** (W/U artifacts and Heroes: Cid, Tidus, Edgar) 48%, **Time Compression** (U/B surveil and
graveyard: Ultimecia, Locke, Jill, Dark Confidant) 52%, **Black Mages' Waltz** (B/R noncreature spells and Wizards:
Black Waltz No. 3, Garland) 51%, **Chocobo Stampede** (R/G landfall and Birds: Gladiolus, Rydia, Sazh Katzroy) 48%.
New rules: a kicker paid with a permanent (`kicker.sacrifice` for Vayne's Treachery, `kicker.returnLand` for Chocobo Kick;
chosen like a sacrifice, the land may tap for mana first; prompts "an artifact or creature to sacrifice" / "a land to return
to your hand"), castSpell triggers from the graveyard (Shambling Cie'th), `returnSource` transformed (Garland),
`putInLibrary` with `shuffle` (Ice Magic), `cardsInGraveyard` by `subtype` / `notTypes` (Cid, Summon: Esper Ramuh), and a
back face that dies triggers its own "dies" abilities (`objectMoved.leftAs`; Chaos). Custom handlers
`sourceToLibraryBottom` and `exileEightFromGraveyard` in `fin-effects.ts`.

11b (group B) done: four decks, built mostly from commons and uncommons. **Turks' Contract** (W/B creatures and artifacts
dying: Judge Magister Gabranth, Rufus Shinra, Squall), **Forbidden Magicks** (U/R expensive noncreature spells: Shantotto,
The Emperor of Palamecia, Tellah), **Into the Void** (B/G permanents in the graveyard: Exdeath, Cloud of Darkness, Diamond
Weapon) and **Road Trip** (G/U lands and Towns: Ignis Scientia, Omega, Gigantoad, Chocobo Kick; The Wandering Minstrel is
implemented but didn't make the list). New rules: "if at least N mana was spent to cast it" (`minManaSpent` on cast
triggers, the `manaSpentOnSubject` amount; the mana spent is kept on the spell's object), "Noncreature" as a spell tag for
restricted mana (the Emperor), "whenever a creature or artifact you control dies" (`permanentYouControlDies`; zone-change
events now carry the controller, so tokens count), activated-ability cost reduction (Qiqirn
Merchant), `lookAndTake` onto the battlefield tapped (Ignis), "lands you control enter untapped" (Minstrel), "prevent all
combat damage dealt to it" (Diamond Weapon) and the Light of Judgment handler `destroyEquipmentOnTarget`. Merged with group A:
where both groups had a card, group A's version stayed (Light of Judgment and Opera Love Song excepted). Card
behaviour in `fin/sacrifice-spellcraft.ts`, `fin/graveyard-towns.ts` and (mono-coloured and colourless) `fin/shared-b.ts`.
Bot vs bot over 160 games against the ten Foundations starter decks: Turks' Contract 54%, Forbidden Magicks 46%, Into the
Void 52%, Road Trip 52%.

### 11c: every rare and mythic, Jump In, boosters

- All 74 rares and 20 mythics (with meld and hideaway), and any remaining commons and uncommons.
- Ten FIN Jump In packets in `jumpin.ts` (our own, like the other sets; `'fin'` in the Packet `set` union).
- FIN boosters in Expedition (with a FIN deck) and Season (with the ten FIN decks as starters).

### 11d: the Starter Kit (Cloud vs Sephiroth)

The two Starter Kit decks with their 12 exclusive cards, as they play on Arena. Exact lists from mtg.wiki (the MediaWiki API)
before starting; shown with the other FIN decks.

## Phase 12: Final Fantasy Commander decks as Brawl (like Marvel Stream A)

On Arena the four FIC decks came as **Arena Store Brawl decks** (7 July 2025, mtg.wiki "Arena Store decks (Final
Fantasy)"), led by the four FIC face commanders. So "four Brawl decks led by FIN legends" and the FIC precons are the same
four decks. Three more FIC Brawl decks followed (9 December 2025, "Arena Store decks (Final Fantasy Commander)").

| Sub-phase | Deck                               | Commander                    | Colours |
| --------- | ---------------------------------- | ---------------------------- | ------- |
| 12a       | Revival Trance                     | Terra, Herald of Hope        | R/W/B   |
| 12b       | Limit Break                        | Cloud, Ex-SOLDIER            | R/G/W   |
| 12c       | Counter Blitz                      | Tidus, Yuna's Guardian       | G/W/U   |
| 12d       | Scions & Spellcraft                | Y'shtola, Night's Blessed    | W/U/B   |
| 12e       | Brawl Aerith, Last Ancient         | Aerith, Last Ancient         | G/W     |
| 12f       | Brawl Emet-Selch of the Third Seat | Emet-Selch of the Third Seat | U/B     |
| 12g       | Brawl Locke, Treasure Hunter       | Locke, Treasure Hunter       | B/R     |

- Lists: Arena is the reference, so the Arena Store lists from mtg.wiki come first. The Arena versions swap cards that are
  not on Arena (Cloud's list has Sword of Forge and Frontier, for example). Check them against the paper lists on
  mtg.wtf (`/deck/fic/revival-trance-final-fantasy-vi`, `limit-break-final-fantasy-vii`, `counter-blitz-final-fantasy-x`,
  `scions-spellcraft-final-fantasy-xiv`) and note the differences.
- `series: 'brawl'`, `set: 'fic'`. Behaviour in `packages/cards/src/fic/`; reuse the MSC staples (Sol Ring, Arcane Signet,
  Command Tower and the rest are in `packages/cards/src/msc/staples.ts`).
- Stream A's Brawl rules apply unchanged.
- 12eâ€“12g are optional, after the four precons.

## Simplifications to revisit

### Phase 11

11a:

- Job select: the creature types an Equipment grants ("is a Knight") show in the creature's characteristics, but most "Knight
  you control" checks read printed types (Dion's flying for Knights doesn't see a job-select Knight).
- Tiered and modal bots: the heuristic bot picks among the tiers like any other cast option.
- Garnet: a Saga gives up at most one lore counter per turn to Garnet (marked by turn, so a second Garnet or Clash of the
  Eikons in the same turn can't take another from it).
- Summon: Fenrir II marks the next creature spell you cast this turn; Ecliptic Growl compares the greatest power on each side.
- Town Greeter doesn't give the 2 life for a Town. Prishe's Wanderings and Weapons Vendor choose their "when you do" targets
  as they are cast or put on the stack.
- Zidane's "whenever an opponent gains control of a permanent from you, create a Treasure" isn't modelled.
- Capital City's "{1}, {T}: Add one mana of any color" is an activated ability using the stack (not a mana ability), so
  payments don't use it automatically. Eden targets the returned card before milling.
- Item Shopkeep's menace target must be your attacking equipped creature.
- Adventure lands: an Adventure that fizzles or is countered goes to the graveyard (as the rules say); the exiled land
  shows only while it can be played (beside the hand, like the other castable cards from other zones).

11b (group A):

- Ultimecia exiles the eight oldest cards of your graveyard (no choice); the extra turn is part of the transform trigger.
- Rydia's "Summon — {X}, {T}" is one ability per X from 1 to 6.
- Delivery Moogle searches the library only (not the graveyard). Qutrub Forayer doesn't check "from a single graveyard".
- Ride the Shoopuf can't become a 7/7.
- Edgar's coin-flip ability isn't modelled.
- A land returned for Chocobo Kick's kicker can tap for mana first; a sacrificed permanent for Vayne's Treachery can't.

11b (group B):

- Mana spent: convoking creatures don't count; Shantotto's draw and Tellah's four- and eight-mana parts are separate
  triggers with `minManaSpent` (same result).
- The Wandering Minstrel untaps only lands that enter tapped by their own text (taplands, Towns); a land put onto the
  battlefield tapped by an effect stays tapped.
- Zack Fair moves one +1/+1 counter (the one he enters with); other counters and his Equipment stay behind.
- Phoenix Down's "choose one" is two abilities with the same cost. Phantom Train becomes an artifact creature, not also a
  Spirit. PuPu UFO's {3} gives +X/+0 on its printed 0 instead of setting its base power.
- Ether's copy keeps the spell's targets. Opera Love Song's "until your next end step" lasts until the end of your next
  turn. Light of Judgment: the engine picks the Equipment it destroys. Sorceress's Schemes returns only instants and
  sorceries from the graveyard (not exiled flashback cards). Stuck in Summoner's Sanctum doesn't stop activated abilities.
- Not done (not in a deck, for 11c): Syncopate (X counter), Jenova (Mutants), Vanille and Fang (meld), Quina, Sidequest:
  Hunt the Mark, Starting Town.

Both groups:

- Ice Magic's Blizzara puts the creature on top (not the owner's choice of top or bottom). Reach the Horizon doesn't check
  "different names".

### Phase 12

(none yet)
