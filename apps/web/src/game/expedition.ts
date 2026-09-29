import { deckById, type Decklist, findDeck, PLAYABLE_DECKS, SCRYFALL, slug } from '@mtg/cards';
import type { CardDefId, Color, NewGameOptions } from '@mtg/engine';
import type { BotKind } from './bot.worker.ts';
import { type DeckRecord, rng, type RunSummary } from './gauntlet.ts';

/*
 * Expedition: a roguelike run. You set out with a deck and two boosters, then
 * travel a map of seven floors, choosing one node per floor: duels (each with
 * the pack it pays out), optional elite fights, camps and shrines, and a final
 * battle at the end. From every pack you keep only a few cards, and boons
 * collected along the way bend the rules in your favour.
 *
 * The deck follows Limited rules: at least 40 cards, any number of copies of
 * what you own, and basic lands for free. The map and every pack are rolled
 * from the run's seed, so reloading can't reroll them.
 */

export const MIN_DECK = 40;
export const START_PACKS = 2;
/** Cards you keep from each pack. */
export const KEEP = 3;
export const LIVES = 3;
export const BASICS: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
const COLORS = Object.keys(BASICS) as Color[];
const isBasic = (name: string) => Object.values(BASICS).includes(name);

export type Pack = { kind: 'booster' } | { kind: 'rare' } | { kind: 'color'; color: Color };
/** Card name -> copies. */
export type Counts = Record<string, number>;

export interface Build {
  main: Counts;
  /** Cards you own that aren't in the deck. Basic lands are never here: they're free. */
  side: Counts;
  /** Packs opened so far; the next pack's roll depends on it. */
  opened: number;
  /** Packs waiting to be opened. */
  packs: Pack[];
  /** Cards kept from the most recent packs, marked as new in the deck builder. */
  fresh: string[];
}

// ---------------------------------------------------------------------------
// Boons
// ---------------------------------------------------------------------------

export type BoonId =
  'hardy' | 'initiative' | 'prepared' | 'trailblazer' | 'collector' | 'lucky' | 'stout';

export const BOONS: Record<BoonId, { name: string; text: string }> = {
  hardy: { name: 'Hardy', text: 'Start every game at 25 life.' },
  initiative: { name: 'Initiative', text: 'You always play first.' },
  prepared: { name: 'Well Prepared', text: 'Start every game with an extra card in hand.' },
  trailblazer: { name: 'Trailblazer', text: 'Start every game with a basic land in play.' },
  collector: {
    name: 'Collector',
    text: `Keep ${KEEP + 1} cards from each pack instead of ${KEEP}.`,
  },
  lucky: { name: 'Lucky Find', text: 'Every pack has an extra rare.' },
  stout: { name: 'Stout Heart', text: 'One more life for the rest of the run.' },
};
const BOON_IDS = Object.keys(BOONS) as BoonId[];

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export type NodeKind = 'duel' | 'elite' | 'camp' | 'shrine' | 'boss';

export interface MapNode {
  kind: NodeKind;
  /** The opponent's deck, for fights. */
  opponent?: string;
  /** What a won duel pays out. */
  reward?: Pack;
}

/** What each floor offers (shuffled into lanes per run). The last floor is the final battle. */
const FLOOR_KINDS: NodeKind[][] = [
  ['duel', 'duel', 'duel'],
  ['duel', 'duel', 'shrine'],
  ['duel', 'elite', 'camp'],
  ['duel', 'duel', 'shrine'],
  ['duel', 'elite', 'camp'],
  ['duel', 'camp', 'shrine'],
  ['boss'],
];
export const FLOORS = FLOOR_KINDS.length;

/**
 * The bot at a fight. Deliberately gentle: Novices first, Apprentices after,
 * and the Master only in elite fights you choose to take on.
 */
export function botFor(floor: number, node: MapNode): BotKind {
  if (node.kind === 'elite') return 'search';
  return floor < 2 ? 'easy' : 'heuristic';
}

export const TIER_NAMES: Record<BotKind, string> = {
  easy: 'Novice',
  heuristic: 'Apprentice',
  search: 'Master',
};

export function makeMap(deck: string, seed: number): MapNode[][] {
  const next = rng((seed ^ 0x5eed_0f) >>> 0);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!;
  const own = deckById(deck).colors;
  const foes = PLAYABLE_DECKS.filter((d) => d.series === 'starter' && d.id !== deck).map(
    (d) => d.id,
  );
  const reward = (): Pack => {
    const r = next();
    if (r < 0.4) return { kind: 'color', color: pick(own.length ? own : COLORS) };
    if (r < 0.7) return { kind: 'color', color: pick(COLORS.filter((c) => !own.includes(c))) };
    return { kind: 'booster' };
  };
  return FLOOR_KINDS.map((kinds) => {
    const lanes = [...kinds];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
    }
    return lanes.map((kind): MapNode => {
      if (kind === 'duel') return { kind, opponent: pick(foes), reward: reward() };
      if (kind === 'elite' || kind === 'boss') return { kind, opponent: pick(foes) };
      return { kind };
    });
  });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** How a floor ended: a fight won or lost, or a camp or shrine visited. */
export type Outcome = 'win' | 'loss' | 'done';
export type Pending = { kind: 'boon'; options: BoonId[] } | { kind: 'camp' };

export interface ExpeditionRun {
  deck: string;
  seed: number;
  map: MapNode[][];
  /** The lane taken on each floor so far. */
  path: number[];
  /** One per finished floor; shorter than `path` while a node is under way. */
  outcomes: Outcome[];
  livesLost: number;
  /** Seed of the match being played at the current node, once it has started. */
  match: number | null;
  boons: BoonId[];
  /** A choice waiting at the current node. */
  pending: Pending | null;
  build: Build;
}

export interface ExpeditionState {
  run: ExpeditionRun | null;
  records: Record<string, DeckRecord>;
}

export const maxLives = (r: ExpeditionRun) => LIVES + (r.boons.includes('stout') ? 1 : 0);
export const keepCount = (r: ExpeditionRun) => KEEP + (r.boons.includes('collector') ? 1 : 0);

export function statusOf(r: ExpeditionRun): 'playing' | 'cleared' | 'out' {
  if (r.outcomes[FLOORS - 1] === 'win') return 'cleared';
  if (r.livesLost >= maxLives(r)) return 'out';
  return 'playing';
}

/** The node you're at and haven't finished yet (a fight to play, a choice to make). */
export function currentNode(
  r: ExpeditionRun,
): { floor: number; lane: number; node: MapNode } | null {
  if (r.path.length <= r.outcomes.length) return null;
  const floor = r.path.length - 1;
  const lane = r.path[floor]!;
  return { floor, lane, node: r.map[floor]![lane]! };
}

/** Lanes you can travel to on the next floor. */
export function reachable(r: ExpeditionRun): number[] {
  const floor = r.path.length;
  if (currentNode(r) || statusOf(r) !== 'playing' || floor >= FLOORS) return [];
  const nodes = r.map[floor]!;
  if (floor === 0 || nodes.length === 1) return nodes.map((_, i) => i);
  const from = r.path[floor - 1]!;
  return nodes.map((_, i) => i).filter((i) => Math.abs(i - from) <= 1);
}

export function newBuild(deck: Decklist): Build {
  return {
    main: Object.fromEntries(deck.cards),
    side: {},
    opened: 0,
    packs: Array.from({ length: START_PACKS }, () => ({ kind: 'booster' }) as const),
    fresh: [],
  };
}

export function startExpedition(s: ExpeditionState, deck: string, seed: number): ExpeditionState {
  const rec = s.records[deck] ?? { runs: 0, clears: 0, best: 0 };
  return {
    records: { ...s.records, [deck]: { ...rec, runs: rec.runs + 1 } },
    run: {
      deck,
      seed,
      map: makeMap(deck, seed),
      path: [],
      outcomes: [],
      livesLost: 0,
      match: null,
      boons: [],
      pending: null,
      build: newBuild(deckById(deck)),
    },
  };
}

const withRun = (s: ExpeditionState, f: (r: ExpeditionRun) => ExpeditionRun): ExpeditionState =>
  s.run ? { ...s, run: f(s.run) } : s;

/** Three boons you don't have yet. */
function boonOffer(r: ExpeditionRun): BoonId[] {
  const next = rng((r.seed ^ Math.imul(r.path.length + 7, 0x2c1b3c6d)) >>> 0);
  const left = BOON_IDS.filter((b) => !r.boons.includes(b));
  for (let i = left.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [left[i], left[j]] = [left[j]!, left[i]!];
  }
  return left.slice(0, 3);
}

/** Travels to a node on the next floor. Camps and shrines ask their question straight away. */
export function enterNode(s: ExpeditionState, lane: number): ExpeditionState {
  return withRun(s, (r) => {
    if (!reachable(r).includes(lane)) return r;
    const moved = { ...r, path: [...r.path, lane] };
    const node = r.map[r.path.length]![lane]!;
    if (node.kind === 'camp') return { ...moved, pending: { kind: 'camp' } };
    if (node.kind === 'shrine')
      return { ...moved, pending: { kind: 'boon', options: boonOffer(moved) } };
    return moved;
  });
}

export function startMatch(s: ExpeditionState, seed: number): ExpeditionState {
  return withRun(s, (r) => (currentNode(r) && !r.pending ? { ...r, match: seed } : r));
}

/**
 * Records a fight. A win pays the node's reward (an elite also offers a boon);
 * a loss costs a life and you move on, except at the final battle, which you
 * retry. Only the match the run is waiting on counts. A draw replays it.
 */
export function recordMatch(
  s: ExpeditionState,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): ExpeditionState {
  const r = s.run;
  const at = r && currentNode(r);
  if (!r || !at || r.match !== seed || statusOf(r) !== 'playing') return s;
  let next: ExpeditionRun = { ...r, match: null };
  if (outcome === 'win') {
    next.outcomes = [...r.outcomes, 'win'];
    if (at.node.kind === 'duel' && at.node.reward)
      next.build = { ...r.build, packs: [...r.build.packs, at.node.reward] };
    if (at.node.kind === 'elite') {
      next.build = { ...r.build, packs: [...r.build.packs, { kind: 'rare' }] };
      const options = boonOffer(r);
      if (options.length) next.pending = { kind: 'boon', options };
    }
  } else if (outcome === 'loss') {
    next = { ...next, livesLost: r.livesLost + 1 };
    if (at.node.kind !== 'boss') next.outcomes = [...r.outcomes, 'loss'];
  }
  const rec = s.records[r.deck] ?? { runs: 1, clears: 0, best: 0 };
  return {
    run: next,
    records: {
      ...s.records,
      [r.deck]: {
        ...rec,
        best: Math.max(rec.best, next.outcomes.length),
        clears: rec.clears + (statusOf(next) === 'cleared' ? 1 : 0),
      },
    },
  };
}

/** At a camp: rest to win back a life, or forage for a booster. */
export function camp(s: ExpeditionState, choice: 'rest' | 'forage'): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'camp') return r;
    const done = { ...r, pending: null, outcomes: [...r.outcomes, 'done' as const] };
    if (choice === 'rest') return { ...done, livesLost: Math.max(0, r.livesLost - 1) };
    return { ...done, build: { ...r.build, packs: [...r.build.packs, { kind: 'booster' }] } };
  });
}

/** Takes a boon from a shrine (which finishes the floor) or an elite's reward. */
export function chooseBoon(s: ExpeditionState, boon: BoonId): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'boon' || !r.pending.options.includes(boon)) return r;
    const atShrine = currentNode(r)?.node.kind === 'shrine';
    return {
      ...r,
      boons: [...r.boons, boon],
      pending: null,
      outcomes: atShrine ? [...r.outcomes, 'done'] : r.outcomes,
    };
  });
}

/** The engine setup the run's boons ask for. */
export function gameOptions(r: ExpeditionRun): Omit<NewGameOptions, 'decks' | 'seed'> {
  const has = (b: BoonId) => r.boons.includes(b);
  return {
    ...(has('hardy') && { life: { p1: 25 } }),
    ...(has('initiative') && { startingPlayer: 'p1' as const }),
    ...(has('prepared') && { extraCards: { p1: 1 } }),
    ...(has('trailblazer') && { landInPlay: ['p1' as const] }),
  };
}

export function summarize(r: ExpeditionRun): RunSummary {
  const wins = r.outcomes.filter((o) => o !== 'loss').length;
  return {
    deck: r.deck,
    status: statusOf(r),
    unit: 'Floor',
    step: Math.min(r.outcomes.length + 1, FLOORS),
    steps: FLOORS,
    done: wins,
    livesLeft: maxLives(r) - r.livesLost,
    lives: maxLives(r),
  };
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/** Foundations cards we can play, by rarity. Basic lands aren't in packs. */
const FDN = SCRYFALL.filter((c) => c.set === 'fdn' && !c.typeLine.startsWith('Basic'));
const byRarity = (r: string) => FDN.filter((c) => c.rarity === r);
const SHEETS = {
  common: byRarity('common'),
  uncommon: byRarity('uncommon'),
  rare: byRarity('rare'),
  mythic: byRarity('mythic'),
};
type Sheet = typeof SHEETS.common;

export const PACK_SIZE = { rare: 1, uncommon: 3, common: 8 };

/**
 * One pack: a rare (a mythic one time in eight), three uncommons and eight
 * commons, no duplicates. A colour pack draws most slots from that colour; a
 * rare pack, and every pack with Lucky Find, swaps a common for another rare.
 */
export function rollPack(pack: Pack, seed: number, extraRare = false): string[] {
  const next = rng(seed);
  const picked = new Set<string>();
  const inColor = (sheet: Sheet) =>
    pack.kind === 'color' ? sheet.filter((c) => c.colors.includes(pack.color)) : sheet;
  const draw = (sheet: Sheet, themed: boolean) => {
    const from = (themed && inColor(sheet).length ? inColor(sheet) : sheet).filter(
      (c) => !picked.has(c.name),
    );
    const card = from[Math.floor(next() * from.length)];
    if (card) picked.add(card.name);
  };
  const rare = (themed: boolean) => draw(next() < 1 / 8 ? SHEETS.mythic : SHEETS.rare, themed);
  const color = pack.kind === 'color';
  const rares = 1 + (pack.kind === 'rare' ? 1 : 0) + (extraRare ? 1 : 0);
  rare(color);
  for (let i = 0; i < PACK_SIZE.uncommon; i++) draw(SHEETS.uncommon, color && i < 2);
  for (let i = 0; i < PACK_SIZE.common - (rares - 1); i++) draw(SHEETS.common, color && i < 5);
  for (let i = 1; i < rares; i++) rare(false);
  return [...picked];
}

const packSeed = (r: ExpeditionRun, n: number) => (r.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;

/** The cards in each waiting pack. */
export function pendingPacks(r: ExpeditionRun): string[][] {
  const lucky = r.boons.includes('lucky');
  return r.build.packs.map((p, i) => rollPack(p, packSeed(r, r.build.opened + i), lucky));
}

/**
 * Opens the waiting packs, keeping the chosen cards from each (at most the
 * run's keep count, and only cards that were in that pack).
 */
export function openPacks(s: ExpeditionState, kept: string[][]): ExpeditionState {
  return withRun(s, (r) => {
    const packs = pendingPacks(r);
    const keep = keepCount(r);
    const cards = packs.flatMap((pack, i) =>
      [...new Set(kept[i] ?? [])].filter((c) => pack.includes(c)).slice(0, keep),
    );
    const side = { ...r.build.side };
    for (const c of cards) side[c] = (side[c] ?? 0) + 1;
    const b = r.build;
    return {
      ...r,
      build: { ...b, side, opened: b.opened + b.packs.length, packs: [], fresh: cards },
    };
  });
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

/** Moves one copy between deck and collection. Basic lands come from and go back to the free supply. */
export function moveCard(s: ExpeditionState, name: string, to: 'main' | 'side'): ExpeditionState {
  return withRun(s, (r) => {
    const b = r.build;
    const from = to === 'main' ? 'side' : 'main';
    const basic = isBasic(name);
    if (!basic && !b[from][name]) return r;
    let build: Build;
    if (basic && to === 'main') build = { ...b, main: bump(b.main, name, 1) };
    else if (basic) build = b.main[name] ? { ...b, main: bump(b.main, name, -1) } : b;
    else build = { ...b, [from]: bump(b[from], name, -1), [to]: bump(b[to], name, 1) };
    return { ...r, build };
  });
}

function bump(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

export const size = (c: Counts) => Object.values(c).reduce((n, k) => n + k, 0);

export function deckCards(b: Build): CardDefId[] {
  return Object.entries(b.main).flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

const byName = new Map(SCRYFALL.map((c) => [c.name, c]));

/** Colours of the deck's spells, most played first. */
export function deckColors(b: Build): Color[] {
  const n: Partial<Record<Color, number>> = {};
  for (const [name, k] of Object.entries(b.main)) {
    const c = byName.get(name);
    if (!c || c.typeLine.includes('Land')) continue;
    for (const col of c.colors as Color[]) n[col] = (n[col] ?? 0) + k;
  }
  return COLORS.filter((c) => n[c]).sort((a, b) => n[b]! - n[a]!);
}

/** The run's deck as a decklist, for the board and the deck view. */
export function runDeck(r: ExpeditionRun): Decklist {
  const base = deckById(r.deck);
  const colors = deckColors(r.build);
  return {
    ...base,
    colors: colors.length ? colors.slice(0, 2) : base.colors,
    cards: Object.entries(r.build.main),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.expedition';
// 2: the map. Runs from version 1 (a straight ladder) are dropped; records are kept.
const VERSION = 2;

export function loadExpedition(): ExpeditionState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      (ExpeditionState & { v: number }) | null;
    if (!g) return { run: null, records: {} };
    if (g.v !== VERSION) return { run: null, records: g.records ?? {} };
    const known = (name: string) => byName.has(name);
    const deck = (id: string) => !!findDeck(id);
    const r = g.run;
    const ok =
      r &&
      deck(r.deck) &&
      r.map.every((f) => f.every((n) => !n.opponent || deck(n.opponent))) &&
      Object.keys(r.build.main).every(known) &&
      Object.keys(r.build.side).every(known);
    return { run: ok ? r : null, records: g.records ?? {} };
  } catch {
    return { run: null, records: {} };
  }
}

export function saveExpedition(s: ExpeditionState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Storage unavailable (private mode): the run lasts for this session only.
  }
}
