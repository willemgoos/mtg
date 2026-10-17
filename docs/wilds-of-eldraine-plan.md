# Plan: Wilds of Eldraine (WOE)

Target: Arena's official Wilds of Eldraine products, exact lists: the **15 Story Decks** (60 cards each, on Arena since
6 September 2023; ten two-colour, one per colour pair, and five three-colour) and Arena's **ten Jump In packets** (random
slots included). Then every other card of the main set (`is:booster`) and boosters. Arena's lists exist, so **no decks of
our own and no human-made decks** (the user's rule). No Commander decks (WOC).

One branch, `wilds-of-eldraine`, one sub-phase at a time. Read `docs/tarkir-dragonstorm-plan.md` and
`docs/lord-of-the-rings-plan.md` first: this plan reuses their rules, wiring and agent setup and doesn't repeat them.

## Rules

Same as Tarkir: Dragonstorm: engine vocabulary in its own commented block (`// Wilds of Eldraine (23a): ...`),
`pnpm typecheck && pnpm lint && pnpm test` before each commit, card data only through `pnpm cards:fetch`, rules text from
the Scryfall oracle text. **No shortcuts**: a card does exactly what its text says, or it stays out (wording in
`docs/marvel-jumpstart-handoff.md`). Anything not exact goes in `docs/shortcuts.md`.

## Sources

- Story Decks: `packages/cards/scripts/data/woe-story-decks.json`, parsed from Wizards'
  [Wilds of Eldraine Story Decks](https://magic.wizards.com/en/news/mtg-arena/wilds-of-eldraine-story-decks) (all 15 at 60
  cards). mtg.wiki's copy is wrong for Slumber for War (53 cards) and Candy and Crumbs; don't use it.
- Jump In: the ten `"set": "Wilds of Eldraine (WOE)"` entries in `packages/cards/scripts/data/arena-jumpin-packets.json`,
  parsed from Wizards' [Jump In! Update for Wilds of Eldraine](https://magic.wizards.com/en/news/mtg-arena/jump-in-update-for-wilds-of-eldraine).
  12 cards each (`fixed` plus one card per `slots` entry; Wizards lists the first option of each slot in its list). They
  rotated out of Arena's Jump In in 2025 but are Arena's own lists. They include the Phyrexia: All Will Be One Sphere
  lands (The Fair Basilica, The Surgical Bay, The Dross Pits, The Autonomous Furnace, The Hunter Maze).
- Some deck and packet cards are reprints or other printings (Mocking Sprite, Ruby, Evolving Wilds, Quick Study, ...);
  17 of them already have behaviour.

## Build groups

`packages/cards/scripts/data/woe-groups.json` (256 cards without behaviour, front-face names):

| Group | Cards | Phase |
| --- | --- | --- |
| white, blue, black, red, green | 35, 31, 34, 37, 35 (Story Deck and Jump In cards) | 23b |
| multicolour, colorless, land | 17, 9, 11 (Story Deck and Jump In cards) | 23b |
| `<colour>-main`, `multicolour-main`, `colorless-main`, `land-main` | 47 (the rest of the booster set) | 23d |

Layouts: 199 normal, 49 Adventures, 8 Sagas.

## Phases

- **23 wiring**: `src/wilds-of-eldraine.ts` merging `src/woe/<group>.ts` stubs, registered like Lord of the Rings
  (`behaviors.ts`, `pool.ts` `WILDS_OF_ELDRAINE_POOL`, `index.ts`, `cards.test.ts`); `woe` in `SET_PREFERENCE` (check no
  existing card moves printing); `scripts/woe-status.ts`; `'woe'` in `Packet.set`; shared tokens (Roles, Food exists, ...)
  in `src/woe/tokens.ts`.
- **23a**: engine groundwork for the mechanics below, with tests, bot handling and Arena-style prompts.
- **23b**: the Story Deck and Jump In cards, one Sonnet agent per group in worktrees.
- **23c**: the 15 Story Decks in the deck registry (shown as "Wilds of Eldraine story decks") and the ten Jump In packets
  (`ARENA_WOE_PACKETS`, picker group, Quick match set `woe`), bot games over the decks.
- **23d**: the rest of the booster set, then boosters in Expedition, Season and Sealed.

## Mechanics (23a)

| Mechanic | Engine today |
| --- | --- |
| Adventure (49 cards) | exists (Final Fantasy, Tarkir Omens) |
| Role tokens (Cursed, Monster, Royal, Sorcerer, Virtuous, Wicked, Young Hero; one Role per controller per creature, rule 303.7) | Wicked Role exists (Strixhaven Brawl 15b) |
| Bargain (sacrifice an artifact, enchantment or token as an additional cost; "if this spell was bargained") | partial (`build.ts`) |
| Celebration (two or more nonland permanents entered under your control this turn) | to check |
| Food | exists |
| Sagas (8) | exist |
| Restless manlands (enter tapped, become a creature until end of turn, attack trigger) | to check |
| Sphere lands (enter tapped, sacrifice to draw) | to check |
| "Enchanted creature you control" / "creature with an Aura" counts, Ward, scry, mill, surveil | mostly exist |

## Status and handoff

Not started.
