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

- **19a**: engine groundwork for the mechanics above, with tests, bot handling and Arena-style prompts.
- **19b**: every card, one agent per colour group in worktrees (`scripts/data/tdm-groups.json`, `scripts/tdm-status.ts`,
  `src/tdm/<group>.ts`, registered in `src/tarkir-dragonstorm.ts`).
- **19c**: Arena's ten Jump In packets (`scripts/data/arena-jumpin-packets.json`, from MTGABuddy) and the ten untapped.gg
  trophy decks.
- **19d**: boosters in Expedition, Season and Sealed.

## Simplifications to revisit

See the Tarkir: Dragonstorm section of `docs/shortcuts.md`.
