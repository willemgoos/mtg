import { cardDb, PLAYABLE_DECKS, SCRYFALL, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  camp,
  chooseBoon,
  currentNode,
  deckCards,
  enterNode,
  type ExpeditionState,
  FLOORS,
  gameOptions,
  keepCount,
  makeMap,
  type MapNode,
  maxLives,
  MIN_DECK,
  moveCard,
  openPacks,
  PACK_SIZE,
  pendingPacks,
  reachable,
  recordMatch,
  rollPack,
  size,
  START_PACKS,
  startExpedition,
  startMatch,
  statusOf,
} from '../src/game/expedition.ts';

const deck = PLAYABLE_DECKS.find((d) => d.series === 'starter')!.id;
const empty: ExpeditionState = { run: null, records: {} };
const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const packSize = PACK_SIZE.rare + PACK_SIZE.uncommon + PACK_SIZE.common;
const isRare = (n: string) => ['rare', 'mythic'].includes(card.get(n)!.rarity);

/** Keeps the first cards of every waiting pack. */
const openAll = (s: ExpeditionState) =>
  openPacks(
    s,
    pendingPacks(s.run!).map((p) => p.slice(0, keepCount(s.run!))),
  );

function fight(s: ExpeditionState, outcome: 'win' | 'loss', seed = 7): ExpeditionState {
  return recordMatch(startMatch(s, seed), seed, outcome);
}

/** A run on a hand-made map: every floor has the given kinds in lanes 0, 1, 2. */
function onMap(kinds: MapNode['kind'][]): ExpeditionState {
  const s = openAll(startExpedition(empty, deck, 5));
  const opponent = PLAYABLE_DECKS.find((d) => d.id !== deck)!.id;
  const node = (kind: MapNode['kind']): MapNode =>
    kind === 'duel'
      ? { kind, opponent, reward: { kind: 'booster' } }
      : kind === 'elite' || kind === 'boss'
        ? { kind, opponent }
        : { kind };
  const map = Array.from({ length: FLOORS - 1 }, () => kinds.map(node));
  return { ...s, run: { ...s.run!, map: [...map, [node('boss')]] } };
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
      expect(pack.filter(isRare)).toHaveLength(1);
    }
  });

  it('puts most of a colour pack in its colour, and extra rares where due', () => {
    const pack = rollPack({ kind: 'color', color: 'G' }, 3);
    expect(pack.filter((n) => card.get(n)!.colors.includes('G')).length).toBeGreaterThanOrEqual(8);
    expect(rollPack({ kind: 'rare' }, 3).filter(isRare)).toHaveLength(2);
    expect(rollPack({ kind: 'booster' }, 3, true).filter(isRare)).toHaveLength(2);
    expect(rollPack({ kind: 'rare' }, 3, true)).toHaveLength(packSize);
  });

  it('keeps only the chosen cards, up to the keep count, from each pack', () => {
    const s = startExpedition(empty, deck, 5);
    expect(s.run!.build.packs).toHaveLength(START_PACKS);
    const packs = pendingPacks(s.run!);
    const opened = openPacks(s, [packs[0]!.slice(0, 5), [packs[0]![0]!, 'Not A Card']]);
    const b = opened.run!.build;
    expect(size(b.side)).toBe(3);
    expect(b.fresh).toEqual(packs[0]!.slice(0, 3));
    expect(b.packs).toEqual([]);
    expect(b.opened).toBe(START_PACKS);
  });
});

describe('expedition map', () => {
  it('has seven floors of three lanes, then a final battle, fixed by the seed', () => {
    const map = makeMap(deck, 9);
    expect(map).toHaveLength(FLOORS);
    expect(map.slice(0, -1).every((f) => f.length === 3)).toBe(true);
    expect(map.at(-1)).toEqual([expect.objectContaining({ kind: 'boss' })]);
    expect(map[0]!.every((n) => n.kind === 'duel' && n.reward && n.opponent)).toBe(true);
    expect(makeMap(deck, 9)).toEqual(map);
    for (const f of map) for (const n of f) if (n.opponent) expect(n.opponent).not.toBe(deck);
  });

  it('moves one floor at a time to neighbouring lanes', () => {
    let s = onMap(['duel', 'duel', 'duel']);
    expect(reachable(s.run!)).toEqual([0, 1, 2]);
    s = enterNode(s, 0);
    expect(currentNode(s.run!)).toMatchObject({ floor: 0, lane: 0 });
    expect(reachable(s.run!)).toEqual([]);
    s = fight(s, 'win');
    expect(reachable(s.run!)).toEqual([0, 1]);
    expect(enterNode(s, 2)).toEqual(s);
  });
});

describe('expedition run', () => {
  it('pays a duel reward on a win and moves on after a loss', () => {
    let s = fight(enterNode(onMap(['duel', 'duel', 'duel']), 1), 'win');
    expect(s.run!.outcomes).toEqual(['win']);
    expect(s.run!.build.packs).toEqual([{ kind: 'booster' }]);
    s = openAll(s);
    s = fight(enterNode(s, 1), 'loss');
    expect(s.run!.outcomes).toEqual(['win', 'loss']);
    expect(s.run!.livesLost).toBe(1);
    expect(s.run!.build.packs).toEqual([]);
    expect(statusOf(s.run!)).toBe('playing');
  });

  it('only counts the match it is waiting on', () => {
    const s = startMatch(enterNode(onMap(['duel', 'duel', 'duel']), 0), 7);
    expect(recordMatch(s, 8, 'win')).toBe(s);
    expect(recordMatch(s, 7, 'draw').run!.outcomes).toEqual([]);
  });

  it('rests or forages at a camp', () => {
    let s = fight(enterNode(onMap(['duel', 'camp', 'duel']), 0), 'loss');
    s = enterNode(s, 1);
    expect(s.run!.pending).toEqual({ kind: 'camp' });
    const rested = camp(s, 'rest').run!;
    expect(rested.livesLost).toBe(0);
    expect(rested.outcomes).toEqual(['loss', 'done']);
    const foraged = camp(s, 'forage').run!;
    expect(foraged.livesLost).toBe(1);
    expect(foraged.build.packs).toEqual([{ kind: 'booster' }]);
  });

  it('grants boons at shrines and after elites, and applies them', () => {
    let s = enterNode(onMap(['shrine', 'elite', 'shrine']), 0);
    const options = s.run!.pending?.kind === 'boon' ? s.run!.pending.options : [];
    expect(options).toHaveLength(3);
    s = chooseBoon(s, options[0]!);
    expect(s.run!.boons).toEqual([options[0]]);
    expect(s.run!.outcomes).toEqual(['done']);

    s = fight(enterNode(s, 1), 'win');
    expect(s.run!.build.packs).toEqual([{ kind: 'rare' }]);
    expect(s.run!.pending?.kind).toBe('boon');
    s = {
      ...s,
      run: {
        ...s.run!,
        pending: null,
        boons: ['hardy', 'initiative', 'prepared', 'trailblazer', 'collector', 'stout'],
      },
    };
    expect(gameOptions(s.run!)).toEqual({
      life: { p1: 25 },
      startingPlayer: 'p1',
      extraCards: { p1: 1 },
      landInPlay: ['p1'],
    });
    expect(keepCount(s.run!)).toBe(4);
    expect(maxLives(s.run!)).toBe(4);
  });

  it('retries the final battle after a loss, and clears on a win', () => {
    let s = onMap(['duel', 'duel', 'duel']);
    for (let f = 0; f < FLOORS - 1; f++) s = openAll(fight(enterNode(s, 1), 'win'));
    s = enterNode(s, 0);
    expect(currentNode(s.run!)?.node.kind).toBe('boss');
    s = fight(s, 'loss');
    expect(currentNode(s.run!)?.node.kind).toBe('boss');
    s = fight(s, 'win');
    expect(statusOf(s.run!)).toBe('cleared');
    expect(s.records[deck]).toEqual({ runs: 1, clears: 1, best: FLOORS });
  });

  it('ends when the lives run out', () => {
    let s = onMap(['duel', 'duel', 'duel']);
    for (let f = 0; f < 3; f++) s = fight(enterNode(s, 1), 'loss');
    expect(statusOf(s.run!)).toBe('out');
    expect(reachable(s.run!)).toEqual([]);
  });

  it('moves cards between deck and collection, with free basic lands', () => {
    let s = openAll(startExpedition(empty, deck, 5));
    const name = Object.keys(s.run!.build.side)[0]!;
    s = moveCard(s, name, 'main');
    expect(size(s.run!.build.main)).toBe(61);
    expect(deckCards(s.run!.build)).toHaveLength(61);
    s = moveCard(s, 'Forest', 'main');
    s = moveCard(s, 'Forest', 'side');
    expect(s.run!.build.side.Forest).toBeUndefined();
    expect(moveCard(s, 'Not A Card', 'main')).toEqual(s);
    expect(MIN_DECK).toBe(40);
  });
});
