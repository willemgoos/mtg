import { describe, expect, it } from 'vitest';
import {
  autoBasics,
  deckStats,
  hasType,
  landTarget,
  sortEntries,
} from '../src/game/deckBuilderLogic.ts';
import { cardEntries } from '../src/game/deckView.ts';

const entries = (cards: [string, number][]) => cardEntries(cards);

describe('deck builder logic', () => {
  it('uses Arena land counts', () => {
    expect(landTarget(40)).toBe(17);
    expect(landTarget(60)).toBe(24);
  });

  it('splits basics by mana symbols and fills the land target', () => {
    const deck = entries([
      ['Llanowar Elves', 6],
      ['Shivan Dragon', 2],
    ]);
    const b = autoBasics(deck, 40);
    expect(b.G + b.R + b.W + b.U + b.B).toBe(17);
    expect(b.G).toBeGreaterThan(b.R);
    expect(b.W + b.U + b.B).toBe(0);
    expect(b.R).toBeGreaterThanOrEqual(2);
  });

  it('counts nonbasic lands against the target', () => {
    const deck = entries([
      ['Llanowar Elves', 4],
      ['Evolving Wilds', 2],
    ]);
    const b = autoBasics(deck, 40);
    expect(b.G).toBe(15);
  });

  it('falls back to the deck colours when there are no symbols', () => {
    const b = autoBasics([], 60, ['W', 'U']);
    expect(b.W + b.U).toBe(24);
    expect(b.W).toBe(12);
  });

  it('computes stats', () => {
    const s = deckStats(
      entries([
        ['Llanowar Elves', 3],
        ['Shivan Dragon', 1],
        ['Forest', 5],
      ]),
    );
    expect(s).toMatchObject({ cards: 9, creatures: 4, spells: 0, lands: 5 });
    expect(s.curve[0]!.creatures).toBe(3);
    expect(s.curve[5]!.creatures).toBe(1);
    expect(s.symbols.G).toBe(3);
    expect(s.symbols.R).toBe(2);
  });

  it('sorts by name, mana value and newest', () => {
    const es = entries([
      ['Shivan Dragon', 1],
      ['Llanowar Elves', 1],
      ['Forest', 1],
    ]);
    expect(sortEntries(es, 'name').map((e) => e.name)).toEqual([
      'Forest',
      'Llanowar Elves',
      'Shivan Dragon',
    ]);
    expect(sortEntries(es, 'cost').map((e) => e.name)).toEqual([
      'Llanowar Elves',
      'Shivan Dragon',
      'Forest',
    ]);
    expect(sortEntries(es, 'newest', new Set(['Shivan Dragon']))[0]!.name).toBe('Shivan Dragon');
    expect(hasType(es[0]!, 'Creature')).toBe(true);
  });
});
