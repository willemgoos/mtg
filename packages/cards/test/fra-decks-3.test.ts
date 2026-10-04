import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import { BEHAVIORS } from '../src/behaviors.ts';
import {
  cardDb,
  deckById,
  deckGameOptions,
  deckIds,
  isPlayable,
  missingCards,
} from '../src/index.ts';
import { FRA_DECKS_3 } from '../src/fra/decks-3.ts';

// Reality Fracture 17b, part 3: U/R, B/G, R/W and G/U decks.

const engine = createEngine(cardDb);
const opponent = deckById('might-of-the-legion');

describe.each(FRA_DECKS_3)('$name', (d) => {
  it('is a Reality Fracture starter-style deck', () => {
    expect(d.set).toBe('fra');
    expect(d.series).toBe('starter');
    expect(d.source).toBe('custom');
    expect(d.id).toMatch(/^fra-/);
    expect(d.cards.some(([name]) => name === d.face)).toBe(true);
  });

  it('has every card in cardDb with behaviour', () => {
    expect(missingCards(d)).toEqual([]);
    expect(isPlayable(d)).toBe(true);
    for (const [name] of d.cards) {
      const def = cardDb.get(deckIds({ ...d, cards: [[name, 1]] })[0]!)!;
      const isBasic = def.supertypes?.includes('Basic');
      expect(isBasic || BEHAVIORS[name] !== undefined || def.types.includes('Land')).toBe(true);
    }
  });

  it('is 60 cards, 24 lands, and only in its two colours', () => {
    const ids = deckIds(d);
    expect(ids).toHaveLength(60);
    const defs = ids.map((id) => cardDb.get(id)!);
    expect(defs.filter((c) => c.types.includes('Land'))).toHaveLength(24);
    for (const c of defs.filter((c) => !c.types.includes('Land'))) {
      for (const col of c.colors ?? []) expect(d.colors).toContain(col);
    }
  });

  it('plays short random games without errors', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const o = seed % 2 ? deckGameOptions(d, opponent) : deckGameOptions(opponent, d);
      const r = playRandomGame(engine, engine.newGame({ ...o, seed }), seed * 7919);
      expect(r.truncated).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});
