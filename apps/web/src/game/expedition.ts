import { deckById, type Decklist, findDeck, SCRYFALL, slug } from '@mtg/cards';
import type { CardDefId, Color } from '@mtg/engine';
import {
  type GauntletState,
  recordResult,
  rng,
  type Run,
  startRun,
  statusOf,
  wins,
} from './gauntlet.ts';

/*
 * Expedition: the gauntlet as a roguelike. You set out with a starter deck and
 * a couple of boosters, and every win opens another pack of your choice. The
 * deck follows Limited rules: at least 40 cards, any number of copies of what
 * you own, and basic lands for free. Packs are rolled from the run's seed and
 * how many have been opened, so reloading can't reroll them.
 */

export const MIN_DECK = 40;
export const START_PACKS = 2;
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
  /** A choice of packs after a win, before one moves to `packs`. */
  offer: Pack[] | null;
  /** Cards from the most recent packs, marked as new in the deck builder. */
  fresh: string[];
}

export interface ExpeditionRun extends Run {
  seed: number;
  build: Build;
}

export type ExpeditionState = GauntletState<ExpeditionRun>;

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
 * rare pack swaps a common for a second rare.
 */
export function rollPack(pack: Pack, seed: number): string[] {
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
  // Colour packs: the rare, two uncommons and five commons are on colour.
  const color = pack.kind === 'color';
  rare(color);
  for (let i = 0; i < PACK_SIZE.uncommon; i++) draw(SHEETS.uncommon, color && i < 2);
  const commons = PACK_SIZE.common - (pack.kind === 'rare' ? 1 : 0);
  for (let i = 0; i < commons; i++) draw(SHEETS.common, color && i < 5);
  if (pack.kind === 'rare') rare(false);
  return [...picked];
}

const packSeed = (run: ExpeditionRun, n: number) => (run.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;

/** The cards in each waiting pack. */
export function pendingPacks(run: ExpeditionRun): string[][] {
  return run.build.packs.map((p, i) => rollPack(p, packSeed(run, run.build.opened + i)));
}

/** Three packs to choose from: one in a colour you play, one in a colour you don't, one with an extra rare. */
export function offerFor(run: ExpeditionRun): Pack[] {
  const next = rng(packSeed(run, 1000 + wins(run)));
  const mine = deckColors(run.build);
  const theirs = COLORS.filter((c) => !mine.includes(c));
  const pick = (cs: Color[]) => cs[Math.floor(next() * cs.length)]!;
  return [
    { kind: 'color', color: pick(mine.length ? mine : COLORS) },
    { kind: 'color', color: pick(theirs.length ? theirs : COLORS) },
    { kind: 'rare' },
  ];
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export function newBuild(deck: Decklist): Build {
  return {
    main: Object.fromEntries(deck.cards),
    side: {},
    opened: 0,
    packs: Array.from({ length: START_PACKS }, () => ({ kind: 'booster' }) as const),
    offer: null,
    fresh: [],
  };
}

export function startExpedition(s: ExpeditionState, deck: string, seed: number): ExpeditionState {
  const g = startRun(s, deck, seed);
  return { ...g, run: { ...g.run!, seed, build: newBuild(deckById(deck)) } };
}

const withBuild = (s: ExpeditionState, f: (b: Build, run: ExpeditionRun) => Build) =>
  s.run ? { ...s, run: { ...s.run, build: f(s.run.build, s.run) } } : s;

/** Takes one of the offered packs. */
export function choosePack(s: ExpeditionState, i: number): ExpeditionState {
  return withBuild(s, (b) =>
    b.offer?.[i] ? { ...b, packs: [...b.packs, b.offer[i]], offer: null } : b,
  );
}

/** Opens the waiting packs into the collection. */
export function openPacks(s: ExpeditionState): ExpeditionState {
  return withBuild(s, (b, run) => {
    const cards = pendingPacks(run).flat();
    const side = { ...b.side };
    for (const c of cards) side[c] = (side[c] ?? 0) + 1;
    return { ...b, side, opened: b.opened + b.packs.length, packs: [], fresh: cards };
  });
}

/** Moves one copy between deck and collection. Basic lands come from and go back to the free supply. */
export function moveCard(s: ExpeditionState, name: string, to: 'main' | 'side'): ExpeditionState {
  return withBuild(s, (b) => {
    const from = to === 'main' ? 'side' : 'main';
    const basic = isBasic(name);
    if (!basic && !b[from][name]) return b;
    if (basic && to === 'main') return { ...b, main: bump(b.main, name, 1) };
    if (basic) return b.main[name] ? { ...b, main: bump(b.main, name, -1) } : b;
    return { ...b, [from]: bump(b[from], name, -1), [to]: bump(b[to], name, 1) };
  });
}

function bump(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

/** Records a match; a win that doesn't end the run earns a choice of packs. */
export function recordExpedition(
  s: ExpeditionState,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): ExpeditionState {
  const next = recordResult(s, seed, outcome);
  const run = next.run;
  if (!run || !s.run || wins(run) === wins(s.run) || statusOf(run) !== 'playing') return next;
  return withBuild(next, (b, r) => ({ ...b, offer: offerFor(r) }));
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

export const size = (c: Counts) => Object.values(c).reduce((n, k) => n + k, 0);

/** The run's deck is legal and there's nothing left to open or choose. */
export const ready = (b: Build) => size(b.main) >= MIN_DECK && !b.packs.length && !b.offer;

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
export function runDeck(run: ExpeditionRun): Decklist {
  const base = deckById(run.deck);
  const colors = deckColors(run.build);
  return {
    ...base,
    colors: colors.length ? colors.slice(0, 2) : base.colors,
    cards: Object.entries(run.build.main),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.expedition';
const VERSION = 1;

export function loadExpedition(): ExpeditionState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      (ExpeditionState & { v: number }) | null;
    if (g?.v !== VERSION) return { run: null, records: {} };
    const known = (name: string) => byName.has(name);
    const deck = (id: string) => !!findDeck(id);
    const run =
      g.run &&
      deck(g.run.deck) &&
      g.run.opponents.every(deck) &&
      Object.keys(g.run.build.main).every(known) &&
      Object.keys(g.run.build.side).every(known)
        ? g.run
        : null;
    return { run, records: g.records ?? {} };
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
