import { describe, expect, it } from 'vitest';
import {
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
  it('are 20 implemented cards of one colour with exactly one rare', () => {
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
        if (colors.length) expect(colors, name).toEqual([p.color]);
      }
      const rares = p.spells.filter(([n]) => ['rare', 'mythic'].includes(card.get(n)!.rarity));
      expect(rares, p.name).toHaveLength(1);
      expect(
        p.spells.some(([n]) => n === p.face),
        p.name,
      ).toBe(true);
    }
  });

  it('has two packets per colour in each set', () => {
    for (const set of [undefined, 'blb', 'msh', 'stx', 'sos'])
      for (const c of ['W', 'U', 'B', 'R', 'G'])
        expect(
          PACKETS.filter((p) => p.set === set && p.color === c),
          `${set ?? 'fdn'} ${c}`,
        ).toHaveLength(2);
  });

  it('uses cards of its own set', () => {
    for (const p of PACKETS.filter((x) => x.set))
      for (const [name] of p.spells) expect(card.get(name)!.set, `${p.name}: ${name}`).toBe(p.set);
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
    expect(JUMP_IN_DECKS).toHaveLength((50 * 49) / 2);
  });

  it('pairs two packets into a 40-card deck', () => {
    const d = deckById(jumpInId('goblins', 'angels'));
    expect(d.name).toBe('Goblins + Angels');
    expect(d.colors).toEqual(['R', 'W']);
    expect(deckIds(d)).toHaveLength(40);
    expect(deckById(jumpInId('elves', 'stompers')).colors).toEqual(['G']);
    expect(findDeck(jumpInId('elves', 'nope'))).toBeUndefined();
  });
});
