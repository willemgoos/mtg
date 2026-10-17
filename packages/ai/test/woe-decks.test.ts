import { createEngine } from '@mtg/engine';
import {
  ARENA_WOE_PACKETS,
  cardDb,
  deckById,
  deckIds,
  jumpInId,
  WILDS_OF_ELDRAINE_STORY_DECKS,
} from '@mtg/cards';
import { afterAll, describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine (23c): seeded bot-vs-bot games with Arena's Story Decks and Jump In packets.
// WOE_WINRATES=1 prints each deck's wins.

const engine = createEngine(cardDb);
const record = new Map<string, { wins: number; games: number }>();

function play(p1: string, p2: string) {
  const decks = { p1: deckIds(deckById(p1)), p2: deckIds(deckById(p2)) };
  for (let seed = 1; seed <= 2; seed++) {
    const r = playMatch(
      engine,
      decks,
      { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
      seed,
      { startingPlayer: seed % 2 ? 'p1' : 'p2' },
    );
    expect(r.winner, `seed ${seed}`).not.toBeNull();
    expect(r.actions.length, `seed ${seed}`).toBeLessThan(5000);
    for (const [id, side] of [
      [p1, 'p1'],
      [p2, 'p2'],
    ] as const) {
      const e = record.get(id) ?? { wins: 0, games: 0 };
      e.games++;
      if (r.winner === side) e.wins++;
      record.set(id, e);
    }
  }
}

afterAll(() => {
  if (process.env.WOE_WINRATES)
    for (const [id, { wins, games }] of record) console.log(`${id}: ${wins}/${games}`);
});

describe('Wilds of Eldraine Story Decks', () => {
  it.each(
    WILDS_OF_ELDRAINE_STORY_DECKS.map((d, i, all) => [d.id, all[(i + 1) % all.length]!.id]),
  )(
    '%s plays seeded heuristic games against %s to a result, error-free',
    (a, b) => play(a, b),
    120_000,
  );
});

describe('Wilds of Eldraine Jump In packets', () => {
  it.each(ARENA_WOE_PACKETS.map((p, i, all) => [p.id, all[(i + 1) % all.length]!.id]))(
    '%s + %s plays seeded heuristic games against a story deck, error-free',
    (a, b) => play(jumpInId(a, b), 'woe-brawl-at-the-ball'),
    120_000,
  );
});
