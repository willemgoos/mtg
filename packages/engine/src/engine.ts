import { produce, setAutoFreeze } from 'immer';
import {
  type Ctx,
  type CustomEffect,
  emit,
  makeCtx,
  moveObject,
  drawCard,
  other,
} from './context.ts';
import { getLegalActions as legalActions } from './legal.ts';
import { checkGameOver } from './sba.ts';
import {
  OPENING_HAND,
  type NewGameOptions,
  emptyState,
  setupGame,
  shuffleLibrary,
} from './setup.ts';
import { activateAbility, castSpell, pushTrigger } from './stack.ts';
import {
  confirmAttackers,
  confirmBlockers,
  finishCleanup,
  givePriority,
  passPriority,
  startTurn,
} from './turn.ts';
import type { Action, ApplyResult, CardDb, GameEvent, GameState, PlayerId } from './types.ts';

// Simulations create many states; freezing each one is wasted work.
setAutoFreeze(false);

export interface ApplyOptions {
  /** Skip the legality check (for callers that picked from getLegalActions). */
  trusted?: boolean;
}

export interface Engine {
  readonly db: CardDb;
  newGame(opts: NewGameOptions): GameState;
  getLegalActions(state: GameState, player: PlayerId): Action[];
  applyAction(state: GameState, action: Action, opts?: ApplyOptions): ApplyResult;
}

export interface EngineOptions {
  customEffects?: Record<string, CustomEffect>;
}

export class IllegalActionError extends Error {
  constructor(public readonly action: Action) {
    super(`Illegal action: ${JSON.stringify(action)}`);
  }
}

/** Canonical key for comparing actions, ignoring key order and payment choice. */
export function actionKey(a: Action): string {
  const { payWith: _ignored, ...rest } = a as Action & { payWith?: unknown };
  return stableStringify(rest);
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function createEngine(db: CardDb, options: EngineOptions = {}): Engine {
  const custom = options.customEffects ?? {};

  return {
    db,

    newGame(opts) {
      for (const p of ['p1', 'p2'] as const) {
        for (const id of opts.decks[p]) if (!db.has(id)) throw new Error(`Unknown card "${id}"`);
      }
      const ctx = makeCtx(emptyState(opts.seed), db, custom);
      setupGame(ctx, opts);
      return ctx.s;
    },

    getLegalActions(state, player) {
      return legalActions(makeCtx(state, db, custom), player);
    },

    applyAction(state, action, opts = {}) {
      if (!opts.trusted && action.type !== 'concede') {
        const key = actionKey(action);
        const legal = legalActions(makeCtx(state, db, custom), action.player);
        if (!legal.some((a) => actionKey(a) === key)) throw new IllegalActionError(action);
      }
      if (state.winner) throw new IllegalActionError(action);
      let events: ApplyResult['events'] = [];
      const next = produce(state, (draft) => {
        const ctx = makeCtx(draft, db, custom);
        apply(ctx, action);
        // Events may reference draft objects, which are revoked when produce returns.
        events = JSON.parse(JSON.stringify(ctx.events)) as GameEvent[];
      });
      return { state: next, events };
    },
  };
}

function afterMulliganDecision(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  const next = other(player);
  if (!s.players[next].keptHand) s.decision = { kind: 'mulligan', player: next };
  else startTurn(ctx, s.turn.activePlayer);
}

function apply(ctx: Ctx, action: Action): void {
  const s = ctx.s;
  const player = action.player;
  const ps = s.players[player];
  const d = s.decision;

  switch (action.type) {
    case 'keepHand': {
      ps.keptHand = true;
      const count = Math.min(ps.mulligans, ps.hand.length);
      if (count > 0) s.decision = { kind: 'bottomCards', player, count };
      else afterMulliganDecision(ctx, player);
      return;
    }
    case 'mulligan': {
      for (const id of [...ps.hand]) moveObject(ctx, id, 'library');
      shuffleLibrary(ctx, player);
      for (let i = 0; i < OPENING_HAND; i++) drawCard(ctx, player);
      ps.mulligans++;
      emit(ctx, { type: 'mulligan', player, count: ps.mulligans });
      s.decision = { kind: 'mulligan', player };
      return;
    }
    case 'bottomCard': {
      if (d.kind !== 'bottomCards') throw new IllegalActionError(action);
      moveObject(ctx, action.card, 'library', { position: 'bottom' });
      d.count--;
      if (d.count === 0) afterMulliganDecision(ctx, player);
      return;
    }
    case 'passPriority':
      return passPriority(ctx, player);
    case 'playLand':
      moveObject(ctx, action.card, 'battlefield', { controller: player });
      ps.landsPlayedThisTurn++;
      s.turn.passed = [];
      return givePriority(ctx, player);
    case 'castSpell':
      castSpell(ctx, player, action.card, action.targets, action.payWith);
      s.turn.passed = [];
      return givePriority(ctx, player);
    case 'activateAbility':
      activateAbility(
        ctx,
        player,
        action.source,
        action.abilityIndex,
        action.targets,
        action.payWith,
      );
      s.turn.passed = [];
      return givePriority(ctx, player);
    case 'addAttacker':
      if (d.kind !== 'declareAttackers') throw new IllegalActionError(action);
      d.declared.push({ id: action.attacker, defender: action.defender });
      return;
    case 'removeAttacker':
      if (d.kind !== 'declareAttackers') throw new IllegalActionError(action);
      d.declared = d.declared.filter((x) => x.id !== action.attacker);
      return;
    case 'confirmAttackers':
      return confirmAttackers(ctx);
    case 'addBlock':
      if (d.kind !== 'declareBlockers') throw new IllegalActionError(action);
      d.declared.push({ blocker: action.blocker, attacker: action.attacker });
      return;
    case 'removeBlock':
      if (d.kind !== 'declareBlockers') throw new IllegalActionError(action);
      d.declared = d.declared.filter((x) => x.blocker !== action.blocker);
      return;
    case 'confirmBlockers':
      return confirmBlockers(ctx);
    case 'chooseTargets': {
      if (d.kind !== 'chooseTriggerTargets') throw new IllegalActionError(action);
      if (action.targets.length > 0) pushTrigger(ctx, d.trigger, action.targets);
      return givePriority(ctx, d.thenPriority);
    }
    case 'discard': {
      if (d.kind !== 'discardToHandSize') throw new IllegalActionError(action);
      moveObject(ctx, action.card, 'graveyard');
      d.count--;
      if (d.count === 0) finishCleanup(ctx);
      return;
    }
    case 'concede':
      ps.lost = true;
      checkGameOver(ctx);
      return;
  }
}
