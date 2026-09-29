import { type Ctx, createObject, drawCard, emit } from './context.ts';
import { createRng, nextInt, shuffleInPlace } from './rng.ts';
import type { CardDefId, GameState, PlayerId, PlayerState } from './types.ts';
import { PLAYERS } from './types.ts';

export const STARTING_LIFE = 20;
export const OPENING_HAND = 7;

export interface NewGameOptions {
  decks: Record<PlayerId, readonly CardDefId[]>;
  seed: number;
  startingPlayer?: PlayerId;
}

function emptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    life: STARTING_LIFE,
    library: [],
    hand: [],
    graveyard: [],
    exile: [],
    landsPlayedThisTurn: 0,
    attackedThisTurn: false,
    drewFromEmptyLibrary: false,
    mulligans: 0,
    keptHand: false,
    lost: false,
  };
}

export function emptyState(seed: number): GameState {
  return {
    schemaVersion: 1,
    seed,
    rng: createRng(seed),
    nextObjectId: 1,
    nextTimestamp: 1,
    players: { p1: emptyPlayer('p1'), p2: emptyPlayer('p2') },
    objects: {},
    battlefield: [],
    stack: [],
    turn: { number: 0, activePlayer: 'p1', step: 'untap', passed: [] },
    combat: null,
    effects: [],
    pendingTriggers: [],
    decision: { kind: 'mulligan', player: 'p1' },
    winner: null,
  };
}

export function shuffleLibrary(ctx: Ctx, player: PlayerId): void {
  shuffleInPlace(ctx.s.rng, ctx.s.players[player].library);
  emit(ctx, { type: 'shuffled', player });
}

/** Builds libraries, shuffles, draws opening hands and asks the starting player to mulligan. */
export function setupGame(ctx: Ctx, opts: NewGameOptions): void {
  const s = ctx.s;
  for (const p of PLAYERS) {
    for (const defId of opts.decks[p]) {
      const o = createObject(ctx, defId, p, 'library');
      s.players[p].library.push(o.id);
    }
    shuffleLibrary(ctx, p);
  }
  const first = opts.startingPlayer ?? (nextInt(s.rng, 2) === 0 ? 'p1' : 'p2');
  s.turn.activePlayer = first;
  for (const p of PLAYERS) for (let i = 0; i < OPENING_HAND; i++) drawCard(ctx, p);
  s.decision = { kind: 'mulligan', player: first };
}
