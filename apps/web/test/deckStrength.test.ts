import { ARENA_DECKS, deckIds } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { deckStrength, pickSeasonOpponent, scoredOpponents } from '../src/game/deckStrength.ts';

const counts = (ids: string[]) => {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
};
/** A seeded integer source, so the picks are the same every run. */
const ints = (seed: number) => {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s % n;
  };
};
const score = (id: string) => scoredOpponents().find((o) => o.id === id)!.score;
const meanOpponent = (cards: Record<string, number>) => {
  const int = ints(1);
  const picks = Array.from({ length: 400 }, () => pickSeasonOpponent(int, cards));
  return picks.reduce((sum, id) => sum + score(id), 0) / picks.length;
};

describe('deck strength', () => {
  it('scores 0-100 from its parts', () => {
    expect(deckStrength({}).score).toBe(0);
    expect(deckStrength({ forest: 60 }).score).toBe(0);
    for (const o of scoredOpponents()) {
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(100);
    }
    const s = deckStrength(counts(deckIds(ARENA_DECKS[0]!)));
    expect(s.score).toBe(Math.round(s.quality + s.removal + s.rares + s.curve));
  });

  it('takes curve points off a deck with far too many lands', () => {
    const deck = counts(deckIds(ARENA_DECKS[0]!));
    const flooded = { ...deck, island: (deck['island'] ?? 0) + 20 };
    expect(deckStrength(flooded).curve).toBeLessThan(deckStrength(deck).curve);
  });

  it('matches weak decks with weak opponents and strong with strong', () => {
    const ranked = [...scoredOpponents()].sort((a, b) => a.score - b.score);
    const weak = ranked[3]!;
    const strong = ranked.at(-4)!;
    const weakMean = meanOpponent(counts(weak.cards));
    const strongMean = meanOpponent(counts(strong.cards));
    expect(Math.abs(weakMean - weak.score)).toBeLessThan(12);
    expect(Math.abs(strongMean - strong.score)).toBeLessThan(12);
    expect(strongMean - weakMean).toBeGreaterThan(25);
  });

  it('never pairs you with the exact same list, and follows its seed', () => {
    const starter = ARENA_DECKS[0]!;
    const cards = counts(deckIds(starter));
    const int = ints(2);
    for (let i = 0; i < 300; i++) expect(pickSeasonOpponent(int, cards)).not.toBe(starter.id);
    expect(pickSeasonOpponent(ints(3), cards)).toBe(pickSeasonOpponent(ints(3), cards));
  });
});
