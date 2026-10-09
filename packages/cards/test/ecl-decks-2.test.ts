import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, deckIds, missingCards } from '../src/index.ts';
import { ECL_DECKS_2 } from '../src/ecl/decks-2.ts';

const engine = createEngine(cardDb);

describe('Lorwyn Eclipsed decks, part 2', () => {
  it('has the three decks', () => {
    expect(ECL_DECKS_2.map((d) => d.id)).toEqual([
      'ecl-boggart-rampage',
      'ecl-gilt-leaf-hunt',
      'ecl-kulrath-tempest',
    ]);
  });

  for (const deck of ECL_DECKS_2) {
    describe(deck.name, () => {
      it('has 60 cards, all implemented, in its two colours', () => {
        expect(deck.set).toBe('ecl');
        expect(deck.cards.reduce((s, [, k]) => s + k, 0)).toBe(60);
        expect(deck.cards.some(([name]) => name === deck.face)).toBe(true);
        expect(missingCards(deck)).toEqual([]);
        for (const id of deckIds(deck)) {
          const card = cardDb.get(id)!;
          for (const c of card.colors) expect(deck.colors, `${card.name} colour`).toContain(c);
        }
      });

      it('plays short random games without errors', () => {
        const decks = { p1: deckIds(deck), p2: deckIds(deck) };
        for (let seed = 1; seed <= 4; seed++) {
          const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
          expect(r.truncated, `seed ${seed}`).toBe(false);
          expect(r.final.decision.kind).toBe('gameOver');
        }
      });
    });
  }
});
