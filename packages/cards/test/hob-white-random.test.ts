import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import { cardDb, slug } from '../src/index.ts';
import { HOB_WHITE } from '../src/hob/white.ts';
import { n } from './blb-helpers.ts';

describe('The Hobbit white: random games', () => {
  it('plays short random games with every white card in the deck without errors', () => {
    const engine = createEngine(cardDb);
    const cards = Object.keys(HOB_WHITE).map(slug);
    const deck = [...cards, ...cards.slice(0, 12), ...n('plains', 24)].slice(0, 70);
    for (let seed = 1; seed <= 8; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ decks: { p1: deck, p2: deck }, seed }),
        seed * 7919,
      );
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});
