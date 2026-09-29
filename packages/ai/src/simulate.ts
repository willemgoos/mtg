import {
  type Action,
  cloneState,
  type Decision,
  type Engine,
  type GameState,
  getCharacteristics,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';
import { creatureValue, evaluate } from './evaluate.ts';

/**
 * How far to look ahead: until the stack is empty, or until combat is over
 * (after combat damage).
 */
export type Horizon = 'stack' | 'combat';

const COMBAT_STEPS = new Set([
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
]);

export function inCombat(s: GameState): boolean {
  return !!s.combat && s.combat.attackers.length > 0 && COMBAT_STEPS.has(s.turn.step);
}

/**
 * Plays the game forward to the horizon with a passive opponent model: every
 * player passes priority, defenders block with `quickBlocks`, and triggered
 * abilities pick their best targets (one level deep). Mutates `s`.
 */
export function settle(engine: Engine, s: GameState, horizon: Horizon, depth = 0): void {
  for (let i = 0; i < 400; i++) {
    const d = s.decision;
    if (s.winner || d.kind === 'gameOver') return;
    const done = horizon === 'stack' || !COMBAT_STEPS.has(s.turn.step);
    if (d.kind === 'priority' && s.stack.length === 0 && done) return;
    engine.applyActionInPlace(s, passiveAction(engine, s, d, depth), { trusted: true });
  }
  throw new Error('settle did not converge');
}

function passiveAction(
  engine: Engine,
  s: GameState,
  d: Exclude<Decision, { kind: 'gameOver' }>,
  depth: number,
): Action {
  switch (d.kind) {
    case 'priority':
      return { type: 'passPriority', player: d.player };
    case 'declareAttackers':
      return { type: 'confirmAttackers', player: d.player };
    case 'declareBlockers': {
      const plan = quickBlocks(engine, s, d.player);
      const next = plan.find((b) => !d.declared.some((x) => x.blocker === b.blocker));
      return next
        ? { type: 'addBlock', player: d.player, ...next }
        : { type: 'confirmBlockers', player: d.player };
    }
    case 'chooseTriggerTargets':
      return bestByEvaluation(
        engine,
        s,
        d.player,
        engine.getLegalActions(s, d.player),
        'stack',
        depth + 1,
      );
    default:
      return engine.getLegalActions(s, d.player)[0]!;
  }
}

/** Applies `action` to a copy of `s`, settles to the horizon and evaluates. */
export function simulate(
  engine: Engine,
  s: GameState,
  action: Action | null,
  horizon: Horizon,
  depth = 0,
): GameState {
  const sim = cloneState(s);
  if (action) engine.applyActionInPlace(sim, action, { trusted: true });
  settle(engine, sim, horizon, depth);
  return sim;
}

export function scoreAction(
  engine: Engine,
  s: GameState,
  action: Action | null,
  me: PlayerId,
  horizon: Horizon,
  depth = 0,
): number {
  return evaluate(simulate(engine, s, action, horizon, depth), engine.db, me);
}

/** The option with the best evaluation for `me` (first option when too deep). */
export function bestByEvaluation(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  options: Action[],
  horizon: Horizon,
  depth = 0,
): Action {
  if (options.length === 1 || depth > 1) return options[0]!;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const a of options) {
    const v = scoreAction(engine, s, a, me, horizon, depth);
    if (v > bestScore) {
      bestScore = v;
      best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rule-based blocking, used to predict the opponent inside simulations
// ---------------------------------------------------------------------------

export interface Block {
  blocker: ObjectId;
  attacker: ObjectId;
}

/** Legal blockers per attacker for `defender` at the current declaration. */
export function blockOptions(
  engine: Engine,
  s: GameState,
  defender: PlayerId,
): Map<ObjectId, ObjectId[]> {
  const out = new Map<ObjectId, ObjectId[]>();
  for (const a of engine.getLegalActions(s, defender)) {
    if (a.type !== 'addBlock') continue;
    out.set(a.attacker, [...(out.get(a.attacker) ?? []), a.blocker]);
  }
  return out;
}

export function combatStats(engine: Engine, s: GameState, id: ObjectId) {
  const c = getCharacteristics(s, engine.db, id);
  const strikes = c.keywords.has('doubleStrike') ? 2 : 1;
  return {
    power: Math.max(0, c.power),
    toughness: c.toughness - s.objects[id]!.damage,
    damage: Math.max(0, c.power) * strikes,
    deathtouch: c.keywords.has('deathtouch'),
    menace: c.keywords.has('menace'),
    value: creatureValue(s, engine.db, id),
  };
}

/**
 * Quick defensive blocks: free kills, then safe blocks, then even-or-better
 * trades, and chump blocks only when the unblocked damage would be lethal.
 */
export function quickBlocks(engine: Engine, s: GameState, defender: PlayerId): Block[] {
  const d = s.decision;
  const declared = d.kind === 'declareBlockers' ? d.declared : [];
  const options = blockOptions(engine, s, defender);
  const used = new Set(declared.map((b) => b.blocker));
  const plan: Block[] = [...declared];
  const attackers = (s.combat?.attackers ?? [])
    .map((a) => ({ id: a.id, ...combatStats(engine, s, a.id) }))
    .sort((x, y) => y.damage - x.damage);
  let incoming = attackers.reduce((n, a) => n + a.damage, 0);
  const life = s.players[defender].life;

  for (const a of attackers) {
    if (plan.some((b) => b.attacker === a.id) || a.menace) continue;
    const cands = (options.get(a.id) ?? [])
      .filter((b) => !used.has(b))
      .map((b) => ({ id: b, ...combatStats(engine, s, b) }));
    const kills = (b: (typeof cands)[number]) => b.deathtouch || b.power >= a.toughness;
    const survives = (b: (typeof cands)[number]) => !a.deathtouch && b.toughness > a.power;
    const pick =
      cands.find((b) => kills(b) && survives(b)) ??
      cands.find(survives) ??
      cands.find((b) => kills(b) && b.value <= a.value) ??
      (incoming >= life ? [...cands].sort((x, y) => x.value - y.value)[0] : undefined);
    if (!pick) continue;
    plan.push({ blocker: pick.id, attacker: a.id });
    used.add(pick.id);
    incoming -= a.damage;
  }
  return plan;
}
