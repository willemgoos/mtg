import { describe, expect, it } from 'vitest';
import { Game, scenario } from './helpers.ts';

describe('casting, priority and the stack', () => {
  it('cast → opponent gets priority → both pass → resolves', () => {
    const g = new Game(scenario({ p1: { hand: ['shock'], battlefield: ['mountain'] } }));
    const shock = g.id('p1', 'shock', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: shock, targets: [{ player: 'p2' }] });
    expect(g.state.stack).toHaveLength(1);
    expect(g.obj(g.id('p1', 'mountain')).tapped).toBe(true);
    // Caster retains priority first.
    expect(g.decision).toEqual({ kind: 'priority', player: 'p1' });
    g.pass();
    expect(g.decision).toEqual({ kind: 'priority', player: 'p2' });
    g.pass();
    expect(g.state.stack).toHaveLength(0);
    expect(g.life('p2')).toBe(18);
    expect(g.zoneOf(shock)).toBe('graveyard');
    // Active player gets priority again after resolution, same step.
    expect(g.decision).toEqual({ kind: 'priority', player: 'p1' });
    expect(g.state.turn.step).toBe('main1');
  });

  it('events are plain data that outlive the update', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock'], battlefield: ['mountain'] },
        p2: { battlefield: ['bear'] },
      }),
    );
    const bear = g.id('p2', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(bear)],
    });
    g.passBoth();
    const dmg = g.events.find((e) => e.type === 'damageDealt');
    expect(JSON.parse(JSON.stringify(dmg))).toEqual({
      type: 'damageDealt',
      source: g.id('p1', 'shock', 'graveyard'),
      to: { object: { id: bear, zcc: 0 } },
      amount: 2,
      combat: false,
    });
  });

  it('resolves last in, first out (pump in response to burn)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock'], battlefield: ['mountain'] },
        p2: { hand: ['giant-growth'], battlefield: ['forest', 'bear'] },
      }),
    );
    const bear = g.id('p2', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(bear)],
    });
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'giant-growth', 'hand'),
      targets: [g.ref(bear)],
    });
    g.passBoth(); // growth resolves
    expect(g.zoneOf(bear)).toBe('battlefield');
    g.passBoth(); // shock resolves
    expect(g.obj(bear).damage).toBe(2);
    expect(g.zoneOf(bear)).toBe('battlefield');
  });

  it('fizzles when its only target is gone', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['giant-growth'], battlefield: ['forest', 'bear'] },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
      }),
    );
    const bear = g.id('p1', 'bear');
    const growth = g.id('p1', 'giant-growth', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: growth, targets: [g.ref(bear)] });
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(bear)],
    });
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    g.passBoth();
    expect(g.events.some((e) => e.type === 'fizzled' && e.id === growth)).toBe(true);
    expect(g.zoneOf(growth)).toBe('graveyard');
  });

  it('a creature that changed zones is a new object (old refs are stale)', () => {
    const g = new Game(scenario({ p1: { hand: ['shock'], battlefield: ['mountain'] } }));
    const shock = g.id('p1', 'shock', 'hand');
    const before = g.obj(shock).zcc;
    g.do({ type: 'castSpell', player: 'p1', card: shock, targets: [{ player: 'p2' }] });
    expect(g.obj(shock).zcc).toBe(before + 1);
  });

  it('enforces sorcery timing', () => {
    const g = new Game(
      scenario({ p1: { hand: ['lava-axe'], battlefield: Array(5).fill('mountain') } }),
    );
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'lava-axe', 'hand'),
      targets: [{ player: 'p2' }],
    });
    g.passBoth();
    expect(g.life('p2')).toBe(15);

    const opp = new Game(
      scenario({
        active: 'p2',
        p1: { hand: ['lava-axe'], battlefield: Array(5).fill('mountain') },
      }),
    );
    expect(opp.legal('p1')).toEqual([]);
    opp.pass();
    expect(opp.legal('p1').some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('only offers spells you can pay for, with the right colors', () => {
    const g = new Game(
      scenario({ p1: { hand: ['shock', 'lava-axe'], battlefield: ['forest', 'forest'] } }),
    );
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('mana creatures pay, but not while summoning sick; lands are tapped first', () => {
    const g = new Game(scenario({ p1: { hand: ['bear'], battlefield: ['forest', 'elf'] } }));
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'bear', 'hand'), targets: [] });
    expect(g.obj(g.id('p1', 'forest')).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'elf')).tapped).toBe(true);

    const sick = new Game(
      scenario({ p1: { hand: ['bear'], battlefield: ['forest', { card: 'elf', sick: true }] } }),
    );
    expect(sick.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('respects explicit payWith', () => {
    const g = new Game(
      scenario({ p1: { hand: ['giant-growth'], battlefield: ['forest', 'forest', 'bear'] } }),
    );
    const [, second] = g.state.battlefield;
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'giant-growth', 'hand'),
      targets: [g.ref(g.id('p1', 'bear'))],
      payWith: [second!],
    });
    expect(g.obj(second!).tapped).toBe(true);
    expect(g.obj(g.state.battlefield[0]!).tapped).toBe(false);
  });

  it('creature spells resolve onto the battlefield summoning sick', () => {
    const g = new Game(scenario({ p1: { hand: ['bear'], battlefield: ['forest', 'forest'] } }));
    const bear = g.id('p1', 'bear', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: bear, targets: [] }).passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.obj(bear).summoningSick).toBe(true);
  });

  it('activated abilities: mana cost, tap cost and summoning sickness', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['mountain', 'mountain', 'firebreather', 'pinger'] } }),
    );
    const fb = g.id('p1', 'firebreather');
    const pumps = g.legal().filter((a) => a.type === 'activateAbility' && a.source === fb);
    expect(pumps).toHaveLength(1);
    g.do(pumps[0]!).passBoth();
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === fb)!).passBoth();
    expect(g.state.effects.filter((e) => e.affected.id === fb)).toHaveLength(2);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === fb)).toBe(false);

    const pinger = g.id('p1', 'pinger');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: pinger,
      abilityIndex: 0,
      targets: [{ player: 'p2' }],
    });
    expect(g.obj(pinger).tapped).toBe(true);
    g.passBoth();
    expect(g.life('p2')).toBe(19);

    const sick = new Game(scenario({ p1: { battlefield: [{ card: 'pinger', sick: true }] } }));
    expect(sick.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });

  it('sacrifice-as-cost uses the power it had when sacrificed', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['mountain', 'sacker'] }, p2: { battlefield: ['ogre'] } }),
    );
    const sacker = g.id('p1', 'sacker');
    const ogre = g.id('p2', 'ogre');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: sacker,
      abilityIndex: 0,
      targets: [g.ref(ogre)],
    });
    expect(g.zoneOf(sacker)).toBe('graveyard');
    g.passBoth();
    expect(g.zoneOf(ogre)).toBe('graveyard');
  });
});
