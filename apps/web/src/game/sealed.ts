import { findDeck, registerDeck, SCRYFALL, slug, type Decklist } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import type { BotKind } from './bot.worker.ts';
import {
  BASICS,
  type Build,
  type Counts,
  deckColors,
  MIN_DECK,
  PACK_SET_NAMES,
  type PackSet,
  rollPack,
  seasonDecklist,
  size,
  suggestDeck,
} from './expedition.ts';
import { rng } from './gauntlet.ts';
import {
  awardSeasonPrize,
  grantSeasonCards,
  type SeasonPackKind,
  type SeasonSave,
} from './season.ts';

/*
 * Sealed: Arena's event against bots. You pick a set and open six boosters (72 cards), build a
 * 40-card deck from the pool with free basics, then play best-of-one matches until you have
 * seven wins or three losses. Each opponent opens six boosters of its own and builds a deck
 * with the same suggester as the "Suggest a deck" button; its skill is random, leaning
 * tougher as your wins go up. Draws are replayed.
 *
 * An event belongs to the Season save that was active when it started: opening the pool adds
 * its cards to that save's collection and the end of the event pays coins and Season packs
 * (`grantSealedPool`, `paySealedPrize`). Without a Season save, Sealed still plays.
 *
 * Everything here is pure state plus localStorage. The pool, every opponent and its bot skill
 * come from the event seed, so a reload can't reroll them. Typical flow for the UI:
 *   startSealed -> sealedPacks (reveal) + grantSealedPool -> edit the deck (moveSealedCard,
 *   applySealedSuggestion) -> startSealedMatch -> play `opponentFor(...)` with
 *   `sealedPlayerDeck`/`sealedDeckCards` -> recordSealedMatch -> ... -> paySealedPrize ->
 *   leaveSealed.
 */

export const SEALED_PACKS = 6;
export const SEALED_WINS = 7;
export const SEALED_LOSSES = 3;

export type SealedStatus = 'playing' | 'won' | 'out' | 'resigned';

export interface SealedEvent {
  id: string;
  seed: number;
  set: PackSet;
  /** The Season save that was active when the event started (it gets the cards and prizes). */
  seasonSaveId: string | null;
  /** The deck: card name -> copies. Basic lands live only here, never in `side`. */
  main: Counts;
  /** The rest of the pool. */
  side: Counts;
  wins: number;
  losses: number;
  /** Drawn matches (replayed; they change no record but move on to a new opponent). */
  draws: number;
  /** Seed of the match being played, once it has started. */
  match: number | null;
  /** The pool has been added to the Season save (happens once). */
  poolGranted: boolean;
  /** The prize has been paid to the Season save (happens once). */
  prizePaid: boolean;
  finished: boolean;
  resigned: boolean;
}

/** Per set: how Sealed has gone. */
export interface SealedRecord {
  /** Events started. */
  events: number;
  /** Most wins in one event. */
  best: number;
  /** Events that reached seven wins. */
  sevenWins: number;
}

export interface SealedState {
  event: SealedEvent | null;
  records: Partial<Record<PackSet, SealedRecord>>;
}

export const emptySealed = (): SealedState => ({ event: null, records: {} });

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/** A new seed from `seed` and a salt, so different things from one event seed don't correlate. */
const derive = (seed: number, salt: number): number =>
  Math.floor(rng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0)() * 4294967296) >>> 0;

const PLAYER_SALT = 0;
const FOE_SALT = 1000;
const BOT_SALT = 5000;

const isBasic = (name: string) => Object.values(BASICS).includes(name);
const byName = new Map(SCRYFALL.map((c) => [c.name, c]));

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

/** The six boosters of the event's pool, as card names. Deterministic from the event seed. */
export function sealedPacks(event: Pick<SealedEvent, 'seed' | 'set'>): string[][] {
  return Array.from({ length: SEALED_PACKS }, (_, i) =>
    rollPack({ kind: 'booster' }, derive(event.seed, PLAYER_SALT + i), 0, event.set),
  );
}

const countOf = (names: string[]): Counts => {
  const c: Counts = {};
  for (const n of names) c[n] = (c[n] ?? 0) + 1;
  return c;
};

/** Starts an event (the pool begins in `side`, so build a deck). Ignored while one is in progress. */
export function startSealed(
  s: SealedState,
  set: PackSet,
  seed: number,
  seasonSaveId: string | null,
): SealedState {
  if (s.event && !s.event.finished) return s;
  const rec = s.records[set] ?? { events: 0, best: 0, sevenWins: 0 };
  return {
    event: {
      id: seed.toString(36),
      seed: seed >>> 0,
      set,
      seasonSaveId,
      main: {},
      side: countOf(sealedPacks({ seed: seed >>> 0, set }).flat()),
      wins: 0,
      losses: 0,
      draws: 0,
      match: null,
      poolGranted: false,
      prizePaid: false,
      finished: false,
      resigned: false,
    },
    records: { ...s.records, [set]: { ...rec, events: rec.events + 1 } },
  };
}

/** Leaves a finished event (its records are kept), for the next one. A running event stays. */
export function leaveSealed(s: SealedState): SealedState {
  return s.event && !s.event.finished ? s : { ...s, event: null };
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

/** Applies `f` to an event still in progress; the same state back when nothing changes. */
function withEvent(s: SealedState, f: (e: SealedEvent) => SealedEvent): SealedState {
  if (!s.event || s.event.finished) return s;
  const event = f(s.event);
  return event === s.event ? s : { ...s, event };
}

function bump(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

/**
 * Moves one copy between deck and side. Basic lands come from and go back to the free supply:
 * moving one to `main` adds a copy, moving one to `side` removes one.
 */
export function moveSealedCard(s: SealedState, name: string, to: 'main' | 'side'): SealedState {
  return withEvent(s, (e) => {
    if (!byName.has(name)) return e;
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

/** Adds (`by` > 0) or removes (`by` < 0) basic lands of a colour in the deck. */
export function addSealedBasics(s: SealedState, color: Color, by: number): SealedState {
  return withEvent(s, (e) => {
    const name = BASICS[color];
    const n = Math.max(-(e.main[name] ?? 0), Math.trunc(by));
    return n ? { ...e, main: bump(e.main, name, n) } : e;
  });
}

const buildOf = (e: Pick<SealedEvent, 'main' | 'side'>): Build => ({
  main: e.main,
  side: e.side,
  opened: 0,
  packs: [],
  fresh: [],
});

/** Replaces the deck with the suggested 40; the rest of the pool goes to `side`. */
export function applySealedSuggestion(s: SealedState): SealedState {
  return withEvent(s, (e) => ({ ...e, ...suggestDeck(buildOf(e)) }));
}

/** The deck is big enough to play (40 cards or more). */
export const canPlay = (e: Pick<SealedEvent, 'main'>): boolean => size(e.main) >= MIN_DECK;

/** The deck as card ids, for `DeckChoice.cards`. */
export const sealedDeckCards = (e: Pick<SealedEvent, 'main'>): string[] =>
  Object.entries(e.main).flatMap(([name, n]) => Array<string>(n).fill(slug(name)));

// ---------------------------------------------------------------------------
// Decklists
// ---------------------------------------------------------------------------

const GUILDS: Record<string, string> = {
  WU: 'Azorius',
  UB: 'Dimir',
  BR: 'Rakdos',
  RG: 'Gruul',
  GW: 'Selesnya',
  WB: 'Orzhov',
  UR: 'Izzet',
  BG: 'Golgari',
  RW: 'Boros',
  GU: 'Simic',
};
const MONO: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/** Arena's guild name for two colours (in either order), a colour word for one, else 'Colourless'. */
export function colorsName(colors: Color[]): string {
  if (colors.length >= 2) {
    const [a, b] = colors;
    return GUILDS[`${a}${b}`] ?? GUILDS[`${b}${a}`] ?? 'Colourless';
  }
  return colors[0] ? MONO[colors[0]] : 'Colourless';
}

function listOf(id: string, name: string, set: PackSet, main: Counts): Decklist {
  const cards = Object.fromEntries(Object.entries(main).map(([n, k]) => [slug(n), k]));
  const base = seasonDecklist('sealed', { id, name, cards });
  return { ...base, id, name, series: 'sealed', ...(set === 'fdn' ? {} : { set }) };
}

/** The player's deck as a decklist (id `sealed:<eventId>:you`), registered so it can be played and viewed by id. */
export function sealedPlayerDeck(e: SealedEvent): Decklist {
  const list = listOf(`sealed:${e.id}:you`, `${PACK_SET_NAMES[e.set]} Sealed`, e.set, e.main);
  registerDeck(list);
  return list;
}

/** Number of the match being played (from 0): finished matches and draws so far. */
export const matchNumber = (e: Pick<SealedEvent, 'wins' | 'losses' | 'draws'>): number =>
  e.wins + e.losses + e.draws;

/** Chance of each bot skill (easy, heuristic, search), by wins so far. */
export const BOT_ODDS = (wins: number): [easy: number, heuristic: number, search: number] =>
  wins <= 2 ? [0.3, 0.5, 0.2] : wins <= 4 ? [0.15, 0.55, 0.3] : [0.05, 0.5, 0.45];

/** The opponent of match `n`: a deck from six boosters of its own, and a bot skill. Registers the deck. */
export function opponentFor(e: SealedEvent, n: number): { deck: Decklist; bot: BotKind } {
  const foe = derive(e.seed, FOE_SALT + n);
  const pool = countOf(
    Array.from({ length: SEALED_PACKS }, (_, i) =>
      rollPack({ kind: 'booster' }, derive(foe, i), 0, e.set),
    ).flat(),
  );
  const { main } = suggestDeck({ main: {}, side: pool, opened: 0, packs: [], fresh: [] });
  // Whatever the suggester does, a bot deck is always a legal 40.
  const dominant = deckColors({ main, side: {}, opened: 0, packs: [], fresh: [] })[0] ?? 'G';
  const short = MIN_DECK - size(main);
  const filled =
    short > 0 ? { ...main, [BASICS[dominant]]: (main[BASICS[dominant]] ?? 0) + short } : main;
  const colors = deckColors(buildOf({ main: filled, side: {} })).slice(0, 2);
  const deck = listOf(`sealed:${e.id}:${n}`, colorsName(colors), e.set, filled);
  registerDeck(deck);
  const roll = rng(derive(e.seed, BOT_SALT + n))();
  const [easy, heuristic] = BOT_ODDS(e.wins);
  const bot: BotKind = roll < easy ? 'easy' : roll < easy + heuristic ? 'heuristic' : 'search';
  return { deck, bot };
}

/** The opponent of the match to play now. */
export const currentOpponent = (e: SealedEvent) => opponentFor(e, matchNumber(e));

/** Registers the event's decks (yours and the next opponent's), e.g. after a reload. */
export function registerSealedDecks(s: SealedState): void {
  if (!s.event || s.event.finished) return;
  sealedPlayerDeck(s.event);
  currentOpponent(s.event);
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export const statusOf = (e: SealedEvent): SealedStatus =>
  e.resigned
    ? 'resigned'
    : e.wins >= SEALED_WINS
      ? 'won'
      : e.losses >= SEALED_LOSSES
        ? 'out'
        : 'playing';

/** Marks a match as started (needs a playable deck). `seed` ties a saved game to the event. */
export function startSealedMatch(s: SealedState, seed: number): SealedState {
  return withEvent(s, (e) => (canPlay(e) ? { ...e, match: seed } : e));
}

function finishRecord(s: SealedState, e: SealedEvent, next: SealedEvent): SealedState['records'] {
  const rec = s.records[e.set] ?? { events: 1, best: 0, sevenWins: 0 };
  return {
    ...s.records,
    [e.set]: {
      ...rec,
      best: Math.max(rec.best, next.wins),
      sevenWins: rec.sevenWins + (e.wins < SEALED_WINS && next.wins >= SEALED_WINS ? 1 : 0),
    },
  };
}

/**
 * Records how the current match ended. Only the match the event is waiting on counts, so
 * replays and reloads can't record a result twice. A draw changes no record (it is replayed).
 * The event ends at seven wins or three losses.
 */
export function recordSealedMatch(
  s: SealedState,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): SealedState {
  const e = s.event;
  if (!e || e.finished || e.match !== seed) return s;
  const next: SealedEvent = {
    ...e,
    match: null,
    wins: e.wins + (outcome === 'win' ? 1 : 0),
    losses: e.losses + (outcome === 'loss' ? 1 : 0),
    draws: e.draws + (outcome === 'draw' ? 1 : 0),
  };
  next.finished = statusOf(next) !== 'playing';
  return { event: next, records: finishRecord(s, e, next) };
}

/** Ends the event with the current record (the prize is for the wins so far). */
export function resignSealed(s: SealedState): SealedState {
  return withEvent(s, (e) => ({ ...e, match: null, finished: true, resigned: true }));
}

// ---------------------------------------------------------------------------
// Prizes
// ---------------------------------------------------------------------------

/** What an event pays, by wins (0 to 7): coins and Season packs of the event's set. */
export const SEALED_PRIZES: readonly { coins: number; packs: number }[] = [
  { coins: 0, packs: 0 },
  { coins: 50, packs: 0 },
  { coins: 100, packs: 0 },
  { coins: 150, packs: 1 },
  { coins: 250, packs: 1 },
  { coins: 350, packs: 1 },
  { coins: 500, packs: 2 },
  { coins: 700, packs: 3 },
];

export const prizeFor = (wins: number): { coins: number; packs: number } =>
  SEALED_PRIZES[Math.max(0, Math.min(SEALED_WINS, Math.trunc(wins)))]!;

/** The Season pack that opens boosters of a set. */
export const SEASON_PACK_OF: Record<PackSet, SeasonPackKind> = {
  fdn: 'foundations',
  blb: 'bloomburrow',
  msh: 'marvel',
  fin: 'finalFantasy',
  stx: 'strixhaven',
  sos: 'secrets',
  fra: 'realityFracture',
};

/** What the event screen shows. */
export interface SealedSummary {
  set: PackSet;
  status: SealedStatus;
  wins: number;
  losses: number;
  maxWins: number;
  maxLosses: number;
  /** The match to play (from 1). */
  match: number;
  /** What the current record pays. */
  prize: { coins: number; packs: number };
}

export function summarizeSealed(e: SealedEvent): SealedSummary {
  return {
    set: e.set,
    status: statusOf(e),
    wins: e.wins,
    losses: e.losses,
    maxWins: SEALED_WINS,
    maxLosses: SEALED_LOSSES,
    match: matchNumber(e) + 1,
    prize: prizeFor(e.wins),
  };
}

// ---------------------------------------------------------------------------
// Season hooks
// ---------------------------------------------------------------------------

/** The part of the Season repository these need (so tests can pass a fake). */
export interface SeasonUpdater {
  update(id: string, change: (save: SeasonSave) => SeasonSave): unknown;
}

/** Runs `change` on the event's Season save. False when there is none or the update fails. */
function inSeason(
  repo: SeasonUpdater,
  e: SealedEvent,
  change: (save: SeasonSave, now: number) => SeasonSave,
  now: number,
): boolean {
  if (e.seasonSaveId === null) return false;
  try {
    repo.update(e.seasonSaveId, (save) => change(save, Math.max(now, save.updatedAt)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds the pool's cards to the event's Season save, once (when the packs are opened). Returns
 * the state with the event marked as granted; unchanged without a save or if it can't be written.
 */
export function grantSealedPool(s: SealedState, repo: SeasonUpdater, now: number): SealedState {
  const e = s.event;
  if (!e || e.poolGranted) return s;
  const ids = sealedPacks(e).flat().map(slug);
  return inSeason(repo, e, (save, t) => grantSeasonCards(save, ids, t), now)
    ? { ...s, event: { ...e, poolGranted: true } }
    : s;
}

/**
 * Pays the finished event's prize to its Season save, once. Returns the state with the event
 * marked as paid; unchanged while the event is running, without a save, or if it can't be written.
 */
export function paySealedPrize(s: SealedState, repo: SeasonUpdater, now: number): SealedState {
  const e = s.event;
  if (!e || !e.finished || e.prizePaid) return s;
  const { coins, packs } = prizeFor(e.wins);
  const paid = (): SealedState => ({ ...s, event: { ...e, prizePaid: true } });
  if (e.seasonSaveId === null) return s;
  if (!coins && !packs) {
    // Nothing to pay, but the save must still exist for the flag to mean anything.
    return inSeason(repo, e, (save) => save, now) ? paid() : s;
  }
  const kinds = Array<SeasonPackKind>(packs).fill(SEASON_PACK_OF[e.set]);
  return inSeason(repo, e, (save, t) => awardSeasonPrize(save, { coins, packs: kinds }, t), now)
    ? paid()
    : s;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.sealed.v1';
const VERSION = 1;
const SETS = Object.keys(PACK_SET_NAMES) as PackSet[];

const isCounts = (c: unknown): c is Counts =>
  !!c &&
  typeof c === 'object' &&
  Object.entries(c).every(
    ([n, k]) => byName.has(n) && Number.isSafeInteger(k) && (k as number) > 0,
  );
const isNat = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

function validEvent(e: SealedEvent | null | undefined): e is SealedEvent {
  return (
    !!e &&
    typeof e.id === 'string' &&
    isNat(e.seed) &&
    SETS.includes(e.set) &&
    (e.seasonSaveId === null || typeof e.seasonSaveId === 'string') &&
    isCounts(e.main) &&
    isCounts(e.side) &&
    Object.keys(e.side).every((n) => !isBasic(n)) &&
    isNat(e.wins) &&
    isNat(e.losses) &&
    isNat(e.draws) &&
    (e.match === null || isNat(e.match)) &&
    typeof e.poolGranted === 'boolean' &&
    typeof e.prizePaid === 'boolean' &&
    typeof e.finished === 'boolean' &&
    typeof e.resigned === 'boolean'
  );
}

/** Loads Sealed (an event in progress, records) and registers its decks. Never throws. */
export function loadSealed(): SealedState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      (SealedState & { v: number }) | null;
    if (!g || g.v !== VERSION) return emptySealed();
    const records: SealedState['records'] = {};
    for (const set of SETS) {
      const r = g.records?.[set];
      if (r && isNat(r.events) && isNat(r.best) && isNat(r.sevenWins)) records[set] = r;
    }
    const state: SealedState = { event: validEvent(g.event) ? g.event : null, records };
    registerSealedDecks(state);
    return state;
  } catch {
    return emptySealed();
  }
}

export function saveSealed(s: SealedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Storage unavailable (private mode): the event lasts for this session only.
  }
}

/** Whether a deck id is one of Sealed's (for menus that list decks). */
export const isSealedDeck = (id: string): boolean => id.startsWith('sealed:') && !!findDeck(id);
