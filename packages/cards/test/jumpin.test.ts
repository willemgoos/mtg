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
  PACKETS,
  packetCards,
  SCRYFALL,
  slug,
} from '../src/index.ts';

const card = new Map(SCRYFALL.map((c) => [c.name, c]));

describe('Jump In packets', () => {
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

  it('has two packets per colour in each set', () => {
    for (const set of [undefined, 'blb', 'msh', 'fin', 'stx', 'sos'])
      for (const c of ['W', 'U', 'B', 'R', 'G'])
        expect(
          PACKETS.filter((p) => p.set === set && !p.source && p.colors.join() === c),
          `${set ?? 'fdn'} ${c}`,
        ).toHaveLength(2);
  });

  it('uses cards of its own set', () => {
    // Arena's packets borrow a few cards from other sets.
    for (const p of PACKETS.filter((x) => x.set && !x.source))
      for (const [name] of p.spells) expect(card.get(name)!.set, `${p.name}: ${name}`).toBe(p.set);
  });

  it('builds Final Fantasy packets from booster cards, not the Starter Kit exclusives', () => {
    const fin = PACKETS.filter((p) => p.set === 'fin');
    expect(fin).toHaveLength(10);
    for (const p of fin)
      for (const [name] of p.spells)
        expect(+card.get(name)!.collectorNumber, `${p.name}: ${name}`).toBeLessThanOrEqual(309);
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
