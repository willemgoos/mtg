import type { Decision, GameObject, GameState, ObjectId } from './types.ts';

/**
 * Deep copy of everything the engine mutates. Hand-written because it is on
 * the hot path: several times faster than structuredClone or Immer drafts.
 * Immutable leaves (targets, effects, pending triggers) are shared.
 */
export function cloneState(s: GameState): GameState {
  const objects: Record<ObjectId, GameObject> = {};
  for (const id in s.objects) objects[id] = { ...s.objects[id]! };
  const player = (p: GameState['players']['p1']) => ({
    ...p,
    library: p.library.slice(),
    hand: p.hand.slice(),
    graveyard: p.graveyard.slice(),
    exile: p.exile.slice(),
  });
  return {
    ...s,
    rng: { s: [s.rng.s[0], s.rng.s[1], s.rng.s[2], s.rng.s[3]] },
    players: { p1: player(s.players.p1), p2: player(s.players.p2) },
    objects,
    battlefield: s.battlefield.slice(),
    stack: s.stack.map((x) => ({ ...x })),
    turn: { ...s.turn, passed: s.turn.passed.slice() },
    combat: s.combat && {
      attackers: s.combat.attackers.map((a) => ({ ...a, blockers: a.blockers.slice() })),
      dealtFirstStrikeDamage: s.combat.dealtFirstStrikeDamage.slice(),
    },
    effects: s.effects.slice(),
    pendingTriggers: s.pendingTriggers.slice(),
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
