import { createEngine } from '@mtg/engine';
import { cardDb, deckById, deckIds, ECL_THEME_DECKS } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Lorwyn Eclipsed (18c): seeded bot-vs-bot games with Arena's Theme Decks.

const engine = createEngine(cardDb);

describe.each(ECL_THEME_DECKS)('$name', (deck) => {
  it.each(['arcane-aerialists', 'path-of-power', deck.id])(
    'plays seeded heuristic games against %s to a result, error-free',
    (opponent) => {
      const decks = { p1: deckIds(deck), p2: deckIds(deckById(opponent)) };
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
    },
    120_000,
  );
});
