# Sealed: plan

Arena's Sealed event, played against bots. Agreed 2026-10-06.

## The event

- Pick a set (any set with boosters: FDN, BLB, MSH, FIN, STX, SOS, FRA), then open **6 boosters**
  of it. Packs come from Expedition's `rollPack` (1 rare or mythic, 3 uncommons, 8 commons; STX
  and SOS swap a common for an archive card): 72 cards.
- Build a **40-card deck** from the pool with free, unlimited basics (the shared `DeckBuilder`).
  The deck can be edited between matches as often as you like, never during one.
- Best-of-one matches until **7 wins or 3 losses**. The event screen shows seven win slots, three
  loss marks and what the current record pays, with Play, Edit Deck and Resign.
- Entry is **free** (for now).
- One event at a time; it survives reloads, and a match left part-way resumes.

## Opponents

Each match's opponent opens its own 6 boosters of the same set, from a seed fixed by the event and
the match number, and builds a 40 with the same deck suggester the player's "Suggest a deck" button
uses. Bot skill is random, leaning tougher as your wins go up.

## Season

An event belongs to the Season save that was active when it started.

- **You keep the pool:** every non-basic card you open joins that save's collection when the packs
  are opened (as on Arena).
- **Prizes** go to the same save when the event ends (7 wins, 3 losses or resigning):

| Wins  | 0 | 1  | 2   | 3   | 4   | 5   | 6   | 7   |
| ----- | - | -- | --- | --- | --- | --- | --- | --- |
| Coins | 0 | 50 | 100 | 150 | 250 | 350 | 500 | 700 |
| Packs | 0 | 0  | 0   | 1   | 1   | 1   | 2   | 3   |

  Packs are Season packs of the event's set. Lower than Arena's because entry is free and the pool
  is kept.
- Without a Season save, Sealed still plays; the event screen says the cards and prizes need one.

## Build order

1. **Deck suggester** (`limitedRating.ts`, Expedition's `suggestDeck`): rate cards by what they do
   (removal, evasion, card draw, stats for cost, rarity) rather than rarity alone, so bot sealed decks
   and the "Suggest a deck" button both build sensible 40s. Tests on random pools of every set.
2. **Event logic** (`sealed.ts`, Season grant/prize functions): state, storage, opponents, results,
   prizes. Tests like `expedition.test.ts`.
3. **UI**: Home tile, set picker, pool reveal, deck builder, event screen, end summary.

Later: Draft (Quick Draft against seven bots), reusing the suggester for the bots' decks.
