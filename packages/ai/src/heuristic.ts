import {
  type Action,
  type CardDb,
  cloneState,
  type Engine,
  type GameState,
  getCharacteristics,
  manaValue,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';
import {
  chooseLandToPlay,
  choosePickExiled,
  chooseForageExile,
  chooseFromHand,
  choosePile,
  chooseSplit,
  choosePunishment,
  chooseSacrifice,
  chooseScry,
  chooseSearch,
} from './choices.ts';
import { evaluate, lifeValue } from './evaluate.ts';
import {
  type Block,
  blockOptions,
  combatStats,
  inCombat,
  scoreAction,
  settle,
  bestByEvaluation,
} from './simulate.ts';
import { type Bot, other, viewEngine } from './view.ts';

/** Minimum improvement over passing before the bot spends a card or mana. */
const MARGIN = 0.05;
/** A simulated outcome at least this good is a won game (see evaluate). */
const WIN = 10000;

/**
 * One-ply lookahead bot: for each legal action it simulates to the end of the
 * stack (or of combat) against a passive opponent and keeps the action with
 * the best static evaluation. Attacks and blocks are planned greedily with
 * the same simulation. Decides only from its redacted view.
 */
export function createHeuristicBot(db: CardDb, name = 'heuristic'): Bot {
  const engine = viewEngine(db);
  return {
    name,
    chooseAction(view, me) {
      const legal = engine.getLegalActions(view, me);
      if (legal.length === 0) throw new Error(`${name}: no legal actions`);
      if (legal.length === 1) return legal[0]!;
      const d = view.decision;
      switch (d.kind) {
        case 'mulligan':
          return keepOrMulligan(engine, view, me, legal);
        case 'bottomCards':
        case 'discardToHandSize':
        case 'discard':
          return pickCardToLose(engine, view, me, legal);
        case 'chooseTriggerTargets':
        case 'optionalEffect':
        case 'forage':
        case 'chooseOption':
        case 'chooseObject':
        case 'payOrCounter':
        case 'castFree':
          return bestByEvaluation(engine, view, me, legal, 'stack');
        case 'chooseFromHand':
        case 'pickCards':
          return chooseFromHand(engine, view, legal);
        case 'forageExile':
          return chooseForageExile(engine, view, legal);
        case 'scry':
          return chooseScry(engine, view, me, legal);
        case 'searchLibrary':
          return chooseSearch(engine, view, me, legal);
        case 'sacrifice':
          return chooseSacrifice(engine, view, legal);
        case 'punisher':
          return choosePunishment(engine, view, me, legal);
        case 'pickExiled':
          return choosePickExiled(engine, view, me, legal);
        case 'splitPiles':
          return chooseSplit(engine, view, me, legal);
        case 'choosePile':
          return choosePile(view, me);
        case 'declareAttackers':
          return nextAttackAction(
            engine,
            view,
            me,
            d.declared.map((x) => x.id),
          );
        case 'declareBlockers':
          return nextBlockAction(engine, view, me, d.declared);
        case 'priority':
          return choosePriorityAction(engine, view, me, legal);
        default:
          return legal[0]!;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

function choosePriorityAction(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
): Action {
  const lands = legal.filter((a) => a.type === 'playLand');
  if (lands.length > 0) return chooseLandToPlay(engine, view, me, lands);

  const pass = legal.find((a) => a.type === 'passPriority')!;
  // Teamwork taps our creatures: never before our own attack (the evaluation can't see the lost attack).
  const beforeOurAttack =
    view.turn.activePlayer === me &&
    (view.turn.step === 'main1' || view.turn.step === 'beginCombat');
  const candidates = legal.filter(
    (a) =>
      (a.type === 'castSpell' &&
        !(
          beforeOurAttack &&
          a.kicked &&
          engine.db.get(view.objects[a.card]!.defId)?.kicker?.teamwork !== undefined
        )) ||
      a.type === 'activateAbility',
  );
  if (candidates.length === 0) return pass;

  const horizon = inCombat(view) ? 'combat' : 'stack';
  // Passing with an empty stack outside combat changes nothing we can see.
  const passScore =
    view.stack.length > 0 || horizon === 'combat'
      ? scoreAction(engine, view, pass, me, horizon)
      : evaluate(cloneState(view), engine.db, me);

  let best: Action = pass;
  let bestScore = passScore + MARGIN;
  for (const a of candidates) {
    const v = scoreAction(engine, view, a, me, horizon);
    if (v > bestScore) {
      bestScore = v;
      best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

/**
 * Damage the opponent could deal us next turn if we tap these creatures now:
 * each of our untapped creatures blocks the biggest attacker it legally can.
 * Returns the evaluation penalty for that exposure.
 */
function crackbackPenalty(engine: Engine, s: GameState, me: PlayerId): number {
  const opp = other(me);
  const creatures = (p: PlayerId) =>
    s.battlefield.filter((id) => {
      const o = s.objects[id]!;
      return o.controller === p && engine.db.get(o.defId)?.types.includes('Creature');
    });
  const attackers = creatures(opp)
    .map((id) => ({
      id,
      ...combatStats(engine, s, id),
      flying: getCharacteristics(s, engine.db, id).keywords.has('flying'),
    }))
    .sort((x, y) => y.damage - x.damage);
  const blockers = creatures(me)
    .filter((id) => !s.objects[id]!.tapped)
    .map((id) => getCharacteristics(s, engine.db, id).keywords)
    .map((k) => ({ canBlockFlyers: k.has('flying') || k.has('reach') }));

  let unblocked = 0;
  for (const a of attackers) {
    const i = blockers.findIndex((b) => !a.flying || b.canBlockFlyers);
    if (i >= 0 && !a.menace) blockers.splice(i, 1);
    else unblocked += a.damage;
  }
  const life = s.players[me].life;
  if (unblocked >= life) return 300;
  return 0.5 * (lifeValue(life) - lifeValue(life - unblocked));
}

function scoreAttack(engine: Engine, view: GameState, me: PlayerId, attackers: ObjectId[]): number {
  const sim = cloneState(view);
  sim.decision = {
    kind: 'declareAttackers',
    player: me,
    declared: attackers.map((id) => ({ id, defender: other(me) })),
  };
  engine.applyActionInPlace(sim, { type: 'confirmAttackers', player: me }, { trusted: true });
  settle(engine, sim, 'combat');
  return evaluate(sim, engine.db, me) - (sim.winner ? 0 : crackbackPenalty(engine, sim, me));
}

/** Greedy attack plan: add the attacker that helps most until nothing helps; also try all-in. */
export function planAttacks(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  declared: ObjectId[],
): ObjectId[] {
  // Bots attack the player (planeswalker attacks list each attacker again).
  const available = [
    ...new Set([
      ...declared,
      ...engine
        .getLegalActions(view, me)
        .flatMap((a) => (a.type === 'addAttacker' && !a.planeswalker ? [a.attacker] : [])),
    ]),
  ];
  // Attacking with everything wins the game: no need to plan.
  const allIn = available.length ? scoreAttack(engine, view, me, available) : -Infinity;
  if (allIn >= WIN) return available;
  // Interchangeable attackers (same card, stats and keywords) are tried once per round.
  const kind = (id: ObjectId) => {
    const c = getCharacteristics(view, engine.db, id);
    return `${view.objects[id]!.defId}|${c.power}|${c.toughness}|${[...c.keywords].sort().join()}`;
  };
  let plan: ObjectId[] = [];
  let planScore = scoreAttack(engine, view, me, plan);
  for (;;) {
    let bestAdd: ObjectId | null = null;
    let bestScore = planScore + MARGIN;
    const tried = new Set<string>();
    for (const id of available) {
      if (plan.includes(id)) continue;
      const k = kind(id);
      if (tried.has(k)) continue;
      tried.add(k);
      const v = scoreAttack(engine, view, me, [...plan, id]);
      if (v > bestScore) {
        bestScore = v;
        bestAdd = id;
      }
    }
    if (!bestAdd) break;
    plan = [...plan, bestAdd];
    planScore = bestScore;
  }
  if (plan.length < available.length && allIn > planScore + MARGIN) plan = available;
  return plan;
}

/**
 * Plans are made once per declaration and then declared one creature at a
 * time. Keyed by the decision object, which stays the same while a simulation
 * mutates its state in place (in the real game each action makes a new one).
 */
const attackPlans = new WeakMap<object, ObjectId[]>();
const blockPlans = new WeakMap<object, Block[]>();

function memo<T>(cache: WeakMap<object, T>, key: object, make: () => T): T {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

function nextAttackAction(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  declared: ObjectId[],
): Action {
  const plan = memo(attackPlans, view.decision, () => planAttacks(engine, view, me, declared));
  const wrong = declared.find((id) => !plan.includes(id));
  if (wrong) return { type: 'removeAttacker', player: me, attacker: wrong };
  const next = plan.find((id) => !declared.includes(id));
  if (next) return { type: 'addAttacker', player: me, attacker: next, defender: other(me) };
  return { type: 'confirmAttackers', player: me };
}

function scoreBlocks(engine: Engine, view: GameState, me: PlayerId, blocks: Block[]): number {
  const sim = cloneState(view);
  sim.decision = { kind: 'declareBlockers', player: me, declared: blocks.map((b) => ({ ...b })) };
  engine.applyActionInPlace(sim, { type: 'confirmBlockers', player: me }, { trusted: true });
  settle(engine, sim, 'combat');
  return evaluate(sim, engine.db, me);
}

/**
 * Greedy block plan: attackers in order of damage, each gets the option
 * (no block, one blocker, or two blockers) that simulates best given the
 * blocks chosen so far. Menace attackers only get the no-block or two-blocker options.
 */
export function planBlocks(engine: Engine, view: GameState, me: PlayerId): Block[] {
  const base = cloneState(view);
  base.decision = { kind: 'declareBlockers', player: me, declared: [] };
  const options = blockOptions(engine, base, me);
  const attackers = (view.combat?.attackers ?? [])
    .map((a) => ({ id: a.id, ...combatStats(engine, view, a.id) }))
    .sort((x, y) => y.damage - x.damage);

  let plan: Block[] = [];
  const used = new Set<ObjectId>();
  for (const a of attackers) {
    const free = (options.get(a.id) ?? []).filter((b) => !used.has(b));
    const choices: ObjectId[][] = [[]];
    if (!a.menace) for (const b of free) choices.push([b]);
    const top = free.slice(0, 4);
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) choices.push([top[i]!, top[j]!]);

    let best: ObjectId[] = [];
    let bestScore = -Infinity;
    for (const c of choices) {
      const v = scoreBlocks(engine, view, me, [
        ...plan,
        ...c.map((b) => ({ blocker: b, attacker: a.id })),
      ]);
      if (v > bestScore + (c.length ? MARGIN : 0)) {
        bestScore = v;
        best = c;
      }
    }
    plan = [...plan, ...best.map((b) => ({ blocker: b, attacker: a.id }))];
    for (const b of best) used.add(b);
  }
  return plan;
}

function nextBlockAction(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  declared: readonly Block[],
): Action {
  const plan = memo(blockPlans, view.decision, () => planBlocks(engine, view, me));
  const key = (b: Block) => `${b.blocker}>${b.attacker}`;
  const planned = new Set(plan.map(key));
  const wrong = declared.find((b) => !planned.has(key(b)));
  if (wrong) return { type: 'removeBlock', player: me, blocker: wrong.blocker };
  const have = new Set(declared.map(key));
  const next = plan.find((b) => !have.has(key(b)));
  if (next) return { type: 'addBlock', player: me, ...next };
  return { type: 'confirmBlockers', player: me };
}

// ---------------------------------------------------------------------------
// Mulligans and discards
// ---------------------------------------------------------------------------

function isLand(engine: Engine, s: GameState, id: ObjectId): boolean {
  return !!engine.db.get(s.objects[id]!.defId)?.types.includes('Land');
}

function keepOrMulligan(engine: Engine, view: GameState, me: PlayerId, legal: Action[]): Action {
  const p = view.players[me];
  const lands = p.hand.filter((id) => isLand(engine, view, id)).length;
  const keepSize = p.hand.length - p.mulligans;
  const ok = p.mulligans >= 2 || (lands >= 2 && lands <= Math.min(5, keepSize - 1));
  return legal.find((a) => a.type === (ok ? 'keepHand' : 'mulligan')) ?? legal[0]!;
}

/** Bottom/discard: a land if we have plenty, otherwise the most expensive spell. */
function pickCardToLose(engine: Engine, view: GameState, me: PlayerId, legal: Action[]): Action {
  const p = view.players[me];
  const landsInPlay = view.battlefield.filter(
    (id) => view.objects[id]!.controller === me && isLand(engine, view, id),
  ).length;
  const handLands = p.hand.filter((id) => isLand(engine, view, id));
  const cost = (id: ObjectId) => {
    const c = engine.db.get(view.objects[id]!.defId)!.manaCost;
    return manaValue(c);
  };
  const tooManyLands =
    handLands.length > p.hand.length - handLands.length || landsInPlay + handLands.length > 7;
  const card = tooManyLands
    ? handLands[0]
    : [...p.hand].filter((id) => !isLand(engine, view, id)).sort((a, b) => cost(b) - cost(a))[0];
  const want = card ?? p.hand[0];
  return (
    legal.find((a) => (a.type === 'bottomCard' || a.type === 'discard') && a.card === want) ??
    legal[0]!
  );
}
