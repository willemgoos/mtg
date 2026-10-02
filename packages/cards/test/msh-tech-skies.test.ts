import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10b: Stark Tech (U/R) and Sky Patrol (W/U).

describe('artifacts', () => {
  it('Iron Man gets +1/+0 per other artifact and draws if an artifact entered this turn', () => {
    const g = game({
      step: 'main1',
      p1: {
        hand: ['ultron-drone'],
        battlefield: ['iron-man-master-of-machines', 'aerial-doombot', ...n('island', 3)],
      },
    });
    const iron = g.id('p1', 'iron-man-master-of-machines');
    expect(pt(g, iron)).toEqual([2, 4]);
    settle(cast(g, 'ultron-drone'));
    expect(pt(g, iron)).toEqual([3, 4]);
    const before = handSize(g, 'p1');
    g.passBoth().passBoth().attack(iron);
    settle(g);
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('Ultron Drone powers up into a Robot Villain token', () => {
    const g = game({ p1: { battlefield: ['ultron-drone', ...n('island', 6)] } });
    const d = g.id('p1', 'ultron-drone');
    g.obj(d).zoneTurn = 0;
    g.do({ type: 'activateAbility', player: 'p1', source: d, abilityIndex: 0, targets: [] });
    settle(g);
    expect(pt(g, d)).toEqual([4, 5]);
    expect(all(g, 'robot-villain-token')).toHaveLength(1);
  });

  it('Super Suit attaches as it enters and untaps the creature', () => {
    const g = game({
      p1: {
        hand: ['super-suit'],
        battlefield: [...n('island', 2), { card: 'agent-of-atlas', tapped: true }],
      },
    });
    const atlas = g.id('p1', 'agent-of-atlas');
    cast(g, 'super-suit');
    settle(g);
    expect(g.obj(atlas).tapped).toBe(false);
    expect(pt(g, atlas)).toEqual([4, 5]); // prowess too
  });
});

describe('fliers', () => {
  it('Falcon brings Redwing', () => {
    const g = game({ p1: { hand: ['falcon-winged-wonder'], battlefield: n('island', 5) } });
    settle(cast(g, 'falcon-winged-wonder'));
    expect(all(g, 'redwing-token')).toHaveLength(1);
  });

  it('Raft Security Officer taps a small creature for {1}', () => {
    const g = game({
      p1: { battlefield: ['raft-security-officer', 'plains'] },
      p2: { battlefield: ['agent-of-atlas'] },
    });
    const atlas = g.id('p2', 'agent-of-atlas');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'raft-security-officer'),
      abilityIndex: 0,
      targets: [g.ref(atlas)],
    });
    settle(g);
    expect(g.obj(atlas).tapped).toBe(true);
  });
});
