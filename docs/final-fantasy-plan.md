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

| Sub-phase | Deck | Commander | Colours |
|---|---|---|---|
| 12a | Revival Trance (done) | Terra, Herald of Hope | R/W/B |
| 12b | Limit Break (done) | Cloud, Ex-SOLDIER | R/G/W |
| 12c | Counter Blitz (done) | Tidus, Yuna's Guardian | G/W/U |
| 12d | Scions & Spellcraft (done) | Y'shtola, Night's Blessed | W/U/B |
| 12e | Brawl Aerith, Last Ancient (done) | Aerith, Last Ancient | G/W |
| 12f | Brawl Emet-Selch of the Third Seat (done) | Emet-Selch of the Third Seat | U/B |
| 12g | Brawl Locke, Treasure Hunter (done) | Locke, Treasure Hunter | B/R |

- Lists: Arena is the reference, so the Arena Store lists from mtg.wiki come first. The Arena versions swap cards that are
  not on Arena (Cloud's list has Sword of Forge and Frontier, for example). Check them against the paper lists on
  mtg.wtf (`/deck/fic/revival-trance-final-fantasy-vi`, `limit-break-final-fantasy-vii`, `counter-blitz-final-fantasy-x`,
  `scions-spellcraft-final-fantasy-xiv`) and note the differences.
- `series: 'brawl'`, `set: 'fic'`. Behaviour in `packages/cards/src/fic/`; reuse the MSC staples (Sol Ring, Arcane Signet,
  Command Tower and the rest are in `packages/cards/src/msc/staples.ts`).
- Stream A's Brawl rules apply unchanged.
- 12eâ€“12g are optional, after the four precons.

### Progress

- **12a Done:** Revival Trance (Terra). New: tiered, "creature or artifact you control dies", "cards leave your
  graveyard", "creatures enter from a graveyard", back-face death triggers (Galian Beast, Chaos), "becomes untapped",
  Pathways, the shared FIC lands of all seven decks, Saga creatures (Summons) on the generic Saga rules. Brawl arena
  (10 games a pairing): 29–21 (58%) against the four Marvel decks and Mabel's Militia, 35–65% against each.
  Measured again with 20 games a pairing against all other Brawl decks (both seats): 63%.
- **12b Done:** Limit Break (Cloud). New: job select (minimal, `jobSelect` custom effect and the colourless 1/1
  `hero-1-1-token`), "equip abilities cost less" (`equipCostsLess`, Firion's copies' own discount), "an additional
  land this turn", first-combat checks (`laterCombat`), forced blocks (Fighter Class), Equipment with base P/T =
  life and legendary-only keywords, improvise for nonartifact spells, spree (as modes with costs), Buster Sword's
  "that damage" free cast. Fixes: Equipment "whenever equipped creature attacks" triggered twice; free casts didn't
  check ward. Win rate over 20 games a pairing: 38% (15–60% per opponent).
- **12c Done:** Counter Blitz (Tidus). New: proliferate (engine-picked: your counters and the opponents' stun
  counters), Hardened Scales (`oneMoreCounter`, before doubling), "enters with additional counters" for the next
  creature spell (`bonusCounters`), saddle, hideaway, lore counters added or removed by spells (Clash of the
  Eikons, Garnet), Esper Origins returning transformed after its flashback, "counter unless they pay" with a cost
  counted on resolution (Syncopate, Swallowed by Leviathan), Altered Ego copying any creature, Ranger Class's
  top-of-library casting at level 3, "first time counters were put on it this turn". Win rate over 20 games a
  pairing: 56% (30–75% per opponent).
- **12d Done:** Scions & Spellcraft (Y'shtola). New: **Adventures** (built minimally here; 11a builds them too):
  `fetch-scryfall.ts` fetches the `adventure` layout as two faces (the Adventure is the back face, cast from hand
  like a modal double-faced card's), the resolved Adventure goes to exile `onAdventure`, and its owner may cast the
  creature (or play the land) from there; the web UI labels it "On an adventure". Also delve (the engine exiles the
  oldest cards), casting from the graveyard on your turn (Hades) and artifacts for 3 life with a finality counter
  (Noctis), Authority of the Consuls, "whenever you scry or surveil", life lost in total this turn. Fix: a
  transform card's back face (no mana cost) could be cast from hand for free. The Brawl fuzz test now plays each
  pairing once (it had grown past its time limit). Win rate over 20 games a pairing: 51% (30–60% per opponent).
- **12e Done:** Brawl Aerith, Last Ancient. New: life gained in total this turn, doubled life gain (The Wind
  Crystal), Quina's extra Frog token, Excalibur II's charge counters counted from the Equipment, "first legendary
  creature spell each turn costs less" (Serah Farron), Sidequests that transform. Win rate over 20 games a pairing:
  67% (55–90% per opponent), a little over the 65% aim with Arena's list unchanged.
- **12f Done:** Brawl Emet-Selch of the Third Seat. New: an Adventure land (Jidoor: Overture, then the land from
  exile), "whenever one or more opponents lose life", spells cast from your graveyard costing less, Demon Wall
  attacking with a counter, Zenos's chosen creature leaving. Win rate over 20 games a pairing: 41% (25–65% per
  opponent).
- **12g Done:** Brawl Locke, Treasure Hunter. New: Mug (each player mills, a land makes a Treasure, a spell among
  them castable this turn), casting the opponent's exiled top card (Reno and Rude, Vaan), ninjutsu as sneak (Yuffie),
  Sephiroth's fourth death of a turn with its emblem. Win rate over 20 games a pairing: 53% (35–70% per opponent).
- **Merged with phase 11** (11a, 11b): phase 11's version of each FIN mechanic won: job select (11a's `jobSelect`
  effect and `fin-hero-token`), tiered (`tiered` costs; Requisition Raid's spree now uses them), Adventures (11a's
  fetch layout and `onAdventure`; a creature on an adventure is cast from exile through it too), Saga transforms
  (`blink` with `transformed`), the back-face free-cast fix (`noManaCost`), a back face's own "dies" triggers
  (`objectMoved.leftAs`), "creature or artifact you control dies" (`permanentYouControlDies`, `other` instead of
  12's `self`), Esper Origins, Garnet and the lore-counter spells. 129 FIN cards phase 11 already had kept phase 11's
  version; Zack Fair kept 12's (it moves his counters and Equipment); the other 91 FIN cards (mostly rares) moved to
  `fin/from-brawl.ts`. The FIN tokens (Hero, Knight, Darkstar, Angelo, Horror, Robot Warrior, Wizard, Bird) are
  phase 11's. Brawl win rates after the merge (20 games a pairing): Revival Trance 58%,
  Limit Break 30%, Counter Blitz 50%, Scions & Spellcraft 46%, Brawl Aerith 65%, Brawl Emet-Selch 49%, Brawl Locke 52%.
  Limit Break measures the same on the fin-brawl branch itself with the one-deck check (26% both), so the merge didn't
  cause the drop from the 48% noted below; it needs retuning.
- **Merged with 11c:** the 58 rares phase 12 had built for its decks keep 11c's versions (`fin/rares-1.ts`,
  `fin/rares-2.ts`); `fin/from-brawl.ts` keeps the 33 FIN cards 11c doesn't have. Engine: 11c's versions of the
  shared rules won (opponents losing life, cards leaving a graveyard, scry/surveil and chosen-creature triggers, the
  first combat phase, life gained this turn, Hades and Noctis, base P/T from an amount, "with mana value up to that
  damage", hideaway, The Wind Crystal); phase 12 keeps its own (creatures entering from a graveyard, becoming
  untapped, equip cost reductions, legendary-only keywords, Hardened Scales, delve, forced blocks, extra land plays).
  The AI now values an Equipment at a little more than a card while you have a creature to carry it
  (`packages/ai/src/evaluate.ts`), which fixed Limit Break (the bot never cast or equipped its Equipment). Win rates
  after this merge and that change: the ten FIN decks (160 games each against the Foundations starter decks) Heroes' Arsenal
  53%, Eidolons' Call 53%, Highwind Workshop 47%, Time Compression 53%, Black Mages' Waltz 53%, Chocobo Stampede 48%,
  Turks' Contract 53%, Forbidden Magicks 45%, Into the Void 52%, Road Trip 51%; Brawl (20 games a pairing) Revival
  Trance 56%, Limit Break 40%, Counter Blitz 49%, Scions & Spellcraft 39%, Brawl Aerith 64%, Brawl Emet-Selch 46%,
  Brawl Locke 50%, Avengers Assemble 58%, Wakanda Forever 42%, The Fantastic Four 32% (low on `main` too), Doom
  Prevails 60%, Mabel's Militia 64%.
- **Final win rates** (all 12 Brawl decks, 12 games a pairing in both seats, after every fix above): Revival
  Trance 55%, Limit Break 48%, Counter Blitz 51%, Scions & Spellcraft 51%, Brawl Aerith 64%, Brawl Emet-Selch 41%,
  Brawl Locke 53%.

### Lists: Arena against paper

The four mtg.wiki lists (and the three of 12e–12g) each add up to 100 (commander included), so they went in as
they are (`FINAL_FANTASY_BRAWL_DECKS` in `decks.ts`, generated from the wiki text). The Arena Store decks are not the
paper precons with a few swaps: they are "Foundation" tier decks rebuilt around the same commander, mostly from FIN
booster cards. Against the mtg.wtf paper lists, about half of each deck differs:

- **Revival Trance** (Terra): 48 cards differ. Arena drops the FF VI cast (Celes stays; Cyan, Gau, Sabin, Setzer,
  Kefka, Locke, the Esper summons), Sol Ring, the Talismans and the commander lands; it adds FIN legends (Ardyn,
  Squall, Rufus Shinra, Gabranth, Vincent, Kain, Garland, Joshua, Fang), six Summons, Fire Magic, Ultima, Swords to
  Plowshares, Path to Exile, Village Rites, Pathways, slow lands and Towns.
- **Limit Break** (Cloud): 55 differ. Arena keeps the Equipment theme with FIN Equipment (Buster Sword, Genji Glove,
  Ultima Weapon, the job-select weapons), Sword of Forge and Frontier, Lost Jitte, Fighter Class; it drops the FF VII
  cast, Skullclamp, Sol Ring and Lightning Greaves.
- **Counter Blitz** (Tidus): 48 differ. Arena drops the FF X cast and Walking Ballista; it adds the FIN Summons
  (Bahamut, Shiva, Leviathan, Titan, Fenrir, Choco/Mog, Fat Chocobo), Garnet, Rosa, Dion, Jill, Sword of Body and
  Mind and Ranger Class.
- **Scions & Spellcraft** (Y'shtola): 47 differ. Arena drops the FF XIV Scions and the Talismans; it adds the tiered
  spells (Ice Magic, Restoration Magic), Emet-Selch, Ultimecia, Xande, Locke Cole and The Lunar Whale.

Arena-only Alchemy cards appear (Arms Scavenger, Captivating Crossroads, Forsaken Crossroads): `fetch-scryfall.ts`
now allows the digital sets `ymid` and `ywoe`, and `pool.ts` lists the other sets the Arena lists borrow from
(Pathways, slow lands, Verges, fetch and shock lands), after every earlier set so no card changes printing.

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

11c (group 1):

- Ultima ("end the turn"): spells on the stack are exiled and abilities removed; the turn continues from an end step
  without beginning-of-end-step triggers (abilities that triggered during Ultima still go on the stack there), then cleanup.
- Gogo's copies keep the original's targets; X = 0 is offered and copies nothing. Louisoix's Sacrifice and Gogo target
  stack abilities (`abilities` / `abilitiesOnly` on a 'spell' target).
- Memories Returning: the opponent's two "put one on the bottom" picks are made by the engine (highest mana value); your
  picks may be declined (then the count of cards shifts).
- The Darkness Crystal: the exiled creature card to return is chosen as the ability resolves (not targeted).
- Zenos yae Galvus chooses the creature as a target (hexproof and ward apply). Shinryu's "when the chosen player loses
  the game, you win the game" does nothing with two players.
- Ardyn's Demon token keeps the card's colours and creature types and adds Demon (it is a 5/5).
- Stiltzkin: the given permanent untaps (as `giveControl` does). Kain likewise untaps as he changes control.
- Summon: Primal Odin's Zantetsuken is a combat-damage trigger that works while it has two or more lore counters.
- Sephiroth, One-Winged Angel: "sacrifice any number" is asked one creature at a time.
- Cecil, Dark Knight: one trigger per damage event (combat damage to a creature and a player triggers twice).
- The Masamune's "must be blocked if able": if no blocker is declared for it, the engine assigns one that can block it.
- Ultima, Origin of Oblivion's extra {C} only applies to lands that tap for {C} alone.
- Astrologian's Planisphere and Ninja's Blades keep the equipped creature's granted triggers on the Equipment.
- Ninja's Blades reads the discarded card as the last card put into your graveyard this turn.
- Fixed on the way: "whenever equipped creature attacks" triggered twice (two code paths) and ignored its intervening
  "if"; now once, with the condition checked.

11c (group 2) (red, green, multicoloured and land rares and mythics, meld; `fin/rares-2.ts`):

- Meld: Vanille's object becomes Ragnarok (its back face, `front` = Vanille) and remembers Fang (`meldedWith`), which waits in
  exile and follows Ragnarok to whatever zone it goes to. Ragnarok's mana value is Vanille's alone.
- Hideaway: the exiled card is face down only in name (exile is visible to both players). A hidden land is put onto the
  battlefield (not played); a hidden spell is cast with the usual "cast for free" prompt.
- Engine picks (no prompt): Gilgamesh puts every Equipment found onto the battlefield and attaches the costliest to
  Gilgamesh (or another Samurai) after the job select triggers; Kefka's discards are each player's lowest mana value card;
  Phoenix III picks the subset with the greatest total mana value; Choco takes the costliest nonland card and puts every land
  onto the battlefield; Sin's card is random (as printed).
- Vaan: a nonland card he exiles stays castable by you while exiled (paying its cost, not "now or never"); only a land makes the
  Treasure.
- Joshua's "discard up to two, then draw that many" is two "you may discard a card; if you do, draw" in a row.
- Vivi's {0} mana ability uses the stack (like Capital City's). Starting Town's "{T}, Pay 1 life" is 1 damage as the mana is
  spent (like a Talisman). Its "first, second, or third turn" is turn 6 or earlier on your turn (extra turns aside).
- Summon: Brynhildr II/III's haste lasts as long as the creature stays (not until end of turn). G.F. Cerberus's copies keep the
  original's targets.
- Triple Triad's free plays end as the end step begins. Absolute Virtue's protection is hexproof plus prevention of damage from
  opponents' sources (Auras can still enchant you).
- The Earth Crystal and The Fire Crystal reduce generic mana only (as all cost reductions here).
- A Realm Reborn's granted ability is used only when paying costs (it isn't listed as an ability of each permanent).
- Fixed in passing: `all` / `any` / `not` conditions now pass the trigger's subject to the conditions inside them.

### Phase 12

Engine additions are in blocks marked `Final Fantasy Commander (12)` (`types.ts`, `triggers.ts`, `context.ts`,
`characteristics.ts`, `spells.ts`, `engine.ts`); one-offs are custom effects and conditions in
`packages/engine/src/fic-effects.ts`. FIN booster cards the decks use live in `packages/cards/src/fin/` since the
merge with phase 11 (below).

- **Pathways:** Arena asks which face to play; here the face is chosen as the land enters (a `choose` prompt), and it
  taps for that colour only. Back faces are cards of their own with no rules.
- **Shock lands:** enter tapped with a "may pay 2 life: untap it" as they enter. **Forsaken Crossroads:** always scries (never "untap instead").
- **Celes** counts creatures entering from a graveyard, not ones cast from it, and the engine picks her rummaging
  discards (spare lands, uncastable cards).
- **Blitzball:** "dealt combat damage by a legendary creature" is read as "a legendary creature of yours attacked and
  the opponent lost life this turn".
- **Combustible Gearhulk:** the opponent's choice is a `choose` prompt for them.
- **12b:** Arms Scavenger's spellbook (Alchemy) is the Equipment of our pool, one at random, playable that turn.
  Sword of Forge and Frontier has no protection. Lost Jitte only charges on combat damage to a player. Zack Fair
  moves an unattached Equipment, not "the one on Zack". Beatrix: the engine picks what to attach. Requisition Raid's
  counters go on your creatures.
- **12c:** Proliferate never adds to an opponent's +1/+1 counters nor to players. Incubation Druid makes two mana
  with a counter, not three, of any colour. Forgotten Ancient never moves its counters. Endless Detour only targets nonland permanents
  (put on top). Syncopate puts the countered spell in the graveyard. Sleep Magic isn't sacrificed when the creature
  is dealt damage. The Squid tokens'
  islandwalk and Sword of Body and Mind's protection aren't built.
- **12d:** Sublime Epiphany only counters spells. Magecraft ignores copies. Dig Through Time's two cards are the
  engine's picks. Quistis Trepe's card can be cast for the rest of the turn. Xande counts artifact creature cards too.
- **12e:** Tataru Taru's opponent always draws. Catch a Fish always takes the card. Quina's Frog comes with tokens made by token effects, not with Hero
  tokens from job select.
- **12f:** Emet-Selch's graveyard spell can be cast for the rest of the turn (from exile, still counted as from the
  graveyard) and isn't exiled afterwards.
- **12g:** Mug's and the stolen cards are castable with any mana (Mug's for the turn, stolen ones while exiled).
  Ninjutsu is sneak (the card is cast). Sidequest: Play Blitzball checks at your end step for 6 or more life lost by the
  opponent, and attaches to your most powerful creature.
