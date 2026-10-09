import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb, deckById, deckIds, missingCards, slug } from '../src/index.ts';
import { ECL_DECKS_1 } from '../src/ecl/decks-1.ts';

// Lorwyn Eclipsed 18c, part 1: G/W Kithkin and W/U Merfolk.

const engine = createEngine(cardDb);
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

describe.each(ECL_DECKS_1)('$name', (deck) => {
  it('has 60 cards in the Lorwyn Eclipsed set and none missing', () => {
    expect(deck.set).toBe('ecl');
    expect(deck.cards.reduce((s, [, k]) => s + k, 0)).toBe(60);
    expect(missingCards(deck)).toEqual([]);
    expect(deckById(deck.id)).toBe(deck);
  });

  it('has behaviour for every nonbasic card', () => {
    for (const [name] of deck.cards) {
      if (!BASICS.has(name)) expect(BEHAVIORS[name], name).toBeDefined();
    }
  });

  it('stays in its two colours (lands aside) and has 24 lands', () => {
    let lands = 0;
    for (const [name, k] of deck.cards) {
      const def = cardDb.get(slug(name))!;
      if (def.types.includes('Land')) {
        lands += k;
        continue;
      }
      for (const c of def.colorIdentity ?? def.colors) expect(deck.colors, name).toContain(c);
    }
    expect(lands).toBe(24);
  });

  it('plays short random games without errors', () => {
    const decks = { p1: deckIds(deck), p2: deckIds(deck) };
    for (let seed = 1; seed <= 5; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});
