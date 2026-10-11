import { createEngine } from '@mtg/engine';
import {
  cardDb,
  deckById,
  deckIds,
  LORD_OF_THE_RINGS_DECKS,
  LORD_OF_THE_RINGS_TROPHY_DECKS,
} from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// The Lord of the Rings (22): seeded bot-vs-bot games with the ten untapped.gg 7–0 draft decks, and the twelve human-made
// 60-card decks (Starter Kit, Arena Story Decks, MTG Arena Zone) against a Foundations starter deck.

const engine = createEngine(cardDb);

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
  }
}

describe('The Lord of the Rings trophy decks', () => {
  it('has ten playable 40-card decks, one per colour pair', () => {
    expect(LORD_OF_THE_RINGS_TROPHY_DECKS).toHaveLength(10);
    const pairs = new Set(LORD_OF_THE_RINGS_TROPHY_DECKS.map((d) => [...d.colors].sort().join('')));
    expect(pairs.size).toBe(10);
    for (const d of LORD_OF_THE_RINGS_TROPHY_DECKS) expect(deckIds(d), d.name).toHaveLength(40);
  });
  it.each(LORD_OF_THE_RINGS_TROPHY_DECKS.map((d, i, all) => [d.id, all[(i + 1) % all.length]!.id]))(
    '%s plays seeded heuristic games against %s to a result, error-free',
    (a, b) => play(a, b),
    120_000,
  );
  it.each(LORD_OF_THE_RINGS_TROPHY_DECKS.map((d) => [d.id]))(
    '%s plays a starter deck, error-free',
    (a) => play(a, 'arcane-aerialists'),
    120_000,
  );
});

describe('The Lord of the Rings 60-card decks', () => {
  it.each(LORD_OF_THE_RINGS_DECKS.map((d) => [d.id]))(
    '%s plays a starter deck to a result, error-free',
    (a) => play(a, 'might-of-the-legion'),
    120_000,
  );
});
