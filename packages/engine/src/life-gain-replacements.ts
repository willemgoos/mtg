import { cloneState } from './clone.ts';
import type { Ctx } from './context.ts';
import type { Action, CardDb, GameState, PlayerId } from './types.ts';

/** Caretakers: replacing a gain is synchronous, including during combat damage.
 * Replay an interrupted action from its unmodified starting state, applying the
 * chosen replacements in order. A single immutable original snapshot is retained;
 * the visible state shows the partially resolved action, never rolled-back zones.
 */
export interface LifeGainReplay {
  action: Action;
  /** One bounded original state, whose decision never contains lifeGainReplay. */
  original: GameState;
  choices: number[];
  /** Prefix already delivered to clients; replayed only for engine bookkeeping. */
  eventCount: number;
  /** Cards publicly revealed earlier in this still-resolving action. */
  revealed: string[];
}

export interface LifeGainReplacement {
  label: string;
  sourceDefId: string;
  kind: 'add' | 'double';
  amount: number;
}

class ChooseLifeGainReplacement extends Error {
  constructor(
    readonly player: PlayerId,
    readonly options: LifeGainReplacement[],
  ) {
    super('Choose the next life-gain replacement');
  }
}

/** Only noncommuting replacements need choices; identical multipliers/additions commute. */
export function replaceLifeGain(
  ctx: Ctx,
  player: PlayerId,
  amount: number,
  replacements: LifeGainReplacement[],
): number {
  const remaining = [...replacements];
  while (remaining.length) {
    let index = 0;
    if (remaining.some((r) => r.kind === 'add') && remaining.some((r) => r.kind === 'double')) {
      const replay = ctx.lifeGainChoices;
      const picked = replay?.choices[replay.cursor];
      if (picked === undefined) throw new ChooseLifeGainReplacement(player, remaining);
      if (picked < 0 || picked >= remaining.length) throw new Error('Invalid replacement order');
      index = picked;
      replay!.cursor++;
    }
    const [replacement] = remaining.splice(index, 1);
    amount = replacement!.kind === 'double' ? amount * 2 : amount + replacement!.amount;
  }
  return amount;
}

function restore(target: GameState, snapshot: GameState): void {
  // Optional state fields added during the interrupted action must disappear too.
  for (const key of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[key];
  Object.assign(target, cloneState(snapshot));
}

export function applyWithLifeGainChoices(
  ctx: Ctx,
  action: Action,
  snapshot: GameState,
  apply: (ctx: Ctx, action: Action) => void,
): void {
  const decision = snapshot.decision;
  const pending = decision.kind === 'chooseOption' ? decision.lifeGainReplay : undefined;
  // Conceding never replays the interrupted action.
  const replay = pending && action.type === 'chooseOption' ? pending : undefined;
  const original = replay?.original ?? snapshot;
  const originalAction = replay?.action ?? action;
  const choices = replay && action.type === 'chooseOption' ? [...replay.choices, action.index] : [];
  if (replay) {
    restore(ctx.s, original);
    ctx.replayedEvents = replay.eventCount;
  }
  if (replay) ctx.lifeGainChoices = { choices, cursor: 0 };
  try {
    apply(ctx, originalAction);
  } catch (error) {
    if (!(error instanceof ChooseLifeGainReplacement)) throw error;
    // Keep all partial changes visible. Replaying reconstructs their triggers
    // from the original state; the engine suppresses only duplicate UI events.
    ctx.s.decision = {
      kind: 'chooseOption',
      player: error.player,
      title: 'Choose the next life-gain replacement',
      options: error.options.map((r) => ({ label: r.label, effects: [] })),
      // The engine handles this decision before the ordinary effect continuation.
      resume: {
        controller: error.player,
        source: null,
        sourceDefId: error.options[0]!.sourceDefId,
        targets: [],
        effects: [],
        item: { kind: 'ability', id: '' },
      },
      thenPriority: error.player,
      lifeGainReplay: {
        action: originalAction,
        original,
        choices,
        eventCount: ctx.events.length,
        revealed: ctx.events.flatMap((e) => (e.type === 'revealed' ? [e.id] : [])),
      },
    };
  } finally {
    if (replay) delete ctx.lifeGainChoices;
  }
}

/** Conservative reachability gate for the in-place API. Definitions are immutable;
 * reachability through live objects is deliberately recomputed on every action.
 * All card-ID references (tokens, backs, spellbooks, nested effects) are followed.
 * An opaque custom handler can create arbitrary definitions, so it enables both
 * bits. Engine-created built-in tokens are included even without explicit refs.
 */
export function createLifeGainSnapshotGate(db: CardDb): (state: GameState) => boolean {
  const masks = new Map<string, number>();
  const definitionMask = (root: string): number => {
    const cached = masks.get(root);
    if (cached !== undefined) return cached;
    if (!db.has(root)) return 3; // Hidden or externally supplied definition.
    const seen = new Set<string>();
    const pending = [root];
    let mask = 0;
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        if (db.has(value) && !seen.has(value)) pending.push(value);
      } else if (value && typeof value === 'object') {
        const kind = (value as { kind?: string }).kind;
        if (kind === 'custom') mask |= 3;
        if (kind === 'extraLifeGain') mask |= 1;
        if (kind === 'doubleLifeGain') mask |= 2;
        for (const v of Object.values(value)) visit(v);
      }
    };
    for (let i = 0; i < pending.length && mask !== 3; i++) {
      const id = pending[i]!;
      if (seen.has(id)) continue;
      seen.add(id);
      visit(db.get(id));
    }
    masks.set(root, mask);
    return mask;
  };
  let tokens = 0;
  // These are the only fixed tokens synthesized by core effect/stack paths.
  // Other fixed tokens are in opaque custom handlers (already conservative).
  for (const id of ['food-token', 'frog-token']) if (db.has(id)) tokens |= definitionMask(id);
  const runtimeMask = (value: unknown): number => {
    if (typeof value === 'string') return db.has(value) ? definitionMask(value) : 0;
    if (!value || typeof value !== 'object') return 0;
    const kind = (value as { kind?: string }).kind;
    if (kind === 'custom') return 3;
    let mask = kind === 'extraLifeGain' ? 1 : kind === 'doubleLifeGain' ? 2 : 0;
    for (const v of Object.values(value)) {
      mask |= runtimeMask(v);
      if (mask === 3) break;
    }
    return mask;
  };
  return (state) => {
    let mask = tokens;
    for (const id in state.objects) {
      const o = state.objects[id]!;
      mask |= definitionMask(o.defId);
      if (o.originalDefId) mask |= definitionMask(o.originalDefId);
      if (o.front) mask |= definitionMask(o.front);
      if (o.tempAbilities) mask |= runtimeMask(o.tempAbilities);
      if (o.perpetualAbilities) mask |= runtimeMask(o.perpetualAbilities);
      if (mask === 3) return true;
    }
    // Continuations and grants may outlive the objects that created them.
    for (const value of [
      state.stack,
      state.pendingTriggers,
      state.effects,
      state.emblems,
      state.delayed,
      state.decision,
      state.players.p1.sideboard,
      state.players.p2.sideboard,
      state.players.p1.paradigms,
      state.players.p2.paradigms,
    ]) {
      mask |= runtimeMask(value);
      if (mask === 3) return true;
    }
    return false;
  };
}
