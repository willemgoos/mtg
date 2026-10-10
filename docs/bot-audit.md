# Bot audit (10 October 2026)

624 heuristic-vs-heuristic games, four per playable deck (136 decks plus 20 Brawl decks), on `tarkir-dragonstorm`.

## Healthy

- No errors, no unfinished games (all under 4,000 actions; 19 turns on average); p1 won 309 of 624.
- Every decision kind has a handler except `sacrificeSeveral`, which took the first option (now the least valuable, like
  `sacrifice`).

## Fixed

- **Huge option counts.** Crackle with Power offered 6,555 casts (X and "up to X targets"), Magma Opus 18,800: one decision
  took 133 s. `capPerSource` (`ai/src/simulate.ts`) scores at most 48 per card or ability, evenly spread (both bots); now 1.6–2.6 s.
- **Search bot crash on cards from outside the deck.** `determinize` threw when a card wasn't in the decklist (a Lesson that
  Learn fetched from the sideboard), and the app sends only the main decks. Master, gauntlet, Sealed and Season games
  against such decks could end in an error. It now accepts such cards and guesses hidden extras from the list.

## Open: what the evaluation can't see

The heuristic bot scores one step ahead with a static evaluation (`ai/src/evaluate.ts`): life, cards in hand, creatures,
lands (0.4), other permanents (1.5). Anything worth less than the card it costs (2) is never played. Cards castable on four
or more turns and never cast: 120 of 2,066.

| Group | Examples | Why |
|---|---|---|
| Mana rocks and ramp | Arcane Signet (5 casts in 152 chances), Sol Ring, Talismans, Monuments, Cultivate, Farseek, Rampant Growth | mana isn't valued |
| Fetch lands | Terramorphic Expanse, Fabled Passage, Windswept Heath, Polluted Delta, Ash Barrens: never cracked | land for land scores 0 |
| Cycling, landcycling | Ice Flan, Balamb T-Rexaur, Kulrath Zealot, the Lorwyn Eclipsed campuses | card for card scores 0 |
| Pacifism effects | Pacifism, Detention Vortex, Charmed Sleep, Sleep Magic, Spiral into Solitude | a creature that can't attack or block keeps its full value |
| Vehicles | Strixhaven Skycoach, Subterranean Schooner, Adventurer's Airship | not creatures until crewed |
| Enchantment engines, anthems | Raid Bombardment, Lunar Convocation, Claim the Kingdom, Folk Hero, Ride the Shoopuf, Overrun | value comes later |
| Cantrips, even trades | Think Twice, Pilfer, Careful Study, Seek New Knowledge | net 0; unused mana is not counted as wasted |
| Adventure halves | Jump, Enroot | the card on an adventure isn't counted as a card to come |

Search bot (Master): with 128 playouts in 1.5 s it hit the time cap in 50 of 53 searches and finished a median 22% of its
playouts (10% of searches under 9%); some decisions rest on two playouts per option. The engine slowdown (see
`tarkir-dragonstorm-plan.md`) makes this worse.
