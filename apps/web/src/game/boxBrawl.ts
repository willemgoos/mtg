import { cardDb, findDeck, registerDeck, SCRYFALL, slug, type Decklist } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import type { BotKind } from './bot.worker.ts';
import {
  ALL_PACK_SETS,
  BASICS,
  type Counts,
  deckStrength,
  isLand,
  landColors,
  PACK_SET_NAMES,
  type PackSet,
  packSetCards,
  pickSpells,
  rollPlayBooster,
  type PlayBooster,
  size,
  type SpellShape,
  UTILITY_LANDS,
} from './expedition.ts';
import { rng } from './gauntlet.ts';
import { rateCard } from './limitedRating.ts';
import { BOT_ODDS, derive, misjudged } from './sealed.ts';

/*
 * Box Brawl: split a booster box of one set (36 Play Boosters) with your first opponent, 18
 * each, and build a 60-card Brawl deck from your half: a legendary creature as the commander
 * and 59 cards of its colour identity, basics free. As in Arena's Brawl builder the commander
 * is a slot in the deck: you may pick it before or after the other cards, and cards outside its
 * colours can't go in. A box has repeats, so unlike Brawl the deck may hold more than one copy
 * of a card. Then play best-of-one Brawl games (25 life, commander
 * tax) against bots, until three wins or two losses. The first opponent plays the other half of
 * your box; later ones bring a half of a box of their own.
 *
 * A half with no legendary creature in it offers five random ones of the set instead.
 *
 * Box Brawl stands apart from Season: it keeps no cards and pays no prize (a box is a lot of
 * cards). Everything is pure state plus localStorage; the box, every opponent and its skill
 * come from the event seed. Flow for the UI:
 *   startBox -> boxBoosters (reveal) -> edit the deck (moveBoxCard, chooseCommander,
 *   applyBoxSuggestion) -> startBoxMatch -> play `currentBoxOpponent(...)` with
 *   `boxPlayerDeck` -> recordBoxMatch -> ... -> leaveBox.
 */

export const BOX_PACKS = 36;
/** Each player opens half the box. */
export const HALF_PACKS = BOX_PACKS / 2;
/** The deck: the commander and 59 more. */
export const BOX_DECK = 60;
export const BOX_MAIN = BOX_DECK - 1;
/** Lands in a suggested deck (of the 59). */
export const BOX_LANDS = 24;
export const BOX_WINS = 3;
export const BOX_LOSSES = 2;
/** Legends offered when the box has none. */
export const LEGEND_CHOICES = 5;

/** A 60-card deck's 35 spells: Limited's curve, scaled up. */
const SHAPE_60: SpellShape = {
  spells: BOX_MAIN - BOX_LANDS,
  creatures: 21,
  cheap: 8,
  fivePlus: 8,
  sixPlus: 4,
};

export type BoxStatus = 'playing' | 'won' | 'out' | 'resigned';

export interface BoxEvent {
  id: string;
  seed: number;
  set: PackSet;
  /** The commander, once chosen. A copy from the box leaves `side`; a gifted one never was in it. */
  commander: string | null;
  /** The 59: card name -> copies. Basic lands live only here. */
  main: Counts;
  /** The rest of the box. */
  side: Counts;
  wins: number;
  losses: number;
  /** Drawn games (replayed against a new opponent). */
  draws: number;
  /** Seed of the game being played, once it has started. */
  match: number | null;
  /** The boosters have been opened on screen. */
  revealed: boolean;
  finished: boolean;
  resigned: boolean;
}

/** Per set: how Box Brawl has gone. */
export interface BoxRecord {
  events: number;
  /** Most wins in one event. */
  best: number;
  /** Events that reached three wins. */
  titles: number;
}

export interface BoxState {
  event: BoxEvent | null;
  records: Partial<Record<PackSet, BoxRecord>>;
}

/** One player's half of a box: `half` 0 (yours, the default) or 1 (the opponent's). */
export type BoxHalf = Pick<BoxEvent, 'seed' | 'set'> & { half?: 0 | 1 };

export const emptyBox = (): BoxState => ({ event: null, records: {} });

const PLAYER_SALT = 20000;
const FOE_SALT = 21000;
const BOT_SALT = 22000;
const MISJUDGE_SALT = 23000;
const LEGEND_SALT = 24000;

const BASIC_NAMES = new Set(Object.values(BASICS));
const isBasic = (name: string) => BASIC_NAMES.has(name);
const byName = new Map(SCRYFALL.map((c) => [c.name, c]));
const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

// ---------------------------------------------------------------------------
// Commanders and colour identity
// ---------------------------------------------------------------------------

/** A card's colour identity (rule 903.4). */
export function identityOf(name: string): Color[] {
  const d = cardDb.get(slug(name));
  return d ? (d.colorIdentity ?? d.colors) : [];
}

/** Can lead the deck: a legendary creature (or a card that says it can be your commander) with a colour. */
export function canCommand(name: string): boolean {
  const d = cardDb.get(slug(name));
  if (!d || !identityOf(name).length) return false;
  const legend = d.supertypes.includes('Legendary') && d.types.includes('Creature');
  return legend || /can be your commander/i.test(byName.get(name)?.oracleText ?? '');
}

/** The card may go in a deck led by a commander of these colours. */
export const fits = (name: string, identity: readonly Color[]): boolean =>
  identityOf(name).every((c) => identity.includes(c));

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

const boosterCache = new Map<string, PlayBooster[]>();

/** The 18 Play Boosters of one half of the box (the box's 36 are deterministic from the seed). */
export function boxBoosters(e: BoxHalf): PlayBooster[] {
  const key = `${e.seed}:${e.set}`;
  let packs = boosterCache.get(key);
  if (!packs) {
    packs = Array.from({ length: BOX_PACKS }, (_, i) =>
      rollPlayBooster(derive(e.seed, PLAYER_SALT + i), e.set),
    );
    boosterCache.set(key, packs);
  }
  const from = (e.half ?? 0) * HALF_PACKS;
  return packs.slice(from, from + HALF_PACKS);
}

const countOf = (names: string[]): Counts => {
  const c: Counts = {};
  for (const n of names) c[n] = (c[n] ?? 0) + 1;
  return c;
};

/** The half's cards (basic lands are free, so not in it). */
export const boxPool = (e: BoxHalf): Counts =>
  countOf(
    boxBoosters(e)
      .flatMap((b) => b.cards)
      .filter((n) => !isBasic(n)),
  );

const legendCache = new Map<string, string[]>();

/** The set's legends (any set's when it has too few), for a box without one. */
function setLegends(set: PackSet): string[] {
  let legends = legendCache.get(set);
  if (!legends) {
    legends = packSetCards(set).filter(canCommand);
    if (legends.length < LEGEND_CHOICES)
      for (const other of ALL_PACK_SETS)
        for (const n of packSetCards(other))
          if (canCommand(n) && !legends.includes(n)) legends.push(n);
    legendCache.set(set, legends);
  }
  return legends;
}

/**
 * Who can lead a deck from this half: its legendary creatures, best first; a half without any
 * gets five random legends of its set instead (from the seed).
 */
export function commanderChoices(e: BoxHalf): {
  names: string[];
  gifted: boolean;
} {
  const own = Object.keys(boxPool(e))
    .filter(canCommand)
    .sort((a, b) => rateCard(b) - rateCard(a) || a.localeCompare(b));
  return own.length ? { names: own, gifted: false } : { names: giftedLegends(e), gifted: true };
}

/** Five random legends of the set (from the seed), for a half without one. */
export function giftedLegends(e: BoxHalf): string[] {
  const all = setLegends(e.set).slice();
  const r = rng(derive(e.seed, LEGEND_SALT + (e.half ?? 0)));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, LEGEND_CHOICES);
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

/** Applies `f` to an event still in progress; the same state back when nothing changes. */
function withEvent(s: BoxState, f: (e: BoxEvent) => BoxEvent): BoxState {
  if (!s.event || s.event.finished) return s;
  const event = f(s.event);
  return event === s.event ? s : { ...s, event };
}

/** Starts an event: your half of the box begins in `side`. Ignored while one is in progress. */
export function startBox(s: BoxState, set: PackSet, seed: number): BoxState {
  if (s.event && !s.event.finished) return s;
  const rec = s.records[set] ?? { events: 0, best: 0, titles: 0 };
  return {
    event: {
      id: seed.toString(36),
      seed: seed >>> 0,
      set,
      commander: null,
      main: {},
      side: boxPool({ seed: seed >>> 0, set }),
      wins: 0,
      losses: 0,
      draws: 0,
      match: null,
      revealed: false,
      finished: false,
      resigned: false,
    },
    records: { ...s.records, [set]: { ...rec, events: rec.events + 1 } },
  };
}

export const markBoxRevealed = (s: BoxState): BoxState =>
  withEvent(s, (e) => (e.revealed ? e : { ...e, revealed: true }));

/** Leaves a finished event (its records are kept). A running event stays. */
export const leaveBox = (s: BoxState): BoxState =>
  s.event && !s.event.finished ? s : { ...s, event: null };

function bump(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

/**
 * Makes `name` the commander (one of `commanderChoices`). A copy from the box comes out of the
 * pool (or the deck) and the old commander goes back to the pool. Cards already in the deck
 * stay, even outside the new colours: `outsideColours` lists them and the deck can't be played
 * until they're out.
 */
export function chooseCommander(s: BoxState, name: string): BoxState {
  return withEvent(s, (e) => {
    if (e.commander === name || !commanderChoices(e).names.includes(name)) return e;
    let { main, side } = e;
    const pool = boxPool(e);
    if (e.commander && pool[e.commander]) side = bump(side, e.commander, 1);
    if (pool[name]) {
      if (side[name]) side = bump(side, name, -1);
      else main = bump(main, name, -1);
    }
    return { ...e, commander: name, main, side };
  });
}

/**
 * Moves one copy between deck and pool. Once there is a commander, only cards of its colour
 * identity go in. Basic lands come from and go back to the free supply.
 */
export function moveBoxCard(s: BoxState, name: string, to: 'main' | 'side'): BoxState {
  return withEvent(s, (e) => {
    if (!byName.has(name)) return e;
    if (to === 'main' && e.commander && !fits(name, identityOf(e.commander))) return e;
    if (isBasic(name))
      return to === 'main'
        ? { ...e, main: bump(e.main, name, 1) }
        : e.main[name]
          ? { ...e, main: bump(e.main, name, -1) }
          : e;
    const from = to === 'main' ? 'side' : 'main';
    if (!e[from][name]) return e;
    return { ...e, [from]: bump(e[from], name, -1), [to]: bump(e[to], name, 1) };
  });
}

/** Deck cards outside the commander's colours (none before a commander is chosen). */
export function outsideColours(e: Pick<BoxEvent, 'commander' | 'main'>): string[] {
  if (!e.commander) return [];
  const identity = identityOf(e.commander);
  return Object.keys(e.main).filter((n) => !fits(n, identity));
}

// ---------------------------------------------------------------------------
// Suggested deck
// ---------------------------------------------------------------------------

const pipsOf = (name: string): Map<Color, number> => {
  const pips = new Map<Color, number>();
  for (const [, sym] of (byName.get(name)?.manaCost ?? '').matchAll(/\{([^}]+)\}/g))
    for (const c of COLORS) if (sym!.includes(c)) pips.set(c, (pips.get(c) ?? 0) + 1);
  return pips;
};

/** How much worse a deck looks for each colour past two (a shakier mana base). */
const COLOUR_COST = 6;

/**
 * The colours a deck for this commander plays: those its cost needs, plus whichever others of
 * its identity make the strongest spells, up to two colours in all (more only when the cost
 * needs them). A five-colour legend then leads a two-colour deck, as a person would build it.
 */
function focusColours(
  copies: readonly string[],
  commander: string,
  identity: readonly Color[],
  rate: (name: string) => number,
): { colors: Color[]; spells: string[]; score: number } {
  const base = COLORS.filter((c) => pipsOf(commander).get(c) && identity.includes(c));
  const extra = identity.filter((c) => !base.includes(c));
  const room = Math.max(0, 2 - base.length);
  const options: Color[][] = [base];
  if (room >= 1) for (const a of extra) options.push([...base, a]);
  if (room >= 2)
    for (const [i, a] of extra.entries())
      for (const b of extra.slice(i + 1)) options.push([...base, a, b]);
  let best = { colors: [...identity], spells: [] as string[], score: -Infinity };
  for (const colors of options) {
    if (!colors.length) continue;
    const spells = pickSpells(
      copies.filter((n) => fits(n, colors)),
      false,
      rate,
      SHAPE_60,
    );
    const score =
      deckStrength(spells, rate) -
      0.5 * (SHAPE_60.spells - spells.length) -
      COLOUR_COST * Math.max(0, colors.length - 2);
    if (score > best.score)
      best = { colors: COLORS.filter((c) => colors.includes(c)), spells, score };
  }
  return best;
}

/**
 * A sensible 59 for the commander from `pool`: the best 35 spells of its colours (see
 * `focusColours`) with a creature-heavy curve (repeats allowed, no extra copies of the
 * commander), lands of its colours and up to three utility lands, and basics split by the
 * coloured mana symbols. A small pool leaves more room for basics. `score` is how strong it
 * looks, for a bot choosing between legends.
 */
export function suggestBoxDeck(
  pool: Counts,
  commander: string,
  rate: (name: string) => number = rateCard,
): { main: Counts; side: Counts; spells: string[]; score: number } {
  const all = identityOf(commander);
  const legal = Object.entries(pool).filter(([n]) => !isBasic(n) && fits(n, all));
  const copies = legal
    .filter(([n]) => !isLand(n) && n !== commander)
    .flatMap(([n, k]) => Array<string>(k).fill(n));
  const focus = focusColours(copies, commander, all, rate);
  const identity = focus.colors;
  const spells = focus.spells;
  // Too few playables in the focus colours: fill with the best of the rest of the identity.
  if (spells.length < SHAPE_60.spells) {
    const left = [...copies];
    for (const n of spells) left.splice(left.indexOf(n), 1);
    left.sort((a, b) => rate(b) - rate(a));
    spells.push(...left.slice(0, SHAPE_60.spells - spells.length));
  }

  const main: Counts = {};
  const add = (n: string, k = 1) => (main[n] = (main[n] ?? 0) + k);
  spells.forEach((n) => add(n));
  let lands = 0;
  let utility = 0;
  for (const [n, k] of legal) {
    if (!isLand(n)) continue;
    const useful = UTILITY_LANDS.includes(n);
    if (!useful && !landColors(n).some((c) => identity.includes(c))) continue;
    const take = Math.min(k, BOX_LANDS - lands, useful ? 3 - utility : Infinity);
    if (take <= 0) continue;
    add(n, take);
    lands += take;
    if (useful) utility += take;
  }
  // Basics fill the rest, by the coloured symbols of the spells (the commander counts thrice).
  const pips = new Map<Color, number>();
  for (const [n, w] of [...spells.map((x) => [x, 1] as const), [commander, 3] as const])
    for (const [c, k] of pipsOf(n)) if (all.includes(c)) pips.set(c, (pips.get(c) ?? 0) + k * w);
  const colors = all.filter((c) => pips.get(c));
  if (!colors.length) colors.push(...identity);
  const total = colors.reduce((k, c) => k + (pips.get(c) ?? 1), 0);
  let left = BOX_MAIN - size(main);
  const basics = left;
  colors.forEach((c, i) => {
    const share = Math.round(((pips.get(c) ?? 1) / total) * basics);
    const k = i === colors.length - 1 ? left : Math.min(left, share);
    if (k > 0) add(BASICS[c], k);
    left -= k;
  });

  const side: Counts = {};
  for (const [n, k] of Object.entries(pool))
    if (!isBasic(n) && k - (main[n] ?? 0) > 0) side[n] = k - (main[n] ?? 0);
  return { main, side, spells, score: focus.score };
}

/** How many legends the commander pick marks as recommended. */
export const RECOMMENDED = 3;

const rankCache = new Map<string, string[]>();

/**
 * The commander choices, strongest deck first: each legend's suggested deck from your whole half,
 * judged as a bot judges its own (the deck plus the commander itself).
 */
export function rankCommanders(e: Pick<BoxEvent, 'seed' | 'set'>): string[] {
  const key = `${e.seed}:${e.set}`;
  let ranked = rankCache.get(key);
  if (!ranked) {
    const pool = boxPool(e);
    ranked = commanderChoices(e)
      .names.map((c) => ({
        c,
        score: suggestBoxDeck(pool[c] ? bump(pool, c, -1) : pool, c).score + 2 * rateCard(c),
      }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
    rankCache.set(key, ranked);
  }
  return ranked;
}

/**
 * Replaces the deck with the suggested 59; the rest of the box goes to `side`. Without a
 * commander it first takes the recommended one.
 */
export function applyBoxSuggestion(s: BoxState): BoxState {
  if (s.event && !s.event.finished && !s.event.commander)
    s = chooseCommander(s, rankCommanders(s.event)[0]!);
  return withEvent(s, (e) => {
    if (!e.commander) return e;
    const pool: Counts = { ...e.side };
    for (const [n, k] of Object.entries(e.main)) if (!isBasic(n)) pool[n] = (pool[n] ?? 0) + k;
    const { main, side } = suggestBoxDeck(pool, e.commander);
    return { ...e, main, side };
  });
}

/** The deck is ready: a commander and at least 59 more cards, all of its colours. */
export const canPlay = (e: Pick<BoxEvent, 'commander' | 'main'>): boolean =>
  !!e.commander && size(e.main) >= BOX_MAIN && !outsideColours(e).length;

// ---------------------------------------------------------------------------
// Decklists
// ---------------------------------------------------------------------------

function listOf(id: string, name: string, set: PackSet, commander: string, main: Counts): Decklist {
  return {
    id,
    name,
    colors: identityOf(commander),
    face: commander,
    source: 'custom',
    series: 'brawl',
    commander,
    cards: Object.entries(main),
    ...(set === 'fdn' ? {} : { set }),
  };
}

/** The player's deck (id `box:<eventId>:you`), registered so it can be played; null before a commander is chosen. */
export function boxPlayerDeck(e: BoxEvent): Decklist | null {
  if (!e.commander) return null;
  const list = listOf(`box:${e.id}:you`, e.commander, e.set, e.commander, e.main);
  registerDeck(list);
  return list;
}

/** Number of the game being played (from 0): finished games and draws so far. */
export const matchNumber = (e: Pick<BoxEvent, 'wins' | 'losses' | 'draws'>): number =>
  e.wins + e.losses + e.draws;

/** Legends a bot tries building around. */
const FOE_LEGENDS = 10;

type BoxBot = 'easy' | 'heuristic' | 'search';

const foeCache = new Map<string, { deck: Decklist; bot: BotKind }>();

/**
 * The opponent of game `n`: a half box (see `foe` below), the legend from it that makes the strongest deck
 * (through the bot's own eyes, so it misjudges cards as Sealed's bots do), and a bot skill that
 * leans tougher as your wins go up. Registers the deck.
 */
export function boxOpponent(e: BoxEvent, n: number): { deck: Decklist; bot: BotKind } {
  const key = `${e.id}:${e.set}:${n}:${e.wins}`;
  const cached = foeCache.get(key);
  if (cached) {
    registerDeck(cached.deck);
    return cached;
  }
  // The first opponent has the other half of your box; later ones a half of a box of their own.
  const foe: BoxHalf = { seed: n ? derive(e.seed, FOE_SALT + n) : e.seed, set: e.set, half: 1 };
  const roll = rng(derive(e.seed, BOT_SALT + n));
  const [easy, heuristic] = BOT_ODDS(e.wins * 2);
  const skill = roll();
  const bot: BoxBot = skill < easy ? 'easy' : skill < easy + heuristic ? 'heuristic' : 'search';
  const rate = misjudged(bot, derive(e.seed, MISJUDGE_SALT + n));
  const pool = boxPool(foe);
  // The legends that look best to it (a big box of legends would take long to try them all).
  const legends = commanderChoices(foe)
    .names.slice()
    .sort((a, b) => rate(b) - rate(a))
    .slice(0, FOE_LEGENDS);
  let best: { commander: string; main: Counts; score: number } | null = null;
  for (const commander of legends) {
    const own = pool[commander] ? bump(pool, commander, -1) : pool;
    const built = suggestBoxDeck(own, commander, rate);
    const score = built.score + 2 * rate(commander);
    if (!best || score > best.score) best = { commander, main: built.main, score };
  }
  const { commander, main } = best!;
  const deck = listOf(`box:${e.id}:${n}`, commander, e.set, commander, main);
  registerDeck(deck);
  const out = { deck, bot };
  foeCache.set(key, out);
  return out;
}

/** The opponent of the game to play now. */
export const currentBoxOpponent = (e: BoxEvent) => boxOpponent(e, matchNumber(e));

/** Registers the event's decks (yours and the next opponent's), e.g. after a reload. */
export function registerBoxDecks(s: BoxState): void {
  if (!s.event || s.event.finished) return;
  boxPlayerDeck(s.event);
  if (s.event.commander) currentBoxOpponent(s.event);
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export const statusOf = (e: BoxEvent): BoxStatus =>
  e.resigned ? 'resigned' : e.wins >= BOX_WINS ? 'won' : e.losses >= BOX_LOSSES ? 'out' : 'playing';

/** Marks a game as started (needs a playable deck). `seed` ties a saved game to the event. */
export const startBoxMatch = (s: BoxState, seed: number): BoxState =>
  withEvent(s, (e) => (canPlay(e) ? { ...e, match: seed } : e));

/**
 * Records how the current game ended. Only the game the event is waiting on counts, so replays
 * and reloads can't record a result twice. The event ends at three wins or two losses.
 */
export function recordBoxMatch(
  s: BoxState,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): BoxState {
  const e = s.event;
  if (!e || e.finished || e.match !== seed) return s;
  const next: BoxEvent = {
    ...e,
    match: null,
    wins: e.wins + (outcome === 'win' ? 1 : 0),
    losses: e.losses + (outcome === 'loss' ? 1 : 0),
    draws: e.draws + (outcome === 'draw' ? 1 : 0),
  };
  next.finished = statusOf(next) !== 'playing';
  const rec = s.records[e.set] ?? { events: 1, best: 0, titles: 0 };
  return {
    event: next,
    records: {
      ...s.records,
      [e.set]: {
        ...rec,
        best: Math.max(rec.best, next.wins),
        titles: rec.titles + (e.wins < BOX_WINS && next.wins >= BOX_WINS ? 1 : 0),
      },
    },
  };
}

/** Ends the event with the current record. */
export const resignBox = (s: BoxState): BoxState =>
  withEvent(s, (e) => ({ ...e, match: null, finished: true, resigned: true }));

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.boxBrawl.v1';
/** 2: you open half the box (an event saved with a whole box is dropped). */
const VERSION = 2;

const isCounts = (c: unknown): c is Counts =>
  !!c &&
  typeof c === 'object' &&
  Object.entries(c).every(
    ([n, k]) => byName.has(n) && Number.isSafeInteger(k) && (k as number) > 0,
  );
const isNat = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

function validEvent(e: BoxEvent | null | undefined): e is BoxEvent {
  return (
    !!e &&
    typeof e.id === 'string' &&
    isNat(e.seed) &&
    ALL_PACK_SETS.includes(e.set) &&
    (e.commander === null || (typeof e.commander === 'string' && canCommand(e.commander))) &&
    isCounts(e.main) &&
    isCounts(e.side) &&
    Object.keys(e.side).every((n) => !isBasic(n)) &&
    isNat(e.wins) &&
    isNat(e.losses) &&
    isNat(e.draws) &&
    (e.match === null || isNat(e.match)) &&
    typeof e.revealed === 'boolean' &&
    typeof e.finished === 'boolean' &&
    typeof e.resigned === 'boolean'
  );
}

/** Loads Box Brawl (an event in progress, records) and registers its decks. Never throws. */
export function loadBox(): BoxState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (BoxState & { v: number }) | null;
    if (!g || g.v !== VERSION) return emptyBox();
    const records: BoxState['records'] = {};
    for (const set of ALL_PACK_SETS) {
      const r = g.records?.[set];
      if (r && isNat(r.events) && isNat(r.best) && isNat(r.titles)) records[set] = r;
    }
    const state: BoxState = { event: validEvent(g.event) ? g.event : null, records };
    registerBoxDecks(state);
    return state;
  } catch {
    return emptyBox();
  }
}

export function saveBox(s: BoxState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Storage unavailable (private mode): the event lasts for this session only.
  }
}

/** Whether a deck id is one of Box Brawl's. */
export const isBoxDeck = (id: string): boolean => id.startsWith('box:') && !!findDeck(id);

export const BOX_SET_NAMES = PACK_SET_NAMES;
