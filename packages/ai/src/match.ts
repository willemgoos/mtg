import {
  type Action,
  type CardDb,
  type CardDefId,
  createRng,
  type Engine,
  type GameEvent,
  type GameState,
  type NewGameOptions,
  nextInt,
  type PlayerId,
  redactFor,
} from '@mtg/engine';
import { type Bot, viewEngine } from './view.ts';

/** Uniformly random legal actions (baseline opponent). */
export function createRandomBot(db: CardDb, seed: number, name = 'random'): Bot {
  const engine = viewEngine(db);
  const rng = createRng(seed);
  return {
    name,
    chooseAction(view, me) {
      const legal = engine.getLegalActions(view, me);
      return legal[nextInt(rng, legal.length)]!;
    },
  };
}

export interface MatchResult {
  winner: PlayerId | 'draw' | null;
  turns: number;
  actions: Action[];
  /** Total time each bot spent deciding, in ms. */
  thinkMs: Record<PlayerId, number>;
}

/**
 * Plays one game between two bots. Each bot only sees its redacted view, and
 * every action is validated by the real engine.
 */
export function playMatch(
  engine: Engine,
  decks: Record<PlayerId, readonly CardDefId[]>,
  bots: Record<PlayerId, Bot>,
  seed: number,
  opts: {
    maxActions?: number;
    startingPlayer?: PlayerId;
    onEvents?: (events: GameEvent[], state: GameState, action: Action) => void;
    /** Brawl: the format and each player's commander. */
    brawl?: Pick<NewGameOptions, 'format' | 'commanders'>;
    /** Strixhaven (13a): each player's sideboard (the Lessons Learn can fetch). */
    sideboards?: NewGameOptions['sideboards'];
  } = {},
): MatchResult {
  let state = engine.newGame({
    decks,
    seed,
    ...opts.brawl,
    ...(opts.sideboards ? { sideboards: opts.sideboards } : {}),
    ...(opts.startingPlayer ? { startingPlayer: opts.startingPlayer } : {}),
  });
  const actions: Action[] = [];
  const thinkMs = { p1: 0, p2: 0 };
  const max = opts.maxActions ?? 5000;
  while (!state.winner && actions.length < max) {
    const d = state.decision;
    if (d.kind === 'gameOver') break;
    const t0 = performance.now();
    const action = bots[d.player].chooseAction(redactFor(state, d.player, engine.db), d.player);
    thinkMs[d.player] += performance.now() - t0;
    const r = engine.applyAction(state, action);
    state = r.state;
    opts.onEvents?.(r.events, state, action);
    actions.push(action);
  }
  return { winner: state.winner, turns: state.turn.number, actions, thinkMs };
}
