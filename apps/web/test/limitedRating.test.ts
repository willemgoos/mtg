import { SCRYFALL } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  BASICS,
  type Build,
  type Counts,
  LANDS_PER_40,
  type PackSet,
  rollPack,
  size,
  suggestDeck,
} from '../src/game/expedition.ts';
import { rateCard } from '../src/game/limitedRating.ts';

const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const SETS: PackSet[] = ['fdn', 'blb', 'msh', 'fin', 'stx', 'sos', 'fra'];
const isLand = (n: string) => card.get(n)!.typeLine.includes('Land');
const isBasic = (n: string) => Object.values(BASICS).includes(n);

const PAIRS = ['WU', 'WB', 'WR', 'WG', 'UB', 'UR', 'UG', 'BR', 'BG', 'RG'].map((p) => [...p]);
/** Every coloured symbol in the cost has a colour among these (hybrid: either). */
const castableWith = (name: string, colors: string[]) =>
  [...card.get(name)!.manaCost.matchAll(/\{([^}]+)\}/g)].every(([, sym]) => {
    const needs = [...'WUBRG'].filter((c) => sym!.includes(c));
    return !needs.length || needs.some((c) => colors.includes(c));
  });

/** Six boosters, the way a Sealed pool is opened. */
function sealedPool(set: PackSet, seed: number): Build {
  const side: Counts = {};
  for (let i = 0; i < 6; i++)
    for (const n of rollPack({ kind: 'booster' }, seed * 100 + i, 0, set))
      if (!isBasic(n)) side[n] = (side[n] ?? 0) + 1;
  return { main: {}, side, opened: 6, packs: [], fresh: [] };
}

describe('suggestDeck on sealed pools', () => {
  for (const set of SETS) {
    it(`builds a sensible 40 from six ${set} boosters`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const b = sealedPool(set, seed);
        const { main, side } = suggestDeck(b);
        expect(size(main)).toBe(40);
        const cards = Object.entries(main);
        const lands = cards.filter(([n]) => isLand(n)).reduce((k, [, c]) => k + c, 0);
        expect(lands).toBeGreaterThanOrEqual(16);
        expect(lands).toBeLessThanOrEqual(18);
        expect(lands).toBe(LANDS_PER_40);

        // Colours: two, or three with a splash of at most three cards.
        const spells = cards.filter(([n]) => !isLand(n));
        // Some colour pair casts all but at most three of the spells (a splash).
        const offPair = Math.min(
          ...PAIRS.map((p) =>
            spells.filter(([n]) => !castableWith(n, p)).reduce((k, [, c]) => k + c, 0),
          ),
        );
        expect(offPair).toBeLessThanOrEqual(3);

        // Nothing lost: deck plus sideboard hold the whole pool (basics aside).
        const nonBasic = (c: Counts) =>
          Object.entries(c)
            .filter(([n]) => !isBasic(n))
            .reduce((k, [, v]) => k + v, 0);
        expect(nonBasic(main) + nonBasic(side)).toBe(nonBasic(b.side));
        for (const [n, k] of Object.entries(b.side))
          expect((main[n] ?? 0) + (side[n] ?? 0)).toBe(k);

        // A pool of 72 cards has plenty of creatures to choose from.
        const creatures = spells
          .filter(([n]) => card.get(n)!.typeLine.includes('Creature'))
          .reduce((k, [, c]) => k + c, 0);
        const available = Object.entries(b.side)
          .filter(([n]) => card.get(n)!.typeLine.includes('Creature'))
          .reduce((k, [, c]) => k + c, 0);
        expect(creatures).toBeGreaterThanOrEqual(Math.min(8, available));
        expect(creatures).toBeLessThanOrEqual(19);
        // Few expensive cards.
        const big = spells
          .filter(
            ([n]) =>
              (card.get(n)!.manaCost.match(/\d+/g) ?? []).reduce((a, x) => a + Number(x), 0) >= 6,
          )
          .reduce((k, [, c]) => k + c, 0);
        expect(big).toBeLessThanOrEqual(5);
      }
    });
  }

  it('is deterministic and keeps the pool in the sideboard', () => {
    const b = sealedPool('fdn', 3);
    expect(suggestDeck(b)).toEqual(suggestDeck(b));
    const split = suggestDeck({ main: b.side, side: {}, opened: 6, packs: [], fresh: [] });
    expect(split.main).toEqual(suggestDeck(b).main);
  });
});

describe('rateCard', () => {
  const rate = (name: string) => {
    expect(card.has(name), name).toBe(true);
    return rateCard(name);
  };

  it('puts removal and bombs above vanilla commons', () => {
    const vanilla = rate('Three Tree Mascot');
    expect(rate('Banishing Light')).toBeGreaterThan(vanilla + 0.8);
    expect(rate("Hero's Downfall")).toBeGreaterThan(vanilla + 0.8);
    expect(rate('Lyra Dawnbringer')).toBeGreaterThan(rate('Banishing Light'));
    expect(rate('Vivien Reid')).toBeGreaterThan(rate('Banishing Light'));
  });

  it('values efficiency and evasion', () => {
    expect(rate('Obliterating Bolt')).toBeGreaterThan(rate('Mystical Teachings'));
    expect(rate('Lyra Dawnbringer')).toBeGreaterThan(rate('Mystical Teachings'));
  });

  it('rates lands and unknown names as zero, and a back face like its front', () => {
    expect(rateCard('Plains')).toBe(0);
    expect(rateCard('Not A Real Card')).toBe(0);
    const dfc = SCRYFALL.find((c) => c.front && card.has(c.front));
    if (dfc) expect(rateCard(dfc.name)).toBe(rateCard(dfc.front!));
  });

  it('keeps every card in range', () => {
    for (const c of SCRYFALL) {
      const r = rateCard(c.name);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(5);
    }
  });
});
