import { answerCommandZone } from './brawl.ts';
import { cloneState } from './clone.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  emit,
  makeCtx,
  moveObject,
  drawCard,
  other,
} from './context.ts';
import { getLegalActions as legalActions } from './legal.ts';
import { checkGameOver } from './sba.ts';
import { canPayFrom, manaSources } from './mana.ts';
import { addCosts, spellTags } from './spells.ts';
import { teamworkValid } from './teamwork.ts';
import { collectTriggers, triggeredAbility } from './triggers.ts';
import { FIC_EFFECTS } from './fic-effects.ts';
import {
  openingHand,
  type NewGameOptions,
  emptyState,
  setupGame,
  shuffleLibrary,
} from './setup.ts';
import {
  activateAbility,
  answerDiscard,
  finishDiscardAny,
  binLookedCard,
  answerPickCards,
  answerSacrificeSeveral,
  answerChooseFromHand,
  answerChooseObject,
  answerPayOrCounter,
  finishCastFree,
  answerChooseOption,
  answerForage,
  answerForageExile,
  answerPickExiled,
  answerPile,
  answerPunisher,
  answerSacrifice,
  answerScry,
  answerSearch,
  answerOptionalEffect,
  answerSplit,
  castCost,
  castSpell,
  wardCost,
  pushTrigger,
} from './stack.ts';
import {
  confirmAttackers,
  confirmBlockers,
  finishCleanup,
  givePriority,
  passPriority,
  startTurn,
} from './turn.ts';
import type { Action, ApplyResult, CardDb, GameEvent, GameState, PlayerId } from './types.ts';

export interface ApplyOptions {
  /** Skip the legality check (for callers that picked from getLegalActions). */
  trusted?: boolean;
}

export interface Engine {
  readonly db: CardDb;
  newGame(opts: NewGameOptions): GameState;
  getLegalActions(state: GameState, player: PlayerId): Action[];
  /** Returns a new state; the input is left untouched. */
  applyAction(state: GameState, action: Action, opts?: ApplyOptions): ApplyResult;
  /**
   * Mutates `state` directly and returns the events. For simulations that own
   * their state (clone once with cloneState, then play out). If this throws,
   * the state may be left half-updated.
   */
  applyActionInPlace(state: GameState, action: Action, opts?: ApplyOptions): GameEvent[];
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
  // Teamwork creatures are chosen like mana sources: any valid choice matches the legal action.
  const {
    payWith: _ignored,
    teamwork: _chosen,
    ...rest
  } = a as Action & {
    payWith?: unknown;
    teamwork?: unknown;
  };
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
  // Final Fantasy Commander (12): the FIC one-offs are built in.
  const custom = { ...FIC_EFFECTS, ...options.customEffects };

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
      validate(state, action, opts);
      const next = cloneState(state);
      const ctx = makeCtx(next, db, custom);
      apply(ctx, action);
      // A resolution that paused to ask something still owes its triggers so far.
      collectTriggers(ctx);
      return { state: next, events: ctx.events };
    },

    applyActionInPlace(state, action, opts = {}) {
      validate(state, action, opts);
      const ctx = makeCtx(state, db, custom);
      apply(ctx, action);
      collectTriggers(ctx);
      return ctx.events;
    },
  };

  function validate(state: GameState, action: Action, opts: ApplyOptions): void {
    if (state.winner) throw new IllegalActionError(action);
    if (opts.trusted || action.type === 'concede') return;
    const key = actionKey(action);
    const legal = legalActions(makeCtx(state, db, custom), action.player);
    if (!legal.some((a) => actionKey(a) === key)) throw new IllegalActionError(action);
    if (action.type === 'castSpell' && action.teamwork) {
      const ctx = makeCtx(state, db, custom);
      const n = def(ctx, action.card).kicker?.teamwork;
      if (!action.kicked || n === undefined) throw new IllegalActionError(action);
      if (!teamworkValid(ctx, action.player, n, action.teamwork))
        throw new IllegalActionError(action);
      // The mana must still be payable without the creatures tapped for teamwork.
      if (state.decision.kind !== 'castFree') {
        const { card, player, targets } = action;
        const cost = addCosts(
          castCost(ctx, player, card, { ...action, back: undefined }, targets),
          wardCost(ctx, player, targets),
        );
        const pool = manaSources(ctx, player, undefined, spellTags(def(ctx, card))).filter(
          (m) => !action.teamwork!.includes(m.id),
        );
        if (!canPayFrom(cost, pool)) throw new IllegalActionError(action);
      }
    }
  }
}

function afterMulliganDecision(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  const next = other(player);
  if (!s.players[next].keptHand) s.decision = { kind: 'mulligan', player: next };
  else {
    // Marvel Super Heroes (Quicksilver): "you may begin the game with him on the battlefield". Always done.
    for (const p of [s.turn.activePlayer, next])
      for (const id of [...s.players[p].hand])
        if (def(ctx, id).beginsOnBattlefield) moveObject(ctx, id, 'battlefield', { controller: p });
    startTurn(ctx, s.turn.activePlayer);
  }
}

function apply(ctx: Ctx, action: Action): void {
  const s = ctx.s;
  const player = action.player;
  const ps = s.players[player];
  const d = s.decision;

  switch (action.type) {
    case 'keepHand': {
      ps.keptHand = true;
      // Brawl: the first mulligan is free.
      const free = s.format === 'brawl' && ps.mulligans > 0 ? 1 : 0;
      const count = Math.min(ps.mulligans - free, ps.hand.length);
      if (count > 0) s.decision = { kind: 'bottomCards', player, count };
      else afterMulliganDecision(ctx, player);
      return;
    }
    case 'mulligan': {
      for (const id of [...ps.hand]) moveObject(ctx, id, 'library');
      shuffleLibrary(ctx, player);
      for (let i = 0; i < openingHand(ps); i++) drawCard(ctx, player);
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
      moveObject(ctx, action.card, 'battlefield', {
        controller: player,
        ...(action.back ? { transformed: true } : {}),
      });
      ps.landsPlayedThisTurn++;
      s.turn.passed = [];
      return givePriority(ctx, player);
    case 'castSpell': {
      // Cast for free in the middle of a resolution (Daring Waverider).
      if (d.kind === 'castFree') {
        castSpell(ctx, player, action.card, action.targets, {
          mode: action.mode,
          kicked: action.kicked,
          x: action.x,
          paws: action.paws,
          discard: action.discard,
          via: 'free',
          exileAfter: d.exileAfter,
          freePay: d.pay,
          freeLess: d.costLess,
        });
        return finishCastFree(ctx, action.card);
      }
      s.turn.passed = [];
      const paused = castSpell(
        ctx,
        player,
        action.card,
        action.targets,
        {
          mode: action.mode,
          kicked: action.kicked,
          sacrifice: action.sacrifice,
          forage: action.forage,
          discard: action.discard,
          x: action.x,
          paws: action.paws,
          via: action.via,
          copyOf: action.copyOf,
          sacrificeMany: action.sacrificeMany,
          kickCount: action.kickCount,
          delve: action.delve,
          teamwork: action.teamwork,
          back: action.back,
          sneak: action.sneak,
        },
        action.payWith,
      );
      // Foraging from a big graveyard asks which cards first.
      return paused ? undefined : givePriority(ctx, player);
    }
    case 'activateAbility': {
      s.turn.passed = [];
      const paused = activateAbility(
        ctx,
        player,
        action.source,
        action.abilityIndex,
        action.targets,
        action.payWith,
        action.sacrifice,
        action.forage,
        action.discard,
        action.x,
        action.tapCreature,
      );
      return paused ? undefined : givePriority(ctx, player);
    }
    case 'addAttacker':
      if (d.kind !== 'declareAttackers') throw new IllegalActionError(action);
      // Re-declaring an attacker (at a planeswalker) replaces its declaration.
      d.declared = d.declared.filter((x) => x.id !== action.attacker);
      d.declared.push({
        id: action.attacker,
        defender: action.defender,
        ...(action.planeswalker ? { planeswalker: action.planeswalker } : {}),
      });
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
    case 'chooseEffect':
      if (d.kind === 'payOrCounter') return answerPayOrCounter(ctx, action.accept);
      if (d.kind === 'castFree') return finishCastFree(ctx, null);
      // Strixhaven (13c): stop discarding (Illuminate History); bin the card looked at (The Biblioplex).
      if (d.kind === 'discard' && d.anyNumber) return finishDiscardAny(ctx);
      if (d.kind === 'searchLibrary' && d.canBin) return binLookedCard(ctx);
      if (d.kind === 'commandZone') {
        answerCommandZone(ctx, d.card, action.accept);
        return givePriority(ctx, d.thenPriority);
      }
      return answerOptionalEffect(ctx, action.accept);
    case 'chooseTargets': {
      if (d.kind !== 'chooseTriggerTargets') throw new IllegalActionError(action);
      // Wasp, Strategic Intervention: an "up to" target left out still puts the trigger on the
      // stack (no targets chosen); only a "may" (or "you may pay") trigger is declined that way.
      const a = triggeredAbility(ctx, d.trigger);
      const upTo = !!a.targets[0]?.optional && !a.optional && !a.cost;
      if (action.targets.length > 0 || action.mode !== undefined || upTo)
        pushTrigger(ctx, d.trigger, action.targets, action.mode);
      return givePriority(ctx, d.thenPriority);
    }
    case 'discard': {
      if (d.kind === 'discard') return answerDiscard(ctx, action.card);
      if (d.kind !== 'discardToHandSize') throw new IllegalActionError(action);
      moveObject(ctx, action.card, 'graveyard');
      d.count--;
      if (d.count === 0) finishCleanup(ctx);
      return;
    }
    case 'scry':
      if (d.kind !== 'scry') throw new IllegalActionError(action);
      return answerScry(ctx, action.top, action.bottom);
    case 'splitPiles':
      if (d.kind !== 'splitPiles') throw new IllegalActionError(action);
      return answerSplit(ctx, action.faceUp);
    case 'choosePile':
      if (d.kind !== 'choosePile') throw new IllegalActionError(action);
      return answerPile(ctx, action.pile);
    case 'forage':
      if (d.kind !== 'forage') throw new IllegalActionError(action);
      return answerForage(ctx, action.choice);
    case 'chooseOption':
      if (d.kind !== 'chooseOption') throw new IllegalActionError(action);
      return answerChooseOption(ctx, action.index);
    case 'chooseCard':
      if (d.kind === 'chooseObject') return answerChooseObject(ctx, action.card);
      if (d.kind === 'pickCards' && (action.card || d.upTo))
        return answerPickCards(ctx, action.card);
      if (d.kind === 'sacrificeSeveral' && action.card)
        return answerSacrificeSeveral(ctx, action.card);
      if (d.kind === 'chooseFromHand') return answerChooseFromHand(ctx, action.card);
      if (d.kind === 'forageExile' && action.card) return answerForageExile(ctx, action.card);
      if (d.kind === 'sacrifice' && action.card) return answerSacrifice(ctx, action.card);
      if (d.kind === 'punisher') return answerPunisher(ctx, action.card);
      if (d.kind === 'pickExiled' && action.card) return answerPickExiled(ctx, action.card);
      if (d.kind !== 'searchLibrary') throw new IllegalActionError(action);
      return answerSearch(ctx, action.card);
    case 'concede':
      ps.lost = true;
      checkGameOver(ctx);
      return;
  }
}
