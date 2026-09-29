import { cardDb, PLAYABLE_DECKS, SCRYFALL, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  choosePack,
  deckCards,
  type ExpeditionState,
  MIN_DECK,
  moveCard,
  openPacks,
  PACK_SIZE,
  pendingPacks,
  ready,
  recordExpedition,
  rollPack,
  size,
  START_PACKS,
  startExpedition,
} from '../src/game/expedition.ts';
import { startMatch } from '../src/game/gauntlet.ts';

const deck = PLAYABLE_DECKS.find((d) => d.series === 'starter')!.id;
const empty: ExpeditionState = { run: null, records: {} };
const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const packSize = PACK_SIZE.rare + PACK_SIZE.uncommon + PACK_SIZE.common;

function play(s: ExpeditionState, outcome: 'win' | 'loss', seed = 7): ExpeditionState {
  return recordExpedition(startMatch(s, seed), seed, outcome);
}

describe('expedition packs', () => {
  it('rolls a fixed pack of distinct, playable Foundations cards', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed);
      expect(pack).toHaveLength(packSize);
      expect(new Set(pack).size).toBe(packSize);
      expect(rollPack({ kind: 'booster' }, seed)).toEqual(pack);
      for (const name of pack) {
        expect(card.get(name)!.set).toBe('fdn');
        expect(cardDb.has(slug(name))).toBe(true);
      }
      const rares = pack.filter((n) => ['rare', 'mythic'].includes(card.get(n)!.rarity));
      expect(rares).toHaveLength(1);
    }
  });

  it('puts most of a colour pack in its colour, and two rares in a rare pack', () => {
    const pack = rollPack({ kind: 'color', color: 'G' }, 3);
    expect(pack.filter((n) => card.get(n)!.colors.includes('G')).length).toBeGreaterThanOrEqual(8);
    const rare = rollPack({ kind: 'rare' }, 3);
    expect(rare).toHaveLength(packSize);
    expect(rare.filter((n) => ['rare', 'mythic'].includes(card.get(n)!.rarity))).toHaveLength(2);
  });
});

describe('expedition run', () => {
  it('starts with the starter deck and two boosters to open', () => {
    const s = startExpedition(empty, deck, 5);
    const b = s.run!.build;
    expect(size(b.main)).toBe(60);
    expect(b.packs).toHaveLength(START_PACKS);
    expect(ready(b)).toBe(false);
    const cards = pendingPacks(s.run!).flat();
    const opened = openPacks(s).run!.build;
    expect(size(opened.side)).toBe(cards.length);
    expect(opened.fresh).toEqual(cards);
    expect(opened.packs).toEqual([]);
    expect(ready(opened)).toBe(true);
    // Opening again does nothing: the packs are gone.
    expect(openPacks(openPacks(s)).run!.build.side).toEqual(opened.side);
  });

  it('moves cards between deck and collection, with free basic lands', () => {
    let s = openPacks(startExpedition(empty, deck, 5));
    const name = Object.keys(s.run!.build.side)[0]!;
    s = moveCard(s, name, 'main');
    expect(s.run!.build.main[name]).toBeGreaterThanOrEqual(1);
    expect(size(s.run!.build.main)).toBe(61);
    expect(deckCards(s.run!.build)).toHaveLength(61);
    s = moveCard(s, 'Forest', 'main');
    expect(size(s.run!.build.main)).toBe(62);
    s = moveCard(s, 'Forest', 'side');
    expect(s.run!.build.side.Forest).toBeUndefined();
    // Can't move a card you don't have.
    expect(moveCard(s, 'Not A Card', 'main')).toEqual(s);
    // Trimming below 40 makes the deck unready.
    for (const [n, k] of Object.entries(s.run!.build.main))
      for (let i = 0; i < k; i++) s = moveCard(s, n, 'side');
    expect(size(s.run!.build.main)).toBe(0);
    expect(ready(s.run!.build)).toBe(false);
    expect(MIN_DECK).toBe(40);
  });

  it('offers three packs after a win, none after a loss', () => {
    let s = openPacks(startExpedition(empty, deck, 5));
    s = play(s, 'loss');
    expect(s.run!.build.offer).toBeNull();
    s = play(s, 'win');
    const offer = s.run!.build.offer!;
    expect(offer).toHaveLength(3);
    expect(ready(s.run!.build)).toBe(false);
    s = choosePack(s, 2);
    expect(s.run!.build.packs).toEqual([offer[2]]);
    s = openPacks(s);
    expect(size(s.run!.build.side)).toBe(2 * packSize + packSize);
    expect(ready(s.run!.build)).toBe(true);
  });
});
