import type { Decision, GameObject, GameState, ObjectId } from './types.ts';

/**
 * Deep copy of everything the engine mutates. Hand-written because it is on
 * the hot path: several times faster than structuredClone or Immer drafts.
 * Immutable leaves (targets, effects, pending triggers) are shared.
 */
export function cloneState(s: GameState): GameState {
  const objects: Record<ObjectId, GameObject> = {};
  for (const id in s.objects) {
    const o = s.objects[id]!;
    const c = { ...o };
    if (o.usedAbilities) c.usedAbilities = o.usedAbilities.slice();
    if (o.exiledUntilLeaves) c.exiledUntilLeaves = o.exiledUntilLeaves.slice();
    if (o.addedSubtypes) c.addedSubtypes = o.addedSubtypes.slice();
    if (o.counters) c.counters = { ...o.counters };
    if (o.onceTurns) c.onceTurns = { ...o.onceTurns };
    if (o.exiledWith) c.exiledWith = o.exiledWith.slice();
    if (o.damagedBy) c.damagedBy = o.damagedBy.slice();
    // Secrets of Strixhaven (14a): converge.
    if (o.manaColors) c.manaColors = o.manaColors.slice();
    objects[id] = c;
  }
  const player = (p: GameState['players']['p1']) => ({
    ...p,
    library: p.library.slice(),
    hand: p.hand.slice(),
    graveyard: p.graveyard.slice(),
    exile: p.exile.slice(),
    command: p.command.slice(),
    ...(p.pool ? { pool: p.pool.slice() } : {}),
    // Strixhaven (13a): Learn takes cards out of the sideboard, so a copy needs its own.
    ...(p.sideboard ? { sideboard: p.sideboard.slice() } : {}),
    ...(p.castBans ? { castBans: p.castBans.slice() } : {}),
    // Secrets of Strixhaven (14a): paradigm.
    ...(p.paradigms ? { paradigms: p.paradigms.slice() } : {}),
  });
  const phased = s.phasedOut ? { phasedOut: s.phasedOut.slice() } : {};
  return {
    ...s,
    rng: { s: [s.rng.s[0], s.rng.s[1], s.rng.s[2], s.rng.s[3]] },
    players: { p1: player(s.players.p1), p2: player(s.players.p2) },
    objects,
    battlefield: s.battlefield.slice(),
    ...phased,
    stack: s.stack.map((x) => ({ ...x })),
    turn: {
      ...s.turn,
      passed: s.turn.passed.slice(),
      attackers: s.turn.attackers.slice(),
      lifeGains: { ...s.turn.lifeGains },
      ...(s.turn.lifeGained ? { lifeGained: { ...s.turn.lifeGained } } : {}),
      cardsDrawn: { ...s.turn.cardsDrawn },
      ...(s.turn.manaSpent ? { manaSpent: { ...s.turn.manaSpent } } : {}),
      ...(s.turn.lifeLost ? { lifeLost: { ...s.turn.lifeLost } } : {}),
      ...(s.turn.spellsCast ? { spellsCast: { ...s.turn.spellsCast } } : {}),
      ...(s.turn.creaturesExiled ? { creaturesExiled: { ...s.turn.creaturesExiled } } : {}),
      ...(s.turn.leftGraveyard ? { leftGraveyard: { ...s.turn.leftGraveyard } } : {}),
      ...(s.turn.creaturesLost ? { creaturesLost: { ...s.turn.creaturesLost } } : {}),
      ...(s.turn.creaturesLost ? { creaturesLost: { ...s.turn.creaturesLost } } : {}),
      ...(s.turn.foodsSacrificed ? { foodsSacrificed: { ...s.turn.foodsSacrificed } } : {}),
      ...(s.turn.hexproofPlayers ? { hexproofPlayers: s.turn.hexproofPlayers.slice() } : {}),
      ...(s.turn.osteomancer ? { osteomancer: s.turn.osteomancer.slice() } : {}),
      ...(s.turn.castDefs
        ? { castDefs: { p1: s.turn.castDefs.p1.slice(), p2: s.turn.castDefs.p2.slice() } }
        : {}),
      ...(s.turn.instantsSorceriesCast
        ? { instantsSorceriesCast: { ...s.turn.instantsSorceriesCast } }
        : {}),
    },
    combat: s.combat && {
      attackers: s.combat.attackers.map((a) => ({ ...a, blockers: a.blockers.slice() })),
      dealtFirstStrikeDamage: s.combat.dealtFirstStrikeDamage.slice(),
    },
    effects: s.effects.slice(),
    pendingTriggers: s.pendingTriggers.slice(),
    ...(s.delayed ? { delayed: s.delayed.slice() } : {}),
    ...(s.emblems ? { emblems: s.emblems.slice() } : {}),
    decision: cloneDecision(s.decision),
  };
}

function cloneDecision(d: Decision): Decision {
  switch (d.kind) {
    case 'declareAttackers':
      return { ...d, declared: d.declared.map((x) => ({ ...x })) };
    case 'declareBlockers':
      return { ...d, declared: d.declared.map((x) => ({ ...x })) };
    default:
      return { ...d };
  }
}
