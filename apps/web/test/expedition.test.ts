import {
  ARCHIVE_RARITY,
  cardDb,
  findDeck,
  PLAYABLE_DECKS,
  REALITY_FRACTURE_DECKS,
  registerDeck,
  SCRYFALL,
  slug,
} from '@mtg/cards';
import { FRA_BOOSTER_LIST } from '../../../packages/cards/src/fra/booster-list.ts';
import { SOA_ARCHIVE_LIST } from '../../../packages/cards/src/sos/archive-list.ts';
import { SOS_BOOSTER_LIST } from '../../../packages/cards/src/sos/booster-list.ts';
import { STA_ARCHIVE_LIST } from '../../../packages/cards/src/stx/archive-list.ts';
import { STX_BOOSTER_LIST } from '../../../packages/cards/src/stx/booster-list.ts';
import { describe, expect, it } from 'vitest';
import {
  owned,
  applySuggestion,
  camp,
  canChoose,
  chooseRare,
  continueExpedition,
  seasonDecklist,
  deckAdvice,
  type EventId,
  EVENTS,
  leaveMerchant,
  resolveEvent,
  trade,
  chooseBoon,
  currentNode,
  botFor,
  deckCards,
  difficultyOf,
  enterNode,
  type ExpeditionState,
  FLOORS,
  gameOptions,
  keepCount,
  links,
  makeMap,
  MAX_LANES,
  type MapNode,
  maxLives,
  MIN_DECK,
  moveCard,
  openPacks,
  PACK_SIZE,
  pendingPacks,
  reachable,
  recordMatch,
  packSetOf,
  rollPack,
  size,
  START_PACKS,
  startExpedition,
  startMatch,
  statusOf,
  choosePact,
  dismissGift,
  extraRares,
  fightOf,
  merchantPrice,
  packKeeps,
  pickCard,
  pickable,
  twistOf,
  difficultyIn,
  chooseLand,
  landCopies,
  landsFor,
  type BoonId,
  type PactId,
} from '../src/game/expedition.ts';

const deck = PLAYABLE_DECKS.find((d) => d.series === 'starter')!.id;
const empty: ExpeditionState = { run: null, records: {} };
const card = new Map(SCRYFALL.map((c) => [c.name, c]));
const boosterNames = new Set(STX_BOOSTER_LIST.map(([n]) => n));
const sosBoosterNames = new Set(SOS_BOOSTER_LIST.map(([n]) => n));
const staNames = new Set(STA_ARCHIVE_LIST.map(([n]) => n));
const soaNames = new Set(SOA_ARCHIVE_LIST.map(([n]) => n));
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
function onMap(kinds: MapNode['kind'][], event: EventId = 'gambler'): ExpeditionState {
  const s = openAll(startExpedition(empty, deck, 5));
  const opponent = PLAYABLE_DECKS.find((d) => d.id !== deck)!.id;
  const node = (kind: MapNode['kind']): MapNode =>
    kind === 'duel'
      ? { kind, opponent, reward: { kind: 'booster' } }
      : kind === 'elite' || kind === 'boss'
        ? { kind, opponent }
        : kind === 'mystery'
          ? { kind, event }
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
    expect(rollPack({ kind: 'booster' }, 3, 1).filter(isRare)).toHaveLength(2);
    expect(rollPack({ kind: 'rare' }, 3, 1)).toHaveLength(packSize);
  });

  it('opens Bloomburrow boosters on an expedition with a Bloomburrow deck', () => {
    expect(packSetOf({ deck: 'blb-warren-rally' })).toBe('blb');
    expect(packSetOf({ deck: PLAYABLE_DECKS[0]!.id })).toBe('fdn');
    // A Jump In deck mixing two sets alternates their boosters.
    const mixed = { deck: 'jump-in:blb-bats+msh-robots' };
    expect([0, 1, 2].map((n) => packSetOf(mixed, n))).toEqual(['blb', 'msh', 'blb']);
    expect(packSetOf({ deck: 'jump-in:goblins+msh-robots' }, 0)).toBe('fdn');
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'blb');
      expect(new Set(pack).size).toBe(packSize);
      for (const name of pack) expect(card.get(name)!.set).toBe('blb');
    }
  });

  it('opens Marvel Super Heroes boosters with a Marvel deck, never a back face alone', () => {
    expect(packSetOf({ deck: 'msh-heroes-unite' })).toBe('msh');
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'msh');
      expect(new Set(pack).size).toBe(packSize);
      for (const name of pack) {
        expect(card.get(name)!.set).toBe('msh');
        expect(card.get(name)!.front).toBeUndefined();
      }
    }
  });

  it('opens Strixhaven boosters with a Strixhaven deck or packet pair', () => {
    expect(packSetOf({ deck: 'stx-lorehold-reckoning' })).toBe('stx');
    expect(packSetOf({ deck: 'jump-in:stx-wizards+stx-beasts' })).toBe('stx');
    expect(packSetOf({ deck: 'jump-in:goblins+stx-beasts' }, 1)).toBe('stx');
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'stx');
      expect(new Set(pack).size).toBe(packSize);
      // One Mystical Archive card in place of a common; the rest are STX booster cards.
      expect(pack.filter((name) => staNames.has(name))).toHaveLength(1);
      for (const name of pack) {
        expect(boosterNames.has(name) || staNames.has(name)).toBe(true);
        expect(card.get(name)!.front).toBeUndefined();
      }
    }
  });

  it('puts one Mystical Archive card in each Strixhaven and Secrets of Strixhaven pack, by archive rarity', () => {
    const tally = (set: 'stx' | 'sos', list: typeof STA_ARCHIVE_LIST) => {
      const rarity = new Map<string, string>(list);
      const seen = { uncommon: 0, rare: 0, mythic: 0 } as Record<string, number>;
      for (let seed = 0; seed < 400; seed++) {
        const pack = rollPack({ kind: 'booster' }, seed, 0, set);
        const archive = pack.filter((name) => rarity.has(name));
        expect(archive).toHaveLength(1);
        seen[rarity.get(archive[0]!)!]!++;
      }
      return seen;
    };
    for (const [set, list] of [
      ['stx', STA_ARCHIVE_LIST],
      ['sos', SOA_ARCHIVE_LIST],
    ] as const) {
      const seen = tally(set, list);
      // Half uncommon, three eighths rare, an eighth mythic.
      expect(seen.uncommon!).toBeGreaterThan(160);
      expect(seen.uncommon!).toBeLessThan(240);
      expect(seen.rare!).toBeGreaterThan(110);
      expect(seen.rare!).toBeLessThan(190);
      expect(seen.mythic!).toBeGreaterThan(25);
      expect(seen.mythic!).toBeLessThan(80);
    }
  });

  it('still adds the extra rare for rare packs, and the other sets have no archive slot', () => {
    for (let seed = 0; seed < 20; seed++) {
      // (An FDN card can share its name with an archive reprint, but no pack of those sets is built from the archive.)
      for (const set of ['fdn', 'blb', 'msh'] as const)
        expect(new Set(rollPack({ kind: 'booster' }, seed, 0, set)).size).toBe(packSize);
      const pack = rollPack({ kind: 'rare' }, seed, 0, 'sos');
      expect(pack).toHaveLength(packSize);
      expect(pack.filter((n) => ARCHIVE_RARITY.has(n))).toHaveLength(1);
    }
  });

  it('opens Secrets of Strixhaven boosters with an SOS deck or packet pair', () => {
    expect(packSetOf({ deck: 'sos-lorehold-spirit-archive' })).toBe('sos');
    expect(packSetOf({ deck: 'jump-in:sos-clerics+sos-beasts' })).toBe('sos');
    expect(packSetOf({ deck: 'jump-in:goblins+sos-beasts' }, 1)).toBe('sos');
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'sos');
      expect(new Set(pack).size).toBe(packSize);
      expect(pack.filter((name) => soaNames.has(name))).toHaveLength(1);
      for (const name of pack) {
        expect(sosBoosterNames.has(name) || soaNames.has(name)).toBe(true);
        expect(card.get(name)!.front).toBeUndefined();
      }
    }
  });

  it('opens Reality Fracture boosters with an FRA deck: one rare, three uncommons, eight commons', () => {
    const fra = REALITY_FRACTURE_DECKS[0]!;
    expect(packSetOf({ deck: fra.id })).toBe('fra');
    expect(packSetOf({ deck: 'jump-in:fra-lifegain+fra-titans' })).toBe('fra');
    const mixed = { deck: 'jump-in:fra-lifegain+blb-bats' };
    expect([0, 1].map((n) => packSetOf(mixed, n))).toEqual(['fra', 'blb']);
    const rarityOf = new Map(FRA_BOOSTER_LIST);
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'fra');
      expect(new Set(pack).size).toBe(packSize);
      const count = (...r: string[]) => pack.filter((n) => r.includes(rarityOf.get(n)!)).length;
      for (const n of pack) expect(cardDb.has(slug(n)), n).toBe(true);
      expect(count('rare', 'mythic')).toBe(1);
      expect(count('uncommon')).toBe(3);
      expect(count('common')).toBe(8);
    }
  });

  it('opens Final Fantasy boosters with a FIN deck: one rare, three uncommons, eight commons', () => {
    expect(packSetOf({ deck: 'fin-chocobo-stampede' })).toBe('fin');
    expect(packSetOf({ deck: 'jump-in:fin-chocobos+fin-monsters' })).toBe('fin');
    const mixed = { deck: 'jump-in:fin-knights+blb-bats' };
    expect([0, 1].map((n) => packSetOf(mixed, n))).toEqual(['fin', 'blb']);
    const fin = SCRYFALL.filter((c) => c.set === 'fin');
    for (let seed = 0; seed < 20; seed++) {
      const pack = rollPack({ kind: 'booster' }, seed, 0, 'fin');
      expect(new Set(pack).size).toBe(packSize);
      const printings = pack.map((name) => fin.find((c) => c.name === name)!);
      for (const c of printings) {
        expect(c.front).toBeUndefined();
        expect(+c.collectorNumber, c.name).toBeLessThanOrEqual(309);
      }
      const count = (...r: string[]) => printings.filter((c) => r.includes(c.rarity)).length;
      expect(count('rare', 'mythic')).toBe(1);
      expect(count('uncommon')).toBe(3);
      expect(count('common')).toBe(8);
    }
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
  it('has ten floors on a grid of five lanes, then a final battle, fixed by the seed', () => {
    const map = makeMap(deck, 9);
    expect(map).toHaveLength(FLOORS);
    expect(FLOORS).toBe(10);
    expect(MAX_LANES).toBe(5);
    for (const f of map.slice(0, -1)) {
      expect(f.length).toBeGreaterThanOrEqual(2);
      expect(f.length).toBeLessThanOrEqual(MAX_LANES);
      // Nodes sit in distinct grid lanes, top to bottom.
      const rows = f.map((n) => n.row!);
      expect(rows).toEqual([...new Set(rows)].sort((a, b) => a - b));
      for (const r of rows) expect(r).toBeLessThan(MAX_LANES);
    }
    expect(map.at(-1)).toEqual([expect.objectContaining({ kind: 'boss' })]);
    expect(map[0]!.every((n) => n.kind === 'duel' && n.reward && n.opponent)).toBe(true);
    expect(makeMap(deck, 9)).toEqual(map);
    for (const f of map) for (const n of f) if (n.opponent) expect(n.opponent).not.toBe(deck);
  });

  it('varies its shape from seed to seed', () => {
    const shapes = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        JSON.stringify(makeMap(deck, seed).map((f) => f.map((n) => [n.kind, n.next]))),
      ),
    );
    expect(shapes.size).toBe(20);
  });

  it('joins every floor to the next with paths that never cross or dead-end', () => {
    for (let seed = 0; seed < 200; seed++) {
      const map = makeMap(deck, seed);
      for (let f = 0; f < FLOORS - 1; f++) {
        const edges = map[f]!.flatMap((_, i) => links(map, f, i).map((j) => [i, j] as const));
        // Every node leads on, and every node on the next floor is reached.
        for (let i = 0; i < map[f]!.length; i++) expect(links(map, f, i).length).toBeGreaterThan(0);
        for (let j = 0; j < map[f + 1]!.length; j++)
          expect(edges.some(([, to]) => to === j)).toBe(true);
        for (const [i, j] of edges) {
          expect(j).toBeLessThan(map[f + 1]!.length);
          for (const [k, l] of edges) expect(i < k && j > l).toBe(false);
        }
      }
    }
  });

  it('follows the rules for what waits where', () => {
    const repeatable = ['duel', 'mystery'];
    let forks = 0;
    let nodes = 0;
    for (let seed = 0; seed < 200; seed++) {
      const map = makeMap(deck, seed);
      const all = map.flat();
      const count = (k: MapNode['kind']) => all.filter((n) => n.kind === k).length;
      expect(count('elite')).toBeGreaterThanOrEqual(2);
      expect(count('elite')).toBeLessThanOrEqual(4);
      for (const k of ['camp', 'shrine', 'merchant'] as const)
        expect(count(k)).toBeGreaterThanOrEqual(1);
      expect(count('treasure')).toBeLessThanOrEqual(2);
      expect(map[FLOORS - 2]!.filter((n) => n.kind === 'camp')).toHaveLength(1);
      for (const f of [0, 1])
        for (const n of map[f]!) expect(['elite', 'camp', 'merchant']).not.toContain(n.kind);
      map.forEach((floor, f) =>
        floor.forEach((n, i) => {
          if (repeatable.includes(n.kind) || n.kind === 'boss') return;
          // Not twice on a floor, nor twice in a row along a path.
          expect(floor.filter((m) => m.kind === n.kind)).toHaveLength(1);
          for (const j of links(map, f, i)) expect(map[f + 1]![j]!.kind).not.toBe(n.kind);
        }),
      );
      for (let f = 0; f < FLOORS - 2; f++)
        for (let i = 0; i < map[f]!.length; i++) {
          nodes++;
          if (links(map, f, i).length > 1) forks++;
        }
    }
    // About a third of nodes give a choice of where to go next.
    expect(forks / nodes).toBeGreaterThan(0.3);
  });

  it('keeps routes apart, so a choice now rules out stops a few floors on', () => {
    let shares = 0;
    let open = 0;
    let n = 0;
    for (let seed = 0; seed < 200; seed++) {
      const map = makeMap(deck, seed);
      for (let f = 0; f + 4 < FLOORS - 1; f++)
        for (let lane = 0; lane < map[f]!.length; lane++) {
          let at = new Set([lane]);
          for (let k = 1; k <= 4; k++)
            at = new Set([...at].flatMap((l) => links(map, f + k - 1, l)));
          shares += at.size / map[f + 4]!.length;
          if (at.size === map[f + 4]!.length) open++;
          n++;
        }
      // Each step moves at most one lane on the grid.
      map.slice(0, -2).forEach((floor, f) =>
        floor.forEach((node, i) => {
          for (const j of links(map, f, i))
            expect(Math.abs(map[f + 1]![j]!.row! - node.row!)).toBeLessThanOrEqual(1);
        }),
      );
    }
    // Four floors on, a node reaches well under the whole floor, and rarely all of it.
    expect(shares / n).toBeLessThan(0.66);
    expect(open / n).toBeLessThan(0.2);
  });

  it('leads to neighbouring lanes on maps saved before paths branched freely', () => {
    const old = makeMap(deck, 4).map((f) => f.map(({ next: _, ...n }) => n));
    const wide = [old[0]!, [old[1]![0]!, old[1]![0]!, old[1]![0]!], old.at(-1)!];
    expect(links(wide, 0, 0)).toEqual([0, 1]);
    expect(links(wide, 0, 1)).toEqual([0, 1, 2]);
    expect(links(wide, 1, 2)).toEqual([0]);
    expect(links(wide, 2, 0)).toEqual([]);
  });

  it('meets mostly Jump In pairs in duels and draft trophy decks in elites and the boss', () => {
    let jumpIns = 0;
    let fights = 0;
    for (let seed = 0; seed < 40; seed++) {
      const nodes = makeMap(deck, seed).flat();
      const foes = nodes.flatMap((n) => n.opponent ?? []);
      expect(new Set(foes).size).toBe(foes.length);
      expect(foes).not.toContain(deck);
      for (const id of foes) expect(findDeck(id)!.cards.length).toBeGreaterThan(0);
      for (const n of nodes)
        if (n.kind === 'elite' || n.kind === 'boss')
          expect(findDeck(n.opponent!)!.series, n.kind).toBe('trophy');
      const duels = nodes.flatMap((n) => (n.kind === 'duel' ? [n.opponent!] : []));
      jumpIns += duels.filter((id) => findDeck(id)!.series === 'jumpIn').length;
      fights += duels.length;
    }
    expect(jumpIns / fights).toBeGreaterThan(0.6);
    expect(jumpIns / fights).toBeLessThan(0.8);
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

describe('expedition difficulty', () => {
  it('climbs from 1 to 4 for duels, with elites two steps up and the final battle at the top', () => {
    const duel: MapNode = { kind: 'duel' };
    const floors = Array.from({ length: FLOORS - 1 }, (_, f) => f);
    expect(floors.map((f) => difficultyOf(f, duel))).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 4]);
    expect(floors.map((f) => botFor(f, duel))).toEqual(
      [1, 1, 1, 2, 2, 2, 3, 3, 4].map((d) => `level${d}`),
    );
    expect(botFor(2, { kind: 'elite' })).toBe('level3');
    expect(botFor(7, { kind: 'elite' })).toBe('level5');
    expect(botFor(8, { kind: 'elite' })).toBe('level6');
    expect(botFor(FLOORS - 1, { kind: 'boss' })).toBe('heuristic');
  });

  it('keeps the old curve on seven-floor maps saved before the map grew', () => {
    const duel: MapNode = { kind: 'duel' };
    expect([0, 1, 2, 3, 4, 5].map((f) => difficultyOf(f, duel, 7))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(botFor(4, { kind: 'elite' }, 7)).toBe('heuristic');
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
    const boon = options.find((b) => b !== 'deepPockets')!;
    s = chooseBoon(s, boon);
    expect(s.run!.boons).toEqual([boon]);
    expect(s.run!.outcomes).toEqual(['done']);

    s = fight(enterNode(s, 1), 'win');
    const rares = s.run!.pending?.kind === 'rareDraft' ? s.run!.pending.options : [];
    expect(rares).toHaveLength(3);
    expect(new Set(rares).size).toBe(3);
    s = chooseRare(s, rares[1]!);
    expect(s.run!.build.side[rares[1]!]).toBeGreaterThanOrEqual(1);
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

  it('opens a free booster at a treasure', () => {
    const s = enterNode(onMap(['treasure', 'treasure', 'treasure']), 1);
    expect(s.run!.outcomes).toEqual(['done']);
    expect(s.run!.build.packs).toEqual([{ kind: 'booster' }]);
  });

  it('resolves mystery events, and never offers a choice that costs the last life', () => {
    let s = enterNode(onMap(['mystery', 'mystery', 'mystery']), 0);
    expect(s.run!.pending).toEqual({ kind: 'event', event: 'gambler' });
    s = resolveEvent(s, 0);
    expect(s.run!.livesLost).toBe(1);
    expect(s.run!.build.packs).toEqual([{ kind: 'rare' }]);
    expect(s.run!.outcomes).toEqual(['done']);
    const last = { ...s.run!, livesLost: 2 };
    expect(canChoose(last, EVENTS.gambler.choices[0]!)).toBe(false);

    let lib = enterNode(onMap(['mystery', 'mystery', 'mystery'], 'library'), 0);
    lib = resolveEvent(lib, 0);
    expect(lib.run!.pending?.kind).toBe('boon');
    lib = enterNode(onMap(['mystery', 'mystery', 'mystery'], 'library'), 0);
    expect(resolveEvent(lib, 1).run!.build.packs[0]).toMatchObject({ kind: 'color' });
  });

  it("trades two of your cards for one of the merchant's", () => {
    let s = enterNode(onMap(['merchant', 'merchant', 'merchant']), 0);
    const offers = s.run!.pending?.kind === 'merchant' ? s.run!.pending.offers : [];
    expect(offers).toHaveLength(3);
    const mine = Object.keys(s.run!.build.side).slice(0, 2) as [string, string];
    const before = s.run!.build;
    expect(trade(s, offers[0]!, ['Forest', mine[0]])).toEqual(s);
    s = trade(s, offers[0]!, mine);
    const b = s.run!.build;
    expect(b.side[offers[0]!]).toBeGreaterThanOrEqual(1);
    for (const n of mine)
      expect((b.side[n] ?? 0) + (b.main[n] ?? 0)).toBe(
        (before.side[n] ?? 0) + (before.main[n] ?? 0) - 1,
      );
    expect(s.run!.outcomes).toEqual(['done']);
    const left = leaveMerchant(enterNode(onMap(['merchant', 'merchant', 'merchant']), 0));
    expect(left.run!.pending).toBeNull();
    expect(left.run!.outcomes).toEqual(['done']);
  });

  it('suggests a 40-card, two-colour deck with 17 lands, and gives advice', () => {
    let s = openAll(startExpedition(empty, deck, 5));
    const advice = deckAdvice(s.run!.build);
    expect(advice.some((a) => a.includes('60 cards'))).toBe(true);
    s = applySuggestion(s);
    const b = s.run!.build;
    expect(size(b.main)).toBe(40);
    const lands = Object.entries(b.main)
      .filter(([n]) => card.get(n)!.typeLine.includes('Land'))
      .reduce((k, [, c]) => k + c, 0);
    expect(lands).toBe(17);
    const colors = new Set(Object.keys(b.main).flatMap((n) => card.get(n)!.colors));
    expect(colors.size).toBeLessThanOrEqual(2);
    // Nothing is lost: deck plus collection still hold every card.
    const count = (x: Record<string, number>) =>
      Object.entries(x)
        .filter(([n]) => !card.get(n)!.typeLine.startsWith('Basic'))
        .reduce((k, [, c]) => k + c, 0);
    expect(count(b.main) + count(b.side)).toBe(
      count(openAll(startExpedition(empty, deck, 5)).run!.build.main) +
        count(openAll(startExpedition(empty, deck, 5)).run!.build.side),
    );
    expect(deckAdvice(b).filter((a) => a.includes('lands'))).toEqual([]);
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

  it('sets out again after a clear with the same deck and collection, but fresh lives and boons', () => {
    let s = onMap(['duel', 'duel', 'duel']);
    expect(continueExpedition(s, 11)).toBe(s);
    for (let f = 0; f < FLOORS - 1; f++) s = openAll(fight(enterNode(s, 1), 'win'));
    s = fight(fight(enterNode(s, 0), 'loss'), 'win');
    s = { ...s, run: { ...s.run!, boons: ['hardy'] } };
    const next = continueExpedition(s, 11);
    const r = next.run!;
    expect(r.map).toEqual(makeMap(deck, 11));
    expect(r).toMatchObject({ path: [], outcomes: [], livesLost: 0, boons: [], loop: 1, seed: 11 });
    expect(r.build.main).toEqual(s.run!.build.main);
    expect(r.build.side).toEqual(s.run!.build.side);
    expect(statusOf(r)).toBe('playing');
    expect(next.records).toEqual(s.records);
    // The fights start from the bottom again.
    expect(botFor(0, r.map[0]![0]!, r.map.length)).toBe('level1');
  });

  it('sets out with a Season deck, keeping a copy of it', () => {
    const starter = PLAYABLE_DECKS.find((d) => d.id === deck)!;
    const cards = Object.fromEntries(starter.cards.map(([n, k]) => [slug(n), k]));
    const list = seasonDecklist('save-1', { id: 'starter:1', name: 'My deck', cards });
    expect(list).toMatchObject({
      id: 'season:save-1:starter:1',
      series: 'season',
      name: 'My deck',
    });
    expect(list.cards).toEqual(starter.cards);
    expect(list.colors).toEqual(expect.arrayContaining(starter.colors));
    registerDeck(list);
    const s = startExpedition(empty, list.id, 5);
    expect(s.run!.custom).toEqual(list);
    expect(s.run!.build.main).toEqual(Object.fromEntries(starter.cards));
    for (const f of s.run!.map)
      for (const n of f) if (n.opponent) expect(findDeck(n.opponent)!.series).not.toBe('season');
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

/** The run with these boons (and pacts). */
const withBoons = (s: ExpeditionState, boons: BoonId[], pacts: PactId[] = []): ExpeditionState => ({
  ...s,
  run: { ...s.run!, boons, pacts },
});

/** A shrine on the first floor offering this pact. */
function atShrine(pact: PactId, boons: BoonId[] = []): ExpeditionState {
  const s = enterNode(withBoons(onMap(['shrine', 'shrine', 'shrine']), boons), 0);
  const p = s.run!.pending;
  return { ...s, run: { ...s.run!, pending: p?.kind === 'boon' ? { ...p, pact } : p } };
}

describe('expedition boons', () => {
  it('Scavenger keeps one card from a lost duel', () => {
    let s = withBoons(onMap(['duel', 'duel', 'duel']), ['scavenger']);
    s = fight(enterNode(s, 0), 'loss');
    expect(s.run!.build.packs).toEqual([{ kind: 'booster', keep: 1 }]);
    expect(packKeeps(s.run!)).toEqual([1]);
    s = openPacks(
      s,
      pendingPacks(s.run!).map((p) => p.slice(0, 3)),
    );
    expect(s.run!.build.fresh).toHaveLength(1);
  });

  it('Second Wind spares the first lost fight only', () => {
    let s = withBoons(onMap(['duel', 'duel', 'duel']), ['secondWind']);
    s = fight(enterNode(s, 1), 'loss');
    expect(s.run!.livesLost).toBe(0);
    expect(s.run!.windUsed).toBe(true);
    s = fight(enterNode(s, 1), 'loss');
    expect(s.run!.livesLost).toBe(1);
  });

  it('Haggler makes the merchant ask for one card', () => {
    let s = enterNode(withBoons(onMap(['merchant', 'merchant', 'merchant']), ['haggler']), 0);
    expect(merchantPrice(s.run!)).toBe(1);
    const offers = s.run!.pending?.kind === 'merchant' ? s.run!.pending.offers : [];
    const mine = Object.keys(s.run!.build.side);
    expect(trade(s, offers[0]!, mine.slice(0, 2))).toEqual(s);
    s = trade(s, offers[0]!, mine.slice(0, 1));
    expect(s.run!.build.side[offers[0]!]).toBeGreaterThanOrEqual(1);
  });

  it('Deep Pockets offers four rares after an elite', () => {
    const s = fight(
      enterNode(withBoons(onMap(['elite', 'elite', 'elite']), ['deepPockets']), 0),
      'win',
    );
    const p = s.run!.pending;
    expect(p?.kind === 'rareDraft' && p.options).toHaveLength(4);
  });

  it('Mapmaker opens the lanes beside your paths', () => {
    let s = withBoons(onMap(['duel', 'duel', 'duel']), ['mapmaker']);
    const map = s.run!.map.map((f, i) => (i === 0 ? f.map((n) => ({ ...n, next: [0] })) : f));
    s = fight(enterNode({ ...s, run: { ...s.run!, map } }, 0), 'win');
    expect(reachable(s.run!)).toEqual([0, 1]);
    expect(reachable({ ...s.run!, boons: [] })).toEqual([0]);
  });
});

describe('expedition pacts', () => {
  it('offers a pact beside the boons at shrines', () => {
    let offered = 0;
    for (let seed = 0; seed < 20; seed++) {
      const s = enterNode(
        {
          ...onMap(['shrine', 'shrine', 'shrine']),
          run: { ...onMap(['shrine', 'shrine', 'shrine']).run!, seed },
        },
        0,
      );
      if (s.run!.pending?.kind === 'boon' && s.run!.pending.pact) offered++;
    }
    expect(offered).toBe(20);
  });

  it('never offers the Mythic Pact on your last life', () => {
    for (let seed = 0; seed < 40; seed++) {
      const base = onMap(['shrine', 'shrine', 'shrine']);
      const s = enterNode({ ...base, run: { ...base.run!, seed, livesLost: 2 } }, 0);
      const p = s.run!.pending;
      expect(p?.kind === 'boon' && p.pact).not.toBe('mythic');
    }
  });

  it('Twin Blessing: two boons, and opponents start at 24', () => {
    let s = choosePact(atShrine('twin'), 'twin');
    const p = s.run!.pending;
    expect(p).toMatchObject({ kind: 'boon', picks: 2 });
    const options = p?.kind === 'boon' ? p.options : [];
    s = chooseBoon(s, options[0]!);
    expect(s.run!.pending).toMatchObject({ kind: 'boon', picks: 1 });
    expect(s.run!.outcomes).toEqual([]);
    s = chooseBoon(s, options[1]!);
    expect(s.run!.boons).toEqual([options[0], options[1]]);
    expect(s.run!.outcomes).toEqual(['done']);
    const duel = enterNode(
      {
        ...onMap(['duel', 'duel', 'duel']),
        run: { ...onMap(['duel', 'duel', 'duel']).run!, pacts: ['twin'] },
      },
      0,
    );
    expect(gameOptions(duel.run!).life).toEqual({ p2: 24 });
  });

  it("Hoarder's Pact: keep six, and opponents draw an extra card", () => {
    const s = choosePact(atShrine('hoarder'), 'hoarder');
    expect(s.run!.outcomes).toEqual(['done']);
    expect(keepCount(s.run!)).toBe(6);
    const duel = enterNode(
      withBoons(onMap(['duel', 'duel', 'duel']), ['prepared'], ['hoarder']),
      0,
    );
    expect(gameOptions(duel.run!).extraCards).toEqual({ p1: 1, p2: 1 });
  });

  it('Gilded Pact: two extra rares a pack, tougher elites and final battle', () => {
    const s = withBoons(onMap(['elite', 'elite', 'elite']), ['lucky'], ['gilded']);
    expect(extraRares(s.run!)).toBe(3);
    expect(rollPack({ kind: 'booster' }, 3, 2).filter(isRare)).toHaveLength(3);
    const elite = s.run!.map[2]![0]!;
    expect(difficultyIn(s.run!, 2, elite)).toBe(difficultyOf(2, elite) + 1);
    let b = onMap(['duel', 'duel', 'duel']);
    for (let f = 0; f < FLOORS - 1; f++) b = openAll(fight(enterNode(b, 1), 'win'));
    b = enterNode(withBoons(b, [], ['gilded']), 0);
    expect(gameOptions(b.run!).life).toEqual({ p2: 25 });
  });

  it("Warlord's Pact: play first with two lands, and every elite has a twist", () => {
    const s = enterNode(
      withBoons(onMap(['elite', 'elite', 'elite']), ['trailblazer'], ['warlord']),
      1,
    );
    const twist = twistOf(s.run!, 0, 1);
    expect(twist).toBeDefined();
    expect(twist).not.toBe('quick');
    const o = gameOptions(s.run!);
    expect(o.startingPlayer).toBe('p1');
    expect(o.landInPlay!.filter((p) => p === 'p1')).toHaveLength(3);
  });

  it('Mythic Pact: one of three mythics, for a life', () => {
    let s = choosePact(atShrine('mythic'), 'mythic');
    const p = s.run!.pending;
    const options = p?.kind === 'rareDraft' ? p.options : [];
    expect(options).toHaveLength(3);
    for (const n of options) expect(card.get(n)!.rarity).toBe('mythic');
    expect(maxLives(s.run!)).toBe(2);
    s = chooseRare(s, options[0]!);
    expect(s.run!.pending).toBeNull();
    expect(s.run!.outcomes).toEqual(['done']);
    expect(s.run!.build.side[options[0]!]).toBeGreaterThanOrEqual(1);
  });

  it('starts over without pacts on a new map', () => {
    let s = withBoons(onMap(['duel', 'duel', 'duel']), [], ['hoarder']);
    for (let f = 0; f < FLOORS - 1; f++) s = openAll(fight(enterNode(s, 1), 'win'));
    s = fight(enterNode(s, 0), 'win');
    expect(continueExpedition(s, 3).run!.pacts).toBeUndefined();
  });
});

describe('expedition elite twists', () => {
  const twisted = (twist: MapNode['twist'], boons: BoonId[] = []) => {
    const s = withBoons(onMap(['elite', 'elite', 'elite']), boons);
    const map = s.run!.map.map((f, i) => (i === 0 ? f.map((n) => ({ ...n, twist })) : f));
    return enterNode({ ...s, run: { ...s.run!, map } }, 0);
  };

  it('gives about half the elites a twist', () => {
    const elites = Array.from({ length: 30 }, (_, seed) => makeMap(deck, seed))
      .flat(2)
      .filter((n) => n.kind === 'elite');
    const share = elites.filter((n) => n.twist).length / elites.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });

  it('sets the elite up with its twist, and pays a booster for beating it', () => {
    expect(gameOptions(twisted('tough').run!)).toEqual({ life: { p2: 25 } });
    expect(gameOptions(twisted('quick').run!)).toEqual({ startingPlayer: 'p2' });
    expect(gameOptions(twisted('ready').run!)).toEqual({ landInPlay: ['p2'] });
    expect(gameOptions(twisted('armed').run!)).toEqual({ extraCards: { p2: 1 } });
    // Quick means nothing when you always play first, so it's Armed instead.
    expect(fightOf(twisted('quick', ['initiative']).run!)!.twist).toBe('armed');
    const won = fight(twisted('tough'), 'win');
    expect(won.run!.build.packs).toEqual([{ kind: 'booster' }]);
    expect(won.run!.pending?.kind).toBe('rareDraft');
    expect(fight(twisted(undefined), 'win').run!.build.packs).toEqual([]);
  });
});

describe('expedition events', () => {
  const at = (event: EventId, run: Partial<ExpeditionState['run']> = {}) => {
    const s = onMap(['mystery', 'mystery', 'mystery'], event);
    return enterNode({ ...s, run: { ...s.run!, ...run } }, 0);
  };

  it('has twelve events, all of which turn up on maps', () => {
    expect(Object.keys(EVENTS)).toHaveLength(12);
    const seen = new Set(
      Array.from({ length: 30 }, (_, seed) => makeMap(deck, seed))
        .flat(2)
        .flatMap((n) => n.event ?? []),
    );
    expect(seen.size).toBe(12);
  });

  it('a locked chest holds a rare pack or a booster', () => {
    const kinds = new Set(
      Array.from(
        { length: 20 },
        (_, seed) => resolveEvent(at('chest', { seed }), 0).run!.build.packs[0]!.kind,
      ),
    );
    expect(kinds).toEqual(new Set(['rare', 'booster']));
  });

  it('an ambush is a fight for a rare pack that costs nothing to lose', () => {
    let s = resolveEvent(at('ambush'), 0);
    expect(s.run!.pending).toBeNull();
    const f = fightOf(s.run!)!;
    expect(f.kind).toBe('ambush');
    // A step easier than a duel on its floor, but never below the easiest.
    expect(f.difficulty).toBe(Math.max(1, difficultyOf(0, { kind: 'duel' }) - 1));
    expect(f.opponent).not.toBe(deck);
    const lost = fight(s, 'loss').run!;
    expect(lost.livesLost).toBe(0);
    expect(lost.outcomes).toEqual(['loss']);
    expect(lost.fight).toBeUndefined();
    s = fight(s, 'win');
    expect(s.run!.build.packs).toEqual([{ kind: 'rare' }]);
    expect(s.run!.outcomes).toEqual(['win']);
  });

  it('a duelist is a tough fight for a boon, never on your last life', () => {
    const s = resolveEvent(at('duelist'), 0);
    expect(fightOf(s.run!)!.difficulty).toBe(difficultyOf(0, { kind: 'elite' }));
    expect(fight(s, 'loss').run!.livesLost).toBe(1);
    expect(fight(s, 'win').run!.pending?.kind).toBe('boon');
    expect(canChoose({ ...s.run!, livesLost: 2 }, EVENTS.duelist.choices[0]!)).toBe(false);
  });

  it('a wishing well swaps a card for a random one a rarity higher', () => {
    let s = resolveEvent(at('well'), 0);
    expect(s.run!.pending).toEqual({ kind: 'cardPick', mode: 'well' });
    const options = pickable(s.run!, 'well');
    expect(options.some((n) => card.get(n)!.rarity === 'mythic')).toBe(false);
    const common = options.find((n) => card.get(n)!.rarity === 'common')!;
    const before = owned(s.run!.build, common);
    s = pickCard(s, common);
    const gift = s.run!.pending;
    expect(gift?.kind).toBe('gift');
    const got = gift?.kind === 'gift' ? gift.card : '';
    expect(card.get(got)!.rarity).toBe('uncommon');
    expect(owned(s.run!.build, common)).toBe(before - 1);
    expect(s.run!.outcomes).toEqual(['done']);
    expect(dismissGift(s).run!.pending).toBeNull();
    // Walking away costs nothing.
    expect(pickCard(resolveEvent(at('well'), 0), null).run!.outcomes).toEqual(['done']);
  });

  it('a mirror copies a card you own', () => {
    let s = resolveEvent(at('mirror'), 0);
    const name = pickable(s.run!, 'mirror')[0]!;
    const before = owned(s.run!.build, name);
    s = pickCard(s, name);
    expect(owned(s.run!.build, name)).toBe(before + 1);
    expect(pickCard(resolveEvent(at('mirror'), 0), 'Forest')).toEqual(
      resolveEvent(at('mirror'), 0),
    );
  });

  it('a fortune makes duels on the next two floors pay rare packs', () => {
    const s = resolveEvent(at('fortune'), 0);
    const base = onMap(['duel', 'duel', 'duel']).run!;
    const run = { ...s.run!, map: base.map };
    const told = resolveEvent(
      {
        ...s,
        run: { ...run, path: [0], outcomes: [], pending: { kind: 'event', event: 'fortune' } },
      },
      0,
    ).run!;
    expect(told.map[1]!.every((n) => n.reward?.kind === 'rare')).toBe(true);
    expect(told.map[2]!.every((n) => n.reward?.kind === 'rare')).toBe(true);
    expect(told.map[3]!.every((n) => n.reward?.kind === 'booster')).toBe(true);
  });
});

describe('expedition surveyor', () => {
  const surveyor = () => enterNode(openAll(onMap(['surveyor', 'surveyor', 'surveyor'])), 0);
  const isBasicLand = (n: string) => card.get(n)!.typeLine.startsWith('Basic');
  const basics = (m: Record<string, number>) =>
    Object.entries(m)
      .filter(([n]) => isBasicLand(n))
      .reduce((k, [, c]) => k + c, 0);

  it('turns up at least once on every map', () => {
    for (let seed = 0; seed < 30; seed++)
      expect(
        makeMap(deck, seed)
          .flat()
          .some((n) => n.kind === 'surveyor'),
      ).toBe(true);
  });

  it('offers a common, an uncommon and a rare land that suit the deck', () => {
    const s = surveyor();
    const p = s.run!.pending;
    const offers = p?.kind === 'lands' ? p.offers : [];
    expect(offers).toHaveLength(3);
    expect(offers.map((n) => card.get(n)!.rarity)).toEqual(['common', 'uncommon', 'rare']);
    for (const n of offers) expect(landsFor(s.run!.build)).toContain(n);
    expect(offers.map(landCopies)).toEqual([3, 2, 1]);
  });

  it('swaps basics for the land, and keeps it after a clear', () => {
    let s = surveyor();
    const p = s.run!.pending;
    const land = p?.kind === 'lands' ? p.offers[0]! : '';
    const before = s.run!.build.main;
    s = chooseLand(s, land);
    const after = s.run!.build.main;
    expect(after[land]).toBe(3);
    expect(basics(after)).toBe(basics(before) - 3);
    expect(size(after)).toBe(size(before));
    expect(s.run!.pending).toMatchObject({ kind: 'gift', card: land });
    expect(s.run!.outcomes).toEqual(['done']);
    // Carried into the next map along with everything else.
    s = dismissGift(s);
    for (let f = 1; f < FLOORS - 1; f++) s = openAll(fight(enterNode(s, 1), 'win'));
    s = fight(enterNode(s, 0), 'win');
    expect(continueExpedition(s, 2).run!.build.main[land]).toBe(3);
  });

  it('can be left without a land, and comes as an event too', () => {
    const s = chooseLand(surveyor(), null);
    expect(s.run!.outcomes).toEqual(['done']);
    expect(s.run!.pending).toBeNull();
    const e = resolveEvent(
      enterNode(openAll(onMap(['mystery', 'mystery', 'mystery'], 'surveyor')), 0),
      0,
    );
    expect(e.run!.pending?.kind).toBe('lands');
  });

  it('suggests decks with up to three utility lands, and warns about more', () => {
    const b = { ...openAll(startExpedition(empty, deck, 5)).run!.build };
    const side = { ...b.side, "Rogue's Passage": 2, 'Cryptic Caves': 2, Fountainport: 1 };
    const s = applySuggestion({
      ...empty,
      run: { ...startExpedition(empty, deck, 5).run!, build: { ...b, side } },
    });
    const util = ["Rogue's Passage", 'Cryptic Caves', 'Fountainport'];
    const m = s.run!.build.main;
    expect(util.reduce((k, n) => k + (m[n] ?? 0), 0)).toBe(3);
    const heavy = { ...m, "Rogue's Passage": 2, 'Cryptic Caves': 2 };
    expect(
      deckAdvice({ ...s.run!.build, main: heavy }).some((a) => a.includes('no coloured mana')),
    ).toBe(true);
  });
});
