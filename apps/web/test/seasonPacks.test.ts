import { SCRYFALL, cardDb, slug } from '@mtg/cards';
import { FRA_BOOSTER_LIST } from '../../../packages/cards/src/fra/booster-list.ts';
import { SOS_BOOSTER_LIST } from '../../../packages/cards/src/sos/booster-list.ts';
import { STX_BOOSTER_LIST } from '../../../packages/cards/src/stx/booster-list.ts';
import { SOA_ARCHIVE_LIST } from '../../../packages/cards/src/sos/archive-list.ts';
import { STA_ARCHIVE_LIST } from '../../../packages/cards/src/stx/archive-list.ts';
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
  FINAL_FANTASY_SHEETS,
  MARVEL_SHEETS,
  REALITY_FRACTURE_SHEETS,
  SECRETS_SHEETS,
  SECRETS_ARCHIVE_SHEETS,
  STRIXHAVEN_ARCHIVE_SHEETS,
  STRIXHAVEN_SHEETS,
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
const boosterNames = new Set(STX_BOOSTER_LIST.map(([n]) => n));
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

  it('sells Marvel Super Heroes boosters too, and the Marvel decks as starters', () => {
    for (const sheet of Object.values(MARVEL_SHEETS)) {
      expect(sheet.length).toBeGreaterThan(0);
      for (const id of sheet) expect(SCRYFALL.find((c) => slug(c.name) === id)!.set).toBe('msh');
    }
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'marvel');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('marvel'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    for (const id of cards) expect(SCRYFALL.find((c) => slug(c.name) === id)!.set).toBe('msh');
    expect(SEASON_STARTERS.some((d) => d.id === 'msh-heroes-unite')).toBe(true);
  });

  it('builds the Strixhaven sheets from the full booster list, reprints included', () => {
    const tally = (r: string) => STX_BOOSTER_LIST.filter(([, x]) => x === r).length;
    expect(STX_BOOSTER_LIST).toHaveLength(280);
    expect(['common', 'uncommon', 'rare', 'mythic'].map(tally)).toEqual([110, 80, 69, 21]);
    // The five basics are in the list but not in our sheets.
    expect(Object.values(STRIXHAVEN_SHEETS).map((s) => s.length)).toEqual([105, 80, 69, 21]);
    expect(STRIXHAVEN_SHEETS.uncommon).toContain(slug('Rip Apart'));
  });

  it('sells Strixhaven boosters too, and the Strixhaven decks as starters', () => {
    for (const [rarity, sheet] of Object.entries(STRIXHAVEN_SHEETS)) {
      expect(sheet.length, rarity).toBeGreaterThan(0);
      for (const id of sheet) {
        const c = SCRYFALL.find((x) => slug(x.name) === id)!;
        expect(boosterNames.has(c.name), c.name).toBe(true);
        expect(STX_BOOSTER_LIST.find(([n]) => n === c.name)![1]).toBe(rarity);
      }
    }
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'strixhaven');
    expect(save.packs[0]!.kind).toBe('strixhaven');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('strixhaven'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards)
      expect(
        boosterNames.has(SCRYFALL.find((c) => slug(c.name) === id)!.name) ||
          STA_ARCHIVE_LIST.some(([n]) => slug(n) === id),
      ).toBe(true);
    expect(SEASON_STARTERS.some((d) => d.id === 'stx-lorehold-reckoning')).toBe(true);
  });

  it('builds the Secrets of Strixhaven sheets from the main set, basics left out', () => {
    const tally = (r: string) => SOS_BOOSTER_LIST.filter(([, x]) => x === r).length;
    expect(['common', 'uncommon', 'rare', 'mythic'].map(tally)).toEqual([86, 100, 60, 20]);
    expect(Object.values(SECRETS_SHEETS).map((s) => s.length)).toEqual([86, 100, 60, 20]);
  });

  it('sells Secrets of Strixhaven boosters too, and the SOS decks as starters', () => {
    const names = new Map(SOS_BOOSTER_LIST);
    for (const [rarity, sheet] of Object.entries(SECRETS_SHEETS))
      for (const id of sheet)
        expect(names.get(SCRYFALL.find((x) => slug(x.name) === id)!.name), id).toBe(rarity);
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'secrets');
    expect(save.packs[0]!.kind).toBe('secrets');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('secrets'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    expect(cards.length).toBeGreaterThan(0);
    for (const id of cards)
      expect(
        names.has(SCRYFALL.find((c) => slug(c.name) === id)!.name) ||
          SOA_ARCHIVE_LIST.some(([n]) => slug(n) === id),
      ).toBe(true);
    expect(SEASON_STARTERS.some((d) => d.id === 'sos-lorehold-spirit-archive')).toBe(true);
  });

  it('puts one Mystical Archive card (by archive rarity) in each Strixhaven and Secrets of Strixhaven pack, in place of a common', () => {
    const sets = [
      ['strixhaven', STRIXHAVEN_SHEETS, STRIXHAVEN_ARCHIVE_SHEETS, STA_ARCHIVE_LIST],
      ['secrets', SECRETS_SHEETS, SECRETS_ARCHIVE_SHEETS, SOA_ARCHIVE_LIST],
    ] as const;
    for (const [kind, main, archive, list] of sets) {
      expect(archive.common).toEqual([]);
      expect(Object.values(archive).reduce((n, s) => n + s.length, 0)).toBe(list.length);
      const rarityByName = new Map<string, string>(list);
      const inArchive = new Set(Object.values(archive).flat());
      const rng = createRng(11);
      const seen: Record<string, number> = { uncommon: 0, rare: 0, mythic: 0 };
      for (let i = 0; i < 300; i++) {
        const pack = packGenerator(kind)(rng, {}, misses());
        expect(pack).toHaveLength(8);
        const cards = pack.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
        const picked = cards.filter((id) => inArchive.has(id));
        expect(picked).toHaveLength(1);
        const name = SCRYFALL.find((c) => slug(c.name) === picked[0])!.name;
        seen[rarityByName.get(name)!]!++;
        // The other cards come from the main sheets: one fewer common than a pack without the slot.
        const mains = cards.filter((id) => Object.values(main).some((s) => s.includes(id)));
        expect(mains.length).toBeGreaterThanOrEqual(cards.length - 1 - 0);
      }
      expect(seen.uncommon!).toBeGreaterThan(110);
      expect(seen.rare!).toBeGreaterThan(80);
      expect(seen.mythic!).toBeGreaterThan(15);
    }
  });

  it('keeps the seed-stable wildcard slot first among the commons when the archive card replaces one', () => {
    const rng = createRng(3);
    const pack = packGenerator('strixhaven')(rng, {}, { common: 4, uncommon: 0, rareMythic: 0 });
    // A common wildcard forced at the first common slot still appears alongside the archive card.
    expect(pack[0]!.kind).toBe('wildcard');
    expect(pack).toHaveLength(8);
  });

  it('sells Final Fantasy boosters without the Starter Kit exclusives, and the FIN decks as starters', () => {
    for (const sheet of Object.values(FINAL_FANTASY_SHEETS)) {
      expect(sheet.length).toBeGreaterThan(0);
      expect(new Set(sheet).size).toBe(sheet.length);
      for (const id of sheet) {
        const c = SCRYFALL.find((x) => slug(x.name) === id && x.set === 'fin')!;
        expect(c, id).toBeDefined();
        expect(+c.collectorNumber, id).toBeLessThanOrEqual(309);
      }
    }
    expect(FINAL_FANTASY_SHEETS.rare).not.toContain('beatrix-loyal-general');
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'finalFantasy');
    expect(save.packs[0]!.kind).toBe('finalFantasy');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('finalFantasy'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    expect(cards.length).toBeGreaterThan(0);
    const all = Object.values(FINAL_FANTASY_SHEETS).flat();
    for (const id of cards) expect(all, id).toContain(id);
    const starters = SEASON_STARTERS.filter((d) => d.set === 'fin');
    expect(starters.length).toBeGreaterThanOrEqual(10);
    expect(starters.some((d) => d.id === 'fin-road-trip')).toBe(true);
    for (const d of starters) expect(d.series).toBe('starter');
  });

  it('sells Reality Fracture boosters from the list cards the pool has, and the FRA decks as starters', () => {
    const rarityOf = new Map(FRA_BOOSTER_LIST);
    for (const [rarity, sheet] of Object.entries(REALITY_FRACTURE_SHEETS)) {
      expect(sheet.length).toBeGreaterThan(0);
      expect(new Set(sheet).size).toBe(sheet.length);
      for (const id of sheet) {
        expect(cardDb.has(id), id).toBe(true);
        expect(rarityOf.get(SCRYFALL.find((x) => slug(x.name) === id)!.name), id).toBe(rarity);
      }
    }
    // The planeswalker group waits for 17c.
    expect(REALITY_FRACTURE_SHEETS.mythic).not.toContain('ajani-resolute');
    let save = { ...fresh(), coins: 1000 };
    save = buySeasonPack(save, 1, 'realityFracture');
    expect(save.packs[0]!.kind).toBe('realityFracture');
    const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator('realityFracture'), 2);
    const cards = opened.lastPack!.rewards.flatMap((r) => (r.kind === 'card' ? [r.cardId] : []));
    expect(cards.length).toBeGreaterThan(0);
    const all = Object.values(REALITY_FRACTURE_SHEETS).flat();
    for (const id of cards) expect(all, id).toContain(id);
    const starters = SEASON_STARTERS.filter((d) => d.set === 'fra');
    expect(starters).toHaveLength(10);
    for (const d of starters) expect(d.series).toBe('starter');
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
