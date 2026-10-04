import { jumpInId, PACKETS } from '@mtg/cards';
import type { PlayerId } from '@mtg/engine';
import type { BotKind } from './bot.worker.ts';

/**
 * Jump In matches: you pick two packets from all of them, and the bot's two
 * (or leave either to chance), then play one game or a best of three. As on
 * Arena, the loser of a game plays first in the next.
 */

export type BestOf = 1 | 3;
export type Outcome = 'win' | 'loss' | 'draw';

/** What the lobby has chosen: packet ids, null for an empty (yours) or random (theirs) slot. */
export interface JumpInSetup {
  you: [string | null, string | null];
  them: [string | null, string | null];
  bot: BotKind;
  bestOf: BestOf;
}

/** A match being played: both decks fixed, one result per finished game. */
export interface Series {
  /** Jump In deck ids. */
  you: string;
  them: string;
  bot: BotKind;
  bestOf: BestOf;
  /** The seed of each game started, the last one being the current game. */
  seeds: number[];
  results: Outcome[];
}

export const DEFAULT_SETUP: JumpInSetup = {
  you: [null, null],
  them: [null, null],
  bot: 'heuristic',
  bestOf: 1,
};

const known = (id: string | null) => id === null || PACKETS.some((p) => p.id === id);

/** Packets at random for the empty slots, never one already in the deck or in `avoid`. */
export function fillRandom(
  slots: [string | null, string | null],
  avoid: (string | null)[] = [],
  random = Math.random,
): [string, string] {
  const taken = new Set([...slots, ...avoid].filter((x): x is string => !!x));
  const out = [...slots];
  for (let i = 0; i < 2; i++) {
    if (out[i]) continue;
    // Leave out what's taken, unless that leaves nothing (then only the deck's other half).
    let pool = PACKETS.filter((p) => !taken.has(p.id));
    if (!pool.length) pool = PACKETS.filter((p) => p.id !== out[1 - i]);
    const p = pool[Math.floor(random() * pool.length)]!;
    out[i] = p.id;
    taken.add(p.id);
  }
  return out as [string, string];
}

/** Starts a match from the lobby's choices; your deck must be complete. */
export function startSeries(setup: JumpInSetup, seed: number, random = Math.random): Series {
  const [a, b] = setup.you;
  if (!a || !b) throw new Error('Pick both halves of your deck first');
  const [c, d] = fillRandom(setup.them, [a, b], random);
  return {
    you: jumpInId(a, b),
    them: jumpInId(c, d),
    bot: setup.bot,
    bestOf: setup.bestOf,
    seeds: [seed],
    results: [],
  };
}

export const current = (s: Series): number => s.seeds[s.seeds.length - 1]!;

/** Records the current game's result (once; other seeds are ignored). */
export function recordGame(s: Series, seed: number, outcome: Outcome): Series {
  if (seed !== current(s) || s.results.length >= s.seeds.length) return s;
  return { ...s, results: [...s.results, outcome] };
}

export function score(s: Series): { wins: number; losses: number; draws: number } {
  const count = (o: Outcome) => s.results.filter((r) => r === o).length;
  return { wins: count('win'), losses: count('loss'), draws: count('draw') };
}

/** Games needed to take the match. */
const needed = (s: Series) => Math.ceil(s.bestOf / 2);

/** The match is decided (a drawn game is replayed, up to two extra games). */
export function isOver(s: Series): boolean {
  const { wins, losses } = score(s);
  return wins >= needed(s) || losses >= needed(s) || s.results.length >= s.bestOf + 2;
}

/** The current game has finished. */
export const gameDone = (s: Series): boolean => s.results.length >= s.seeds.length;

export function winner(s: Series): 'you' | 'them' | 'draw' | null {
  if (!isOver(s)) return null;
  const { wins, losses } = score(s);
  return wins > losses ? 'you' : losses > wins ? 'them' : 'draw';
}

/** The next game of the match: the loser of the last one plays first. */
export function nextGame(s: Series, seed: number): Series {
  if (!gameDone(s) || isOver(s)) return s;
  return { ...s, seeds: [...s.seeds, seed] };
}

/** Who starts the current game: the loser of the last one (random for the first or after a draw). */
export function startingPlayer(s: Series, human: PlayerId, bot: PlayerId): PlayerId | undefined {
  const last = s.results[s.seeds.length - 2];
  return last === 'win' ? bot : last === 'loss' ? human : undefined;
}

/** "Best of 3 · Game 2", for the board. */
export const gameLabel = (s: Series): string =>
  `Jump In · Best of ${s.bestOf} · Game ${s.seeds.length}`;

/** The match score after a game, e.g. "You lead 1–0" or "You win the match 2–1". */
export function scoreLine(s: Series): string {
  const { wins, losses } = score(s);
  const w = winner(s);
  if (w === 'you') return `You win the match ${wins}–${losses}`;
  if (w === 'them') return `You lose the match ${wins}–${losses}`;
  if (w === 'draw') return `The match is drawn ${wins}–${losses}`;
  if (wins === losses) return `Match tied ${wins}–${losses}`;
  return wins > losses ? `You lead ${wins}–${losses}` : `You trail ${wins}–${losses}`;
}

// ------------------------------------------------------------------ storage

export interface JumpInState {
  setup: JumpInSetup;
  /** The match in progress or just played. */
  series: Series | null;
}

const KEY = 'mtg.jumpInMatch';

export function loadJumpIn(): JumpInState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as JumpInState | null;
    if (!s) return { setup: DEFAULT_SETUP, series: null };
    // Packets can be renamed or removed between versions: drop what's gone.
    const slots = (x: [string | null, string | null]) =>
      x.map((id) => (known(id) ? id : null)) as [string | null, string | null];
    const setup = {
      ...DEFAULT_SETUP,
      ...s.setup,
      you: slots(s.setup.you),
      them: slots(s.setup.them),
    };
    const ok = (id: string) =>
      /^jump-in:([\w-]+)\+([\w-]+)$/.test(id) && id.slice(8).split('+').every(known);
    const series = s.series && ok(s.series.you) && ok(s.series.them) ? s.series : null;
    return { setup, series };
  } catch {
    return { setup: DEFAULT_SETUP, series: null };
  }
}

export function saveJumpIn(s: JumpInState): JumpInState {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: the lobby just starts empty next time.
  }
  return s;
}
