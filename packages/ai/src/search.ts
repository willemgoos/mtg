import {
  type Action,
  type CardDb,
  type CardDefId,
  cloneState,
  createEngine,
  createRng,
  determinize,
  type Engine,
  type GameState,
  nextInt,
  type ObjectId,
  type PlayerId,
  type RngState,
} from '@mtg/engine';
import { evaluate } from './evaluate.ts';
import { createHeuristicBot, planAttacks, planBlocks, planWalkerAttacks } from './heuristic.ts';
import { type Block, inCombat, quickBlocks, scoreAction } from './simulate.ts';
import { type Bot, other, viewEngine } from './view.ts';

export interface SearchOptions {
  /** Total playouts per decision (deterministic budget). Default 96. */
  rollouts?: number;
  /** Optional wall-clock cap per decision, in ms (makes play non-deterministic). */
  timeMs?: number;
  /** How many turn boundaries each playout runs before evaluating. Default 2. */
  horizonTurns?: number;
  /** Seed for the bot's own sampling. */
  seed?: number;
  /** Target options kept per card or ability (ranked by the heuristic). Default 2. */
  targetsPerSource?: number;
  name?: string;
}

/** A root option: a single action or a whole attack/block plan. */
interface Arm {
  label: string;
  /** First action to take towards this option in the real game. */
  first: Action;
  apply(engine: Engine, s: GameState): void;
  /** For attack/block options: the full plan, declared one creature at a time. */
  attackers?: ObjectId[];
  /** Reality Fracture (17c): attackers that go at an opposing planeswalker. */
  attackAt?: ReadonlyMap<ObjectId, ObjectId>;
  blocks?: Block[];
}

/**
 * Determinized Monte Carlo search. Each playout samples the hidden cards
 * from the decklists, applies a root option, lets the heuristic bot play both
 * sides for a couple of turns, then scores the position. The budget is spread
 * with successive halving, and every option is compared on the same sampled
 * worlds (common random numbers).
 */
export function createSearchBot(
  db: CardDb,
  decks: Record<PlayerId, readonly CardDefId[]>,
  opts: SearchOptions = {},
): Bot {
  const name = opts.name ?? 'search';
  const budget = opts.rollouts ?? 96;
  const horizon = opts.horizonTurns ?? 2;
  const perSource = opts.targetsPerSource ?? 2;
  const engine = createEngine(db);
  const view = viewEngine(db);
  const heuristic = createHeuristicBot(db, `${name}/heuristic`);
  const rng = createRng(opts.seed ?? 1);
  /** Attack/block plans are chosen once, then declared one creature at a time. */
  const plans = new Map<string, Arm>();

  function reward(s: GameState, me: PlayerId): number {
    if (s.winner) return s.winner === me ? 1 : s.winner === 'draw' ? 0.5 : 0;
    return 1 / (1 + Math.exp(-evaluate(s, db, me) / 8));
  }

  function rollout(world: GameState, me: PlayerId): number {
    const stopAt = world.turn.number + horizon;
    for (let i = 0; i < 3000; i++) {
      const d = world.decision;
      if (world.winner || d.kind === 'gameOver') break;
      if (world.turn.number >= stopAt && d.kind === 'priority' && world.stack.length === 0) break;
      engine.applyActionInPlace(world, heuristic.chooseAction(world, d.player), { trusted: true });
    }
    return reward(world, me);
  }

  function search(v: GameState, me: PlayerId, arms: Arm[]): Arm {
    if (arms.length === 1) return arms[0]!;
    const started = performance.now();
    const rounds = Math.max(1, Math.ceil(Math.log2(arms.length)));
    const perRound = Math.max(arms.length, Math.floor(budget / rounds));
    const sum = new Map<Arm, number>();
    const count = new Map<Arm, number>();
    let alive = [...arms];
    const seeds: number[] = [];
    const seedAt = (i: number) => (seeds[i] ??= nextSeed(rng));

    let offset = 0;
    for (let r = 0; r < rounds && alive.length > 1; r++) {
      const per = Math.max(1, Math.floor(perRound / alive.length));
      for (let j = 0; j < per; j++) {
        const world = determinize(v, decks, seedAt(offset + j));
        for (const arm of alive) {
          const w = cloneState(world);
          arm.apply(engine, w);
          sum.set(arm, (sum.get(arm) ?? 0) + rollout(w, me));
          count.set(arm, (count.get(arm) ?? 0) + 1);
        }
        if (opts.timeMs !== undefined && performance.now() - started > opts.timeMs) break;
      }
      offset += per;
      const mean = (a: Arm) => (sum.get(a) ?? 0) / Math.max(1, count.get(a) ?? 0);
      alive = [...alive].sort((a, b) => mean(b) - mean(a)).slice(0, Math.ceil(alive.length / 2));
      if (opts.timeMs !== undefined && performance.now() - started > opts.timeMs) break;
    }
    return alive[0]!;
  }

  // -------------------------------------------------------------- candidates

  const actionArm = (a: Action, label: string = a.type): Arm => ({
    label,
    first: a,
    apply: (e, s) => void e.applyActionInPlace(s, a, { trusted: true }),
  });

  /** Casts/activations, keeping the best few target choices per source. */
  function priorityArms(v: GameState, me: PlayerId, legal: Action[]): Arm[] {
    const pass = legal.find((a) => a.type === 'passPriority')!;
    const groups = new Map<string, Action[]>();
    for (const a of legal) {
      if (a.type === 'castSpell')
        groups.set(`c:${a.card}`, [...(groups.get(`c:${a.card}`) ?? []), a]);
      if (a.type === 'activateAbility') {
        const k = `a:${a.source}:${a.abilityIndex}`;
        groups.set(k, [...(groups.get(k) ?? []), a]);
      }
    }
    const horizon = inCombat(v) ? 'combat' : 'stack';
    const arms: Arm[] = [actionArm(pass, 'pass')];
    for (const [key, actions] of groups) {
      const ranked =
        actions.length <= perSource
          ? actions
          : actions
              .map((a) => ({ a, v: scoreAction(view, v, a, me, horizon) }))
              .sort((x, y) => y.v - x.v)
              .slice(0, perSource)
              .map((x) => x.a);
      for (const a of ranked) arms.push(actionArm(a, key));
    }
    // Ties go to the earliest option (the sort is stable). Put the heuristic's own
    // choice first: "pass now and cast it next priority" often scores the same.
    const preferred = JSON.stringify(heuristic.chooseAction(v, me));
    const i = arms.findIndex((a) => JSON.stringify(a.first) === preferred);
    if (i > 0) arms.unshift(...arms.splice(i, 1));
    return arms;
  }

  function attackArms(v: GameState, me: PlayerId, legal: Action[]): Arm[] {
    const d = v.decision;
    const declared = d.kind === 'declareAttackers' ? d.declared.map((x) => x.id) : [];
    const available = [
      ...declared,
      ...legal.flatMap((a) => (a.type === 'addAttacker' ? [a.attacker] : [])),
    ];
    // Attackers that can't be taken back (goaded) stay in every option.
    const removable = new Set(
      legal.flatMap((a) => (a.type === 'removeAttacker' ? [a.attacker] : [])),
    );
    const fixed = declared.filter((id) => !removable.has(id));
    const planned = planAttacks(view, v, me, declared);
    // Reality Fracture (17c): the same plan with some attackers sent at the opponent's planeswalkers.
    const at = planWalkerAttacks(view, v, me, planned, declared);
    const options: ObjectId[][] = [planned, [], available];
    for (const id of available) options.push([id]);
    for (const id of available) {
      options.push(planned.includes(id) ? planned.filter((x) => x !== id) : [...planned, id]);
    }
    const seen = new Set<string>();
    const arms = options
      .map((ids) => [...fixed.filter((id) => !ids.includes(id)), ...ids])
      // Only creatures that may still be declared (Propaganda caps them).
      .map((ids) => ids.filter((id) => available.includes(id)))
      .filter((ids) => {
        const k = [...ids].sort().join(',');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((ids) => attackArm(me, v, declared, ids));
    if (at.size > 0) {
      const ids = [...planned, ...[...at.keys()].filter((id) => !planned.includes(id))];
      arms.push(attackArm(me, v, declared, ids, at));
    }
    return arms;
  }

  function attackArm(
    me: PlayerId,
    v: GameState,
    declared: ObjectId[],
    ids: ObjectId[],
    at: ReadonlyMap<ObjectId, ObjectId> = new Map(),
  ): Arm {
    const wrong = declared.find((id) => !ids.includes(id));
    const next = ids.find((id) => !declared.includes(id));
    const declaredAt = (id: ObjectId) =>
      v.decision.kind === 'declareAttackers'
        ? v.decision.declared.find((x) => x.id === id)
        : undefined;
    // Declared at the player but meant for a planeswalker: declare it again at the walker.
    const redirect = ids.find(
      (id) => at.has(id) && declared.includes(id) && declaredAt(id)?.planeswalker !== at.get(id),
    );
    const toward = (id: ObjectId): Action =>
      at.has(id)
        ? {
            type: 'addAttacker',
            player: me,
            attacker: id,
            defender: other(me),
            planeswalker: at.get(id)!,
          }
        : { type: 'addAttacker', player: me, attacker: id, defender: other(me) };
    const first: Action = wrong
      ? { type: 'removeAttacker', player: me, attacker: wrong }
      : next
        ? toward(next)
        : redirect
          ? toward(redirect)
          : { type: 'confirmAttackers', player: me };
    return {
      label: `attack[${ids.map((id) => (at.has(id) ? `${id}>${at.get(id)}` : id)).join(',')}]`,
      first,
      attackers: ids,
      attackAt: at,
      apply: (e, s) => {
        s.decision = {
          kind: 'declareAttackers',
          player: me,
          declared: ids.map((id) => ({
            id,
            defender: other(me),
            ...(at.has(id) ? { planeswalker: at.get(id)! } : {}),
          })),
        };
        e.applyActionInPlace(s, { type: 'confirmAttackers', player: me }, { trusted: true });
      },
    };
  }

  function blockArms(v: GameState, me: PlayerId): Arm[] {
    const d = v.decision;
    const declared: Block[] = d.kind === 'declareBlockers' ? d.declared : [];
    const planned = planBlocks(view, v, me);
    const options: Block[][] = [planned, [], quickBlocks(view, v, me)];
    for (let i = 0; i < planned.length; i++) options.push(planned.filter((_, j) => j !== i));
    const key = (bs: Block[]) =>
      bs
        .map((b) => `${b.blocker}>${b.attacker}`)
        .sort()
        .join(',');
    const seen = new Set<string>();
    return options
      .filter((bs) => {
        const k = key(bs);
        if (seen.has(k) || !blocksLegal(v, me, bs)) return false;
        seen.add(k);
        return true;
      })
      .map((bs) => blockArm(me, declared, bs, key(bs)));
  }

  /** Some combinations are illegal to confirm (e.g. one blocker on a menace attacker). */
  function blocksLegal(v: GameState, me: PlayerId, blocks: Block[]): boolean {
    const s = cloneState(v);
    s.decision = { kind: 'declareBlockers', player: me, declared: blocks.map((b) => ({ ...b })) };
    return view.getLegalActions(s, me).some((a) => a.type === 'confirmBlockers');
  }

  function blockArm(me: PlayerId, declared: readonly Block[], blocks: Block[], label: string): Arm {
    const k = (b: Block) => `${b.blocker}>${b.attacker}`;
    const want = new Set(blocks.map(k));
    const have = new Set(declared.map(k));
    const wrong = declared.find((b) => !want.has(k(b)));
    const next = blocks.find((b) => !have.has(k(b)));
    const first: Action = wrong
      ? { type: 'removeBlock', player: me, blocker: wrong.blocker }
      : next
        ? { type: 'addBlock', player: me, ...next }
        : { type: 'confirmBlockers', player: me };
    return {
      label: `block[${label}]`,
      first,
      blocks,
      apply: (e, s) => {
        s.decision = {
          kind: 'declareBlockers',
          player: me,
          declared: blocks.map((b) => ({ ...b })),
        };
        e.applyActionInPlace(s, { type: 'confirmBlockers', player: me }, { trusted: true });
      },
    };
  }

  /** Worth searching: our main phase, combat, or a response to something on the stack. */
  function worthSearching(v: GameState, me: PlayerId): boolean {
    if (v.stack.length > 0) return true;
    if (inCombat(v)) return true;
    const step = v.turn.step;
    return v.turn.activePlayer === me && (step === 'main1' || step === 'main2');
  }

  /** Follows a plan chosen earlier in this declaration, if it's still reachable. */
  function continuePlan(key: string, v: GameState, me: PlayerId, legal: Action[]): Action | null {
    const plan = plans.get(key);
    if (!plan) return null;
    const d = v.decision;
    const next =
      d.kind === 'declareAttackers'
        ? attackArm(
            me,
            v,
            d.declared.map((x) => x.id),
            plan.attackers ?? [],
            plan.attackAt,
          )
        : d.kind === 'declareBlockers'
          ? blockArm(me, d.declared, plan.blocks ?? [], '')
          : null;
    if (!next) return null;
    const key2 = JSON.stringify(next.first);
    return legal.some((a) => JSON.stringify(a) === key2) ? next.first : null;
  }

  return {
    name,
    chooseAction(v, me) {
      const legal = view.getLegalActions(v, me);
      if (legal.length <= 1) return legal[0]!;
      const d = v.decision;
      const planKey = `${v.turn.number}:${d.kind}:${me}`;

      switch (d.kind) {
        case 'declareAttackers': {
          const cont = continuePlan(planKey, v, me, legal);
          if (cont) return cont;
          const best = search(v, me, attackArms(v, me, legal));
          plans.set(planKey, best);
          return best.first;
        }
        case 'declareBlockers': {
          const cont = continuePlan(planKey, v, me, legal);
          if (cont) return cont;
          const best = search(v, me, blockArms(v, me));
          plans.set(planKey, best);
          return best.first;
        }
        case 'priority': {
          // Lands: the heuristic picks which one (tapped lands, colours).
          if (legal.some((a) => a.type === 'playLand')) return heuristic.chooseAction(v, me);
          if (!worthSearching(v, me)) return heuristic.chooseAction(v, me);
          const arms = priorityArms(v, me, legal);
          if (arms.length === 1) return arms[0]!.first;
          return search(v, me, arms).first;
        }
        default:
          return heuristic.chooseAction(v, me);
      }
    },
  };
}

function nextSeed(rng: RngState): number {
  return nextInt(rng, 0x7fffffff);
}
