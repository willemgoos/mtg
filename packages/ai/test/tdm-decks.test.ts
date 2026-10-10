import { createEngine } from '@mtg/engine';
import {
  ARENA_TDM_PACKETS,
  cardDb,
  deckById,
  deckIds,
  jumpInId,
  TARKIR_DRAGONSTORM_TROPHY_DECKS,
} from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Tarkir: Dragonstorm (19c): seeded bot-vs-bot games with the trophy decks and Arena's Jump In packets.

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

describe('Tarkir: Dragonstorm trophy decks', () => {
  it.each(
    TARKIR_DRAGONSTORM_TROPHY_DECKS.map((d, i, all) => [d.id, all[(i + 1) % all.length]!.id]),
  )(
    '%s plays seeded heuristic games against %s to a result, error-free',
    (a, b) => play(a, b),
    120_000,
  );
});

describe('Tarkir: Dragonstorm Jump In packets', () => {
  // Each packet once, paired with the next one (clan with theme packets).
  it.each(ARENA_TDM_PACKETS.map((p, i, all) => [p.id, all[(i + 1) % all.length]!.id]))(
    '%s + %s plays seeded heuristic games against a starter deck, error-free',
    (a, b) => play(jumpInId(a, b), 'arcane-aerialists'),
    120_000,
  );
});
