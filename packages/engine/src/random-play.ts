import type { Engine } from './engine.ts';
import { createRng, nextInt } from './rng.ts';
import type { Action, GameEvent, GameState, PlayerId } from './types.ts';

export interface RandomGameResult {
  final: GameState;
  winner: PlayerId | 'draw' | null;
  actions: Action[];
  turns: number;
  /** Stopped because maxActions was reached. */
  truncated: boolean;
}

/**
 * Plays both sides by picking uniformly among legal actions. The bot uses its
 * own seeded RNG, so a (game seed, bot seed) pair fully determines the game.
 */
export function playRandomGame(
  engine: Engine,
  initial: GameState,
  botSeed: number,
  opts: {
    maxActions?: number;
    onEvents?: (events: GameEvent[], action: Action, state: GameState) => void;
  } = {},
): RandomGameResult {
  const maxActions = opts.maxActions ?? 20000;
  const rng = createRng(botSeed);
  let state = initial;
  const actions: Action[] = [];
  while (!state.winner && actions.length < maxActions) {
    const d = state.decision;
    if (d.kind === 'gameOver') break;
    const legal = engine.getLegalActions(state, d.player);
    if (legal.length === 0) throw new Error(`No legal actions for ${d.player} at ${d.kind}`);
    const action = legal[nextInt(rng, legal.length)]!;
    const r = engine.applyAction(state, action, { trusted: true });
    opts.onEvents?.(r.events, action, r.state);
    state = r.state;
    actions.push(action);
  }
  return {
    final: state,
    winner: state.winner,
    actions,
    turns: state.turn.number,
    truncated: !state.winner,
  };
}
