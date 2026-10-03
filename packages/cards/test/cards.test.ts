import { describe, expect, it } from 'vitest';
import {
  BEHAVIORS,
  BLACK_POOL,
  BLOOMBURROW_DECKS,
  BLOOMBURROW_POOL,
  MARVEL_DECKS,
  MARVEL_POOL,
  BLUE_POOL,
  CARDS,
  cardDb,
  DECKS,
  deckIds,
  FINAL_FANTASY_DECKS,
  FINAL_FANTASY_POOL,
  STRIXHAVEN_POOL,
  STRIXHAVEN_QUANDRIX_DECKS,
  GREEN_POOL,
  LAND_POOL,
  MARVEL_BRAWL_POOL,
  OTHER_POOL,
  PLAYABLE_DECKS,
  parseManaCost,
  parseTypeLine,
  RED_POOL,
  WHITE_POOL,
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
    expect(names.sort()).toEqual(
      [
        ...RED_POOL,
        ...GREEN_POOL,
        ...WHITE_POOL,
        ...BLUE_POOL,
        ...BLACK_POOL,
        ...OTHER_POOL,
        ...LAND_POOL,
        ...BLOOMBURROW_POOL,
        ...MARVEL_POOL,
        // Back faces of double-faced cards come with their fronts.
        ...SCRYFALL.filter((c) => c.front).map((c) => c.name),
        ...MARVEL_BRAWL_POOL,
        ...FINAL_FANTASY_POOL,
        ...STRIXHAVEN_POOL,
      ].sort(),
    );
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
        expect(c.spell ?? c.modes ?? c.pawprints, c.name).toBeDefined();
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

  it('decks are 60 cards and legal (max 4 non-basic copies), with unique ids', () => {
    const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    for (const d of DECKS.filter((x) => x.series !== 'brawl')) {
      expect(deckIds(d), d.name).toHaveLength(60);
      expect(
        d.cards.map(([name]) => name),
        d.name,
      ).toContain(d.face);
      for (const [name, n] of d.cards)
        if (!basics.includes(name)) expect(n, name).toBeLessThanOrEqual(4);
    }
    expect(new Set(DECKS.map((d) => d.id)).size).toBe(DECKS.length);
  });

  it('playable decks only use implemented cards', () => {
    expect(PLAYABLE_DECKS.map((d) => d.id).sort()).toEqual(
      [
        'arcane-aerialists',
        'cat-attack',
        'learn-from-the-land',
        'might-of-the-legion',
        'morbid-machinations',
        'path-of-power',
        'reckless-raid',
        'vampiric-hunger',
        'wondrous-wizardry',
        'graveyard-gifts',
        'keep-the-peace',
        'goblins-everywhere',
        'large-and-in-charge',
        ...BLOOMBURROW_DECKS.map((d) => d.id),
        ...MARVEL_DECKS.map((d) => d.id),
        ...FINAL_FANTASY_DECKS.map((d) => d.id),
        ...STRIXHAVEN_QUANDRIX_DECKS.map((d) => d.id),
      ].sort(),
    );
    for (const d of PLAYABLE_DECKS)
      for (const id of deckIds(d)) expect(cardDb.has(id), id).toBe(true);
  });

  it('two-colour lands enter tapped and tap for either colour', () => {
    const produces = (id: string) =>
      cardDb.get(id)!.abilities.flatMap((a) => (a.kind === 'mana' ? [a.produces] : []));
    for (const id of ['gruul-guildgate', 'rugged-highlands', 'temple-of-abandon']) {
      expect(cardDb.get(id)?.entersTapped, id).toBe(true);
      expect(produces(id), id).toEqual(['R', 'G']);
    }
  });
});
