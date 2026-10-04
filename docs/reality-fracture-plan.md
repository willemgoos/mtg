# Plan: Reality Fracture (FRA), decks and Jump In

Target: the Reality Fracture main set (on Arena since 29 September 2026) in the same form as Final Fantasy and Strixhaven:
our own two-colour 60-card decks, every card in the set, Jump In packets, then boosters. **No Commander precons** (FRC and
the Foundations Commander decks) for now.

One branch, `reality-fracture`, one sub-phase at a time, each committed when its done criteria hold. Read
`docs/final-fantasy-plan.md` first: this plan reuses its rules and wiring and doesn't repeat them.

**Order: planeswalkers last.** Everything that needs the new planeswalker work (Empower Jace and the Jace token, loyalty
abilities granted to planeswalkers, "a Jace", and the eight planeswalker cards) waits for 17c. The rest of the set is
built and playable first; 17c then adds those 49 cards and swaps some of them into the decks and packets.

## Rules

Same as the FIN plan: done criteria, engine vocabulary in its own commented block (`// Reality Fracture (17a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`. Rules text always
comes from the Scryfall oracle text, never from memory. **No shortcuts**: a card does exactly what its text says, or it
stays out (see `docs/marvel-jumpstart-handoff.md` for the wording given to agents). Anything not exact goes in
`docs/shortcuts.md`.

## The set (Scryfall, 4 October 2026)

- 280 nonbasic main-set cards, collector numbers 1–280 (81 common, 109 uncommon, 64 rare, 26 mythic), plus basics.
  Everything numbered above 280 is basics and alternate art. Scryfall marks no FRA card `is:booster`, so the booster list
  is the collector-number range (`src/fra/booster-list.ts`, from `scripts/fetch-booster-list.ts fra`).
- Layouts: 259 normal, 21 `prepare` (the SOS layout; the fetch script already handles it).
- 75 legendary creatures, 8 planeswalker cards.
- 8 cards were already in the pool (Unsummon, Last Gasp, Blazing Crescendo, the five slow lands) and keep their earlier
  printing: `fra` is last in `SET_PREFERENCE`.
- Tokens: Cadet (2/2 colourless Wizard Soldier) and Heartwood (artifact, `{T}: Add {R} or {G}`) are shared, in
  `src/fra/tokens.ts`. Lotus, Sculpture Treasure, Forest Tentacle, Illusion, Angel, Thopter, Beast, Mowu, Leviathan and
  Ajani's Pridemate are each made by one or two cards. The Jace planeswalker token is 17c.

## Mechanics

| Mechanic | Cards | Engine today | Phase |
| --- | --- | --- | --- |
| **Empower Jace N** | 34 (plus the walkers) | none: needs planeswalker tokens and an "empower" effect (create the Jace token if you have none, then add N loyalty) | 17c |
| **Granted loyalty abilities** ("Planeswalkers you control have [−2]: …") | about 15 (the ten "Way of the …" enchantments, Sanctum Lurker, Avatar of Burgeoning Echoes, Kiora) | none | 17c |
| "A Jace" (behold a Jace, "Jaces you control", "if you control a Jace planeswalker") | about 6 | behold exists (Marvel) | 17c |
| Prepare / "becomes prepared" | 21 layout + 6 more | exists (SOS) | 17a |
| Surveil, scry triggers | 43 | exist (`youScryOrSurveil`) | 17a |
| Threshold, landcycling, flashback, finality and stun counters, convoke, proliferate, excess damage, ward costs, split second, hybrid | many | exist | 17a |
| Exhaust | 1 (Liliana the Repentant) | close to `once` | 17a |
| Domain | 1 | small | 17a |

Shared pieces several 17a groups may need, with fixed names so parallel work merges cleanly:
`{ kind: 'scriedOrSurveilledThisTurn' }` (condition), `{ kind: 'opponentDealtNoncombatDamageThisTurn' }` (condition).

## Build groups

`scripts/data/fra-groups.json` assigns every card to a group; `scripts/fra-status.ts` shows what's left
(`pnpm --filter @mtg/cards exec tsx scripts/fra-status.ts [--group <name>]`). Each group has its own file in `src/fra/`,
already registered in `src/reality-fracture.ts`, so parallel agents never edit the same registry lines.

| Group | Cards | File |
| --- | --- | --- |
| white | 30 | `fra/white.ts` |
| blue | 27 | `fra/blue.ts` |
| black | 28 | `fra/black.ts` |
| red | 33 | `fra/red.ts` |
| green | 31 | `fra/green.ts` |
| multi-a (W/U, U/B, B/R, R/G, G/W gold) | 29 | `fra/multi-a.ts` |
| multi-b (W/B, U/R, B/G, R/W, G/U and three-colour gold) | 20 | `fra/multi-b.ts` |
| colorless (artifacts and nonbasic lands) | 25 | `fra/colorless.ts` |
| planeswalkers (17c) | 49 | `fra/planeswalkers.ts` (later) |
| existing | 8 | already in the pool |

## Phase 17a: every non-planeswalker card

Eight agents in parallel worktrees, one per group, then merges into `reality-fracture`. Tests in
`packages/cards/test/fra-<group>.test.ts`. Done when `fra-status.ts` shows every group but `planeswalkers` complete.

**Done** (4 October 2026): 222 of 223 cards, 230 of 280 with the eight already in the pool. Left out: Extrapolate the
Impossible (cards "from outside the game"; there's no sideboard outside Learn). Cards that aren't exact yet are listed
under Reality Fracture in `docs/shortcuts.md`.

New engine pieces, each in a `// Reality Fracture (17a)` block (custom handlers in `engine/src/fra-<group>-effects.ts`):
- Turn tracking: `scriedOrSurveilledThisTurn`, `opponentDealtNoncombatDamageThisTurn` / `LastTurn`, cards milled this
  turn, no legend rule this turn (Hall of Echoes), hand swaps (Arc of Fortune), Molten Tide.
- Triggers: `opponentDealtNoncombatDamage`, `playerDiscards`, `selfDiscarded`, `opponentCreatureBlocks`, beginning of
  combat / upkeep / end step from the graveyard, "attacks a player" (`aPlayer`), castSpell filters for Danitha and Codie.
- Statics: split second for instants and sorceries (Samut), opponents' spells cost more (Thalia), toughness assigns
  combat damage and defenders can attack (Ghalta), no casting during combat (Yuriko), enters-the-battlefield triggers
  suppressed (Karn, Argent Defender), artifact tokens replaced (Draconic Visitor), lands have hexproof (Marwyn), free
  casting by creature count (Omnipresence), negative power assigns as positive (Loot).
- Effects and costs: exact proliferate (one permanent at a time), "up to N" library searches with different names,
  -1/-1 counters (cancelling +1/+1), tap N untapped artifacts as a cost, discard "if you do" follow-ups, exile-copy-cast
  within a mana value budget (Uldaros Theorix), ward "sacrifice three permanents", cast from exile while a land keeps an
  ability (Emrakul), Aura choice for permanents returned from the graveyard, token copies of a card no longer on the
  battlefield, `winGame`.
- Amounts: `floorDiv`, basic land types (domain), card types in graveyards (Tarmogoyf), colours among artifacts,
  planeswalker types, greatest toughness.
- A planeswalker put onto the battlefield without being cast enters with its loyalty.

## Phase 17b: decks, Jump In, boosters

- **Ten decks**, one per colour pair (36 spells, 24 lands), `set: 'fra'`, built from 17a cards only, each 45–65% against
  the ten Foundations starter decks. Themes from the signpost uncommons:

  | Pair | Theme | Signposts |
  | --- | --- | --- |
  | W/U | scry and surveil | Prudent Fateseer, Desperate Futurescribe, Denzilore Fatehold |
  | U/B | mill and threshold | Paradox Shaper, Theorix Charm, Recursive Recruitment |
  | B/R | noncombat damage | Grim Repriser, Stingerquill Voxmancer, Ingris Stingerquill |
  | R/G | Heartwood and artifacts | Woodwork Prodigy, Konstrari Charm, Aerid Konstrari |
  | G/W | lifegain and +1/+1 counters | Bloombrute, Vigorbloom Vanguard, Kwia Vigorbloom |
  | W/B | creatures dying | Edgar, Ancient Bloodlord; Twisted Fates |
  | U/R | noncreature spells and Thopters | Saheeli, Jewel of Avishkar; Clash of Elements |
  | B/G | lands in the graveyard | Primal Witchstalker; Hapatra, the Desert Fang |
  | R/W | creatures entering, +1/+1 counters | Mabel, Valley Hero; Warrior's Blades |
  | G/U | landfall and planeswalkers | Mind Meanderer and Kiora are 17c; built around landfall until then |

  The first two decks go in as soon as their cards are merged, so they can be played early.

  **Decks done** (`fra/decks-1.ts` to `decks-3.ts`, tests `fra-decks-*.test.ts`). Bot vs bot, 20 games per seat against each
  starter deck: Foresight and Flight (W/U) 50.5%, Heartwood Forge (R/G) 56.2%, Drowned Archive (U/B) 46.8%, Stingerquill
  Barrage (B/R) 53.0%, Vigorbloom Grove (G/W) 61.4%, Bloodline Requiem (W/B) 50.4%, Clockwork Spellslingers (U/R) 48.3%,
  Grave Harvest (B/G) 54.5%, Rallying Blades (R/W) 50.3%, Tidal Terrain (G/U) 48.5%. The first six were measured against
  the fourteen `source: 'arena'` starter decks, the last four against the ten Foundations ones. Tidal Terrain is ramp and
  land recursion for now: G/U has no landfall payoffs outside the planeswalker cards.
- **Ten Jump In packets** of our own (Arena has announced none for FRA), two per colour, each twelve FRA cards with one
  rare or mythic plus eight basics; `'fra'` in the Packet `set` union and a Reality Fracture button in the picker.
- **Boosters**: `PackSet` `'fra'` in Expedition and a Season pack kind, sheets from `FRA_BOOSTER_LIST` (cards the pool
  doesn't have yet are left out until 17c).

  **Jump In and boosters done.** Ten packets (`fra-*` in `jumpin.ts`), heuristic-bot win rates over about 300 games each
  against random packets from every set: Lifegain (W, Lyra, Archangel of Dawn) 60%, Counters (W, Guiding Hydra) 51%,
  Scholars (U, Diviner of Victory) 52%, Sphinxes and Flyers (U, Sphinx of False Conclusions) 56%, Graveyard (B, Dark Matter
  Manipulator) 51%, Assassins (B, Lich's Relic) 63%, Sparkmages (R, Master of Barbs) 57%, Artificers (R, Draconic Visitor)
  47%, Titans (G, Simulacrum Shaper) 67%, Heartwood (G, Hungering Puppetbeast) 44%; FRA as a whole 55%. Titans and
  Assassins are above the 40–60% aim but inside the 20–70% the other sets' packets span. Boosters:
  `realityFractureBoosterSheets()` (FRA booster list filtered on `cardDb`, so 17c cards join by themselves), `PackSet`
  `'fra'` in Expedition, Season pack kind `realityFracture` with the ten FRA decks as starters; the wrapper shows Emrakul,
  the Exigent Doom.

## Phase 17c: planeswalkers

- Planeswalker tokens and the Jace token; the `empowerJace` effect (amounts may be counts: "X, where X is …").
- Granted loyalty abilities ("Planeswalkers you control have …"), "a Jace" filters and counts.
- The 49 cards in the `planeswalkers` group, including the eight walker cards.
- Bots: using the Jace token and granted abilities sensibly, attacking walkers.
- Second pass on the decks and packets: swap Empower Jace cards in where they fit (W/U and G/U most), rerun the balance.

Files: `fra/pw-core.ts` (the core and the twelve commons), `fra/pw-b.ts` (uncommons), `fra/pw-c.ts` (rares and mythics).

**Core done** (`fra/pw-core.ts`, tests `fra-pw-core.test.ts` and `ai/test/planeswalkers.test.ts`): the twelve commons, and
this vocabulary (engine helpers in `engine/src/fra-pw-effects.ts`, card builders in `cards/src/fra/helpers.ts`):

- **Jace token** `FRA_JACE` (`fra/tokens.ts`): loyalty 0, `−1: Surveil 1` (ability 0), `−3: Draw a card` (ability 1).
  Planeswalker tokens and token copies of walkers enter with their loyalty (`enterWithLoyalty` in `context.ts`); the test
  scenario builder takes `{ card, loyalty }`.
- **`empowerJace(amount)`**: any `Amount`. No Jace token: create one, then add the counters; one: use it; several: a
  `chooseObject` prompt. Nontoken Jaces and other players' tokens never count; 0 only creates the token (it dies). Works
  inside follow-ups (`if`, `ifExcess`) through the `ctx.deferred` queue. `damage.ifExcess` (Violent Echoes) runs with
  `{ event: 'amount' }` = the excess.
- **Granted loyalty abilities**: `planeswalkersHave(loyaltyAbility(cost, label, effects))`, applying to every walker you
  control, tokens included; granted abilities follow the printed ones. Activated and static abilities only (no card needs a
  granted trigger). Statics `planeswalkersStayAtZero` (Sanctum Lurker), `oneAttackerOnly` (Tomik).
- **Loyalty triggers and effects**: `youActivateLoyaltyAbility` (`removedAtLeast`), `opponentActivatesLoyaltyAbility`,
  `youPutLoyaltyCounters` (`{ event: 'amount' }` = that many), condition `activatedLoyaltyAbilityThisTurn`, effect
  `loyaltyCounters` (walkers only), effect `loyaltyAtInstantSpeed` (with `filter: JACE`).
- **"A Jace"**: `JACE` (filter), `controlsJace` (condition), `noJaceToBehold` (Theorist's Sanctum's `entersTappedIf`),
  amounts `{ count: 'loyaltyAmongPlaneswalkers', filter }` and `{ loyaltyOf }`, `beholdOrPay` (Countersculpt), behold with
  `JACE`. `getAbilities(state, db, id)` is exported (printed plus granted abilities).
- **Bots**: a Jace token is valued at 0.6 per loyalty counter, so `−3` draws as soon as it can (not with 2 or fewer cards in
  the library); `−1` only in main phase 2 at 1–2 loyalty. `planWalkerAttacks` / `planAttackTargets` send attackers at
  walkers when the simulation scores it better (heuristic and search bots).
- **UI**: loyalty badge, Jace token text, granted abilities in the activation menu, the Jace-token choice, "Behold a Jace /
  Pay {1}".

## Simplifications to revisit

(none yet)
