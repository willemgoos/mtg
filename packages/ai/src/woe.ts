import {
  type Action,
  type CardDb,
  cloneState,
  type Engine,
  type GameState,
  getAbilities,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';

// Wilds of Eldraine (23a): what the bots need beyond the evaluation for the set's mechanics. Bargain, Roles and the choice of what
// to sacrifice are scored like any other cast (the evaluation sees the sacrificed permanent and the bigger effect).

/** Does `p` control a permanent with a celebration ability (a static or a trigger that checks it)? */
export function hasCelebrationPayoff(s: GameState, db: CardDb, p: PlayerId): boolean {
  return s.battlefield.some((id) => {
    const o = s.objects[id]!;
    if (o.controller !== p) return false;
    return !!db
      .get(o.defId)
      ?.abilities.some(
        (a) =>
          (a.kind === 'triggered' && a.condition?.kind === 'celebration') ||
          (a.kind === 'static' &&
            a.effect.kind === 'while' &&
            a.effect.condition.kind === 'celebration'),
      );
  });
}

/** Celebration is on for `p`: two or more nonland permanents entered under their control this turn. */
export const celebrating = (s: GameState, p: PlayerId): boolean =>
  (s.turn.nonlandEntered?.[p] ?? 0) >= 2;

/**
 * Before combat on `me`'s turn, the "at the beginning of combat, if two or more nonland permanents entered ..." payoffs that are
 * now switched on (Pests of Honor, Belligerent of the Ball): the evaluation can't see the trigger before it happens.
 */
export function celebrationCombatPayoffs(s: GameState, db: CardDb, me: PlayerId): number {
  if (s.turn.activePlayer !== me || !['upkeep', 'draw', 'main1'].includes(s.turn.step)) return 0;
  if (!celebrating(s, me)) return 0;
  return s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    return (
      o.controller === me &&
      !!db
        .get(o.defId)
        ?.abilities.some(
          (a) =>
            a.kind === 'triggered' &&
            a.trigger.on === 'beginningOfCombat' &&
            a.condition?.kind === 'celebration',
        )
    );
  }).length;
}

/** Is this activation "this land becomes a creature until end of turn" (a Restless land)? */
function animatesSelf(
  engine: Engine,
  view: GameState,
  a: Action,
): a is Extract<Action, { type: 'activateAbility' }> {
  if (a.type !== 'activateAbility') return false;
  const ab = getAbilities(view, engine.db, a.source)[a.abilityIndex];
  return (
    ab?.kind === 'activated' &&
    ab.effects.some((e) => e.kind === 'animate' && e.what === 'self' && !e.permanent)
  );
}

/**
 * The Restless lands: in our first main phase, with nothing better to do, animate a land if it would then be one of our attackers
 * (the attack plan made from the declare attackers step after the activation). Returns the activation, or null.
 */
export function chooseAnimateToAttack(
  engine: Engine,
  view: GameState,
  me: PlayerId,
  legal: Action[],
  planAttacks: (engine: Engine, view: GameState, me: PlayerId, declared: ObjectId[]) => ObjectId[],
): Action | null {
  if (view.turn.activePlayer !== me || view.turn.step !== 'main1' || view.stack.length > 0)
    return null;
  const seen = new Set<ObjectId>();
  for (const a of legal) {
    if (!animatesSelf(engine, view, a) || seen.has(a.source)) continue;
    seen.add(a.source);
    const land = view.objects[a.source];
    if (!land || land.tapped || land.summoningSick) continue;
    const sim = cloneState(view);
    try {
      engine.applyActionInPlace(sim, a, { trusted: true });
      // Resolve it and go to the declare attackers step (both players pass).
      for (let i = 0; i < 12 && sim.decision.kind !== 'declareAttackers'; i++) {
        const d = sim.decision;
        if (d.kind !== 'priority' || sim.turn.step === 'main2' || sim.turn.step === 'end') break;
        engine.applyActionInPlace(
          sim,
          { type: 'passPriority', player: d.player },
          { trusted: true },
        );
      }
    } catch {
      continue;
    }
    if (sim.decision.kind !== 'declareAttackers' || sim.objects[a.source]?.tapped) continue;
    if (planAttacks(engine, sim, me, []).includes(a.source)) return a;
  }
  return null;
}
