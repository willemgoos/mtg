import { findDeck, PLAYABLE_DECKS } from '@mtg/cards';
import type { BotKind } from './bot.worker.ts';

/*
 * The gauntlet: one deck against a ladder of opponents that get harder, like
 * Arena's Color Challenge crossed with an event (three losses and you're out).
 * Losing a round costs a life and you face the same opponent again. Pure state
 * plus localStorage, so the rules are testable and a run survives reloads.
 */

export const ROUNDS: readonly { bot: BotKind; tier: string }[] = [
  { bot: 'easy', tier: 'Novice' },
  { bot: 'easy', tier: 'Novice' },
  { bot: 'heuristic', tier: 'Apprentice' },
  { bot: 'heuristic', tier: 'Apprentice' },
  { bot: 'search', tier: 'Master' },
  { bot: 'search', tier: 'Master' },
];
export const LIVES = 3;

export type Result = 'win' | 'loss';

export interface Run {
  deck: string;
  /** Opponent deck for each round. */
  opponents: string[];
  results: Result[];
  /** Seed of the match being played for the current round, once it has started. */
  match: number | null;
}

export interface DeckRecord {
  runs: number;
  clears: number;
  /** Most rounds won in one run. */
  best: number;
}

export interface GauntletState<R extends Run = Run> {
  run: R | null;
  records: Record<string, DeckRecord>;
}

export const wins = (r: Run): number => r.results.filter((x) => x === 'win').length;
export const losses = (r: Run): number => r.results.filter((x) => x === 'loss').length;
/** Index of the round being played (or the last one, once the run is over). */
export const roundOf = (r: Run): number => Math.min(wins(r), ROUNDS.length - 1);

/** A run in progress, whatever the mode, for menus and tiles. */
export interface RunSummary {
  deck: string;
  status: 'playing' | 'cleared' | 'out';
  unit: 'Round' | 'Floor';
  /** The step being played, from 1. */
  step: number;
  steps: number;
  /** Steps finished (for a progress bar). */
  done: number;
  livesLeft: number;
  lives: number;
}

export function summarize(r: Run): RunSummary {
  return {
    deck: r.deck,
    status: statusOf(r),
    unit: 'Round',
    step: roundOf(r) + 1,
    steps: ROUNDS.length,
    done: wins(r),
    livesLeft: LIVES - losses(r),
    lives: LIVES,
  };
}

export function statusOf(r: Run): 'playing' | 'cleared' | 'out' {
  if (wins(r) >= ROUNDS.length) return 'cleared';
  if (losses(r) >= LIVES) return 'out';
  return 'playing';
}

/** Small seeded generator (mulberry32), so a run's ladder is fixed by its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fresh run: opponents are the other playable decks from the same series
 * (starter decks for a Jump In deck), shuffled, repeating only if there are
 * fewer than six.
 */
export function newRun(deck: string, seed: number, pool = PLAYABLE_DECKS): Run {
  const own = findDeck(deck)?.series;
  const series = own === 'jumpIn' ? 'starter' : own;
  const same = pool.filter((d) => d.id !== deck && d.series === series);
  const others = (same.length ? same : pool.filter((d) => d.id !== deck)).map((d) => d.id);
  const next = rng(seed);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const opponents = ROUNDS.map((_, i) => others[i % Math.max(1, others.length)] ?? deck);
  return { deck, opponents, results: [], match: null };
}

export function startRun(s: GauntletState, deck: string, seed: number): GauntletState {
  const rec = s.records[deck] ?? { runs: 0, clears: 0, best: 0 };
  return {
    run: newRun(deck, seed),
    records: { ...s.records, [deck]: { ...rec, runs: rec.runs + 1 } },
  };
}

export function startMatch<R extends Run>(s: GauntletState<R>, seed: number): GauntletState<R> {
  return s.run ? { ...s, run: { ...s.run, match: seed } } : s;
}

/**
 * Records how the current round's match ended. Only the match the run is
 * waiting on counts, so replays and reloads can't record a result twice.
 * A draw replays the round without costing a life.
 */
export function recordResult<R extends Run>(
  s: GauntletState<R>,
  seed: number,
  outcome: 'win' | 'loss' | 'draw',
): GauntletState<R> {
  const run = s.run;
  if (!run || run.match !== seed || statusOf(run) !== 'playing') return s;
  const next: R = {
    ...run,
    match: null,
    results: outcome === 'draw' ? run.results : [...run.results, outcome],
  };
  const rec = s.records[run.deck] ?? { runs: 1, clears: 0, best: 0 };
  return {
    run: next,
    records: {
      ...s.records,
      [run.deck]: {
        ...rec,
        best: Math.max(rec.best, wins(next)),
        clears: rec.clears + (statusOf(next) === 'cleared' ? 1 : 0),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEY = 'mtg.gauntlet';
const VERSION = 1;

export function loadGauntlet(): GauntletState {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as
      (GauntletState & { v: number }) | null;
    if (g?.v !== VERSION) return { run: null, records: {} };
    const known = (id: string) => !!findDeck(id);
    const run = g.run && known(g.run.deck) && g.run.opponents.every(known) ? g.run : null;
    return { run, records: g.records ?? {} };
  } catch {
    return { run: null, records: {} };
  }
}

export function saveGauntlet(s: GauntletState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...s }));
  } catch {
    // Storage unavailable (private mode): the run lasts for this session only.
  }
}
