import {
  deckById,
  type Decklist,
  findDeck,
  pickOpponent,
  registerDeck,
  SCRYFALL,
  scryfallById,
  slug,
} from '@mtg/cards';
import type { CardDefId, Color, NewGameOptions } from '@mtg/engine';
import type { BotKind, LevelBot } from './bot.worker.ts';
import { manaValue } from './deckView.ts';
import { type DeckRecord, rng, type RunSummary } from './gauntlet.ts';

/*
 * Expedition: a roguelike run. You set out with a deck and two boosters, then
 * travel a map of ten floors, choosing one node per floor: duels (each with
 * the pack it pays out), optional elite fights, camps and shrines, and a final
 * battle at the end. From every pack you keep only a few cards, and boons
 * collected along the way bend the rules in your favour. Clear the final
 * battle and you can set out on a new map with the deck and collection you
 * built; lives and boons start over, and the fights are no tougher.
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

export type NodeKind =
  'duel' | 'elite' | 'camp' | 'shrine' | 'treasure' | 'merchant' | 'mystery' | 'boss';

export interface MapNode {
  kind: NodeKind;
  /** The opponent's deck, for fights. */
  opponent?: string;
  /** What a won duel pays out. */
  reward?: Pack;
  /** What happens at a mystery node. */
  event?: EventId;
}

/** What each floor offers (shuffled into lanes per run). The last floor is the final battle. */
const FLOOR_KINDS: NodeKind[][] = [
  ['duel', 'duel', 'duel'],
  ['duel', 'mystery', 'treasure'],
  ['duel', 'elite', 'shrine'],
  ['duel', 'camp', 'mystery'],
  ['duel', 'merchant', 'elite'],
  ['duel', 'mystery', 'treasure'],
  ['duel', 'elite', 'camp'],
  ['duel', 'merchant', 'mystery'],
  ['duel', 'camp', 'shrine'],
  ['boss'],
];
export const FLOORS = FLOOR_KINDS.length;

/** The top difficulty: the heuristic bot (the Apprentice), met at the final battle. */
export const MAX_DIFFICULTY = 7;

/**
 * How hard a fight is, from 1 to 7. Duels climb from 1 on the first floor to
 * 6 on the floor before the final battle, elite fights are two steps above
 * their floor, and the final battle is the top. `floors` is the map's length
 * (maps saved before the map grew are shorter).
 */
export function difficultyOf(floor: number, node: MapNode, floors = FLOORS): number {
  if (node.kind === 'boss') return MAX_DIFFICULTY;
  const duel = 1 + Math.floor((floor * 5) / Math.max(1, floors - 2));
  return Math.min(MAX_DIFFICULTY, duel + (node.kind === 'elite' ? 2 : 0));
}

/** The bot for a difficulty: the easy bot's levels, then the heuristic bot. */
export function botFor(floor: number, node: MapNode, floors = FLOORS): BotKind {
  const d = difficultyOf(floor, node, floors);
  return d >= MAX_DIFFICULTY ? 'heuristic' : (`level${d}` as LevelBot);
}

export function difficultyName(d: number): string {
  return d <= 2 ? 'Very easy' : d <= 4 ? 'Easy' : d <= 6 ? 'Fair' : 'Medium';
}

export function makeMap(deck: string, seed: number): MapNode[][] {
  const next = rng((seed ^ 0x5eed_0f) >>> 0);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!;
  const own = deckById(deck).colors;
  // Opponents are mostly Jump In pairs, and none comes back on the same map while others are left.
  const met: string[] = [];
  const foe = () => {
    const id = pickOpponent((n) => Math.floor(next() * n), deck, met);
    met.push(id);
    return id;
  };
  const reward = (): Pack => {
    const r = next();
    if (r < 0.4) return { kind: 'color', color: pick(own.length ? own : COLORS) };
    if (r < 0.7) return { kind: 'color', color: pick(COLORS.filter((c) => !own.includes(c))) };
    return { kind: 'booster' };
  };
  // Mystery events don't repeat until every one has come up.
  const events: EventId[] = [];
  const event = () => {
    if (!events.length) events.push(...EVENT_IDS);
    return events.splice(Math.floor(next() * events.length), 1)[0]!;
  };
  return FLOOR_KINDS.map((kinds) => {
    const lanes = [...kinds];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
    }
    return lanes.map((kind): MapNode => {
      if (kind === 'duel') return { kind, opponent: foe(), reward: reward() };
      if (kind === 'elite' || kind === 'boss') return { kind, opponent: foe() };
      if (kind === 'mystery') return { kind, event: event() };
      return { kind };
    });
  });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** How a floor ended: a fight won or lost, or a camp or shrine visited. */
export type Outcome = 'win' | 'loss' | 'done';
export type Pending =
  | { kind: 'boon'; options: BoonId[] }
  | { kind: 'camp' }
  | { kind: 'event'; event: EventId }
  | { kind: 'merchant'; offers: string[] }
  /** After an elite: pick one of three rares, then a boon. */
  | { kind: 'rareDraft'; options: string[] };

// ---------------------------------------------------------------------------
// Mystery events: a little story and two choices, none of which cost cards.
// ---------------------------------------------------------------------------

export type EventId = 'gambler' | 'library' | 'spring' | 'hermit' | 'caravan';

export interface EventChoice {
  label: string;
  text: string;
  /** Lives won back (or lost, when negative). */
  life?: number;
  /** 'main' is a colour pack in your deck's main colour. */
  pack?: 'booster' | 'rare' | 'main';
  boon?: boolean;
}

export const EVENTS: Record<EventId, { title: string; text: string; choices: EventChoice[] }> = {
  gambler: {
    title: 'A Grinning Gambler',
    text: 'A stranger rattles a cup of bones. "One life for a rare prize. Fair game, friend?"',
    choices: [
      { label: 'Take the bet', text: 'Lose a life, take a rare pack', life: -1, pack: 'rare' },
      { label: 'Walk on', text: 'Keep your lives' },
    ],
  },
  library: {
    title: 'A Forgotten Library',
    text: 'Dusty shelves lean under spellbooks nobody has opened in a century.',
    choices: [
      { label: 'Study', text: 'Choose a boon', boon: true },
      { label: 'Take a tome', text: 'A pack in your main colour', pack: 'main' },
    ],
  },
  spring: {
    title: 'A Healing Spring',
    text: 'Clear water bubbles up between the stones, warm to the touch.',
    choices: [
      { label: 'Drink', text: 'Win back a life', life: 1 },
      { label: 'Fill your flasks', text: 'Trade them for a booster in town', pack: 'booster' },
    ],
  },
  hermit: {
    title: "A Hermit's Hut",
    text: 'An old mage waves you in for tea and will not stop talking.',
    choices: [
      { label: 'Listen', text: 'Choose a boon', boon: true },
      { label: 'Take the herbs', text: 'Win back a life', life: 1 },
    ],
  },
  caravan: {
    title: 'A Stranded Caravan',
    text: 'A merchant wagon sits in a ditch, one wheel spinning.',
    choices: [
      { label: 'Help push', text: 'They pay you in cards: a booster', pack: 'booster' },
      { label: 'Ask about the road', text: 'Choose a boon', boon: true },
    ],
  },
};
const EVENT_IDS = Object.keys(EVENTS) as EventId[];

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
  /** Expeditions cleared with this deck before the current map (absent on the first). */
  loop?: number;
  /** The starting deck, when it isn't one of ours (a Season deck). */
  custom?: Decklist;
}

export interface ExpeditionState {
  run: ExpeditionRun | null;
  records: Record<string, DeckRecord>;
}

export const maxLives = (r: ExpeditionRun) => LIVES + (r.boons.includes('stout') ? 1 : 0);
export const keepCount = (r: ExpeditionRun) => KEEP + (r.boons.includes('collector') ? 1 : 0);

/** Floors on the run's map (shorter on maps saved before it grew). */
export const floorsOf = (r: ExpeditionRun) => r.map.length;

export function statusOf(r: ExpeditionRun): 'playing' | 'cleared' | 'out' {
  if (r.outcomes[floorsOf(r) - 1] === 'win') return 'cleared';
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
  if (currentNode(r) || statusOf(r) !== 'playing' || floor >= floorsOf(r)) return [];
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

/** Sets out with a deck. The run keeps a copy of a Season deck, which can change or go. */
export function startExpedition(s: ExpeditionState, deck: string, seed: number): ExpeditionState {
  const list = deckById(deck);
  const custom = list.series === 'season' ? list : undefined;
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
      build: newBuild(list),
      ...(custom && { custom }),
    },
  };
}

/**
 * After clearing an expedition: a new map with the same deck and collection.
 * Lives and boons start over, and the fights climb from the bottom again.
 */
export function continueExpedition(s: ExpeditionState, seed: number): ExpeditionState {
  const r = s.run;
  if (!r || statusOf(r) !== 'cleared') return s;
  return {
    ...s,
    run: {
      ...r,
      seed,
      map: makeMap(r.deck, seed),
      path: [],
      outcomes: [],
      livesLost: 0,
      match: null,
      boons: [],
      pending: null,
      build: { ...r.build, fresh: [] },
      loop: (r.loop ?? 0) + 1,
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

/**
 * Three rares or mythics, mostly in the deck's colours, for merchants and
 * elite rewards. `salt` keeps different offers on the same floor apart.
 */
function rareOffer(r: ExpeditionRun, salt: number): string[] {
  const next = rng((r.seed ^ Math.imul(r.path.length * 31 + salt, 0x68e31da4)) >>> 0);
  const colors = deckColors(r.build).slice(0, 2);
  const sheets = SHEETS[packSetOf(r)];
  const rares = [...sheets.rare, ...sheets.mythic];
  const fits = rares.filter(
    (c) => c.colors.length > 0 && c.colors.every((x) => colors.includes(x as Color)),
  );
  const picked: string[] = [];
  for (let i = 0; i < 3; i++) {
    // Two in your colours, one from anywhere.
    const from = (i < 2 && fits.length > 2 ? fits : rares).filter((c) => !picked.includes(c.name));
    picked.push(from[Math.floor(next() * from.length)]!.name);
  }
  return picked;
}

/**
 * Travels to a node on the next floor. Camps, shrines, merchants and mysteries
 * ask their question straight away; a treasure is a free booster.
 */
export function enterNode(s: ExpeditionState, lane: number): ExpeditionState {
  return withRun(s, (r) => {
    if (!reachable(r).includes(lane)) return r;
    const moved = { ...r, path: [...r.path, lane] };
    const node = r.map[r.path.length]![lane]!;
    switch (node.kind) {
      case 'camp':
        return { ...moved, pending: { kind: 'camp' } };
      case 'shrine':
        return { ...moved, pending: { kind: 'boon', options: boonOffer(moved) } };
      case 'merchant':
        return { ...moved, pending: { kind: 'merchant', offers: rareOffer(moved, 1) } };
      case 'mystery':
        return { ...moved, pending: { kind: 'event', event: node.event ?? 'spring' } };
      case 'treasure':
        return {
          ...moved,
          outcomes: [...r.outcomes, 'done'],
          build: { ...r.build, packs: [...r.build.packs, { kind: 'booster' }] },
        };
      default:
        return moved;
    }
  });
}

/** Makes a mystery event's choice. A boon choice asks which boon next. */
export function resolveEvent(s: ExpeditionState, choice: number): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'event') return r;
    const c = EVENTS[r.pending.event].choices[choice];
    if (!c || !canChoose(r, c)) return r;
    let next: ExpeditionRun = { ...r, pending: null, outcomes: [...r.outcomes, 'done'] };
    if (c.life) next.livesLost = Math.max(0, r.livesLost - c.life);
    if (c.pack) {
      const main = deckColors(r.build)[0];
      const pack: Pack =
        c.pack === 'main' && main
          ? { kind: 'color', color: main }
          : c.pack === 'rare'
            ? { kind: 'rare' }
            : { kind: 'booster' };
      next.build = { ...r.build, packs: [...r.build.packs, pack] };
    }
    if (c.boon) {
      const options = boonOffer(r);
      if (options.length) next = { ...next, pending: { kind: 'boon', options } };
    }
    return next;
  });
}

/** A choice that would cost your last life isn't on offer. */
export const canChoose = (r: ExpeditionRun, c: EventChoice): boolean =>
  !c.life || c.life > 0 || maxLives(r) - r.livesLost > -c.life;

/** How many copies of a card you own, in the deck or the collection. */
export const owned = (b: Build, name: string): number => (b.main[name] ?? 0) + (b.side[name] ?? 0);

/**
 * Buys one of the merchant's cards for two of yours (taken from the
 * collection first, then the deck). Basic lands aren't currency.
 */
export function trade(s: ExpeditionState, buy: string, give: [string, string]): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'merchant' || !r.pending.offers.includes(buy)) return r;
    let b = r.build;
    for (const name of give) {
      if (isBasic(name) || owned(b, name) < 1) return r;
      b = b.side[name]
        ? { ...b, side: bump(b.side, name, -1) }
        : { ...b, main: bump(b.main, name, -1) };
    }
    return {
      ...r,
      pending: null,
      outcomes: [...r.outcomes, 'done'],
      build: { ...b, side: bump(b.side, buy, 1), fresh: [buy] },
    };
  });
}

/** Leaves the merchant without buying. */
export function leaveMerchant(s: ExpeditionState): ExpeditionState {
  return withRun(s, (r) =>
    r.pending?.kind === 'merchant' ? { ...r, pending: null, outcomes: [...r.outcomes, 'done'] } : r,
  );
}

/** Takes one of an elite's three rares; a boon choice follows. */
export function chooseRare(s: ExpeditionState, name: string): ExpeditionState {
  return withRun(s, (r) => {
    if (r.pending?.kind !== 'rareDraft' || !r.pending.options.includes(name)) return r;
    const options = boonOffer(r);
    return {
      ...r,
      pending: options.length ? { kind: 'boon', options } : null,
      build: { ...r.build, side: bump(r.build.side, name, 1), fresh: [name] },
    };
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
    if (at.node.kind === 'elite') next.pending = { kind: 'rareDraft', options: rareOffer(r, 2) };
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
    step: Math.min(r.outcomes.length + 1, floorsOf(r)),
    steps: floorsOf(r),
    done: wins,
    livesLeft: maxLives(r) - r.livesLost,
    lives: maxLives(r),
  };
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

/** The set a booster comes from: Foundations, or the set of a Bloomburrow or Marvel deck. */
export type PackSet = 'fdn' | 'blb' | 'msh';

/** Booster names, by set. */
export const PACK_SET_NAMES: Record<PackSet, string> = {
  fdn: 'Foundations',
  blb: 'Bloomburrow',
  msh: 'Marvel Super Heroes',
};

/** An expedition with a Bloomburrow or Marvel deck opens that set's boosters. */
export function packSetOf(r: Pick<ExpeditionRun, 'deck'>): PackSet {
  const set = findDeck(r.deck)?.set;
  return set === 'blb' || set === 'msh' ? set : 'fdn';
}

/** Cards of a set we can play, by rarity. Basic lands aren't in packs. */
function sheetsOf(set: PackSet) {
  // A double-faced card's back face comes with its front.
  const cards = SCRYFALL.filter(
    (c) => c.set === set && !c.typeLine.startsWith('Basic') && !c.front,
  );
  const byRarity = (r: string) => cards.filter((c) => c.rarity === r);
  return {
    common: byRarity('common'),
    uncommon: byRarity('uncommon'),
    rare: byRarity('rare'),
    mythic: byRarity('mythic'),
  };
}
const SHEETS = { fdn: sheetsOf('fdn'), blb: sheetsOf('blb'), msh: sheetsOf('msh') };
type Sheet = (typeof SHEETS.fdn)['common'];

export const PACK_SIZE = { rare: 1, uncommon: 3, common: 8 };

/**
 * One pack: a rare (a mythic one time in eight), three uncommons and eight
 * commons, no duplicates. A colour pack draws most slots from that colour; a
 * rare pack, and every pack with Lucky Find, swaps a common for another rare.
 */
export function rollPack(
  pack: Pack,
  seed: number,
  extraRare = false,
  set: PackSet = 'fdn',
): string[] {
  const sheets = SHEETS[set];
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
  const rare = (themed: boolean) => draw(next() < 1 / 8 ? sheets.mythic : sheets.rare, themed);
  const color = pack.kind === 'color';
  const rares = 1 + (pack.kind === 'rare' ? 1 : 0) + (extraRare ? 1 : 0);
  rare(color);
  for (let i = 0; i < PACK_SIZE.uncommon; i++) draw(sheets.uncommon, color && i < 2);
  for (let i = 0; i < PACK_SIZE.common - (rares - 1); i++) draw(sheets.common, color && i < 5);
  for (let i = 1; i < rares; i++) rare(false);
  return [...picked];
}

const packSeed = (r: ExpeditionRun, n: number) => (r.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;

/** The cards in each waiting pack. */
export function pendingPacks(r: ExpeditionRun): string[][] {
  const lucky = r.boons.includes('lucky');
  const set = packSetOf(r);
  return r.build.packs.map((p, i) => rollPack(p, packSeed(r, r.build.opened + i), lucky, set));
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

/**
 * A Season deck as a decklist to set out with. Season decks count cards by
 * id; any we don't know are left out. The deck box shows its best creature.
 */
export function seasonDecklist(
  saveId: string,
  deck: { id: string; name: string; cards: Counts },
): Decklist {
  const cards = Object.entries(deck.cards).flatMap(([id, n]): [string, number][] => {
    const name = scryfallById.get(id)?.name;
    return name && n > 0 ? [[name, n]] : [];
  });
  const spells = cards.map(([n]) => byName.get(n)!).filter((c) => !c.typeLine.includes('Land'));
  const rank = (c: (typeof spells)[number]) =>
    (c.typeLine.includes('Creature') ? 10 : 0) + (RARITY_SCORE[c.rarity] ?? 0) + mv(c.name) / 10;
  const face = [...spells].sort((a, b) => rank(b) - rank(a))[0]?.name ?? cards[0]?.[0] ?? 'Plains';
  const colors = deckColors({
    main: Object.fromEntries(cards),
    side: {},
    opened: 0,
    packs: [],
    fresh: [],
  });
  return {
    id: `season:${saveId}:${deck.id}`,
    name: deck.name,
    colors: colors.length ? colors.slice(0, 2) : ['W'],
    face,
    source: 'custom',
    series: 'season',
    cards,
  };
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
// Deck help: friendly notes and a suggested 40
// ---------------------------------------------------------------------------

export const LANDS_PER_40 = 17;
const COLOR_WORDS: Record<Color, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};
const RARITY_SCORE: Record<string, number> = { common: 1, uncommon: 2, rare: 3, mythic: 4 };
const isLand = (name: string) => byName.get(name)?.typeLine.includes('Land') ?? false;
const colorsOf = (name: string) => (byName.get(name)?.colors ?? []) as Color[];
const mv = (name: string) => manaValue(byName.get(name)?.manaCost ?? '');

/** Colours of mana a land makes: basics by name, others from their "Add {G}" text. */
export function landColors(name: string): Color[] {
  const basic = COLORS.find((c) => BASICS[c] === name);
  if (basic) return [basic];
  const text = byName.get(name)?.oracleText ?? '';
  return COLORS.filter((c) => new RegExp(`Add[^.]*\\{${c}\\}`).test(text));
}

/** Plain-language notes on the deck: land count, colours and mana curve. */
export function deckAdvice(b: Build): string[] {
  const total = size(b.main);
  if (total < MIN_DECK) return [];
  const cards = Object.entries(b.main);
  const count = (pred: (name: string) => boolean) =>
    cards.filter(([n]) => pred(n)).reduce((k, [, c]) => k + c, 0);
  const notes: string[] = [];

  const lands = count(isLand);
  const want = Math.round((total * LANDS_PER_40) / 40);
  if (lands < want - 2)
    notes.push(
      `Only ${lands} lands. About ${want} is usual for ${total} cards, so you can cast your spells on time.`,
    );
  else if (lands > want + 2)
    notes.push(
      `${lands} lands is a lot. About ${want} is usual, which leaves more room for spells.`,
    );
  if (total > 42)
    notes.push(`${total} cards. Trimming toward 40 means you draw your best cards more often.`);

  const perColor = COLORS.map((c) => ({
    c,
    n: count((name) => !isLand(name) && colorsOf(name).includes(c)),
  })).filter((x) => x.n > 0);
  if (perColor.length >= 3) {
    const least = [...perColor].sort((a, b) => a.n - b.n)[0]!;
    notes.push(
      `Your spells use ${perColor.length} colours. Two is much easier to cast; your ${COLOR_WORDS[least.c]} cards (${least.n}) are the easiest to cut.`,
    );
  }
  const makes = new Set(cards.filter(([n]) => isLand(n)).flatMap(([n]) => landColors(n)));
  for (const { c } of perColor)
    if (!makes.has(c))
      notes.push(
        `You have ${COLOR_WORDS[c]} spells but nothing that makes ${COLOR_WORDS[c]} mana. Add some ${BASICS[c]}s.`,
      );

  const spells = total - lands;
  const cheap = count((n) => !isLand(n) && mv(n) <= 2);
  const big = count((n) => !isLand(n) && mv(n) >= 5);
  if (spells >= 15 && cheap < Math.round(spells * 0.25))
    notes.push(`Only ${cheap} spells cost 2 or less. A few more cheap cards help you start fast.`);
  if (big > Math.round(spells * 0.25))
    notes.push(`${big} spells cost 5 or more. Too many can leave you with nothing to do early on.`);
  return notes;
}

/**
 * A sensible 40 from everything you own: the two colours with the strongest
 * cards, their best 23 spells (with only a few expensive ones), matching
 * non-basic lands, and basics split by the spells' coloured mana symbols.
 */
export function suggestDeck(b: Build): Pick<Build, 'main' | 'side'> {
  const pool: Counts = {};
  for (const [n, k] of [...Object.entries(b.main), ...Object.entries(b.side)])
    if (!isBasic(n)) pool[n] = (pool[n] ?? 0) + k;
  const score = (n: string) =>
    (RARITY_SCORE[byName.get(n)?.rarity ?? 'common'] ?? 1) +
    (byName.get(n)?.typeLine.includes('Creature') ? 0.5 : 0) -
    (mv(n) >= 6 ? 1 : 0);

  const weight = new Map<Color, number>();
  for (const [n, k] of Object.entries(pool))
    if (!isLand(n)) for (const c of colorsOf(n)) weight.set(c, (weight.get(c) ?? 0) + score(n) * k);
  const two = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([c]) => c);
  const fits = (n: string) => colorsOf(n).every((c) => two.includes(c));

  const copies = Object.entries(pool)
    .filter(([n]) => !isLand(n))
    .flatMap(([n, k]) => Array<string>(k).fill(n))
    .sort((a, b) => Number(fits(b)) - Number(fits(a)) || score(b) - score(a) || mv(a) - mv(b));
  const spells: string[] = [];
  const later: string[] = [];
  for (const n of copies) {
    if (spells.length >= MIN_DECK - LANDS_PER_40) break;
    const expensive = mv(n) >= 5 && spells.filter((x) => mv(x) >= 5).length >= 4;
    if (!fits(n) || expensive) later.push(n);
    else spells.push(n);
  }
  while (spells.length < MIN_DECK - LANDS_PER_40 && later.length) spells.push(later.shift()!);

  const main: Counts = {};
  const add = (n: string, k = 1) => (main[n] = (main[n] ?? 0) + k);
  spells.forEach((n) => add(n));
  let lands = 0;
  for (const [n, k] of Object.entries(pool)) {
    const makes = landColors(n);
    if (!isLand(n) || !makes.length || !makes.every((c) => two.includes(c))) continue;
    const take = Math.min(k, LANDS_PER_40 - lands);
    if (take > 0) add(n, take);
    lands += take;
  }
  // Basics in proportion to the coloured mana symbols the spells ask for.
  const pips = new Map<Color, number>();
  for (const n of spells)
    for (const [, sym] of (byName.get(n)?.manaCost ?? '').matchAll(/\{([^}]+)\}/g))
      for (const c of COLORS) if (sym!.includes(c)) pips.set(c, (pips.get(c) ?? 0) + 1);
  const colors = two.length ? two : ['G' as Color];
  const totalPips = colors.reduce((k, c) => k + (pips.get(c) ?? 0), 0) || colors.length;
  let left = LANDS_PER_40 - lands;
  colors.forEach((c, i) => {
    const k =
      i === colors.length - 1
        ? left
        : Math.round(((pips.get(c) ?? 1) / totalPips) * (LANDS_PER_40 - lands));
    if (k > 0) add(BASICS[c], k);
    left -= k;
  });

  const side: Counts = {};
  for (const [n, k] of Object.entries(pool))
    if (k - (main[n] ?? 0) > 0) side[n] = k - (main[n] ?? 0);
  return { main, side };
}

/** Replaces the deck with the suggested 40; everything else goes to the collection. */
export function applySuggestion(s: ExpeditionState): ExpeditionState {
  return withRun(s, (r) => ({ ...r, build: { ...r.build, ...suggestDeck(r.build) } }));
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
    if (r?.custom) registerDeck(r.custom);
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
