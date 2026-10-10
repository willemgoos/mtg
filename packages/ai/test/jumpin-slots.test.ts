import { createEngine } from '@mtg/engine';
import {
  ARENA_BLB_PACKETS,
  ARENA_FDN_PACKETS,
  cardDb,
  deckById,
  deckIds,
  defaultDeal,
} from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Jump In slots: seeded bot-vs-bot games with each card only a random slot plays, dealt into its packet.

const engine = createEngine(cardDb);
const CARDS = [
  'Polygraph Orb',
  'Nezumi Informant',
  "Ephara's Dispersal",
  "Valkyrie's Call",
  'Flamewake Phoenix',
  'Raise the Past',
  'Immersturm Predator',
  'Dread Summons',
  'Imprisoned in the Moon',
];
const PACKETS = [...ARENA_BLB_PACKETS, ...ARENA_FDN_PACKETS];

/** A Jump In deck id with `card` dealt into its packet, paired with the next packet of the same set. */
function deckWith(card: string): string {
  const p = PACKETS.find((x) => x.slots?.some((s) => s.some((a) => a.card === card)))!;
  const deal = defaultDeal(p);
  p.slots!.forEach((s, i) => {
    const at = s.findIndex((a) => a.card === card);
    if (at >= 0) deal[i] = at;
  });
  const partner = PACKETS.find((x) => x !== p && x.set === p.set)!;
  return `jump-in:${p.id}+${partner.id}~${[...deal, ...defaultDeal(partner)].join('')}`;
}

describe('Jump In slot cards in bot games', () => {
  it.each(CARDS)(
    '%s: its packet plays seeded heuristic games to a result, error-free',
    (card) => {
      const id = deckWith(card);
      expect(deckById(id).cards.map(([n]) => n)).toContain(card);
      const decks = { p1: deckIds(deckById(id)), p2: deckIds(deckById('arcane-aerialists')) };
      for (let seed = 1; seed <= 2; seed++) {
        const r = playMatch(
          engine,
          decks,
          { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
          seed,
          { startingPlayer: seed % 2 ? 'p1' : 'p2' },
        );
        expect(r.winner, `seed ${seed}`).not.toBeNull();
        expect(r.actions.length, `seed ${seed}`).toBeLessThan(5000);
      }
    },
    120_000,
  );
});
