import { describe, expect, it } from 'vitest';
import { allCards, NO_FILTERS, parseQuery, search } from '../src/game/cardSearch.ts';

const names = (q: Partial<typeof NO_FILTERS>) =>
  search({ ...NO_FILTERS, ...q }, 'name').map((c) => c.card.name);

describe('card search', () => {
  it('lists every front face once', () => {
    const all = allCards();
    expect(new Set(all.map((c) => c.card.name)).size).toBe(all.length);
    expect(all.some((c) => c.card.front)).toBe(false);
  });

  it('parses prefixes, phrases and negation', () => {
    expect(parseQuery('t:goblin -o:"draw a card" haste')).toEqual([
      { field: 'type', text: 'goblin', negate: false },
      { field: 'text', text: 'draw a card', negate: true },
      { field: 'any', text: 'haste', negate: false },
    ]);
  });

  it('filters by name, type and keyword', () => {
    expect(names({ query: 'llanowar elves' })).toContain('Llanowar Elves');
    const goblins = search({ ...NO_FILTERS, query: 't:goblin' }, 'name');
    expect(goblins.length).toBeGreaterThan(0);
    expect(goblins.every((c) => c.typeText.includes('goblin'))).toBe(true);
    const flyers = search({ ...NO_FILTERS, keyword: 'Flying' }, 'name');
    expect(flyers.every((c) => c.card.keywords.includes('Flying') || c.back?.keywords.includes('Flying'))).toBe(true);
  });

  it('matches colours including or exactly', () => {
    const any = search({ ...NO_FILTERS, colors: new Set(['R']) }, 'name');
    const exact = search({ ...NO_FILTERS, colors: new Set(['R']), colorMode: 'exact' }, 'name');
    expect(any.every((c) => c.colors.includes('R'))).toBe(true);
    expect(exact.every((c) => c.colors.join() === 'R')).toBe(true);
    expect(any.length).toBeGreaterThan(exact.length);
    const gold = search({ ...NO_FILTERS, colors: new Set(['M']) }, 'name');
    expect(gold.every((c) => c.colors.length > 1)).toBe(true);
  });

  it('buckets mana value 7 and up', () => {
    const big = search({ ...NO_FILTERS, costs: new Set([7]) }, 'cost');
    expect(big.length).toBeGreaterThan(0);
    expect(big.every((c) => c.manaValue >= 7)).toBe(true);
  });
});
