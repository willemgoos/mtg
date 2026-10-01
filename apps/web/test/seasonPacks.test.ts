import { SCRYFALL, cardDb, slug } from '@mtg/cards';
import FOUNDATIONS_MANIFEST from '../../../packages/cards/src/generated/foundations-manifest.json';
import { createRng } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import {
  buySeasonPack,
  createSeasonSave,
  openSeasonPack,
  SEASON_STARTERS,
  type Counts,
  type Rarity,
  type WildcardMisses,
} from '../src/game/season.ts';
import {
  BLOOMBURROW_SHEETS,
  FOUNDATIONS_SHEETS,
  generateFoundationsPack,
  packGenerator,
  protectedCard,
  wildcardHit,
} from '../src/game/seasonPacks.ts';
import {
  createSeasonRepository,
  SEASON_STORAGE_KEY,
  validateSeasonSave,
} from '../src/game/seasonStorage.ts';

const fresh = () => createSeasonSave('a', 'Test', SEASON_STARTERS[0]!.id, 19, 0);
const misses = (): WildcardMisses => ({ common: 0, uncommon: 0, rareMythic: 0 });

describe('Season Bloomburrow packs', () => {
  it('sells Bloomburrow boosters that open into Bloomburrow cards', () => {
    for (const sheet of Object.values(BLOOMBURROW_SHEETS)) {
      expect(sheet.length).toBeGreaterThan(0);
      for (const id of sheet) expect(SCRYFALL.find((c) => slug(c.name) === id)!.set).toBe('blb');
    }
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'bloomburrow');
    expect(save.packs[0]!.kind).toBe('bloomburrow');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('bloomburrow'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards) expect(SCRYFALL.find((c) => slug(c.name) === id)!.set).toBe('blb');
  });

  it('offers the Bloomburrow decks as starters', () => {
    expect(SEASON_STARTERS.some((d) => d.id === 'blb-forage-and-feast')).toBe(true);
  });
});

describe('Season Foundations packs', () => {
  it('uses unique supported regular Arena identities, not artwork or nonbooster printings', () => {
    expect(FOUNDATIONS_MANIFEST.cards).toHaveLength(517);
    expect(FOUNDATIONS_MANIFEST.specialGuests).toHaveLength(10);
    for (const [rarity, sheet] of Object.entries(FOUNDATIONS_SHEETS)) {
      expect(sheet.length).toBeGreaterThan(0);
      expect(new Set(sheet).size).toBe(sheet.length);
      for (const id of sheet) {
        const c = FOUNDATIONS_MANIFEST.cards.find((c) => c.id === id)!;
        expect(c.regular && c.arena).toBe(true);
        expect(c.rarity).toBe(rarity);
        expect(cardDb.has(id)).toBe(true);
        // Reward accounting and crafting agree with the pack rarity.
        expect(SCRYFALL.find((s) => s.name === c.name)!.rarity).toBe(rarity);
      }
    }
  });
  it('generates deterministic eight-slot packs and advances RNG/misses only in the draft', () => {
    const a = createRng(72),
      b = createRng(72),
      ma = misses(),
      mb = misses();
    const before = structuredClone(a);
    expect(generateFoundationsPack(a, {}, ma)).toEqual(generateFoundationsPack(b, {}, mb));
    expect(a).not.toEqual(before);
    expect(ma).toEqual(mb);
    const pack = generateFoundationsPack(a, {}, ma);
    expect(pack).toHaveLength(8);
    expect(
      pack.filter((r) => r.kind === 'wildcard' && r.rarity === 'common').length,
    ).toBeLessThanOrEqual(1);
    for (const [index, r] of pack.entries()) {
      const rarity =
        r.kind === 'wildcard'
          ? r.rarity
          : FOUNDATIONS_MANIFEST.cards.find((c) => c.id === r.cardId)!.rarity;
      expect(
        index < 5
          ? rarity === 'common'
          : index < 7
            ? rarity === 'uncommon'
            : ['rare', 'mythic'].includes(rarity),
      ).toBe(true);
    }
  });
  it.each(['rare', 'mythic'] as const)(
    'protects %s duplicates within that sheet, including the last missing copy',
    (rarity) => {
      const sheet = FOUNDATIONS_SHEETS[rarity];
      const quantities: Counts = Object.fromEntries(sheet.map((id) => [id, 4]));
      quantities[sheet[0]!] = 3;
      for (let seed = 0; seed < 100; seed++)
        expect(protectedCard(createRng(seed), rarity, quantities)).toBe(sheet[0]);
      quantities[sheet[0]!] = 4;
      expect(sheet).toContain(protectedCard(createRng(1), rarity, quantities));
    },
  );
  it('converts completed sheets to coins/Vault without upgrading rarity or losing rewards', () => {
    const save = buySeasonPack(fresh(), 1);
    for (const sheet of Object.values(FOUNDATIONS_SHEETS))
      for (const id of sheet) save.collection[id] = 4;
    const next = openSeasonPack(save, 1, generateFoundationsPack, 2);
    const bonus = next.lastPack!.bonus!;
    expect(next.vaultPoints - save.vaultPoints).toBe(bonus.vaultPoints);
    expect(next.coins - save.coins).toBe(bonus.coins);
    const expectedCoins = next.lastPack!.rewards.reduce(
      (n, r) =>
        n +
        (r.kind === 'card'
          ? (({ rare: 20, mythic: 40 } as Partial<Record<Rarity, number>>)[
              SCRYFALL.find((c) => c.name === cardDb.get(r.cardId)!.name)!.rarity as Rarity
            ] ?? 0)
          : 0),
      0,
    );
    expect(bonus.coins).toBe(expectedCoins);
    expect(next.collection).toEqual(save.collection);
    expect(validateSeasonSave(next)).toEqual(next);
    expect(openSeasonPack(next, 1, generateFoundationsPack, 3)).toBe(next);
  });
  it('forces wildcard hits at the documented miss boundaries and rejects invalid counters', () => {
    for (const [key, maximum] of [
      ['common', 5],
      ['uncommon', 9],
      ['rareMythic', 29],
    ] as const) {
      const counters = misses();
      counters[key] = maximum - 1;
      expect(wildcardHit(createRng(1), counters, key)).toBe(true);
      expect(counters[key]).toBe(0);
      counters[key] = maximum;
      expect(() => wildcardHit(createRng(1), counters, key)).toThrow();
      const save = fresh();
      save.wildcardMisses = counters;
      expect(() => validateSeasonSave(save)).toThrow();
    }
  });
  it('matches published wildcard averages and 1/7 mythic upgrades in a seeded sample', () => {
    const rng = createRng(9182),
      counters = misses();
    const hits = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
    let highCards = 0,
      mythicCards = 0;
    const samples = 60000;
    for (let i = 0; i < samples; i++) {
      const rewards = generateFoundationsPack(rng, {}, counters);
      for (const r of rewards) if (r.kind === 'wildcard') hits[r.rarity]++;
      const last = rewards[7]!;
      if (last.kind === 'card') {
        highCards++;
        if (FOUNDATIONS_SHEETS.mythic.includes(last.cardId)) mythicCards++;
      }
    }
    for (const [r, mean] of [
      ['common', 3],
      ['uncommon', 5],
      ['rare', 30],
      ['mythic', 30],
    ] as const)
      expect(Math.abs(samples / hits[r] / mean - 1)).toBeLessThan(0.06);
    expect(Math.abs(mythicCards / highCards - 1 / 7)).toBeLessThan(0.01);
  });
  it('restores old saves, persists misses/receipts, and retries failed writes without rerolling', () => {
    let raw: string | null = null;
    let fail = false;
    const repository = createSeasonRepository({
      getItem: () => raw,
      setItem: (key, value) => {
        expect(key).toBe(SEASON_STORAGE_KEY);
        if (fail) throw new Error('quota');
        raw = value;
      },
    });
    repository.create('a', 'Test', SEASON_STARTERS[0]!.id, 19, 0);
    repository.update('a', (s) => buySeasonPack(s, 1));
    const before = raw;
    const expected = openSeasonPack(repository.load().saves[0]!, 1, generateFoundationsPack, 2);
    fail = true;
    expect(() =>
      repository.update('a', (s) => openSeasonPack(s, 1, generateFoundationsPack, 2)),
    ).toThrow('could not be saved');
    expect(raw).toBe(before);
    fail = false;
    repository.update('a', (s) => openSeasonPack(s, 1, generateFoundationsPack, 2));
    expect(repository.load().saves[0]).toEqual(expected);
    const backup = repository.exportSave('a');
    repository.importSave(backup, 'b');
    expect(repository.load().saves[1]!.wildcardMisses).toEqual(expected.wildcardMisses);
    expect(repository.load().saves[1]!.lastPack).toEqual(expected.lastPack);
  });
});
