import { createEngine } from '@mtg/engine';
import { cardDb, deckById, deckIds, jumpInId, PACKETS, THE_HOBBIT_TROPHY_DECKS } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// The Hobbit (20c): seeded bot-vs-bot games with the ten untapped.gg 7–0 draft decks, and with our Jump In packets.

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

describe('The Hobbit trophy decks', () => {
  it.each(THE_HOBBIT_TROPHY_DECKS.map((d, i, all) => [d.id, all[(i + 1) % all.length]!.id]))(
    '%s plays seeded heuristic games against %s to a result, error-free',
    (a, b) => play(a, b),
    120_000,
  );
  it.each(THE_HOBBIT_TROPHY_DECKS.map((d) => [d.id]))(
    '%s plays a starter deck, error-free',
    (a) => play(a, 'arcane-aerialists'),
    120_000,
  );
});

describe('The Hobbit Jump In packets', () => {
  const hob = PACKETS.filter((p) => p.set === 'hob').map((p) => p.id);
  // Each packet with the one three further on (another colour), against the next such pair.
  const pair = (i: number) => jumpInId(hob[i % 10]!, hob[(i + 3) % 10]!);
  it.each(hob.map((_, i) => [pair(i), pair(i + 1)]))(
    '%s plays %s to a result, error-free',
    (a, b) => play(a, b),
    120_000,
  );
});
