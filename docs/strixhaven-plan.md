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

14b (group A: white, Silverquill, Lorehold; `sos/cards-a.ts`, `sos-14b-a-effects.ts`):

- Silverquill, the Disputant's casualty 1 is a trigger when you cast an instant or sorcery (you may sacrifice a creature
  with power 1 or more; if you do, copy that spell). Aziza's copy and Social Snub's copy keep the original targets.
- Soaring Stoneglider's "exile two cards from your graveyard" picks the least useful cards without a prompt (the other
  choice is the kicker, {1}{W} more). Group Project's flashback taps the three least powerful untapped creatures.
- Moment of Reckoning is pawprint-style modes worth one each, up to four (`pawBudget`); with many targets the cast menu
  can get long. Lorehold, the Historian's miracle {2} is the first instant or sorcery you draw each turn.
- Ark of Hunger's milled card is playable this turn from the graveyard (no spell lock, unlike Conduit of Worlds).
  Nita's exiled spell goes to exile instead of a graveyard (`exileAfterCast`). Practiced Scrollsmith and Suspend Aggression
  use `playableUntilTurn` (the owner may cast or play from exile). Practiced Offense's target player is you or the opponent.
14b (group C: black, Witherbloom, colourless; `sos/cards-c.ts`):

- Arnyn reads the dying creature's printed power and toughness. Rabid Attack targets up to three creatures. Dina's Guidance
  asks hand or graveyard before the search. Mind Roots: the discarding player picks both cards, then you pick the land.
  Pox Plague asks one card or permanent at a time (you, then the opponent). Great Hall of the Biblioplex pays the life as
  damage when its mana is spent. Petrified Hamlet picks from a list of land names (lands in play first).
  Together as One and the other converge cards read the colours spent as recorded on the spell or permanent.
14b (group D, red and Prismari, `sos/cards-d.ts`, `sos-14b-d-effects.ts`):

- Impractical Joke has no "damage can't be prevented" clause. Steal the Show's discard-and-draw is for you (the target player is always you).
  Choreographed Sparks and Prismari, the Inspiration keep the original targets on copies (no new-target choice); Sparks' copy of a
  creature spell is hasty and sacrificed at the end step. Rubble Rouser's mana ability is an activated ability (it deals damage), so
  it can't pay a cost mid-cast. Resonating Lute makes each land two mana of any colours (not necessarily the same colour) and
  replaces the land's own mana for instants and sorceries. Tablet of Discovery's milled card is playable from the graveyard
  this turn (`playGraveyardTurn`). Magmablood Archaic's {2/R} pips are paid with {R} where possible, else two generic
  (`ManaCost.twoHybrid`). SOS Spirit (2/2 red and white) and Elemental (3/3 blue and red flying) tokens are this group's own
  (`sos-spirit-rw-token`, `sos-elemental-ur-token`).
14b (group E: green and Quandrix, `sos/cards-e.ts`):

- Planar Engineering searches four times (each may find nothing). Zimone's Experiment and Paradox Surveyor reveal nothing to the opponent. Applied Geometry's copy keeps its own colours (not green and blue). Ambitious Augmenter moves only +1/+1 counters. Fractal Tender counts any counter put on it. Quandrix, the Proof's granted cascade is a cast trigger, and Geometer's Arthropod and Bind to Life let you decline the card. Twobrid pips (`{2/G}`) are `ManaCost.twoHybrid`.
