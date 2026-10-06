import { scryfallById, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { BASICS, basicColor } from '../src/game/deckBuilderLogic.ts';
import { completionHints } from '../src/game/deckCompletion.ts';
import { rollPack, spellColors, suggestDeck } from '../src/game/expedition.ts';

type Counts = Record<string, number>;
const sum = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);
const info = (n: string) => scryfallById.get(slug(n))!;
const isLand = (n: string) => /\bLand\b/.test(info(n)?.typeLine ?? '') || basicColor.has(n);

/** A pool of 8 packs across sets (seeded), as an owned collection. */
function pool(seed = 7): Counts {
  const out: Counts = {};
  const sets = ['fdn', 'blb', 'fdn', 'blb', 'fdn', 'blb', 'fdn', 'blb'] as const;
  sets.forEach((set, i) => {
    for (const n of rollPack({ kind: 'booster' }, seed + i, 0, set)) out[n] = (out[n] ?? 0) + 1;
  });
  return out;
}

/** Take a pool, build its suggested 40 and cut it down to about `keep` cards. */
function partial(keep: number) {
  const p = pool();
  const { main } = suggestDeck({ main: {}, side: p, opened: 0, packs: [], fresh: [] });
  const deck: Counts = {};
  let n = 0;
  // Keep the first spells and lands alternately so both are short.
  for (const [name, k] of Object.entries(main)) {
    const take = Math.min(k, keep - n);
    if (take > 0) deck[name] = take;
    n += Math.max(0, take);
  }
  const rest: Counts = { ...p };
  for (const [name, k] of Object.entries(deck)) {
    if (basicColor.has(name)) continue;
    rest[name] = (rest[name] ?? 0) - k;
    if (rest[name]! <= 0) delete rest[name];
  }
  return { deck, pool: rest };
}

const apply = (deck: Counts, hints: ReturnType<typeof completionHints>) => {
  const out = { ...deck };
  for (const h of hints) out[h.name] = (out[h.name] ?? 0) + h.count;
  return out;
};

describe('completionHints', () => {
  it('fills a part-built Limited deck to exactly 40 with about 17 lands, on colour', () => {
    const { deck, pool: rest } = partial(33);
    expect(sum(deck)).toBe(33);
    const hints = completionHints({ deck, pool: rest, min: 40, basics: true });
    const full = apply(deck, hints);
    expect(sum(full)).toBe(40);
    const lands = Object.entries(full).reduce((a, [n, k]) => a + (isLand(n) ? k : 0), 0);
    expect(lands).toBeGreaterThanOrEqual(15);
    expect(lands).toBeLessThanOrEqual(18);
    // Spells are in the deck's colours: nothing needs a colour the deck doesn't play.
    const colours = [...spellColors(deck).keys()];
    for (const h of hints.filter((x) => !x.land)) {
      for (const [, sym] of info(h.name).manaCost.matchAll(/\{([^}]+)\}/g)) {
        const needs = sym!.split('/').filter((c) => 'WUBRG'.includes(c));
        if (needs.length) expect(needs.some((c) => colours.includes(c as never))).toBe(true);
      }
      expect(h.reason).not.toBe('');
    }
  });

  it('never suggests more copies than the pool has', () => {
    const { deck, pool: rest } = partial(25);
    const hints = completionHints({ deck, pool: rest, min: 40, basics: true });
    for (const h of hints)
      if (!basicColor.has(h.name)) expect(h.count).toBeLessThanOrEqual(rest[h.name] ?? 0);
  });

  it('gives nothing for a full deck', () => {
    const { deck, pool: rest } = partial(40);
    expect(sum(deck)).toBe(40);
    expect(completionHints({ deck, pool: rest, min: 40, basics: true })).toEqual([]);
    expect(completionHints({ deck: apply(deck, []), pool: rest, min: 30, basics: true })).toEqual(
      [],
    );
  });

  it('starts from nothing: picks a colour pair and 40 cards', () => {
    const p = pool(11);
    const hints = completionHints({ deck: {}, pool: p, min: 40, basics: true });
    expect(sum(apply({}, hints))).toBe(40);
    expect(hints.some((h) => h.land)).toBe(true);
    expect(hints.some((h) => !h.land)).toBe(true);
  });

  it('Season-style: 60 cards, no basics in the pool, only what is owned', () => {
    const p = pool(3);
    for (const [n, k] of Object.entries(pool(5))) p[n] = (p[n] ?? 0) + k;
    const hints = completionHints({ deck: {}, pool: p, min: 60, basics: false });
    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) {
      expect(basicColor.has(h.name)).toBe(false);
      expect(h.count).toBeLessThanOrEqual(p[h.name]!);
      expect(h.count).toBeLessThanOrEqual(4);
    }
    expect(sum(apply({}, hints))).toBeLessThanOrEqual(60);
  });

  it('suggests basics split by the deck colours, only with basics on', () => {
    const { deck, pool: rest } = partial(30);
    const without = completionHints({ deck, pool: rest, min: 40, basics: false });
    expect(without.every((h) => !basicColor.has(h.name))).toBe(true);
    const withBasics = completionHints({ deck, pool: rest, min: 40, basics: true });
    const colours = new Set([...spellColors(deck).keys()]);
    for (const h of withBasics.filter((x) => basicColor.has(x.name))) {
      const c = [...Object.entries(BASICS)].find(([, n]) => n === h.name)![0];
      expect(colours.has(c as never)).toBe(true);
    }
  });

  it('treats a hybrid card by the colours the deck plays', () => {
    const hybrid = (pair: string) =>
      [...scryfallById.values()].find(
        (c) =>
          c.manaCost.includes(`{${pair}}`) &&
          !/\{[WUBRG]\}/.test(c.manaCost) &&
          !c.typeLine.includes('Land'),
      );
    const wb = hybrid('W/B');
    const ur = hybrid('U/R');
    expect(wb).toBeDefined();
    expect(ur).toBeDefined();
    // A black deck can cast a {W/B} card; it cannot cast a {U/R} one.
    const black = [...scryfallById.values()].find(
      (c) => /^\{1\}\{B\}$/.test(c.manaCost) && c.typeLine.includes('Creature'),
    )!;
    const hints = completionHints({
      deck: { Swamp: 8, [black.name]: 2 },
      pool: { [wb!.name]: 2, [ur!.name]: 2 },
      min: 12,
      basics: false,
    });
    expect(hints.map((h) => h.name)).toContain(wb!.name);
    expect(hints.map((h) => h.name)).not.toContain(ur!.name);
  });
});
