import { describe, expect, it } from 'vitest';
import {
  BEHAVIORS,
  CARDS,
  cardDb,
  deckIds,
  GREEN_POOL,
  MONO_GREEN,
  MONO_RED,
  parseManaCost,
  parseTypeLine,
  RED_POOL,
  SCRYFALL,
} from '../src/index.ts';

/** Oracle text minus reminder text and lines that are only keywords. */
function rulesText(oracle: string, keywords: string[]): string {
  const kw = new Set(keywords.map((k) => k.toLowerCase()));
  return oracle
    .replace(/\([^)]*\)/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.split(/,\s*/).every((w) => kw.has(w.trim().toLowerCase())))
    .join('\n');
}

describe('card data', () => {
  it('has Scryfall data for every card in the pool', () => {
    const names = SCRYFALL.map((c) => c.name);
    expect(names.sort()).toEqual([...RED_POOL, ...GREEN_POOL].sort());
    for (const c of SCRYFALL) expect(c.image?.normal).toMatch(/^https:\/\/cards\.scryfall\.io\//);
  });

  it('every card with rules text beyond keywords has a behavior', () => {
    const missing = SCRYFALL.filter(
      (c) =>
        rulesText(c.oracleText, c.keywords) &&
        !c.typeLine.startsWith('Basic') &&
        !BEHAVIORS[c.name],
    ).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  it('no behavior is defined for a card outside the pool', () => {
    const names = new Set(SCRYFALL.map((c) => c.name));
    expect(Object.keys(BEHAVIORS).filter((n) => !names.has(n))).toEqual([]);
  });

  it('spells have effects; permanents are typed correctly', () => {
    for (const c of CARDS) {
      if (c.types.includes('Instant') || c.types.includes('Sorcery'))
        expect(c.spell, c.name).toBeDefined();
      if (c.types.includes('Creature')) expect(c.power, c.name).toBeTypeOf('number');
    }
  });

  it('parses mana costs and type lines', () => {
    expect(parseManaCost('{2}{G}{G}')).toEqual({ generic: 2, colored: { G: 2 } });
    expect(parseTypeLine('Basic Land — Forest')).toEqual({
      supertypes: ['Basic'],
      types: ['Land'],
      subtypes: ['Forest'],
    });
    expect(cardDb.get('shivan-dragon')).toMatchObject({
      power: 5,
      toughness: 5,
      keywords: ['flying'],
    });
    expect(cardDb.get('forest')?.abilities[0]).toEqual({
      kind: 'mana',
      cost: { tapSelf: true },
      produces: 'G',
    });
  });

  it('decks are 60 cards, legal (max 4 non-basic copies) and only use pool cards', () => {
    for (const d of [MONO_RED, MONO_GREEN]) {
      const ids = deckIds(d);
      expect(ids, d.name).toHaveLength(60);
      for (const id of ids) expect(cardDb.has(id), id).toBe(true);
      for (const [name, n] of d.cards)
        if (!['Mountain', 'Forest'].includes(name)) expect(n).toBeLessThanOrEqual(4);
    }
  });
});
