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
  - `pnpm arena` runs without errors, with each new deck at 45–65% against the ten Foundations starter decks
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
- 12 more cards only in the Starter Kit (`starterdeck` promo type, numbers 426–563: Cloud, Planet's Champion; Sephiroth,
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

| Mechanic | Cards | What it needs |
|---|---|---|
| **Job select** | 16 Equipment (25 Equipment in all) | ETB trigger: create a 1/1 colourless Hero creature token, then attach this to it. Hero tokens also come from two other cards (18 Hero-token texts in all). Equip, attach and Hero as a creature type exist; the trigger and the token kind are new. |
| **Tiered** | 6 instants (Restoration Magic, Ice Magic, Thunder Magic, Fire Magic, Vincent's Limit Break, Tifa's Limit Break) | "Choose one additional cost": each mode has its own extra mana cost ({0} for the first). Like `modes`, but the mode is picked before paying and adds its cost; close to Seasons' per-mode `paws`. Prompt: Arena shows the modes with their costs. Vincent's Limit Break picks a base P/T, not an effect. |
| **Saga creatures** ("Summon: X") | 23 (15 saga layout, 8 as transform backs, e.g. Esper Origins' Summon: Esper Maduin) | Our Sagas are generic (`saga: N`, lore counters at entry and precombat main, sacrificed after the last chapter). Check that a creature Saga gets summoning sickness, combat and chapter triggers, and is sacrificed after the last chapter even when it's a creature. New: removing lore counters (Garnet), "return target Saga card" (Rydia), and Sagas that transform at the end (Summon: Alexander, Bahamut). |
| **Town** (land subtype) | 23 Town lands (12 common, 3 uncommon, 8 rare) and about 10 cards that count or fetch Towns | Subtypes come from the type line already; new are the counts ("for each Town you control"), "Affinity for Towns" (affinity exists, for artifacts) and "search for a basic land or Town card". |
| **Adventure lands** | 5 rare Towns (Ishgard, Jidoor, Lindblum, Midgar, Zanarkand) | A land with an Adventure (a sorcery or instant). Cast the Adventure from hand; it resolves into exile; you may later play the land from exile (using your land drop). Adventures don't exist in the engine yet: new casting option, an "on an adventure" exile zone flag, playing a land from exile, a fetch-script layout. |
| **Meld** | 1 pair (Vanille + Fang into Ragnarok, Divine Deliverance) | New, but one pair: do it as a `custom` exile-and-create of the melded card in 11c, plus the fetch layout. |
| **Hideaway** | 1 (Clive's Hideaway) | Hideaway 4: exile one of the top four face down; play it free later under a condition. One card, so `custom` unless other sets need it. |
| **Finality counters** | Esper Origins | Exists (context, stack, spells). Esper Origins also puts a sorcery onto the battlefield transformed: new, `custom`. |
| **Stun counters** | 6 | Exist: the untap replacement is in `context.ts`. Check "put X stun counters" (Omega) as an effect. |
| **Named ability labels** | about 45 ("Stagger —", "Protect —", "Summon —", "Limit Break" names, etc.) | Labels with no rules (Scryfall lists some as keywords). Nothing to build. |

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

| Pair | Theme | Signposts |
|---|---|---|
| W/U | artifacts and Heroes | Cid, Timeless Artificer; Tidus, Blitzball Star |
| U/B | surveil and big graveyard turns | Ultimecia, Time Sorceress; Locke Cole |
| B/R | noncreature spells | Black Waltz No. 3; Garland, Knight of Cornelia |
| R/G | landfall | Gladiolus Amicitia; Rydia, Summoner of Mist |
| G/W | Sagas and Summons | Garnet, Princess of Alexandria; Rinoa Heartilly |
| W/B | creatures and artifacts dying | Judge Magister Gabranth; Rufus Shinra |
| U/R | expensive noncreature spells | Shantotto, Tactician Magician; The Emperor of Palamecia |
| B/G | permanents in the graveyard | Exdeath, Void Warlock; Cloud of Darkness |
| R/W | Equipment and job select | Giott, King of the Dwarves; Zidane, Tantalus Thief |
| G/U | lands and Towns | Ignis Scientia; Omega, Heartless Evolution |

## Phase 11: FIN main set (like Bloomburrow and MSH Stream B)

Our own two-colour 60-card decks (36 spells, 24 lands), shown in their own deck section, with `set: 'fin'`. They play
against the Foundations, Bloomburrow and MSH decks. Card behaviour in `packages/cards/src/fin/`, one file per pair of decks
plus `others.ts`, `rares.ts`, `mythics.ts`, `sagas.ts`, `lands.ts`, merged in `final-fantasy.ts`. Tests in
`packages/cards/test/fin-*.test.ts`.

### 11a: the set mechanics and the first two decks

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
rare-only mechanics wait for 11c. Each deck 45–65% against the ten Foundations starter decks.

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
| 12a | Revival Trance | Terra, Herald of Hope | R/W/B |
| 12b | Limit Break | Cloud, Ex-SOLDIER | R/G/W |
| 12c | Counter Blitz | Tidus, Yuna's Guardian | G/W/U |
| 12d | Scions & Spellcraft | Y'shtola, Night's Blessed | W/U/B |
| 12e | Brawl Aerith, Last Ancient | Aerith, Last Ancient | G/W |
| 12f | Brawl Emet-Selch of the Third Seat | Emet-Selch of the Third Seat | U/B |
| 12g | Brawl Locke, Treasure Hunter | Locke, Treasure Hunter | B/R |

- Lists: Arena is the reference, so the Arena Store lists from mtg.wiki come first. The Arena versions swap cards that are
  not on Arena (Cloud's list has Sword of Forge and Frontier, for example). Check them against the paper lists on
  mtg.wtf (`/deck/fic/revival-trance-final-fantasy-vi`, `limit-break-final-fantasy-vii`, `counter-blitz-final-fantasy-x`,
  `scions-spellcraft-final-fantasy-xiv`) and note the differences.
- `series: 'brawl'`, `set: 'fic'`. Behaviour in `packages/cards/src/fic/`; reuse the MSC staples (Sol Ring, Arcane Signet,
  Command Tower and the rest are in `packages/cards/src/msc/staples.ts`).
- Stream A's Brawl rules apply unchanged.
- 12e–12g are optional, after the four precons.

## Simplifications to revisit

### Phase 11

(none yet)

### Phase 12

(none yet)
