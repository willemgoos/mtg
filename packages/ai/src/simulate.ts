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
import {
  chooseHandSwap,
  choosePickExiled,
  chooseCreatureType,
  chooseForageExile,
  chooseWardSacrifice,
  chooseFromHand,
  choosePile,
  chooseSplit,
  choosePunishment,
  chooseSacrifice,
  chooseScry,
  chooseSearch,
} from './choices.ts';
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
    case 'commandZone':
      return { type: 'chooseEffect', player: d.player, accept: true };
    case 'declareAttackers':
      return { type: 'confirmAttackers', player: d.player };
    case 'declareBlockers': {
      const plan = quickBlocks(engine, s, d.player);
      const next = plan.find((b) => !d.declared.some((x) => x.blocker === b.blocker));
      return next
        ? { type: 'addBlock', player: d.player, ...next }
        : { type: 'confirmBlockers', player: d.player };
    }
    case 'discard':
      // Strixhaven (13c): "any number": stop discarding at once.
      if (d.anyNumber) return { type: 'chooseEffect', player: d.player, accept: false };
      return engine.getLegalActions(s, d.player)[0]!;
    case 'chooseTriggerTargets':
    case 'spellTargets': // Lorwyn Eclipsed (18b, white)
    case 'optionalEffect':
    case 'forage':
    case 'chooseOption':
    case 'chooseObject':
    case 'payOrCounter':
    case 'castFree':
    case 'conspire': // Lorwyn Eclipsed (18a)
      // Reality Fracture (17a fixes): every creature type is on offer.
      if (d.kind === 'chooseOption' && d.title === 'Choose a creature type')
        return chooseCreatureType(engine, s, d.player, d);
      // Reality Fracture (17a): Arc of Fortune.
      if (d.kind === 'chooseOption' && d.options[0]?.label.startsWith('Discard your hand'))
        return { type: 'chooseOption', player: d.player, index: chooseHandSwap(s, d.player) };
      // A free cast can have tens of thousands of target splits (Magma Opus): don't list them when nested.
      if (d.kind === 'castFree' && depth >= 1)
        return { type: 'chooseEffect', player: d.player, accept: false };
      return bestByEvaluation(
        engine,
        s,
        d.player,
        engine.getLegalActions(s, d.player),
        'stack',
        depth + 1,
      );
    case 'scry':
      return chooseScry(engine, s, d.player, engine.getLegalActions(s, d.player));
    case 'searchLibrary':
      return chooseSearch(engine, s, d.player, engine.getLegalActions(s, d.player));
    case 'sacrifice':
      return chooseSacrifice(engine, s, engine.getLegalActions(s, d.player));
    case 'wardSacrifice':
      return chooseWardSacrifice(engine, s, engine.getLegalActions(s, d.player));
    case 'punisher':
      return choosePunishment(engine, s, d.player, engine.getLegalActions(s, d.player));
    case 'pickExiled':
      return choosePickExiled(engine, s, d.player, engine.getLegalActions(s, d.player));
    case 'splitPiles':
      return chooseSplit(engine, s, d.player, engine.getLegalActions(s, d.player));
    case 'choosePile':
      return choosePile(s, d.player);
    case 'chooseFromHand':
    case 'pickCards':
      return chooseFromHand(engine, s, engine.getLegalActions(s, d.player));
    case 'forageExile':
      return chooseForageExile(engine, s, engine.getLegalActions(s, d.player));
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
  // A free cast of Magma Opus has tens of thousands of target splits: score an even sample (the first option included).
  const cap = depth > 0 ? 12 : 48;
  const sample =
    options.length > cap
      ? Array.from({ length: cap }, (_, k) => options[Math.floor((k * options.length) / cap)]!)
      : options;
  for (const a of sample) {
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
  // Final Fantasy (11c): "can't be blocked except by three or more creatures" (Relentless X-ATM092).
  let minBlockers = c.keywords.has('menace') ? 2 : 1;
  // Lorwyn Eclipsed (18b): "can't be blocked by more than one creature" (Safewright Cavalry).
  let maxBlockers = Infinity;
  for (const a of engine.db.get(s.objects[id]!.defId)?.abilities ?? []) {
    if (a.kind === 'static' && a.effect.kind === 'minBlockers')
      minBlockers = Math.max(minBlockers, a.effect.count);
    if (a.kind === 'static' && a.effect.kind === 'maxBlockers')
      maxBlockers = Math.min(maxBlockers, a.effect.count);
  }
  return {
    power: Math.max(0, c.power),
    toughness: c.toughness - s.objects[id]!.damage,
    damage: Math.max(0, c.power) * strikes,
    deathtouch: c.keywords.has('deathtouch'),
    menace: minBlockers > 1,
    minBlockers,
    maxBlockers,
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
