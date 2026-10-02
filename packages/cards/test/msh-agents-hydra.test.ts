import { describe, expect, it } from 'vitest';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10b: Lone Agents (W/B) and HYDRA Rising (B/R).

describe('attacks alone', () => {
  it('Black Widow gives a lone attacker first strike and menace', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['black-widow-double-agent', 'agent-of-atlas'] },
    });
    const atlas = g.id('p1', 'agent-of-atlas');
    g.passBoth().attack(atlas);
    settle(g);
    expect(g.state.effects.some((e) => e.affected.id === atlas)).toBe(true);
  });

  it('Luke Cage gets +2/+0 attacking alone', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['luke-cage-power-man'] } });
    const luke = g.id('p1', 'luke-cage-power-man');
    g.passBoth().attack(luke);
    settle(g);
    expect(pt(g, luke)).toEqual([4, 5]);
  });
});

describe('Villains', () => {
  it('Madame Hydra makes a Villain token when you cast a Villain spell', () => {
    const g = game({
      p1: { hand: ['red-room-recruit'], battlefield: ['madame-hydra', ...n('swamp', 2)] },
    });
    cast(g, 'red-room-recruit');
    settle(g);
    expect(all(g, 'villain-token')).toHaveLength(1);
  });

  it('Bullseye discards a nonland card to deal 2 damage', () => {
    const g = game({
      p1: { hand: ['bullseye-death-dealer', 'dark-deed'], battlefield: n('swamp', 3) },
    });
    cast(g, 'bullseye-death-dealer');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          (a.targets[0] as { player?: string } | undefined)?.player === 'p2',
      ),
    );
    if (g.decision.kind === 'discard')
      g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'dark-deed', 'hand') });
    settle(g);
    expect(g.life('p2')).toBe(18);
  });
});
