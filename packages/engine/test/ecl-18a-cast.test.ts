import { describe, expect, it } from 'vitest';
import type { Action } from '../src/types.ts';
import { casts, counters, Game, getPower, scenario } from './ecl-fixtures.ts';

describe('wither', () => {
  it('combat damage from a wither creature is dealt to creatures as -1/-1 counters', () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['witherer'] },
        p2: { battlefield: ['wall'] },
      }),
    );
    g.passBoth();
    const wall = g.id('p2', 'wall');
    const witherer = g.id('p1', 'witherer');
    g.attack(witherer).pass().pass();
    g.block([wall, witherer]);
    g.passUntilStep('endCombat');
    // The 0/4 wall took 3 damage as three -1/-1 counters: no damage marked, and it is a -3/1.
    expect(g.zoneOf(wall)).toBe('battlefield');
    expect(g.obj(wall).damage).toBe(0);
    expect(counters(g, wall)).toBe(3);
    expect(getPower(g, wall)).toBe(-3);
  });

  it('wither damage to a player is ordinary damage', () => {
    const g = new Game(
      scenario({ step: 'beginCombat', p1: { battlefield: ['witherer'] }, p2: {} }),
    );
    g.passBoth();
    g.attack(g.id('p1', 'witherer'));
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(17);
  });

  it('a wither creature kills by counters: 3 counters on a 3/3 leave a 0/0 that dies', () => {
    const g = new Game(
      scenario({
        step: 'beginCombat',
        p1: { battlefield: ['witherer'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    g.passBoth();
    const ogre = g.id('p2', 'ogre');
    const witherer = g.id('p1', 'witherer');
    g.attack(witherer).pass().pass();
    g.block([ogre, witherer]);
    g.passUntilStep('endCombat');
    expect(g.zoneOf(ogre)).toBe('graveyard');
    expect(g.zoneOf(witherer)).toBe('graveyard');
  });
});

describe('wither on spells (Spinerock Tyrant)', () => {
  it('the spell and its copy both deal damage as -1/-1 counters', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['wither-copier', 'mountain'], hand: ['shock'] },
        p2: { battlefield: ['trampler'] },
      }),
    );
    const ogre = g.id('p2', 'trampler');
    g.do(
      casts(g, 'p1', g.id('p1', 'shock', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === ogre),
      )!,
    );
    // The trigger: "you may copy it".
    g.passBoth();
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    // New targets for the copy: keep them (the first option).
    if (g.decision.kind === 'chooseOption') g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    for (let i = 0; i < 6 && g.state.stack.length > 0; i++) g.passBoth();
    // Two shocks of 2 as counters: the 5/5 is a 1/1 with four counters and no damage marked.
    expect(g.zoneOf(ogre)).toBe('battlefield');
    expect(g.obj(ogre).counters?.['-1/-1']).toBe(4);
    expect(g.obj(ogre).damage).toBe(0);
  });
});

describe('conspire', () => {
  const pairCasts = (g: Game, id: string) =>
    casts(g, 'p1', id).filter((a): a is Extract<Action, { type: 'castSpell' }> => !!a.conspire);

  it('a conspire spell can be cast with conspire when two untapped creatures share a colour with it', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['conspiring-zap'],
          battlefield: ['mountain', 'red-guy', 'thin', 'green-guy'],
        },
      }),
    );
    const zap = g.id('p1', 'conspiring-zap', 'hand');
    expect(pairCasts(g, zap).length).toBeGreaterThan(0);
    const toPlayer = pairCasts(g, zap).find((a) =>
      a.targets.some((t) => 'player' in t && t.player === 'p2'),
    )!;
    g.do(toPlayer);
    // The creatures to tap are chosen one at a time (the green one doesn't share a colour).
    expect(g.decision.kind).toBe('conspire');
    const red = g.id('p1', 'red-guy');
    const thin = g.id('p1', 'thin');
    expect(
      g
        .legal('p1')
        .map((a) => a.type === 'chooseCard' && a.card)
        .sort(),
    ).toEqual([red, thin].sort());
    g.do({ type: 'chooseCard', player: 'p1', card: red });
    expect(g.legal('p1')).toHaveLength(1);
    g.do({ type: 'chooseCard', player: 'p1', card: thin });
    expect(g.obj(red).tapped).toBe(true);
    expect(g.obj(thin).tapped).toBe(true);
    // The trigger: copy it. It may get new targets.
    g.passBoth();
    if (g.decision.kind === 'chooseOption') g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    for (let i = 0; i < 6 && g.state.stack.length > 0; i++) g.passBoth();
    expect(g.life('p2')).toBe(18);
  });

  it("is not offered without two creatures of the spell's colour, or if they are needed for mana", () => {
    const one = new Game(
      scenario({
        p1: { hand: ['conspiring-zap'], battlefield: ['mountain', 'red-guy', 'green-guy'] },
      }),
    );
    expect(pairCasts(one, one.id('p1', 'conspiring-zap', 'hand'))).toHaveLength(0);
    // No mountain: the red creatures would have to tap for mana. (Fixture creatures make no mana.)
    const plain = new Game(
      scenario({ p1: { hand: ['zap'], battlefield: ['mountain', 'red-guy', 'thin'] } }),
    );
    expect(pairCasts(plain, plain.id('p1', 'zap', 'hand'))).toHaveLength(0);
  });

  it('Raiding Schemes gives noncreature spells conspire, but not creature spells', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['zap', 'red-guy'],
          battlefield: ['raiding-schemes', 'mountain', 'mountain', 'big-red', 'thin'],
        },
      }),
    );
    expect(pairCasts(g, g.id('p1', 'zap', 'hand')).length).toBeGreaterThan(0);
    expect(pairCasts(g, g.id('p1', 'red-guy', 'hand'))).toHaveLength(0);
  });

  it('the copy is a copy: a spell cast with conspire is on the stack twice', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['conspiring-zap'], battlefield: ['mountain', 'red-guy', 'thin'] },
      }),
    );
    const zap = g.id('p1', 'conspiring-zap', 'hand');
    g.do(pairCasts(g, zap).find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'red-guy') });
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'thin') });
    g.pass();
    g.pass();
    // The conspire trigger resolved: a copy sits above the original.
    if (g.decision.kind === 'chooseOption') g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.state.stack.filter((i) => i.kind === 'spell')).toHaveLength(2);
    expect(g.state.stack.some((i) => i.kind === 'spell' && i.copy)).toBe(true);
  });
});
