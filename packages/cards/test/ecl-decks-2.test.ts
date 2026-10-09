import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, deckIds, missingCards, slug } from '../src/index.ts';
import { ECL_DECKS_2 } from '../src/ecl/decks-2.ts';
import { PACKETS, packetCards } from '../src/jumpin.ts';

const engine = createEngine(cardDb);

describe('Lorwyn Eclipsed decks, part 2', () => {
  it('has the three decks', () => {
    expect(ECL_DECKS_2.map((d) => d.id)).toEqual([
      'ecl-boggart-rampage',
      'ecl-gilt-leaf-hunt',
      'ecl-kulrath-tempest',
    ]);
  });

  for (const deck of ECL_DECKS_2) {
    describe(deck.name, () => {
      it('has 60 cards, all implemented, in its two colours', () => {
        expect(deck.set).toBe('ecl');
        expect(deck.cards.reduce((s, [, k]) => s + k, 0)).toBe(60);
        expect(deck.cards.some(([name]) => name === deck.face)).toBe(true);
        expect(missingCards(deck)).toEqual([]);
        for (const id of deckIds(deck)) {
          const card = cardDb.get(id)!;
          for (const c of card.colors) expect(deck.colors, `${card.name} colour`).toContain(c);
        }
      });

      it('plays short random games without errors', () => {
        const decks = { p1: deckIds(deck), p2: deckIds(deck) };
        for (let seed = 1; seed <= 4; seed++) {
          const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
          expect(r.truncated, `seed ${seed}`).toBe(false);
          expect(r.final.decision.kind).toBe('gameOver');
        }
      });
    });
  }
});

describe('Lorwyn Eclipsed Jump In packets, part 2', () => {
  const packets = PACKETS.filter((p) => ['ecl-elemental', 'ecl-goblins', 'ecl-elves'].includes(p.id));

  it('has Elemental, Goblins and Elves', () => {
    expect(packets.map((p) => p.name)).toEqual(['Elemental', 'Goblins', 'Elves']);
    expect(packets.map((p) => p.colors.join(''))).toEqual(['UR', 'BR', 'BG']);
  });

  for (const p of packets) {
    it(`${p.name}: twelve ECL cards, one rare, eight lands`, () => {
      expect(p.set).toBe('ecl');
      expect(p.spells.reduce((s, [, k]) => s + k, 0)).toBe(12);
      expect(packetCards(p).reduce((s, [, k]) => s + k, 0)).toBe(20);
      expect(p.spells.some(([n]) => n === p.face)).toBe(true);
      for (const [name] of packetCards(p)) expect(cardDb.has(slug(name)), name).toBe(true);
    });
  }
});
