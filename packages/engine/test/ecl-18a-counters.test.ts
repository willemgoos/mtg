import { describe, expect, it } from 'vitest';
import { casts, counters, Game, getPower, scenario } from './ecl-fixtures.ts';

const abilities = (g: Game, source: string) =>
  g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === source);

describe('enters with -1/-1 counters, and removing counters', () => {
  it('"enters with two -1/-1 counters" and "remove a counter" as a cost', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['burdened'], battlefield: ['mountain', 'mountain', 'mountain', 'mountain'] },
      }),
    );
    g.do(casts(g, 'p1', g.id('p1', 'burdened', 'hand'))[0]!);
    g.passBoth();
    const b = g.id('p1', 'burdened');
    expect(counters(g, b)).toBe(2);
    expect(getPower(g, b)).toBe(2);
    // One kind of counter: one way to pay each cost.
    const options = abilities(g, b);
    expect(options).toHaveLength(2);
    const one = options.find((a) => a.type === 'activateAbility' && a.abilityIndex === 0)!;
    expect(one.type === 'activateAbility' && one.removeKinds).toEqual(['-1/-1']);
    g.do(one);
    expect(counters(g, b)).toBe(1);
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('the cost needs enough counters', () => {
    const g = new Game(scenario({ p1: { battlefield: ['burdened', 'mountain', 'mountain'] } }));
    // No counters at all: neither ability is offered.
    expect(abilities(g, g.id('p1', 'burdened'))).toHaveLength(0);
    g.obj(g.id('p1', 'burdened')).counters = { '-1/-1': 1 };
    expect(
      abilities(g, g.id('p1', 'burdened')).map(
        (a) => a.type === 'activateAbility' && a.abilityIndex,
      ),
    ).toEqual([0]);
  });

  it('with several kinds of counters the player picks which to remove', () => {
    const g = new Game(scenario({ p1: { battlefield: ['burdened', 'mountain', 'mountain'] } }));
    const b = g.id('p1', 'burdened');
    g.obj(b).counters = { '-1/-1': 2, stun: 1 };
    const one = abilities(g, b).filter((a) => a.type === 'activateAbility' && a.abilityIndex === 0);
    expect(one.map((a) => a.type === 'activateAbility' && a.removeKinds)).toEqual([
      ['-1/-1'],
      ['stun'],
    ]);
    // Two counters: both -1/-1, or one of each.
    const two = abilities(g, b).filter((a) => a.type === 'activateAbility' && a.abilityIndex === 1);
    expect(two.map((a) => a.type === 'activateAbility' && a.removeKinds)).toEqual([
      ['-1/-1', '-1/-1'],
      ['-1/-1', 'stun'],
    ]);
    g.do(one[1]!);
    expect(g.obj(b).counters?.stun).toBe(0);
    expect(counters(g, b)).toBe(2);
  });

  it('"remove a -1/-1 counter from this creature" as an effect', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['auntie', 'bear', 'mountain'], hand: ['shock'] },
      }),
    );
    const auntie = g.id('p1', 'auntie');
    g.obj(auntie).counters = { '-1/-1': 2 };
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(g.id('p1', 'bear'))],
    });
    g.passBoth();
    g.passBoth();
    expect(counters(g, auntie)).toBe(1);
  });

  it('"remove any number of counters": one at a time until done', () => {
    const g = new Game(scenario({ p1: { battlefield: ['rhys', 'plains', 'ogre'] } }));
    const ogre = g.id('p1', 'ogre');
    g.obj(ogre).counters = { '-1/-1': 2, stun: 1 };
    g.do(
      abilities(g, g.id('p1', 'rhys')).find(
        (a) =>
          a.type === 'activateAbility' &&
          a.targets.some((t) => 'object' in t && t.object.id === ogre),
      )!,
    );
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    // Done, a -1/-1 counter, or the stun counter.
    expect(g.legal('p1')).toHaveLength(3);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(counters(g, ogre)).toBe(1);
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    expect(counters(g, ogre)).toBe(0);
    // Only the stun counter is left: stop here.
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.obj(ogre).counters?.stun).toBe(1);
    expect(g.decision.kind).toBe('priority');
  });

  it('"if it had a -1/-1 counter on it" looks back at the creature as it died', () => {
    const withCounter = new Game(scenario({ p1: { battlefield: ['wretch'] } }));
    const w = withCounter.id('p1', 'wretch');
    withCounter.obj(w).counters = { '-1/-1': 1 };
    withCounter.obj(w).damage = 1;
    withCounter.pass();
    withCounter.passBoth();
    expect(withCounter.life('p1')).toBe(23);
    const without = new Game(scenario({ p1: { battlefield: ['wretch'] } }));
    without.obj(without.id('p1', 'wretch')).damage = 2;
    without.pass();
    without.passBoth();
    expect(without.life('p1')).toBe(20);
  });

  it('"if you put a counter on a creature this turn" (any kind of counter, including a blight)', () => {
    const yes = new Game(
      scenario({
        step: 'main2',
        p1: { hand: ['fell-rite'], battlefield: ['tarfire', 'swamp', 'ogre'] },
      }),
    );
    yes.do(casts(yes, 'p1', yes.id('p1', 'fell-rite', 'hand'))[0]!);
    yes.passBoth();
    yes.passUntilStep('end');
    yes.passBoth();
    expect(yes.life('p2')).toBe(18);
    const no = new Game(scenario({ step: 'main2', p1: { battlefield: ['tarfire', 'ogre'] } }));
    no.passUntilStep('end');
    no.passBoth();
    expect(no.life('p2')).toBe(20);
  });
});

describe('convoke granted to creature spells', () => {
  it('Eirdu: creatures can tap for {1} or one mana of their colour', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['convoker'], battlefield: ['eirdu', 'white-guy', 'red-guy', 'red-guy'] },
      }),
    );
    // {2}{W}{W}: two white creatures pay the W, the red ones pay generic.
    const options = casts(g, 'p1', g.id('p1', 'convoker', 'hand'));
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(4);
  });

  it('a creature of the wrong colour can only pay generic', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['convoker'], battlefield: ['eirdu', 'red-guy', 'red-guy', 'red-guy'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 'convoker', 'hand'))).toHaveLength(0);
  });

  it('noncreature spells do not convoke', () => {
    const g = new Game(scenario({ p1: { hand: ['shock'], battlefield: ['eirdu', 'red-guy'] } }));
    expect(casts(g, 'p1', g.id('p1', 'shock', 'hand'))).toHaveLength(0);
  });
});

describe('creatures with counters dying (Shadow Urchin)', () => {
  const dies = (g: Game, id: string) => {
    g.obj(id).damage = 99;
    g.pass();
    g.passBoth();
  };

  it('triggers for a creature with counters of any kind, "that many" being all of them', () => {
    const g = new Game(scenario({ p1: { battlefield: ['urchin', 'bear'] } }));
    const bear = g.id('p1', 'bear');
    g.obj(bear).counters = { '-1/-1': 1, stun: 1 };
    dies(g, bear);
    expect(g.life('p1')).toBe(22);
  });

  it('does not trigger for a creature without counters', () => {
    const g = new Game(scenario({ p1: { battlefield: ['urchin', 'bear'] } }));
    dies(g, g.id('p1', 'bear'));
    expect(g.life('p1')).toBe(20);
  });

  it('works for a token (which is gone by the time the trigger looks)', () => {
    const g = new Game(scenario({ p1: { battlefield: ['urchin', 'goblin'] } }));
    const token = g.id('p1', 'goblin');
    g.obj(token).isToken = true;
    g.obj(token).plusOneCounters = 2;
    dies(g, token);
    expect(g.life('p1')).toBe(22);
  });

  it('works for the Urchin itself', () => {
    const g = new Game(scenario({ p1: { battlefield: ['urchin'] } }));
    const urchin = g.id('p1', 'urchin');
    g.obj(urchin).counters = { '-1/-1': 1 };
    dies(g, urchin);
    expect(g.life('p1')).toBe(21);
  });
});
