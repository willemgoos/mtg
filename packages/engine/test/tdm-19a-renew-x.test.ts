import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import type { Action } from '../src/types.ts';
import { DB, Game, scenario } from './tdm-fixtures.ts';

// Renew — {X}{B}{B}, exile this card from your graveyard: put a decayed counter on each of X target creatures.

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};
const setup = (swamps: number) =>
  new Game(
    scenario({
      p1: {
        graveyard: ['t-rakshasa'],
        battlefield: [...Array<string>(swamps).fill('swamp'), 'ogre', 'bear'],
      },
      p2: { battlefield: ['wall'] },
    }),
  );
type Activate = Extract<Action, { type: 'activateAbility' }>;
const activations = (g: Game) =>
  g.legal('p1').filter((a): a is Activate => a.type === 'activateAbility');

describe('"X target creatures" on an activated ability (Rot-Curse Rakshasa)', () => {
  it('offers each X up to what is affordable and what has targets, and no X of 0', () => {
    // Four Swamps: X up to 2 ({X}{B}{B}); three creatures could be targeted.
    const g = setup(4);
    const xs = activations(g).map((a) => a.x);
    expect(xs.sort()).toEqual([1, 2]);
    // The targets are not part of the activation.
    expect(activations(g).every((a) => a.targets.length === 0)).toBe(true);
  });

  it('X is limited by the number of creatures there are to target', () => {
    const g = setup(9);
    expect(Math.max(...activations(g).map((a) => a.x ?? 0))).toBe(3);
  });

  it('the X targets are chosen one at a time once the ability is on the stack, then a decayed counter on each', () => {
    const g = setup(4);
    const rak = g.id('p1', 't-rakshasa', 'graveyard');
    g.do(activations(g).find((a) => a.x === 2)!);
    expect(g.zoneOf(rak)).toBe('exile');
    expect(g.decision.kind).toBe('abilityTargets');
    const ogre = g.id('p1', 'ogre');
    const wall = g.id('p2', 'wall');
    const pick = (id: string) =>
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === id),
        )!;
    g.do(pick(ogre));
    // One more is needed, a different one.
    expect(g.decision.kind).toBe('abilityTargets');
    expect(
      g
        .legal('p1')
        .every(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 2 &&
            JSON.stringify(a.targets[0]) !== JSON.stringify(a.targets[1]),
        ),
    ).toBe(true);
    g.do(pick(wall));
    expect(g.decision.kind).toBe('priority');
    settle(g);
    expect(g.obj(ogre).counters?.decayed).toBe(1);
    expect(g.obj(wall).counters?.decayed).toBe(1);
    expect(g.obj(g.id('p1', 'bear')).counters?.decayed).toBeUndefined();
    expect(getCharacteristics(g.state, DB, ogre).keywords.has('decayed')).toBe(true);
    expect(getCharacteristics(g.state, DB, ogre).cantBlock).toBe(true);
  });

  it('a creature with a decayed counter attacks and is sacrificed at end of combat', () => {
    const g = setup(4);
    g.do(activations(g).find((a) => a.x === 1)!);
    g.do(
      g
        .legal('p1')
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.some((t) => 'object' in t && t.object.id === g.id('p1', 'ogre')),
        )!,
    );
    settle(g);
    g.passUntilStep('beginCombat');
    g.passBoth();
    g.attack(g.id('p1', 'ogre'));
    g.passUntilStep('endCombat');
    settle(g);
    expect(g.zoneOf(g.id('p1', 'ogre', 'graveyard'))).toBe('graveyard');
    expect(g.life('p2')).toBe(17);
  });
});
