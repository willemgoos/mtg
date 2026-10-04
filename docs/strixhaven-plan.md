# Plan: Strixhaven, complete (STX, SOS, Mystical Archive, Brawl precons)

Target: everything Arena has for the Strixhaven plane, in the same form as Bloomburrow, Marvel and Final Fantasy:

- **Phase 13, Strixhaven: School of Mages (STX, 2021):** our own two-colour 60-card decks, every rare and mythic, Jump In
  packets, boosters.
- **Phase 14, Secrets of Strixhaven (SOS, released 24 April 2026):** the same again.
- **Phase 15, Brawl decks:** the eight Arena Store Brawl decks (three from the 2021 set's commanders, five from Secrets of
  Strixhaven Commander, SOC), played as **Brawl**, as Marvel Stream A and FIN phase 12 did.
- **Phase 16, Mystical Archive (STA and SOA):** the bonus cards in boosters.

One branch, `strixhaven`, one sub-phase at a time, each committed when its done criteria hold. Read `docs/final-fantasy-plan.md`
first: this plan reuses its structure, rules and wiring, and doesn't repeat them.

## Why Strixhaven (and what it gives for planeswalkers)

Planeswalkers in the sets (checked against Scryfall, 3 October 2026):

| Set | Walkers                                                                                          |
| --- | ------------------------------------------------------------------------------------------------ |
| STX | Kasmina, Enigma Sage; Professor Onyx; Mila, Crafty Companion // Lukka, Wayward Bonder; Rowan, Scholar of Sparks // Will, Scholar of Frost |
| SOS | Professor Dellian Fel; Ral Zarek, Guest Lecturer                                                 |
| SOC | **Quintorius, History Chaser** (R/W, can be a commander): the reason for this plan              |

That is eight walkers. Not many, but Quintorius leads a Brawl deck. For many more walkers, War of the Spark is the better
set (see the earlier discussion); this plan doesn't depend on it.

## Rules

Same as the FIN plan: done criteria, engine vocabulary in its own commented block (`// Strixhaven (13a): magecraft`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, simplifications
recorded at the bottom. Arena is the reference (`CLAUDE.md`): decklists come from mtg.wiki through the MediaWiki API, and main-set decks are
our own. Rules text always comes from the Scryfall oracle text, never from memory.

**Design notes per mechanic** (rules, rulings, engine mapping, sizes): `docs/strixhaven-mechanics.md`. Read it before
13a and 14a. Sizes: magecraft, opus, repartee, infusion, increment, MDFC and a planeswalker commander are small; converge,
paradigm and Learn are medium; prepare is large. Magecraft needs a new `spellCopied` event (`copySpell` emits none);
converge needs the colours of mana spent recorded (only the count is kept); Learn needs `Decklist.sideboard` through to
`PlayerState.sideboard`.

## The sets (Scryfall, 3 October 2026)

| Set | Cards | Common / uncommon / rare / mythic | Layouts                | Notes                                                    |
| --- | ----- | --------------------------------- | ---------------------- | -------------------------------------------------------- |
| STX | 280 booster cards | 110 / 80 / 69 / 21         | 264 normal, 16 modal DFC | Plus basics. 5 Lessons-themed cycles, the Elder Dragon legends. |
| SOS | 271 cards (Scryfall's `booster` flag is false for the whole set; booster membership comes from collector numbers) | 91 / 100 / 60 / 20 | 235 normal, **36 `prepare`** | Plus 5 Lessons. |
| SOC | 375 cards (about 47 commander-eligible legends), 5 decks of 100 | n/a | | 12 new cards per deck, 88 reprints. |
| STA | the Mystical Archive (about 63 cards; Scryfall lists 126 with Japanese alternate-art versions) | | | Instants and sorceries only. |
| SOA | the second Mystical Archive (about 63; Scryfall lists 195) | | | Same. |

Out of scope: **Alchemy: Strixhaven** and **Alchemy: Secrets of Strixhaven** (digital-only cards that need rebalancing and
Alchemy rules; Arena sells two Brawl decks for them, Anina and Soovril, which we skip), the 2021 paper Commander
decks (Arena doesn't sell them; its Store decks are the reference), Art Series, promos, Minigames, tokens-only sets.

## Mechanic inventory

Counts are from Scryfall keywords and layouts. "Engine" is a grep of `packages/engine/src` and `packages/cards/src`
(3 October 2026); read the oracle text before building anything, since keyword lists miss ability words.

### STX

| Mechanic                  | Cards | Engine today | What it needs |
| ------------------------- | ----- | ------------ | ------------- |
| **Magecraft**             | 24    | none         | "Whenever you cast or copy an instant or sorcery spell": a trigger on cast and on copy. `copySpell` exists for Ether-style copies; copies must emit an event. |
| **Learn / Lessons**       | 21    | none (no sideboard) | "You may reveal a Lesson card you own from outside the game and put it into your hand. If you don't, you may discard a card; if you do, draw a card." Needs a **sideboard** (the Lessons) on the deck, a Lesson subtype, and a prompt. Arena lets a deck carry a sideboard for this. |
| **Modal double-faced**    | 16    | **exists** (from Marvel: `back`, `castSpell.back`, `withBackFace`) | Check the walker MDFCs (Mila // Lukka, Rowan // Will) and the spell // land ones against it. |
| Ward, Treasure, Scry, Fight, Mill, Menace, Double strike, Surveil | many | all exist | Check the individual cards. |
| Elder Dragons (cycle), Teachings, Pledge of Unity, Strixhaven "campus" lands | few | custom | One-off handlers. |

### SOS

| Mechanic                  | Cards | Engine today | What it needs |
| ------------------------- | ----- | ------------ | ------------- |
| **Prepare / Prepared**    | 36 (own layout) and 38 with the keyword | none | New card layout: the fetch script must handle `prepare` (one record, two faces, like `adventure`); the rules come from oracle text. Biggest single unknown in the plan; spike it first (14a). |
| **Repartee**              | 12    | none         | Ability word with a condition on how a spell targets. |
| **Infusion**              | 12    | none         | Ability word: "if you gained life this turn". Needs a per-turn life-gained counter (check; Foundations has lifegain triggers). |
| **Opus**                  | 10    | none         | Ability word on casting an instant or sorcery. Shares its trigger with magecraft. |
| **Increment**             | 9     | none         | Keyword; read oracle text. |
| **Converge**              | 9     | none         | Counts the colours of mana spent; `manaSpentOnSubject` exists from FIN 11b. |
| **Paradigm**              | 5     | none         | Read oracle text. |
| Flashback, Ward, Surveil, Cascade, Crew, Affinity | few | exist | Check the individual cards. |

### Brawl (phase 15)

- Planeswalker as commander: Quintorius, History Chaser. The Brawl rules in `docs/marvel-plan.md` say "legendary creature"; Arena also allows
  legendary planeswalkers. No engine code blocks it (checked); only a Creature-only assertion in `brawl.test.ts` and that
  rules line need changing, plus a test that casts a walker from the command zone.
- Extus, Oriq Overlord is a legendary creature **with a Sorcery back face** (an MDFC), so the commander is the front face
  and the back face can be cast from the command zone; needs MDFC (13a) first.
- Codie, Vociferous Codex has the colour identity of all five colours (B/G/R/U/W): the deck can hold any card.
- **The lists are mostly staples from the whole of Magic**, not Strixhaven. A name search against `packages/cards/src` shows the
  share still to implement: Killian 68 of 79, Rootha 56 of 76, Zimone 69 of 77, Dina 70 of 82, Quintorius 64 of 76, Codie 71 of
  88, Extus 70 of 86, Galazeth 57 of 78 (distinct, nonland). Across all eight: **516 distinct nonbasic cards, 54 implemented,
  79 in two or more decks** (lists and overlap table in `docs/strixhaven-decklists.md`). About 460 cards to build, the
  largest card-count cost in the plan, bigger than the main sets' new mechanics. `SET_PREFERENCE` in `pool.ts` and the fetch script's set list need the older sets
  the staples come from (Cyclonic Rift, Damn, Casualties of War and the like).

## Wiring (step 0, before 13a)

- `fetch-scryfall.ts`: add the sets `stx`, `sos`, `soc`, `sta`, `soa` and tokens (`tstx`, `tsos`, `tsoc`); handle layouts
  `modal_dfc` (13a) and `prepare` (14a). Then `pnpm cards:fetch`.
- `pool.ts`: `stx`, `sos`, `soc` in `SET_PREFERENCE` after `msc`/`fic`, so reprints keep their earlier printing; pools from new
  `strixhaven.ts` and `secrets-of-strixhaven.ts` (as `final-fantasy.ts`), merged into `BEHAVIORS` in `behaviors.ts`.
- `decks.ts`: `'stx'`, `'sos'`, `'soc'` in the `set` union; `jumpin.ts`: `'stx'`, `'sos'` in the Packet `set` union;
  `PackSet` and `SHEETS` in `apps/web/src/game/expedition.ts` and `season.ts` (13c, 14c).
- Behaviour folders: `packages/cards/src/stx/`, `sos/`, `soc/`.
- Branch `strixhaven`, cut from whichever branch has Final Fantasy merged (the shared files `decks.ts`, `pool.ts`,
  `behaviors.ts` and `expedition.ts` all conflict otherwise).

## Phase 13: Strixhaven: School of Mages

Ten two-colour decks (five college pairs first, then the other five pairs from commons and uncommons), as FIN did.

### 13a: mechanics and the first two decks

- Magecraft, Learn with a deck sideboard, modal double-faced cards, and the sideboard prompt.
- Two college decks: **Lorehold (R/W)** and **Quandrix (G/U)**; Lorehold first, since it is the Quintorius colour pair.

13a done. Engine: `spellCopied` and `castSpell.orCopy` (magecraft), the `learn` effect and the deck sideboard
(`Decklist.sideboard` to `PlayerState.sideboard`), `cardsLeaveYourGraveyard` (Quintorius, Field Historian), `grantAbility`
with `tempAbilities` (Lorehold Apprentice), `mustBlock`, `CostDef.exileFromGraveyard`, token "dies" triggers, and smaller
amounts and conditions. Every deck here runs 24 lands (as the Foundations starters do); the drafts in
`docs/strixhaven-13a-decks.md` had 17 and won 14–25%, so both decks were rebuilt with 24 lands and some Foundations
reprints. **Lorehold Reckoning** 49% and **Quandrix Equation** 52% against the ten starters (40 games per matchup, both
seats). All the drafted cards are implemented even where they didn't make the list. Card behaviour in `stx/lorehold.ts`,
`stx/quandrix.ts`, `stx/lessons*.ts`.

### 13b: the rest of the decks

Group A done (four agents in parallel worktrees, then one merge with dedupes): **Silverquill Inkwell** (W/B, 36/36 STX,
49%), **Prismari Artistry** (U/R, 31/36, 46%), **Witherbloom Bloodroot** (B/G, 35/36, 46%), **Azorius Skies** (W/U, 30/36,
40%: below target, retuned in group B). Engine: `kicker.replacesCost` (alternative costs, Baleful Mastery), `lkiPower` on a
spell, `pump.ignoreDefender`, `nextSpellCostsLess`, `spellsCostLessTargeting` (Killian), `CardFilter.monocolored`.
Group B (Dimir, Rakdos, Gruul, Selesnya, plus the Azorius retune) claims cards in a shared list before implementing, so
parallel agents don't build the same card twice.

- Groups of four (like FIN 11b): **Silverquill (W/B)**, **Prismari (U/R)**, **Witherbloom (B/G)**, then the five off-college
  pairs. Bot win rate 45–65% against the ten Foundations starter decks.

### 13c: every rare and mythic, Jump In, boosters

- All 69 rares and 21 mythics (walkers included, with the MDFC faces), and the remaining commons and uncommons.
- Group A (white, blue, Silverquill, Lorehold; `stx/rares-a.ts`, tests `stx-13c-a.test.ts`) done: 30 of 30 (Rip Apart and
  Furycalm Snarl were already in msc/). Engine: `chooseCustom` (handler-built option prompt, `CHOOSERS` in
  `stx-13c-a-effects.ts`), `castBans` (name bans), `cantAttack`/`noActivate` continuous effects, loyalty-ability lock,
  triggers `opponentActivatesAbility`, `opponentAttacksPlaneswalker`, `permanentTargetedByOpponent`, `cardsExiledYourTurn`,
  emblem `otherCreatureEtb`, `gainControl.permanent`, `instantsSorceriesLifelink`, filters `nonlegendary`/`chosenNameOfSource`,
  planeswalker back-face loyalty in the fetch script. Simplifications: card names are chosen from a searchable list of every
  nonland card (Silencer chooses on entering, not as it enters); Academic Probation's name mode and Secret Rendezvous always
  affect the opponent; Semester's End takes up to three targets; Mercurial Transformation sets base power/toughness and loses
  abilities but not colour or creature type; Hofri's token returns the exiled card at once; Devastating Mastery's opponent
  is asked twice (with "Done"); Augusta's "tap any number" is one prompt per creature and the bot taps none.
- Ten STX Jump In packets in `jumpin.ts`.
- STX boosters in Expedition (with an STX deck) and Season (the ten STX decks as starters).

**Phase 13 done.** All 280 STX booster cards implemented (groups B, C, D in `stx/rares-{b,c,d}.ts`; their simplifications
are listed below). Ten STX Jump In packets (mono-colour, like BLB and MSH). STX boosters in Expedition and Season, sheets
built from `stx/booster-list.ts` (generated by `scripts/fetch-stx-booster-list.ts` from Scryfall `set:stx is:booster`, so
reprints whose preferred printing is another set still count): 105 C / 80 U / 69 R / 21 M, basics left out. The ten STX
decks are Season starters. Selesnya Overgrowth retuned with the 13c rares (36/36 STX). Win rates against the ten Foundations
starters, 20 games per matchup per seat, tallied from `pnpm arena` output: Lorehold 46.5%, Quandrix 46.0%, Silverquill
48.5%, Prismari 45.8%, Witherbloom 45.5%, Azorius 46.0%, Dimir 51.3%, Rakdos 47.3%, Gruul 47.0%, Selesnya 45.8%.

Lessons for phases 14 and 15: decks need 24 lands; agents' self-reported win rates were unreliable, so tally the raw
`pnpm arena` output; parallel agents need disjoint card lists (by colour group) or a claims list, or they build the same
card twice; build booster sheets from the set's own booster list, not from the preferred printing.

## Phase 14: Secrets of Strixhaven

### 14a: spike `prepare`, then mechanics and the first two decks

- Prepare, as designed in `docs/strixhaven-mechanics.md` (spike done: no new zone or rules layer; a `prepared` flag and
  a copy of the prepare spell in exile, cast through the existing cast-from-exile path). Back faces carry real card names
  (Lightning Bolt and others), so their ids need a prefix to avoid colliding with the real cards.
- Repartee, Infusion, Opus (shared with magecraft), Increment, Converge, Paradigm.
- Two college decks, **Silverquill (W/B)** and **Witherbloom (B/G)**, since Dina and Killian lead Brawl decks in phase 15.

### 14b: the rest of the decks (groups of four)

### 14c: every rare and mythic, Jump In, boosters

- 60 rares and 20 mythics (Professor Dellian Fel, Ral Zarek, Guest Lecturer), ten SOS Jump In packets, SOS boosters in
  Expedition and Season.

**Phase 14 done**, in a different order from the plan, to avoid parallel agents building the same card: 14a engine
(prepare and the six other mechanics) and the Silverquill and Witherbloom decks; then **every remaining SOS card at once**
(203 cards in five disjoint colour groups, `sos/cards-{a..e}.ts`), then the other eight decks in parallel touching only
`decks.ts`. All 266 non-basic SOS cards implemented. Ten SOS decks, all 36/36 SOS spells, 24 lands, against the ten
Foundations starters (20 games per matchup per seat, tallied from `pnpm arena` output): Silverquill Debate Club 56.0%
(retuned), Witherbloom Pest Control 51.8%, Prismari Spellslingers 54.5%, Quandrix Fractal Theorem 48.8%, Lorehold Spirit
Archive 58.5%, Azorius Open Skies 55.5%, Night Library Sentinels (U/B) 46.8%, Rakdos Sparks and Ashes 52.3%, Gruul Stampede
58.0%, Selesnya Grove Guardians 62.3%. 14c: ten mono-colour SOS Jump In packets; SOS boosters in Expedition and Season from
`sos/booster-list.ts` (`scripts/fetch-booster-list.ts sos`): 86 C / 100 U / 60 R / 20 M, basics left out, prepare spell
faces never in packs. Bug fixed on the way: a trigger granted until end of turn (Root Manipulation on a Pest, Lorehold
Apprentice) crashed with "No triggered ability", because the engine looked it up on the printed card.

Lesson: when parallel branches each append to the same array, a line-union merge fuses the entries; rebuild the array
from each branch's own entries instead (`decks.ts` was rebuilt this way).

## Phase 15: Brawl decks

The eight Arena Store decks, lists from mtg.wiki ("Arena Store decks (Secrets of Strixhaven)" and "(Strixhaven)") before
starting, since Arena is the reference. The paper SOC lists (Silverquill Influence, Prismari Artistry, Witherbloom Pestilence,
Lorehold Spirit, Quandrix Unlimited, on mtg.wtf `/deck/soc/...`) differ; note the differences, don't build them.

| Sub-phase | Deck                     | Commander                        | Colours |
| --------- | ------------------------ | -------------------------------- | ------- |
| 15a       | Planeswalker commander and the staples (below) | | |
| 15b       | Brawl Quintorius, History Chaser | Quintorius, History Chaser | R/W     |
| 15c       | Brawl Killian, Decisive Mentor | Killian, Decisive Mentor   | W/B     |
| 15d       | Brawl Rootha, Mastering the Moment | Rootha, Mastering the Moment | U/R |
| 15e       | Brawl Zimone, Infinite Analyst | Zimone, Infinite Analyst   | G/U     |
| 15f       | Brawl Dina, Essence Brewer | Dina, Essence Brewer           | B/G     |
| 15g       | Brawl Galazeth Prismari  | Galazeth Prismari                | U/R     |
| 15h       | Brawl Extus, Oriq Overlord | Extus, Oriq Overlord           | B/R/W   |
| 15i       | Brawl Codie, Vociferous Codex | Codie, Vociferous Codex     | five colours |

- 15a: planeswalker commanders, plus the staples shared by several decks (implement a card once, in `packages/cards/src/soc/shared.ts`).
  Do the shared staples as a batch: count which cards occur in two or more of the eight lists and do those first.
- Order: Quintorius first, since he's the goal. The decks need the matching main-set mechanics, so run phase 15 after 13 and
  14 (or at least after 13a and 14a).
- `series: 'brawl'`, `set: 'soc'` (the three 2021 decks `set: 'stx'`). Stream A's Brawl rules apply unchanged.

**15a done: Brawl Quintorius, History Chaser** (`brawl-quintorius-history-chaser`, in `STRIXHAVEN_BRAWL_DECKS`). Its 49
missing cards in `soc/cards-15a-{w,r,rw}.ts`. Planeswalker commanders needed no engine change (only the Brawl test and the
rules line). 24 of 50 games won against the other Brawl decks, no errors; checked in the browser (command zone, 25 life).

**15b done: the seven remaining Brawl decks** (Killian, Rootha, Zimone, Dina, Codie, Extus, Galazeth Prismari, in `STRIXHAVEN_BRAWL_DECKS`, exactly the Arena Store lists in `docs/strixhaven-decklists.md`). Five are `set: 'soc'`, the 2021 three (Codie, Extus, Galazeth) `set: 'stx'` (the pickers filter by series, so Brawl decks never show in the STX sets). Simplifications: "A-" Alchemy names are the paper cards, "Aggro Amalgam" is Voracious Hydra, Extus is listed by its front face, and Rootha has one extra Mountain (wiki list has 99 cards). Arena run (6 games per pairing, heuristic bots, mirrors excluded), games won of played against the other Brawl decks: Quintorius 42/72, Killian 48/72, Rootha 43/72, Zimone 29/72, Dina 32/72, Codie 4/72, Extus 31/72, Galazeth 41/72; no errors. Codie (five colours) is weak for the bot and its games run long. Engine fixes found by the run: a Treasure that taps for two (Goldspan Dragon) crashed payment, a free cast of a discard-or-sacrifice card (Demand Answers via Mizzix's Mastery) offered illegal actions, a copy of Unexpected Results crashed on returning itself to hand; the AI also stalled on a free cast of Magma Opus (tens of thousands of target splits), so it now scores an even sample. The Brawl random-play test plays each pairing once.

**Where 15b stands (paused 3 October 2026):**

- 354 cards still missing for the other seven decks, split into seven disjoint colour groups in `docs/strixhaven-15b/`
  (`brawl-g-{w,b,u,g,r,pair,multi}.txt`, 44–57 cards each; `brawl-missing.json` is the source).
- Done already: every set those cards need is in `SET_PREFERENCE` (one "Strixhaven Brawl (15b)" block, 43 sets), and
  `fetch-scryfall.ts` allows digital printings from the Alchemy sets the lists use (`DIGITAL_SETS_ALLOWED`). Bulk data
  refreshed; no existing card changed printing.
- Arena-only cards: the four "A-" rebalanced cards (A-Maelstrom Muse, A-Iridescent Hornbeetle, A-Ochre Jelly, A-Haywire
  Mite) aren't in Scryfall's bulk data, so use the paper versions (record as a simplification). Aggro Amalgam is in `tmc`
  (needs the refreshed bulk; add `tmc` to SET_PREFERENCE if the fetch can't find it).
- Rootha's list is one card short on the wiki (99): find the missing card before building that deck.
- Next: seven card agents (one per group file, worktrees, as in 14b), one merge, then the seven decks (they touch only
  `decks.ts`; rebuild `STRIXHAVEN_BRAWL_DECKS` from each branch's entries rather than line-union merging).
- Scryfall rate-limited us after heavy API use: agents should read card data from the bulk cache
  (`packages/cards/.cache/default-cards.jsonl.gz`) or `generated/scryfall.json`, not the API.

**15b progress (paused 4 October 2026):** seven card agents ran (one per group, each on its own branch cut from
`strixhaven` at `c6aa291`).

| Group | Branch | State |
| ----- | ------ | ----- |
| b     | merged into `strixhaven` (`430c4bf`) | done: 56 of 57 (Fell already existed), checks pass |
| multi | `strixhaven-15b-multi` (`56cdc93`) | done, checks pass, **not merged** |
| w, u, g, r, pair | `strixhaven-15b-{w,u,g,r,pair}` | **WIP**: agent stopped near the end, one WIP commit each, checks not run |

- Next: on each WIP branch, compare its card file with `brawl-g-<group>.txt`, finish the missing cards, write
  `docs/strixhaven-15b/simplifications-<group>.md` if absent, run `pnpm typecheck && pnpm lint && pnpm test`, commit.
- Merge order: multi, then the five. Expected conflicts (seen merging multi): `build.ts` (`KEYWORDS_AS_ABILITIES`),
  `strixhaven-brawl.ts`, `context.ts`, `types.ts`, `pool.ts` (`SET_PREFERENCE` tail): keep both sides. For
  `generated/scryfall.json`, take either side and re-run `pnpm cards:fetch` after the merge.
- Then fold the `simplifications-*.md` files into the list at the bottom of this plan, and build the seven decks.
- Aggro Amalgam is the Arena flavour name of Voracious Hydra (implemented in multi): list it as Voracious Hydra.
- Rootha's missing 100th card: not found (mtg.wiki still 99; Moxfield and MTGGoldfish only have the paper precon or
  player lists). Plan: one more basic land, recorded as a simplification.

## Phase 16: Mystical Archive

- STA and SOA instants and sorceries as the bonus slot of STX and SOS boosters (one card per pack on Arena; check the
  pack structure). Most are reprints of older cards, so implemented already or in 15a. Also makes the Archive cards
  available as rewards.

## Order and size

13 (STX main), 14 (SOS main), 15 (Brawl), 16 (Mystical Archive) in that order; 15 can start after 13a and 14a if
Quintorius should come sooner. Expect about two Final Fantasy-sized efforts for 13 and 14 together and about one for 15
(the eight lists are mostly staples). If that is too much, the cuts, in order: 16, the off-college decks in 13b/14b, 14 as a
whole (SOS's `prepare` is the riskiest). The shortest path to Quintorius is 0, 13a, 14a, 15a, 15b.

## Simplifications to revisit

13a:

- Learn: Season and Expedition decks carry no sideboard, so Learn only rummages there. The Lesson isn't revealed to the
  opponent. The bot always takes a Lesson when it can.
- Graveyard exile costs (Stonerise Spirit, Tome Shredder) pick the least useful card, without a prompt.
- A creature that must block blocks the first attacker it can. Venerable Warsinger's X is its power.
- Lorehold Apprentice's granted Spirit ability doesn't show in the card text.
- Quandrix Apprentice puts the rest on the bottom in random order. Quandrix Command is six "choose one" modes (one per
  pair); its shuffle mode targets only your own graveyard. Divide by Zero is two modes (spell or permanent). Frost
  Trickster uses a stun counter.

13b (group A):

- Shadrix Silverquill offers two fixed pairs of modes. Mage Hunters' Onslaught has no "blocks: lose 1 life" clause. Blot
  Out the Sky has no X≥6 sweep. Exhilarating Elocution's team pump includes the target. The sacrifice modes of Umbral
  Juke and Silverquill Command don't target. Master Symmetrist has no trample trigger.
- Magma Opus deals 4 to one target or 2 and 2. Prismari Command's loot and Treasure modes are for you. Elemental
  Expressionist makes its Elemental when the creature dies, not when exiled. Galazeth Prismari only makes a Treasure.
  Retriever Phoenix always learns on entering.
- Symmetry Sage sets total power to 2. Dream Strix triggers only on opponents targeting it. Detention Vortex has no
  "{3}: destroy" and doesn't stop activated abilities. Teachings of the Archaics never draws three.

13c (group B: black, green, Witherbloom):

- Accomplished Alchemist's two mana abilities are one: X mana (at least one), each of any colour. Emergent Sequence's
  land doesn't become green and blue. Ecological Appreciation takes the four creatures with the greatest mana value
  and the opponent puts back the two best, both without a prompt. Confront the Past's planeswalker target ignores X
  when targeting (it does nothing on resolution if the mana value is above X). Pestilent Cauldron's exile is two
  abilities (your graveyard, an opponent's). Plumb the Forbidden sacrifices up to three creatures (tokens and the
  cheapest first, not chosen). Deadly Brew returns its card before the opponent sacrifices. Verdant Mastery and Search for
  Blex pick one card at a time. Professor Onyx's -8 asks the discard one decision at a time.

13c (group C: Quandrix, Prismari, Codie, Extus; `stx/rares-c.ts`):

- Frostboil Snarl and Expressive Iteration were already in the pool (msc). Kasmina's shared loyalty abilities use her own
  colours for the -8 on other walkers. Jadzi, Double Major and Rootha copies keep the original targets (Rootha, Teach by
  Example, Rowan's emblem; no new-target choice). Codie's free cast happens when the trigger resolves, not "until end of turn".
- Practical Research always discards an instant or sorcery when you hold one. Journey to the Oracle puts every land from hand
  onto the battlefield. Torrent Sculptor and Flamethrower Sonata target (the card / the creature) instead of choosing on
  resolution. Uvilda exiles the card as a cost; the refine counters are an engine counter, so the exiled card shows no text.
  Echoing Equation's copies end with the turn like any copy. Will's +1 and Rowan's other targets are chosen as usual.

13c (group D, red, colourless, lands):

- Reflective Golem and Wandering Archaic copy a spell with the original targets (no new targets for the copy). Conspiracy
  Theorist asks once per nonland card discarded, not once per batch. Fervent Mastery's search asks three times
  (each may find nothing). Draconic Intervention exiles the chosen card as part of casting, and its X is that card's
  mana value (stored as the spell's X).

14a (Witherbloom Pest Control, `sos/witherbloom.ts`, `sos/shared-14a.ts`):

- Follow the Lumarets with infusion asks for the second card even if the first was declined. Lumaret's Favor's copy
  retargets to another creature when there is one (`retarget`). Dissection Practice's "up to one" targets are chosen in
  order (the second creature can't be picked while skipping the first). Foolish Fate and Moseo read the life gained this
  turn from the turn tally. The SOS Pest (`sos-pest-token`, gains 1 life on attack) is not the STX Pest.

14b (cards):

Group A (white, Silverquill, Lorehold; `sos/cards-a.ts`, `sos-14b-a-effects.ts`):

- Silverquill, the Disputant's casualty 1 is a trigger when you cast an instant or sorcery (you may sacrifice a creature
  with power 1 or more; if you do, copy that spell). Aziza's copy and Social Snub's copy keep the original targets.
- Soaring Stoneglider's "exile two cards from your graveyard" picks the least useful cards without a prompt (the other
  choice is the kicker, {1}{W} more). Group Project's flashback taps the three least powerful untapped creatures.
- Moment of Reckoning is pawprint-style modes worth one each, up to four (`pawBudget`); with many targets the cast menu
  can get long. Lorehold, the Historian's miracle {2} is the first instant or sorcery you draw each turn.
- Ark of Hunger's milled card is playable this turn from the graveyard (no spell lock, unlike Conduit of Worlds).
  Nita's exiled spell goes to exile instead of a graveyard (`exileAfterCast`). Practiced Scrollsmith and Suspend Aggression
  use `playableUntilTurn` (the owner may cast or play from exile). Practiced Offense's target player is you or the opponent.
Group B (blue; `sos/cards-b.ts`, `sos-14b-b-effects.ts`):

- Hydro-Channeler's second ability is a stack ability that adds the mana, not a mana ability. Divergent Equation has at most three targets, however large X is. Flow State puts the cards not taken on the bottom of the library at random, not in a chosen order. Fractalize changes only the base power and toughness (it keeps its colours and creature types). Emeritus of Ideation exiles instants and sorceries last, then the oldest first.

Group C (black, Witherbloom, colourless; `sos/cards-c.ts`):

- Arnyn reads the dying creature's printed power and toughness. Rabid Attack targets up to three creatures. Dina's Guidance
  asks hand or graveyard before the search. Mind Roots: the discarding player picks both cards, then you pick the land.
  Pox Plague asks one card or permanent at a time (you, then the opponent). Great Hall of the Biblioplex pays the life as
  damage when its mana is spent. Petrified Hamlet picks from a list of land names (lands in play first).
  Together as One and the other converge cards read the colours spent as recorded on the spell or permanent.

Group D (red and Prismari; `sos/cards-d.ts`, `sos-14b-d-effects.ts`):

- Impractical Joke has no "damage can't be prevented" clause. Steal the Show's discard-and-draw is for you (the target player is always you).
  Choreographed Sparks and Prismari, the Inspiration keep the original targets on copies (no new-target choice); Sparks' copy of a
  creature spell is hasty and sacrificed at the end step. Rubble Rouser's mana ability is an activated ability (it deals damage), so
  it can't pay a cost mid-cast. Resonating Lute makes each land two mana of any colours (not necessarily the same colour) and
  replaces the land's own mana for instants and sorceries. Tablet of Discovery's milled card is playable from the graveyard
  this turn (`playableUntilTurn`, like Ark of Hunger). Magmablood Archaic's {2/R} pips are paid with {R} where possible, else two generic
  (`ManaCost.twoHybrid`). The R/W Spirit and U/R Elemental tokens are shared with groups A and B (`sos-spirit-token`, `sos-elemental-3-3-flying-token`).

Group E (green and Quandrix; `sos/cards-e.ts`):

- Planar Engineering searches four times (each may find nothing). Zimone's Experiment and Paradox Surveyor reveal nothing to the opponent. Applied Geometry's copy keeps its own colours (not green and blue). Ambitious Augmenter moves only +1/+1 counters. Fractal Tender counts any counter put on it. Quandrix, the Proof's granted cascade is a cast trigger, and Geometer's Arthropod and Bind to Life let you decline the card. Twobrid pips (`{2/G}`) are `ManaCost.twoHybrid`.

### 15 (Brawl cards)

From `docs/strixhaven-15b/simplifications-*.md` (now folded in here). 15b also: Alchemy "A-" names (A-Maelstrom Muse, A-Iridescent Hornbeetle, A-Ochre Jelly, A-Haywire Mite) are the paper cards; "Aggro Amalgam" is Voracious Hydra; Rootha has one extra basic (the wiki list has 99 cards).

- **white**
  - Katilda, Dawnhart Martyr and Katilda's Rising Dawn: no protection from Vampires.
  - Reprobation: the creature loses its abilities and becomes 0/1 but keeps its creature types.
  - Alseid of Life's Bounty: protection from a colour is modelled as "can't be targeted, damaged, enchanted or blocked by" that colour via a tracked effect until end of turn.
  - Indebted Spirit bestowed: the host's afterlife is a trigger on the creature face that fires when the host dies, even after the Aura has become a creature again.
  - Bestow auras revert to creatures in state-based actions as soon as the host is gone (no separate "becomes unattached" trigger window).

- **blue**
  - **Negate**: already implemented (Foundations); skipped. **Opt**: likewise skipped.
  - **Slickshot Lockpicker**: plot is an activated ability from hand at sorcery speed that uses the stack (the opponent can respond), not a special action. The plotted card can only be cast as a sorcery (fine for a creature; no other card in the group has plot).
  - **Quicken**: "the next sorcery spell you cast this turn" is kept per player for the turn and used up by the next sorcery cast, whenever it is cast.
  - **Silundi Vision**: the revealed card is not shown to the opponent as a reveal; the rest go to the bottom in a random order (as printed).
  - **Sink into Stupor**: "target spell or nonland permanent" is two modes ("return target spell" / "return target nonland permanent"), chosen when casting.
  - **Unexpected Assistance**: none (convoke).
  - **Baral's Expertise**: "up to three targets" is exactly three optional target slots; the free spell is offered from hand (mana value 4 or less) as a cast decision, with no check that you could normally cast it.
  - **Distant Melody**: counts the permanents you control (not only creatures) of the chosen creature type, as printed; the creature type list is the engine's usual list of types you could choose.
  - **Lazotep Plating**: the Army is chosen by the engine (the first Zombie Army or Army you control); "you and permanents you control gain hexproof" uses the Dawn's Truce effect (permanents on the battlefield now plus the player).
  - **Mizzium Skin, Cyclonic Rift**: overload is an alternative cost ("replaces the mana cost") with its own spell, as in other overload cards; the menu says "Alternative cost (...): overload (each)".
  - **Part the Waterveil**: awaken 6 is the alternative cost with a target land you control. The awakened land becomes a 0/0 Elemental creature with haste permanently, as printed. The extra turn is queued the usual way (after this one).
  - **Rise from the Tides**: the Zombie tokens are the common 2/2 black Zombie token (they enter tapped, as printed).
  - **Sea Gate Restoration // Sea Gate, Reborn**, **Soporific Springs**, **Hydroelectric Laboratory**: "you may pay 3 life, if you don't it enters tapped" is modelled as enters tapped plus a "may pay 3 life, then untap" trigger (the permanent is briefly tapped; same as the 15a shock lands).
  - **Stock Up, Experimental Augury**: the pick is a "choose a card or none" prompt; the rest go to the bottom in a random order rather than any order. **Experimental Augury / Tezzeret's Gambit**: see proliferate below.
  - **Proliferate** (Experimental Augury, Tezzeret's Gambit): the engine chooses for you: it adds one more of each kind of counter (+1/+1, loyalty, named counters except finality, stun, time) to every permanent you control that has any. It never affects opponents' permanents or players' counters.
  - **Treasure Cruise**: delve exiles only as many cards as the generic cost needs (the least useful first); you can't choose to exile more or to exile specific cards.
  - **Gate to Seatower**: "seek" is the shared random-nonland handler; "activate only once" is per permanent.
  - **Mystic Sanctuary**: "enters tapped unless you control three or more other Islands" is evaluated as it enters; "when this land enters untapped" is an intervening-if on the land being untapped, and the card goes on top of the library with no choice of "may" beyond leaving the target out.
  - **Hydroelectric Specimen**: the redirect is only offered for a spell with exactly one target and only if the Specimen is a legal target for that spell; "you may" is a yes/no prompt.
  - **Ingenious Prodigy**: skulk is the engine's "can't be blocked by creatures with greater power" (greater than its current power).
  - **Essence Capture**: none.
  - **Syncopate**: "unless its controller pays {X}" with X = the value chosen for Syncopate; an X of 0 lets the spell resolve without a prompt.
  - **Better Offer** (Alchemy): the random creature is chosen from the target opponent's library (no search, no reveal, no shuffle). "Perpetually" is a base 0/0-replacing stat set (`copyPT`) that stays with the card in every zone; "perpetually gains ward {1}" is ward {1} only while it stays on the battlefield (it is lost if the card changes zones).
  - **Mass Manipulation**: "X target creatures and/or planeswalkers" is at most three targets (never more than X), and fewer than X are allowed. Control is permanent, as printed.
  - **Stolen by the Fae**: the target creature's mana value must equal X (checked when you cast it, not again on resolution).
  - **Tezzeret's Gambit**: the Phyrexian {U/P} is a choice between the normal {3}{U} and a {3} alternative cost that also pays 2 life ("Alternative cost ({3}): pay 2 life"). Proliferate: see above.
  - **Seek New Knowledge, Bounty of the Deep** (Alchemy): "seek" puts a random matching card from your library into your hand (no reveal). Seek New Knowledge puts a card of your choice from your hand on the bottom after seeking.
  - **Expropriate** (council's dilemma): you vote first, then your opponent, by a prompt for each (the engine's AI answers the opponent's vote). Each time vote is an extra turn for you. Your own money vote takes back a permanent you own that an opponent controls (the best by mana value, with no choice); an opponent's money vote lets them choose which of their permanents you gain control of (control is permanent; the permanent is summoning sick). Expropriate is exiled as it resolves.
  - **Housemeld** (Alchemy): the exiled card perpetually has exactly the enchantment type (it loses its creature type, and any other types) for as long as the card exists (it stays so after it returns to the battlefield and in every zone). A token exiled this way ceases to exist and doesn't return. "At the beginning of your next end step" is a delayed trigger on your next end step (this turn's if it hasn't begun yet).
  - **Snow-Covered Island**: snow is a new supertype ("Snow"); nothing in the engine reads it yet (no snow mana).
  - **Thriving Isle**: "choose a color other than blue" offers all five colours; choosing blue just makes it a plain Island that enters tapped.
  - **Haughty Djinn**: none (power is a characteristic-defining count of instant and sorcery cards in your graveyard).
  - **Murmuring Mystic**: the token is a new 1/1 blue Bird Illusion with flying (`soc-15b-u-bird-illusion`).
  - **Reflective Rimekin** (Alchemy): the one-time boon is a permanent emblem-style triggered ability, so it copies each of your later instant or sorcery spells with mana value 3 or less. The copy keeps the original's targets ("you may choose new targets" is not offered).
  - **Counterspell, Spell Pierce, Spell Swindle, Wash Away, Three Steps Ahead**: Spell Swindle counts X for a spell with {X} in its cost as the announced value; Wash Away's cleave is the alternative cost {1}{U}{U} ("Alternative cost ({1}{U}{U}): cleave") and the unrestricted spell; the normal Wash Away can only target a spell that wasn't cast from its owner's hand. Three Steps Ahead's spree is any non-empty set of its three modes, each with its own additional cost, shown as one cast option per set.
  - **Soulblade Djinn, Consider, Preordain, Deduce, Thoughtcast**: none (Thoughtcast's affinity counts artifacts you control, tokens included).
  - **Group status**: all 48 listed cards are implemented (back faces in `BRAWL_15B_U_BACKS`); typecheck, lint and tests pass.

- **black**
  - Boggart Trawler // Boggart Bog, Fell the Profane // Fell Mire: "you may pay 3 life, otherwise it enters tapped" is modelled as entering tapped, then an optional "pay 3 life, untap it".
  - Hateful Eidolon: triggers on any creature dying and counts the Auras at resolution (drawing nothing if there were none), rather than checking "enchanted" when it triggers.
  - Kaya's Ghostform: enchants a creature you control (not a planeswalker) and returns it only when it dies, not when it is exiled.
  - Cursebound Witch: the spellbook draft is just drawing a card (the spellbook list isn't in the card data).
  - Blasphemous Edict: players sacrifice one creature at a time in turn (13 rounds), not all thirteen simultaneously. The {B} cost is a conditional cost reduction (the card's {3}{B}{B} less {3}{B}), not an alternative cost.
  - Phyrexian Tower: the "{T}, Sacrifice a creature: Add {B}{B}" ability uses the stack and adds the mana to your pool (it isn't a mana ability).
  - Westvale Abbey: the five creatures are sacrificed as the ability resolves, not as a cost (it needs five creatures when activated).
  - Thriving Moor: "choose a color other than black" also offers black (which adds nothing).
  - Blighted Nightmare: X is the target's mana value, and the blight (X -1/-1 counters, shown as a permanent -X/-X effect) goes on your creature with the greatest toughness; nothing returns if X exceeds that toughness (the Nightmare has already gone to hand). The perpetual +1/+1 is a perpetual static boost on each card.
  - Terrors of the Track: double team conjures a copy of the same card with a flag that it has lost double team.
  - Lord Skitter's Blessing: the Wicked Role's "only one Role per controller on a creature" replacement isn't implemented.
  - Vein Ripper: ward's creature sacrifice takes your creature with the lowest power automatically; the Brawl AI/UI doesn't offer the choice.
  - Liliana, Dreadhorde General (-9): each opponent keeps their highest mana value permanent of each type (artifact, creature, enchantment, land, planeswalker) automatically instead of choosing.
  - Bone Shards, Bitter Triumph: the discarded card goes to the graveyard directly (no "discard" event, so no discard triggers).
  - Snow-Covered Swamp: the Snow supertype has no rules here (no snow mana).

- **red**
  - Cards not exactly per Scryfall oracle text (3 October 2026 bulk data). Behaviour: `packages/cards/src/soc/cards-15b-r.ts`,
  - one-offs in `packages/engine/src/brawl-15b-r-effects.ts`.
  - **Return the Favor:** the copy mode targets a spell only (not an activated or triggered ability) and the copy keeps the
  - original's targets (no new targets chosen). The change-target mode works on spells with exactly one target, and is a choice
  - among the legal new targets (or keep it).
  - **Mizzix's Mastery, Arcane Bombardment:** the exiled card itself is cast without paying its mana cost, then returns to exile
  - (as a copy would leave it), rather than a true copy being cast. For both you first say yes or no, then may decline each card.
  - **Torch the Tower:** "if a permanent dealt damage by this spell would die, exile it instead" is "if the target creature would
  - die this turn, exile it instead" (also for damage from other sources); planeswalker targets aren't covered. Bargain is a
  - kicker with a sacrifice (an artifact, enchantment or token).
  - **Great Train Heist:** the Treasure mode doesn't target (there is one opponent): creatures that deal combat damage to the
  - opponent this turn each make a tapped Treasure.
  - **Saheeli, Sublime Artificer:** the copy has only the copied permanent's types (it isn't an artifact in addition when it
  - copies a creature).
  - **Sapphire Collector:** "this ability triggers only once" is a `conjured` named counter on the creature
  - (a second Collector triggers on its own). Mox Sapphire is in the pool (Alchemy: Dominaria United printing) so it can be conjured.
  - **Glimpse the Impossible:** the Eldrazi Spawn's "Sacrifice this token: Add {C}" is an activated ability (uses the stack),
  - not a mana ability, so it never pays costs automatically.
  - **Muddle, the Ever-Changing:** myriad is left out (it only matters with more than one opponent).
  - **Steam Vents:** "you may pay 2 life; if you don't it enters tapped" is modelled as entering tapped, then paying 2 life untaps it
  - (same as the other shock lands).
  - **Snow-Covered Mountain:** the snow supertype isn't tracked (nothing in the pool cares).

- **green**
  - Pest Infestation: up to three targets, however large X is.
  - Spinning Wheel Kick: at most three targets, however large X is.
  - Mana Confluence: the life is "damage" to you (pain), not paid as a cost.
  - Proliferate (Karn's Bastion, Follow the Tracks): only your own permanents get counters; no opponents' permanents or players are chosen.

- **two-colour**
  - Eriette: "can't attack you or planeswalkers you control" is "can't attack" (two-player game).
  - Ornate Imitations: the creature of each mana value is a deterministic pick (by card id) from the whole pool, not random.
  - Ornate Imitations: X can't be 0 (no effect anyway).
  - Planar Genesis / Make Your Own Luck: the cards left over go to the bottom in a fixed order (no random order choice).
  - Growth Spiral: the land may only come from hand (as printed).
  - Killian: the card draw triggers once per combat when you attack with any creature enchanted by your Aura.
  - Damn: overload is modelled as an alternative cost that replaces the cost.
  - Fracture, Pterafractyl and Hinterland Harbor were already implemented in earlier sets.

- **multicolour**
  - A-Maelstrom Muse: already in the pool as the paper STX card (not re-implemented); the Alchemy rebalance is not modelled.
  - A-Iridescent Hornbeetle, A-Ochre Jelly, A-Haywire Mite: the "A-" rebalanced versions aren't in bulk data, so these are the paper cards.
  - Aggro Amalgam: a flavour name (Through the Omenpaths) of Voracious Hydra. Implemented as `Voracious Hydra` (m20 printing); decks must list it under that name.
  - Restless Cottage: becomes a 4/4 Horror until end of turn, but its colours (black and green) aren't tracked, and the Horror subtype stays after end of turn.
  - The World Tree: "any number of God cards" is all Gods in the library (the choice is always to take every one).
  - Dispersal: when several nonland permanents tie for the greatest mana value, the first one is returned (the opponent doesn't choose).
  - Duneblast: "choose up to one creature" is a prompt with one option per creature (yours first), not a targeted choice.
  - Vesuvan Mist: the duplicate's "spend mana as though it were mana of any color" is an any-type cost (colourless mana could also pay a coloured pip).
  - Gorma, the Gullet: the extra counters apply only to creature spells resolving onto the battlefield, not to creatures put onto it by other effects.
  - Time Wipe: the creature you return is chosen on resolution from your creatures; if you control none, nothing is returned.
  - Call the Crash: suspend is an ability activated from hand at sorcery speed (any time you could cast it, which for a sorcery is the same), not a special action; the conjured Siege Rhinos are real cards (Khans of Tarkir printing).
  - Iridescent Hornbeetle: counts +1/+1 counters put on your creatures as counters (a doubled put counts as the doubled number).
  - Assassin's Trophy: the opponent's "may search" is a library search prompt that can be declined.
