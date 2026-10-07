import { scryfallById, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { BASICS, basicColor } from '../src/game/deckBuilderLogic.ts';
import { colourPairs } from '../src/game/colourPairs.ts';
import { completionHints } from '../src/game/deckCompletion.ts';
import { rollPack, spellColors, suggestDeck } from '../src/game/expedition.ts';
import { rateCard } from '../src/game/limitedRating.ts';

type Counts = Record<string, number>;
const sum = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);
const info = (n: string) => scryfallById.get(slug(n))!;
const isLand = (n: string) => /\bLand\b/.test(info(n)?.typeLine ?? '') || basicColor.has(n);

/** A pool of 8 packs across sets (seeded), as an owned collection. */
function pool(seed = 7): Counts {
  const out: Counts = {};
  const sets = ['fdn', 'blb', 'fdn', 'blb', 'fdn', 'blb', 'fdn', 'blb'] as const;
  sets.forEach((set, i) => {
    for (const n of rollPack({ kind: 'booster' }, seed + i, 0, set, { noBasic: true }))
      out[n] = (out[n] ?? 0) + 1;
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

/** A pool where white and blue are thin (8 cards each) but black is deep; the deck so far is white-blue. */
function thin(seed: number, set: 'fdn' | 'blb' = 'fdn') {
  const all: Counts = {};
  for (let i = 0; i < 8; i++)
    for (const n of rollPack({ kind: 'booster' }, seed + i, 0, set, { noBasic: true }))
      all[n] = (all[n] ?? 0) + 1;
  const mono = (n: string, c: string) => info(n).manaCost.includes(`{${c}}`);
  const nonland = Object.keys(all).filter((n) => !isLand(n));
  const keep = (c: string) =>
    nonland
      .filter((n) => mono(n, c) && !/[WUBRG]\/|\{[WUBRG]\}.*\{[WUBRG]\}/.test(info(n).manaCost))
      .sort((a, b) => rateCard(b) - rateCard(a))
      .slice(0, 8);
  const white = keep('W');
  const blue = keep('U');
  const pool: Counts = {};
  for (const n of nonland) {
    const w = /\{[WU]\}/.test(info(n).manaCost);
    if (!w || white.includes(n) || blue.includes(n)) pool[n] = 1;
  }
  const deck: Counts = { [white[0]!]: 1, [white[1]!]: 1, [blue[0]!]: 1, [blue[1]!]: 1 };
  for (const n of Object.keys(deck)) delete pool[n];
  return { deck, pool };
}

describe('splash hints', () => {
  it('suggests a few single-pip cards of a third colour when two colours are thin', () => {
    let found = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { deck, pool: p } = thin(seed);
      const hints = completionHints({ deck, pool: p, min: 40, basics: true });
      const splash = hints.filter((h) => h.tag === 'Splash');
      if (!splash.length) continue;
      found++;
      expect(splash.reduce((n, h) => n + h.count, 0)).toBeLessThanOrEqual(3);
      const main = ['W', 'U'];
      const third = new Set<string>();
      for (const h of splash) {
        expect(h.reason).toMatch(/^Splash \((?:white|blue|black|red|green)\): /);
        const syms = [...info(h.name).manaCost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
        const off = syms.filter((x) => /^[WUBRG]$/.test(x) && !main.includes(x));
        expect(off.length).toBe(1);
        third.add(off[0]!);
        expect(rateCard(h.name)).toBeGreaterThanOrEqual(3);
      }
      expect(third.size).toBe(1);
      // Land hints include the splash colour's basics, and the total is still 40.
      const colour = [...third][0] as keyof typeof BASICS;
      const splashLands = hints.filter((h) => h.land && h.splash);
      expect(splashLands.some((h) => h.name === BASICS[colour])).toBe(true);
      expect(sum(apply(deck, hints))).toBe(40);
      const lands = hints.filter((h) => h.land).reduce((n, h) => n + h.count, 0);
      expect(lands).toBeGreaterThanOrEqual(12);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('does not splash when nothing off-colour is worth it', () => {
    const { deck, pool: rest } = partial(10);
    // Keep only cards the deck's colours (blue-black) can cast: plenty of them, nothing to splash.
    const own: Counts = {};
    for (const [n, k] of Object.entries(rest))
      if ((info(n)?.colors ?? []).every((c) => c === 'U' || c === 'B')) own[n] = k;
    const hints = completionHints({ deck, pool: own, min: 40, basics: true });
    expect(hints.some((h) => h.splash || h.tag === 'Splash')).toBe(false);
    expect(sum(apply(deck, hints))).toBe(40);
  });

  it('says so when even a splash cannot fill the deck: the best of the rest', () => {
    const p: Counts = {};
    for (const n of Object.keys(thin(2).pool).slice(0, 10)) p[n] = 1;
    const hints = completionHints({ deck: {}, pool: p, min: 40, basics: true });
    const spells = hints.filter((h) => !h.land);
    expect(spells.length).toBeGreaterThan(0);
    expect(sum(apply({}, hints))).toBeLessThanOrEqual(40);
    // Nothing is left out that could be played: every pool card is suggested.
    expect(spells.reduce((n, h) => n + h.count, 0)).toBe(Object.keys(p).length);
  });
});

describe('colourPairs', () => {
  const pools: [string, 'fdn' | 'blb', number][] = [
    ['fdn 7', 'fdn', 7],
    ['fdn 99', 'fdn', 99],
    ['blb 31337', 'blb', 31337],
    ['blb 5', 'blb', 5],
  ];
  for (const [label, set, seed] of pools)
    it(`ranks pairs sensibly (${label})`, () => {
      const p: Counts = {};
      for (let i = 0; i < 6; i++)
        for (const n of rollPack({ kind: 'booster' }, seed + i, 0, set, { noBasic: true }))
          p[n] = (p[n] ?? 0) + 1;
      const pairs = colourPairs(p);
      expect(pairs).toHaveLength(3);
      expect(pairs[0]!.playables).toBeGreaterThanOrEqual(15);
      for (let i = 1; i < pairs.length; i++)
        expect(pairs[i - 1]!.score).toBeGreaterThanOrEqual(pairs[i]!.score);
      for (const a of pairs) {
        expect(a.colors).toHaveLength(2);
        expect(a.name).not.toBe('Colourless');
        expect(a.creatures).toBeLessThanOrEqual(a.playables);
        expect(a.removal).toBeLessThanOrEqual(a.playables);
        expect(a.standouts.length).toBeLessThanOrEqual(3);
        for (const n of a.standouts) expect(p[n]).toBeGreaterThan(0);
        if (a.playables >= 23) expect(a.splash).toBeNull();
      }
      // The top pair is the one suggestDeck builds.
      const built = suggestDeck({ main: {}, side: p, opened: 0, packs: [], fresh: [] });
      const top = pairs[0]!.colors;
      const used = [...spellColors(built.main).keys()];
      expect(top.every((c) => used.includes(c))).toBe(true);
    });

  it('flags a splash when a pair is short of playables', () => {
    const { pool: p } = thin(3);
    const pairs = colourPairs(p, { top: 10 });
    const wu = pairs.find((x) => x.colors.join('') === 'WU');
    expect(wu).toBeDefined();
    expect(wu!.playables).toBeLessThan(23);
  });

  it('suggestDeck with a forced pair uses only those colours (plus a light splash)', () => {
    const p = pool(21);
    for (const colors of [
      ['W', 'U'],
      ['B', 'R'],
      ['G', 'W'],
    ] as const) {
      const { main } = suggestDeck(
        { main: {}, side: p, opened: 0, packs: [], fresh: [] },
        { colors },
      );
      expect(sum(main)).toBe(40);
      const used = [...spellColors(main).entries()].filter(([, k]) => k > 0).map(([c]) => c);
      const off = used.filter((c) => !(colors as readonly string[]).includes(c));
      expect(off.length).toBeLessThanOrEqual(1);
      for (const c of colors) expect(used).toContain(c);
    }
  });
});
