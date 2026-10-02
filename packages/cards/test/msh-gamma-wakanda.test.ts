import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10b: Gamma Smash (R/G) and Heroes of Wakanda (G/W).

describe('enrage', () => {
  it('Red Hulk grows when dealt damage and hits another target', () => {
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: [...n('mountain', 2), 'red-hulk'] },
    });
    const hulk = g.id('p1', 'red-hulk');
    cast(g, 'lightning-strike', [g.ref(hulk)]);
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          (a.targets[0] as { player?: string } | undefined)?.player === 'p2',
      ),
    );
    expect(pt(g, hulk)).toEqual([7, 8]);
    expect(g.life('p2')).toBe(19);
  });
});

describe('power-up', () => {
  it('Hulk, Gamma Goliath makes other power-up abilities cost {3} less', () => {
    const g = game({
      p1: { battlefield: ['hulk-gamma-goliath', 'serpent-specialist', 'forest'] },
    });
    const s = g.id('p1', 'serpent-specialist');
    g.obj(s).zoneTurn = 0;
    // {3}{G} less {3} is {G}.
    g.do({ type: 'activateAbility', player: 'p1', source: s, abilityIndex: 0, targets: [] });
    settle(g);
    expect(pt(g, s)).toEqual([3, 3]);
  });
});

describe('counters', () => {
  it('Knight of Wundagore grows when another creature gets a counter, once a turn', () => {
    const g = game({
      p1: {
        hand: ['go-nuts', 'go-nuts'],
        battlefield: ['forest', 'forest', 'knight-of-wundagore', 'agent-of-atlas'],
      },
    });
    const atlas = g.id('p1', 'agent-of-atlas');
    const knight = g.id('p1', 'knight-of-wundagore');
    settle(cast(g, 'go-nuts', [g.ref(atlas)], { mode: 0 }));
    settle(cast(g, 'go-nuts', [g.ref(atlas)], { mode: 0 }));
    expect(g.obj(knight).plusOneCounters).toBe(1);
  });

  it('Wakandan Royal Guard puts two counters on another Hero, one otherwise', () => {
    const g = game({
      p1: { hand: ['wakandan-royal-guard'], battlefield: [...n('forest', 5), 'agent-of-atlas'] },
    });
    const atlas = g.id('p1', 'agent-of-atlas');
    cast(g, 'wakandan-royal-guard');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          'object' in (a.targets[0] ?? {}) &&
          (a.targets[0] as { object: { id: string } }).object.id === atlas,
      ),
    );
    expect(g.obj(atlas).plusOneCounters).toBe(2);
  });
});

describe('attacks alone and investigate', () => {
  it('Agent 13 investigates when a creature attacks alone, and a Clue draws', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['agent-13-sharon-carter', 'agent-of-atlas', ...n('plains', 2)] },
    });
    g.passBoth().attack(g.id('p1', 'agent-of-atlas'));
    settle(g);
    const clues = all(g, 'clue-token');
    expect(clues).toHaveLength(1);
    g.passUntilStep('main2');
    const before = handSize(g, 'p1');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: clues[0]!,
      abilityIndex: 0,
      targets: [],
    });
    settle(g);
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('two attackers are not alone', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['agent-13-sharon-carter', 'agent-of-atlas', 'brave-brawler'] },
    });
    g.passBoth().attack(g.id('p1', 'agent-of-atlas'), g.id('p1', 'brave-brawler'));
    settle(g);
    expect(all(g, 'clue-token')).toHaveLength(0);
  });
});
