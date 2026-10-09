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
  chooseHandSwap,
  chooseLandToPlay,
  choosePickExiled,
  chooseBeholdType,
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
        // Brawl: always send the commander back.
        case 'commandZone':
          return { type: 'chooseEffect', player: me, accept: true };
        case 'discard':
          // Strixhaven (13c): "discard any number, then draw that many": only surplus lands.
          if (d.anyNumber) return discardAnyNumber(engine, view, me, legal);
          return pickCardToLose(engine, view, me, legal);
        case 'bottomCards':
        case 'discardToHandSize':
          return pickCardToLose(engine, view, me, legal);
        case 'chooseTriggerTargets':
        case 'spellTargets': // Lorwyn Eclipsed (18b, white): Morningtide's Light
        case 'optionalEffect':
        case 'forage':
        case 'chooseObject':
        case 'payOrCounter':
        case 'castFree':
        case 'conspire': // Lorwyn Eclipsed (18a): which two creatures to tap (blight's creature is a chooseObject)
          return bestByEvaluation(engine, view, me, legal, 'stack');
        // Lorwyn Eclipsed (18a): Celestial Reunion, the creature type to behold (the one it has most of), then any creatures.
        case 'beholdType':
          return chooseBeholdType(engine, view, me, d, legal);
        // Lorwyn Eclipsed (18a): Dawnhand Dissident, the counters to remove (the evaluation likes losing -1/-1 counters).
        case 'payCounters':
          return bestByEvaluation(engine, view, me, legal, 'stack');
        case 'chooseOption': {
          // Strixhaven (13a): Learn takes a Lesson if there is one (the first option), else the best by evaluation.
          if (d.title === 'Learn' && d.options[0]!.label.startsWith('Reveal'))
            return { type: 'chooseOption', player: me, index: 0 };
          // Strixhaven (13c): a card name (thousands of options): the first is a card the opponent has shown.
          if (d.title === 'Choose a nonland card name')
            return { type: 'chooseOption', player: me, index: 0 };
          // Strixhaven (13c): Augusta's "tap any number of creatures": the bot taps none ("Done" is first).
          if (d.title?.startsWith('Augusta')) return { type: 'chooseOption', player: me, index: 0 };
          // Reality Fracture (17a fixes): every creature type is on offer.
          if (d.title === 'Choose a creature type') return chooseCreatureType(engine, view, me, d);
          // Reality Fracture (17a): Arc of Fortune.
          if (d.options[0]?.label.startsWith('Discard your hand'))
            return { type: 'chooseOption', player: me, index: chooseHandSwap(view, me) };
          return bestByEvaluation(engine, view, me, legal, 'stack');
        }
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
        case 'wardSacrifice':
          return chooseWardSacrifice(engine, view, legal);
        case 'punisher':
          return choosePunishment(engine, view, me, legal);
        case 'pickExiled':
          return choosePickExiled(engine, view, me, legal);
        case 'splitPiles':
          return chooseSplit(engine, view, me, legal);
        case 'choosePile':
          return choosePile(view, me);
        case 'declareAttackers':
          return nextAttackAction(engine, view, me, d.declared);
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

/**
 * Codie, Vociferous Codex: {4},{T} turns four lands into five mana of any
 * colours and makes the next spell find a free, cheaper instant or sorcery.
 * The evaluation can't see that payoff, so activate it by rule in our main
 * phase when an instant or sorcery in hand (mana value 2 or more, so the
 * trigger can find something cheaper) is affordable with the extra mana.
 */
function chooseCodie(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
): Action | undefined {
  if (view.turn.activePlayer !== me || view.stack.length > 0) return undefined;
  if (view.turn.step !== 'main1' && view.turn.step !== 'main2') return undefined;
  if (view.players[me].pool?.some((m) => m.untilEndOfTurn)) return undefined;
  const act = legal.find(
    (a) =>
      a.type === 'activateAbility' &&
      view.objects[a.source]?.defId === 'codie-vociferous-codex' &&
      a.abilityIndex === 1,
  );
  if (!act) return undefined;
  const untapped = view.battlefield.filter((id) => {
    const o = view.objects[id]!;
    return o.controller === me && !o.tapped && isLand(engine, view, id);
  }).length;
  const afford = untapped + 1;
  const worthIt = view.players[me].hand.some((id) => {
    const c = engine.db.get(view.objects[id]!.defId);
    if (!c || !c.types.some((t) => t === 'Instant' || t === 'Sorcery')) return false;
    const mv = manaValue(c.manaCost);
    return mv >= 2 && mv <= afford;
  });
  return worthIt ? act : undefined;
}

// ---------------------------------------------------------------------------
// The Jace token (Reality Fracture 17c)
// ---------------------------------------------------------------------------

const JACE_TOKEN = 'fra-jace-token';

/** Is `a` the activation of ability `index` of one of our Jace tokens? */
function isJaceTokenAbility(engine: Engine, view: GameState, a: Action, index: number): boolean {
  return (
    a.type === 'activateAbility' &&
    a.abilityIndex === index &&
    view.objects[a.source]?.defId === JACE_TOKEN &&
    !!engine.db.get(JACE_TOKEN)
  );
}

/** "−3: Draw a card" with almost nothing left in the library would only lose the game sooner. */
function isLastCardsDraw(engine: Engine, view: GameState, me: PlayerId, a: Action): boolean {
  return isJaceTokenAbility(engine, view, a, 1) && view.players[me].library.length <= 2;
}

/** Does a card in our hand, or a permanent of ours, have a way to put more loyalty counters on a Jace token? */
function canEmpowerSoon(engine: Engine, view: GameState, me: PlayerId): boolean {
  const mentions = (id: ObjectId) =>
    JSON.stringify(engine.db.get(view.objects[id]!.defId) ?? {}).includes('"empowerJace"');
  return (
    view.players[me].hand.some(mentions) ||
    view.battlefield.some((id) => view.objects[id]!.controller === me && mentions(id))
  );
}

/**
 * The Jace token's "−1: Surveil 1" costs a loyalty counter, which is worth about half a card, and the evaluation
 * can't see what surveil gains. So the bot surveils by rule, only with counters it won't use otherwise: one or two
 * left (not enough for the "−3: Draw a card"), nothing in sight to add more, in its own main phase.
 */
function chooseJaceSurveil(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
): Action | undefined {
  if (view.turn.activePlayer !== me || view.stack.length > 0) return undefined;
  if (view.turn.step !== 'main2') return undefined;
  const act = legal.find((a) => isJaceTokenAbility(engine, view, a, 0));
  if (!act || act.type !== 'activateAbility') return undefined;
  if ((view.objects[act.source]!.counters?.loyalty ?? 0) > 2) return undefined;
  if (canEmpowerSoon(engine, view, me)) return undefined;
  return act;
}

function choosePriorityAction(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
): Action {
  const lands = legal.filter((a) => a.type === 'playLand');
  if (lands.length > 0) return chooseLandToPlay(engine, view, me, lands);

  const pass = legal.find((a) => a.type === 'passPriority')!;
  const codie = chooseCodie(engine, view, me, legal);
  if (codie) return codie;
  const jace = chooseJaceSurveil(engine, view, me, legal);
  if (jace) return jace;
  // Teamwork taps our creatures: never before our own attack (the evaluation can't see the lost attack).
  const beforeOurAttack =
    view.turn.activePlayer === me &&
    (view.turn.step === 'main1' || view.turn.step === 'beginCombat');
  const candidates = legal.filter(
    (a) =>
      !isJaceTokenAbility(engine, view, a, 0) && // the surveil is a rule (chooseJaceSurveil), not a score
      !isLastCardsDraw(engine, view, me, a) &&
      ((a.type === 'castSpell' &&
        !(
          beforeOurAttack &&
          a.kicked &&
          engine.db.get(view.objects[a.card]!.defId)?.kicker?.teamwork !== undefined
        )) ||
        a.type === 'activateAbility'),
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

/** Where attackers go when not at the player: attacker id to the planeswalker it attacks (Reality Fracture 17c). */
export type WalkerAttacks = ReadonlyMap<ObjectId, ObjectId>;

function scoreAttack(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  attackers: ObjectId[],
  at?: WalkerAttacks,
): number {
  const sim = cloneState(view);
  sim.decision = {
    kind: 'declareAttackers',
    player: me,
    declared: attackers.map((id) => ({
      id,
      defender: other(me),
      ...(at?.has(id) ? { planeswalker: at.get(id)! } : {}),
    })),
  };
  engine.applyActionInPlace(sim, { type: 'confirmAttackers', player: me }, { trusted: true });
  settle(engine, sim, 'combat');
  return evaluate(sim, engine.db, me) - (sim.winner ? 0 : crackbackPenalty(engine, sim, me));
}

/** The planeswalkers `me`'s opponent controls. */
function opposingWalkers(engine: Engine, view: GameState, me: PlayerId): ObjectId[] {
  return view.battlefield.filter(
    (id) =>
      view.objects[id]!.controller === other(me) &&
      !!engine.db.get(view.objects[id]!.defId)?.types.includes('Planeswalker'),
  );
}

/**
 * Reality Fracture (17c): sends attackers at the opponent's planeswalkers when that scores better than hitting
 * the player (a walker's loyalty is worth cards, see evaluate). Starts from the attackers already planned and
 * also considers adding ones that stayed home, one change at a time while something improves.
 */
export function planWalkerAttacks(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  attackers: ObjectId[],
  declared: ObjectId[] = [],
): Map<ObjectId, ObjectId> {
  const walkers = opposingWalkers(engine, view, me);
  const at = new Map<ObjectId, ObjectId>();
  if (walkers.length === 0) return at;
  const legal = engine.getLegalActions(view, me);
  // Attackers that may go at a walker: any that can attack at all.
  const canAtWalker = new Set(
    legal.flatMap((a) => (a.type === 'addAttacker' && a.planeswalker ? [a.attacker] : [])),
  );
  // Ones already declared at a walker have no such action for that walker, but are still attackers at it.
  if (view.decision.kind === 'declareAttackers')
    for (const x of view.decision.declared) if (x.planeswalker) canAtWalker.add(x.id);
  const available = [...new Set([...declared, ...attackers, ...canAtWalker])].filter((id) =>
    canAtWalker.has(id),
  );
  let chosen = [...attackers];
  let score = scoreAttack(engine, view, me, chosen, at);
  for (let round = 0; round < 8; round++) {
    let best: { id: ObjectId; walker: ObjectId } | null = null;
    let bestScore = score + MARGIN;
    const tried = new Set<string>();
    for (const id of available) {
      if (at.has(id)) continue;
      for (const w of walkers) {
        // Interchangeable attackers at the same walker give the same answer.
        const c = getCharacteristics(view, engine.db, id);
        const k = `${view.objects[id]!.defId}|${c.power}|${c.toughness}|${[...c.keywords].sort().join()}|${chosen.includes(id)}|${w}`;
        if (tried.has(k)) continue;
        tried.add(k);
        const next = new Map(at).set(id, w);
        const v = scoreAttack(
          engine,
          view,
          me,
          chosen.includes(id) ? chosen : [...chosen, id],
          next,
        );
        if (v > bestScore) {
          bestScore = v;
          best = { id, walker: w };
        }
      }
    }
    if (!best) break;
    at.set(best.id, best.walker);
    if (!chosen.includes(best.id)) chosen = [...chosen, best.id];
    score = bestScore;
  }
  return at;
}

/** The attackers to declare and the planeswalkers some of them attack (the rest attack the player). */
export function planAttackTargets(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  declared: ObjectId[],
): { attackers: ObjectId[]; at: Map<ObjectId, ObjectId> } {
  const planned = planAttacks(engine, view, me, declared);
  const at = planWalkerAttacks(engine, view, me, planned, declared);
  return { attackers: [...planned, ...[...at.keys()].filter((id) => !planned.includes(id))], at };
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
const attackPlans = new WeakMap<object, { attackers: ObjectId[]; at: Map<ObjectId, ObjectId> }>();
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
  declared: readonly { id: ObjectId; planeswalker?: ObjectId }[],
): Action {
  const plan = memo(attackPlans, view.decision, () =>
    planAttackTargets(
      engine,
      view,
      me,
      declared.map((x) => x.id),
    ),
  );
  // Goaded attackers can't be taken back; Propaganda may cap how many attack.
  const legal = engine.getLegalActions(view, me);
  const removable = legal.flatMap((a) => (a.type === 'removeAttacker' ? [a.attacker] : []));
  const addable = legal.flatMap((a) => (a.type === 'addAttacker' ? [a.attacker] : []));
  const wrong = declared.find((x) => !plan.attackers.includes(x.id) && removable.includes(x.id));
  if (wrong) return { type: 'removeAttacker', player: me, attacker: wrong.id };
  const have = (id: ObjectId) => declared.some((x) => x.id === id);
  const next = plan.attackers.find((id) => !have(id) && addable.includes(id));
  if (next) return attackAction(legal, me, next, plan.at.get(next));
  // Reality Fracture (17c): an attacker declared at the player that should go at a planeswalker.
  const redirect = declared.find((x) => plan.at.has(x.id) && x.planeswalker !== plan.at.get(x.id));
  if (redirect) {
    const act = attackAction(legal, me, redirect.id, plan.at.get(redirect.id));
    if (act.type === 'addAttacker' && act.planeswalker) return act;
  }
  return { type: 'confirmAttackers', player: me };
}

/** Declares `id` as an attacker, at `walker` if it can (else the player). */
function attackAction(legal: Action[], me: PlayerId, id: ObjectId, walker?: ObjectId): Action {
  const at = walker
    ? legal.find((a) => a.type === 'addAttacker' && a.attacker === id && a.planeswalker === walker)
    : undefined;
  return at ?? { type: 'addAttacker', player: me, attacker: id, defender: other(me) };
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
    // Relentless X-ATM092 needs three blockers: the bot doesn't try.
    const top = a.minBlockers > 2 ? [] : free.slice(0, 4);
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

/** Strixhaven (13c): swap away a land only when we hold plenty; otherwise stop. */
function discardAnyNumber(engine: Engine, view: GameState, me: PlayerId, legal: Action[]): Action {
  const landsInPlay = view.battlefield.filter(
    (id) => view.objects[id]!.controller === me && isLand(engine, view, id),
  ).length;
  const handLands = view.players[me].hand.filter((id) => isLand(engine, view, id));
  if (handLands.length > 0 && landsInPlay + handLands.length > 7) {
    const pick = legal.find((a) => a.type === 'discard' && a.card === handLands[0]);
    if (pick) return pick;
  }
  return legal.find((a) => a.type === 'chooseEffect') ?? legal[0]!;
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
