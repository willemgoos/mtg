import { cardDb } from '@mtg/cards';
import type { GameState, ObjectId } from '@mtg/engine';
import { buildScenario } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { incomingDamage, isLethal } from '../src/game/lethal.ts';

/** p2 attacks p1 with a 4/4 trampler and a 2/2; p1 has a 2/2 to block with. */
function combat(life: number) {
  const view = buildScenario(cardDb, {
    active: 'p2',
    step: 'declareBlockers',
    p1: { life, battlefield: ['bear-cub'] },
    p2: { battlefield: ['gnarlback-rhino', 'bear-cub'] },
  });
  const find = (defId: string, owner: string): ObjectId =>
    Object.values(view.objects).find((o) => o.defId === defId && o.controller === owner)!.id;
  const rhino = find('gnarlback-rhino', 'p2');
  const bear = find('bear-cub', 'p2');
  const wall = find('bear-cub', 'p1');
  const attackers = [rhino, bear].map((id) => ({
    id,
    defender: 'p1',
    blocked: false,
    blockers: [],
  }));
  const withCombat = { ...view, combat: { attackers, dealtFirstStrikeDamage: [] } } as GameState;
  return { view: withCombat, rhino, bear, wall };
}

describe('lethal warning', () => {
  it('adds up unblocked attackers', () => {
    const { view } = combat(6);
    expect(incomingDamage(view, 'p1')).toBe(6);
    expect(isLethal(view, 'p1')).toBe(true);
    expect(isLethal(combat(7).view, 'p1')).toBe(false);
  });

  it('reacts to blocks being chosen, letting trample through', () => {
    const { view, rhino, bear, wall } = combat(4);
    expect(incomingDamage(view, 'p1', [{ blocker: wall, attacker: bear }])).toBe(4);
    // Blocking the rhino with a 2/2 still lets 2 trample over, plus the bear's 2.
    expect(incomingDamage(view, 'p1', [{ blocker: wall, attacker: rhino }])).toBe(4);
  });

  it('stays quiet outside the attack and block steps', () => {
    const { view } = combat(1);
    const after = { ...view, turn: { ...view.turn, step: 'combatDamage' } } as GameState;
    expect(isLethal(after, 'p1')).toBe(false);
  });
});
