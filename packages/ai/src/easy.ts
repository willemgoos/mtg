import {
  type Action,
  type CardDb,
  cloneState,
  createRng,
  type GameState,
  getCharacteristics,
  nextInt,
  type ObjectId,
  type PlayerId,
  type RngState,
} from '@mtg/engine';
import { creatureValue } from './evaluate.ts';
import { createHeuristicBot, planAttackTargets, planBlocks } from './heuristic.ts';
import { type Block, blockOptions } from './simulate.ts';
import { type Bot, other, viewEngine } from './view.ts';

export interface EasyOptions {
  seed: number;
  /** Chance to hold back a spell it could cast on its own turn. */
  holdChance?: number;
  /** Chance to skip attacking in a combat. */
  skipAttackChance?: number;
  /** Chance to skip blocking when the attack isn't lethal. */
  skipBlockChance?: number;
  /** Chance, per flyer it could block, to leave it alone anyway (and, when attacking, to plan as if you had no flyers). */
  flyerChance?: number;
  /** Chance, per block, to put a more valuable creature in front of the attacker than needed. */
  badBlockChance?: number;
  /** Chance to aim a creature-removal burn spell at your face while you are healthy. */
  faceBurnChance?: number;
  /** Chance to point removal at a smaller creature than the best target. */
  weakTargetChance?: number;
  /** Chance to leave one planned attacker at home. */
  dropAttackerChance?: number;
  /** Chance to send one more creature in than the plan has, one a blocker can kill. */
  badAttackChance?: number;
  /** Whether it may act at instant speed (counters, tricks on your turn). */
  respond?: boolean;
}

/**
 * Six steps from a very forgiving opponent up to one just below the heuristic
 * bot, for the expedition's floors. Level 4 is roughly the Novice.
 */
export const EASY_LEVELS: readonly Omit<EasyOptions, 'seed'>[] = [
  {
    holdChance: 0.5,
    skipAttackChance: 0.3,
    skipBlockChance: 0.5,
    flyerChance: 0.8,
    badBlockChance: 0.6,
    faceBurnChance: 0.7,
    weakTargetChance: 0.5,
    dropAttackerChance: 0.5,
    badAttackChance: 0.5,
  },
  {
    holdChance: 0.4,
    skipAttackChance: 0.25,
    skipBlockChance: 0.4,
    flyerChance: 0.65,
    badBlockChance: 0.5,
    faceBurnChance: 0.55,
    weakTargetChance: 0.4,
    dropAttackerChance: 0.4,
    badAttackChance: 0.4,
  },
  {
    holdChance: 0.3,
    skipAttackChance: 0.2,
    skipBlockChance: 0.3,
    flyerChance: 0.5,
    badBlockChance: 0.4,
    faceBurnChance: 0.4,
    weakTargetChance: 0.3,
    dropAttackerChance: 0.3,
    badAttackChance: 0.3,
  },
  {
    holdChance: 0.2,
    skipAttackChance: 0.12,
    skipBlockChance: 0.2,
    flyerChance: 0.35,
    badBlockChance: 0.3,
    faceBurnChance: 0.25,
    weakTargetChance: 0.2,
    dropAttackerChance: 0.2,
    badAttackChance: 0.2,
  },
  {
    holdChance: 0.12,
    skipAttackChance: 0.06,
    skipBlockChance: 0.1,
    flyerChance: 0.2,
    badBlockChance: 0.2,
    faceBurnChance: 0.12,
    weakTargetChance: 0.12,
    dropAttackerChance: 0.12,
    badAttackChance: 0.12,
    respond: true,
  },
  {
    holdChance: 0.06,
    skipAttackChance: 0.03,
    skipBlockChance: 0.05,
    flyerChance: 0.1,
    badBlockChance: 0.1,
    faceBurnChance: 0.05,
    weakTargetChance: 0.06,
    dropAttackerChance: 0.06,
    badAttackChance: 0.06,
    respond: true,
  },
];

/** At or above this life a burn spell at the face is a plausible beginner choice, not a finisher. */
const HEALTHY = 10;

type AttackPlan = { attackers: ObjectId[]; at: Map<ObjectId, ObjectId> };

/**
 * A beginner opponent: the heuristic bot with deliberate mistakes. Unless
 * `respond` is set it never acts at instant speed (no counters or combat
 * tricks on your turn). It sometimes holds spells, forgets your flyers,
 * blocks with the wrong creature, burns your face instead of a creature,
 * leaves an attacker home or sends one to die, but still blocks when an
 * attack would kill it.
 */
export function createEasyBot(db: CardDb, opts: EasyOptions): Bot {
  const inner = createHeuristicBot(db, 'easy');
  const engine = viewEngine(db);
  const rng: RngState = createRng(opts.seed);
  const roll = (p: number) => p > 0 && nextInt(rng, 1000) < p * 1000;
  const hold = opts.holdChance ?? 0.25;
  const skipAttack = opts.skipAttackChance ?? 0.35;
  const skipBlock = opts.skipBlockChance ?? 0.5;
  const flyer = opts.flyerChance ?? 0;
  const badBlock = opts.badBlockChance ?? 0;
  const faceBurn = opts.faceBurnChance ?? 0;
  const weakTarget = opts.weakTargetChance ?? 0;
  const dropAttacker = opts.dropAttackerChance ?? 0;
  const badAttack = opts.badAttackChance ?? 0;
  // One decision per combat, so it doesn't half-declare attacks.
  const combatChoice = new Map<string, boolean>();
  const decideOnce = (key: string, p: number) => {
    if (!combatChoice.has(key)) combatChoice.set(key, roll(p));
    return combatChoice.get(key)!;
  };
  // The mistaken plans, made once per declaration and then followed one action at a time
  // (null: no mistake this time, the heuristic bot declares).
  const attackPlans = new Map<string, AttackPlan | null>();
  const blockPlans = new Map<string, Block[] | null>();

  const hasFlying = (s: GameState, id: ObjectId) =>
    getCharacteristics(s, db, id).keywords.has('flying');

  /** The heuristic attack plan, then a creature left at home or one sent to die. */
  function mistakenAttacks(view: GameState, me: PlayerId): AttackPlan | null {
    const opp = other(me);
    let seen = view;
    const theirs = (s: GameState, id: ObjectId) => s.objects[id]!.controller === opp;
    // Planned on a board without their flyers, which also forgets them as crack-back.
    if (view.battlefield.some((id) => theirs(view, id) && hasFlying(view, id)) && roll(flyer)) {
      seen = cloneState(view);
      seen.battlefield = seen.battlefield.filter(
        (id) => !(theirs(seen, id) && hasFlying(seen, id)),
      );
    }
    const plan = planAttackTargets(engine, seen, me, []);
    let changed = seen !== view;
    if (plan.attackers.length > 0 && roll(dropAttacker)) {
      const gone = plan.attackers[nextInt(rng, plan.attackers.length)]!;
      plan.attackers = plan.attackers.filter((id) => id !== gone);
      plan.at.delete(gone);
      changed = true;
    }
    const untapped = view.battlefield.some((id) => theirs(view, id) && !view.objects[id]!.tapped);
    if (untapped && roll(badAttack)) {
      // The smallest creature left behind is the likeliest to die when blocked.
      const left = engine
        .getLegalActions(view, me)
        .flatMap((a) => (a.type === 'addAttacker' && !a.planeswalker ? [a.attacker] : []))
        .filter((id) => !plan.attackers.includes(id))
        .sort(
          (x, y) =>
            getCharacteristics(view, db, x).toughness - getCharacteristics(view, db, y).toughness,
        )[0];
      if (left !== undefined) {
        plan.attackers = [...plan.attackers, left];
        changed = true;
      }
    }
    return changed ? plan : null;
  }

  /** The heuristic block plan, then flyers waved through and the wrong creature in front. */
  function mistakenBlocks(view: GameState, me: PlayerId): Block[] | null {
    const plan = planBlocks(engine, view, me);
    const attackers = view.combat?.attackers ?? [];
    const life = view.players[me].life;
    const unblocked = (blocks: Block[]) =>
      attackers
        .filter((a) => !blocks.some((b) => b.attacker === a.id))
        .reduce((n, a) => n + Math.max(0, getCharacteristics(view, db, a.id).power), 0);
    let blocks = plan;
    let changed = false;
    for (const b of plan) {
      if (!hasFlying(view, b.attacker) || !roll(flyer)) continue;
      const rest = blocks.filter((x) => x !== b);
      // Never waves it through when that is the lethal hit.
      if (unblocked(rest) >= life) continue;
      blocks = rest;
      changed = true;
    }
    const base = cloneState(view);
    base.decision = { kind: 'declareBlockers', player: me, declared: [] };
    const options = blockOptions(engine, base, me);
    const value = (id: ObjectId) => creatureValue(view, db, id);
    for (const b of [...blocks]) {
      if (!roll(badBlock)) continue;
      const used = new Set(blocks.map((x) => x.blocker));
      // Its best creature steps up where the planned one would do.
      const best = (options.get(b.attacker) ?? [])
        .filter((id) => !used.has(id) && value(id) > value(b.blocker))
        .sort((x, y) => value(y) - value(x))[0];
      if (best === undefined) continue;
      blocks = blocks.map((x) => (x === b ? { blocker: best, attacker: b.attacker } : x));
      changed = true;
    }
    return changed ? blocks : null;
  }

  /** A creature-removal spell aimed at your face or at a smaller creature. */
  function mistakenSpell(a: Action, view: GameState, me: PlayerId): Action {
    if (a.type !== 'castSpell' || a.targets.length !== 1) return a;
    const opp = other(me);
    const first = (x: Action) => (x.type === 'castSpell' ? x.targets[0] : undefined);
    const creature = (x: Action) => {
      const t = first(x);
      return t && 'object' in t && view.objects[t.object.id]?.controller === opp
        ? t.object.id
        : undefined;
    };
    if (creature(a) === undefined) return a;
    const aimed = engine
      .getLegalActions(view, me)
      .filter((x) => x.type === 'castSpell' && x.card === a.card && x.mode === a.mode);
    if (view.players[opp].life >= HEALTHY && roll(faceBurn)) {
      const face = aimed.find((x) => {
        const t = first(x);
        return t && 'player' in t && t.player === opp;
      });
      if (face) return face;
    }
    if (!roll(weakTarget)) return a;
    const value = (x: Action) => {
      const id = creature(x);
      return id === undefined ? Infinity : creatureValue(view, db, id);
    };
    const smaller = aimed.filter((x) => value(x) < value(a)).sort((x, y) => value(y) - value(x))[0];
    return smaller ?? a;
  }

  return {
    name: 'easy',
    chooseAction(view, me) {
      const d = view.decision;
      const pass = { type: 'passPriority', player: me } as const;
      const combatKey = `${view.turn.number}:${view.turn.attackers.length}`;

      if (d.kind === 'priority') {
        const mine = view.turn.activePlayer === me;
        // No instant-speed interaction on the opponent's turn or in response to spells.
        if (!opts.respond && (!mine || view.stack.length > 0)) return pass;
        const a = inner.chooseAction(view, me);
        if (a.type === 'castSpell' && mine && roll(hold)) return pass;
        return mine ? mistakenSpell(a, view, me) : a;
      }
      if (d.kind === 'declareAttackers') {
        if (d.declared.length === 0 && decideOnce(`atk:${combatKey}`, skipAttack))
          return { type: 'confirmAttackers', player: me };
        const key = `atk:${view.turn.number}`;
        if (d.declared.length === 0 && !attackPlans.has(key))
          attackPlans.set(key, mistakenAttacks(view, me));
        const plan = attackPlans.get(key);
        if (plan) {
          const legal = engine.getLegalActions(view, me);
          const wrong = d.declared.find(
            (x) =>
              !plan.attackers.includes(x.id) &&
              legal.some((a) => a.type === 'removeAttacker' && a.attacker === x.id),
          );
          if (wrong) return { type: 'removeAttacker', player: me, attacker: wrong.id };
          const next = plan.attackers.find(
            (id) =>
              !d.declared.some((x) => x.id === id) &&
              legal.some((a) => a.type === 'addAttacker' && a.attacker === id),
          );
          if (next) {
            const walker = plan.at.get(next);
            const atWalker = legal.find(
              (a) => a.type === 'addAttacker' && a.attacker === next && a.planeswalker === walker,
            );
            return (
              (walker && atWalker) || {
                type: 'addAttacker',
                player: me,
                attacker: next,
                defender: other(me),
              }
            );
          }
          return { type: 'confirmAttackers', player: me };
        }
      }
      if (d.kind === 'declareBlockers') {
        if (d.declared.length === 0) {
          const incoming = (view.combat?.attackers ?? []).reduce(
            (n, a) => n + Math.max(0, getCharacteristics(view, db, a.id).power),
            0,
          );
          const lethal = incoming >= view.players[me].life;
          if (!lethal && decideOnce(`blk:${combatKey}`, skipBlock))
            return { type: 'confirmBlockers', player: me };
        }
        const key = `blk:${view.turn.number}:${(view.combat?.attackers ?? []).map((a) => a.id).join()}`;
        if (d.declared.length === 0 && !blockPlans.has(key))
          blockPlans.set(key, mistakenBlocks(view, me));
        const plan = blockPlans.get(key);
        if (plan) {
          const same = (x: Block, y: Block) => x.blocker === y.blocker && x.attacker === y.attacker;
          const wrong = d.declared.find((x) => !plan.some((p) => same(p, x)));
          if (wrong) return { type: 'removeBlock', player: me, blocker: wrong.blocker };
          const next = plan.find((p) => !d.declared.some((x) => same(p, x)));
          if (next) return { type: 'addBlock', player: me, ...next };
          return { type: 'confirmBlockers', player: me };
        }
      }
      return inner.chooseAction(view, me);
    },
  };
}
