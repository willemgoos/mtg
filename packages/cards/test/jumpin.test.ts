import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARENA_BLB_PACKETS,
  ARENA_FDN_PACKETS,
  cardDb,
  deckById,
  deckIds,
  findDeck,
  jumpInId,
  jumpInPackets,
  JUMP_IN_DECKS,
  MARVEL_JUMPSTART_PACKETS,
  PACKETS,
  packetCards,
  SCRYFALL,
  slug,
} from '../src/index.ts';

const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const marvelLists: { name: string; cards: [string, number][] }[] = JSON.parse(
  readFileSync(new URL('../scripts/data/marvel-jumpstart-lists.json', import.meta.url), 'utf8'),
);

describe('Jump In packets', () => {
  it.each(MARVEL_JUMPSTART_PACKETS.map((p) => p.name))(
    '%s matches its official Jumpstart list',
    (name) => {
      const packet = MARVEL_JUMPSTART_PACKETS.find((p) => p.name === name);
      expect(packet, name).toBeDefined();
      const official = marvelLists.find((p) => p.name === name)!;
      const sort = (cards: [string, number][]) =>
        cards.slice().sort(([a], [b]) => a.localeCompare(b));
      expect(sort(packetCards(packet!))).toEqual(sort(official.cards));
    },
  );

  it('are 20 implemented cards of their colours with exactly one rare', () => {
    expect(new Set(PACKETS.map((p) => p.id)).size).toBe(PACKETS.length);
    for (const p of PACKETS) {
      const cards = packetCards(p);
      expect(
        cards.reduce((n, [, k]) => n + k, 0),
        p.name,
      ).toBe(20);
      for (const [name] of cards) {
        expect(cardDb.has(slug(name)), name).toBe(true);
        const colors = card.get(name)!.colors;
        // Official packets may hold a hybrid card of another colour too (She-Hulk in Trained).
        if (p.source && colors.length > 1)
          expect(
            colors.some((c) => (p.colors as string[]).includes(c)),
            name,
          ).toBe(true);
        else for (const c of colors) expect(p.colors, name).toContain(c);
      }
      const rares = p.spells.filter(([n]) => ['rare', 'mythic'].includes(card.get(n)!.rarity));
      // Official packets may have more (Agents of S.H.I.E.L.D. has two).
      if (p.source) expect(rares.length, p.name).toBeGreaterThanOrEqual(1);
      else expect(rares, p.name).toHaveLength(1);
      expect(
        p.spells.some(([n]) => n === p.face),
        p.name,
      ).toBe(true);
    }
  });

  it('has two base packets per colour in each set, before cross-set custom themes', () => {
    for (const set of [undefined, 'blb', 'msh', 'fin', 'stx', 'sos', 'fra'])
      for (const c of ['W', 'U', 'B', 'R', 'G'])
        expect(
          PACKETS.filter((p) => p.set === set && !p.source && !p.crossSet && p.colors.join() === c),
          `${set ?? 'fdn'} ${c}`,
        ).toHaveLength(2);
  });

  it('uses cards of its own set', () => {
    // Official packets and explicitly cross-set custom themes may borrow cards.
    for (const p of PACKETS.filter((x) => x.set && !x.source && !x.crossSet))
      for (const [name] of p.spells) expect(card.get(name)!.set, `${p.name}: ${name}`).toBe(p.set);
  });

  it('builds Final Fantasy packets from booster cards, not the Starter Kit exclusives', () => {
    const fin = PACKETS.filter((p) => p.set === 'fin');
    expect(fin).toHaveLength(10);
    for (const p of fin)
      for (const [name] of p.spells)
        expect(+card.get(name)!.collectorNumber, `${p.name}: ${name}`).toBeLessThanOrEqual(309);
  });

  it('builds ten Reality Fracture packets with planeswalker-related cards, one rare each', () => {
    const fra = PACKETS.filter((p) => p.set === 'fra');
    expect(fra).toHaveLength(10);
    for (const p of fra) {
      let rares = 0;
      for (const [name, k] of p.spells) {
        const c = card.get(name)!;
        if (c.rarity === 'rare' || c.rarity === 'mythic') rares += k;
      }
      expect(rares, p.name).toBe(1);
    }
    // Empower Jace cards are in the packets now (17c).
    expect(fra.some((p) => p.spells.some(([n]) => card.get(n)!.oracleText?.includes('Jace')))).toBe(
      true,
    );
    expect(deckById(jumpInId('fra-lifegain', 'fra-titans')).set).toBe('fra');
    expect(deckById(jumpInId('fra-lifegain', 'angels')).set).toBeUndefined();
  });

  it("has Lorwyn Eclipsed packets with Arena's names and colours, one rare each", () => {
    const ecl = PACKETS.filter((p) => p.set === 'ecl');
    // Arena's ten Lorwyn Eclipsed packets (Draftsim's list); the cards are ours.
    const arena = [
      'Kithkin WG',
      'Merfolk WU',
      'Elemental UR',
      'Goblins BR',
      'Elves BG',
      'Flashy UB',
      'Burdened W',
      'Blighted B',
      'Giant R',
      'Vivid G',
    ];
    for (const p of ecl) expect(arena).toContain(`${p.name} ${p.colors.join('')}`);
    expect(new Set(ecl.map((p) => p.name)).size).toBe(ecl.length);
    for (const p of ecl) {
      const rares = p.spells.filter(([n]) => ['rare', 'mythic'].includes(card.get(n)!.rarity));
      expect(rares, p.name).toHaveLength(1);
      expect(
        p.spells.reduce((n, [, k]) => n + k, 0),
        p.name,
      ).toBe(12);
    }
    expect(deckById(jumpInId('ecl-kithkin', 'ecl-merfolk')).set).toBe('ecl');
  });

  it('pairs packets across sets; a pair from one set is of that set', () => {
    const mixed = deckById(jumpInId('goblins', 'blb-lizards'));
    expect(deckIds(mixed)).toHaveLength(40);
    expect(mixed.set).toBeUndefined();
    expect(jumpInPackets(mixed.id)?.map((p) => p.set)).toEqual([undefined, 'blb']);
    const d = deckById(jumpInId('msh-hydra', 'msh-robots'));
    expect(d.set).toBe('msh');
    expect(deckIds(d)).toHaveLength(40);
    expect(deckById(jumpInId('blb-bats', 'msh-robots')).set).toBeUndefined();
    expect(deckById(jumpInId('fin-chocobos', 'fin-monsters')).set).toBe('fin');
    expect(deckById(jumpInId('fin-knights', 'angels')).set).toBeUndefined();
    expect(JUMP_IN_DECKS).toHaveLength((PACKETS.length * (PACKETS.length - 1)) / 2);
  });

  it('pairs two packets into a 40-card deck', () => {
    const d = deckById(jumpInId('goblins', 'angels'));
    expect(d.name).toBe('Goblins + Angels');
    expect(d.colors).toEqual(['R', 'W']);
    expect(deckIds(d)).toHaveLength(40);
    expect(deckById(jumpInId('elves', 'stompers')).colors).toEqual(['G']);
    expect(findDeck(jumpInId('elves', 'nope'))).toBeUndefined();
  });

  it('pairs Ten Rings with Cats into a playable white-blue deck with fixing', () => {
    const d = deckById(jumpInId('msh-ten-rings', 'cats'));
    expect(deckIds(d)).toHaveLength(40);
    expect(d.colors).toEqual(['W', 'U']);
    expect(d.cards).toEqual(
      expect.arrayContaining([
        ['Shang-Chi and the Ten Rings', 1],
        ['Thriving Isle', 2],
        ['Island', 3],
        ['Plains', 11],
      ]),
    );
    expect(jumpInPackets(d.id)?.map((p) => p.name)).toEqual(['Ten Rings', 'Cats']);
  });

  it("has Arena's ten Bloomburrow packets; two-colour ones bring both colours of land", () => {
    expect(ARENA_BLB_PACKETS).toHaveLength(10);
    const d = deckById(jumpInId('blb-arena-bats', 'blb-arena-rats'));
    expect(d.colors).toEqual(['W', 'B']);
    expect(d.set).toBe('blb');
    expect(deckIds(d)).toHaveLength(40);
    expect(d.cards).toEqual(
      expect.arrayContaining([
        ['Scoured Barrens', 1],
        ['Plains', 4],
        ['Swamp', 11],
      ]),
    );
  });

  it("has Arena's eleven Foundations packets, each with its own land", () => {
    expect(ARENA_FDN_PACKETS).toHaveLength(11);
    const d = deckById(jumpInId('fdn-arena-flyers', 'fdn-arena-hares'));
    expect(d.set).toBeUndefined();
    expect(deckIds(d)).toHaveLength(40);
    expect(d.cards).toEqual(
      expect.arrayContaining([
        ['Hare Apparent', 7],
        ['Azorius Guildgate', 1],
        ['Plains', 11],
        ['Island', 4],
      ]),
    );
  });
});
