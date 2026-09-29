import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { DB, Game, scenario } from './helpers.ts';

describe('state-based actions', () => {
  it('a player at 0 life loses', () => {
    const g = new Game(
      scenario({ p1: { hand: ['shock'], battlefield: ['mountain'] }, p2: { life: 2 } }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [{ player: 'p2' }],
    });
    g.passBoth();
    expect(g.state.winner).toBe('p1');
    expect(g.decision.kind).toBe('gameOver');
  });

  it('drawing from an empty library loses', () => {
    const g = new Game(scenario({ step: 'upkeep', p1: { library: [] } }));
    g.passBoth();
    expect(g.state.winner).toBe('p2');
  });

  it('both players losing at once is a draw', () => {
    const g = new Game(scenario({ p1: { life: 0 }, p2: { life: 0 } }));
    g.pass();
    expect(g.state.winner).toBe('draw');
  });

  it('creatures with lethal damage or 0 toughness die', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock', 'zero'], battlefield: ['mountain', 'mountain'] },
        p2: { battlefield: ['bear'] },
      }),
    );
    const bear = g.id('p2', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(bear)],
    }).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    const zero = g.id('p1', 'zero', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: zero, targets: [] }).passBoth();
    expect(g.zoneOf(zero)).toBe('graveyard');
  });

  it('+1/+1 counters from "enters with" keep a 0/0 alive', () => {
    const g = new Game(scenario({ p1: { hand: ['hydra'], battlefield: ['forest'] } }));
    const h = g.id('p1', 'hydra', 'hand');
    g.do({ type: 'castSpell', player: 'p1', card: h, targets: [] }).passBoth();
    expect(g.zoneOf(h)).toBe('battlefield');
    expect(g.obj(h).plusOneCounters).toBe(4);
  });

  it('tokens cease to exist when they leave the battlefield', () => {
    const g = new Game(
      scenario({ p1: { hand: ['fodder', 'rupture'], battlefield: Array(5).fill('mountain') } }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'fodder', 'hand'),
      targets: [],
    }).passBoth();
    const goblins = g.state.battlefield.filter((id) => g.obj(id).defId === 'goblin');
    expect(goblins).toHaveLength(2);
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'rupture', 'hand'),
      targets: [],
    }).passBoth();
    for (const id of goblins) expect(g.zoneOf(id)).toBe('gone');
    expect(g.state.players.p1.graveyard).toHaveLength(2); // fodder + rupture
  });
});

describe('triggered abilities', () => {
  it('ETB trigger asks for targets, then uses the stack', () => {
    const g = new Game(scenario({ p1: { hand: ['pyromancer'], battlefield: ['mountain'] } }));
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'pyromancer', 'hand'),
      targets: [],
    }).passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [{ player: 'p2' }] });
    expect(g.state.stack).toHaveLength(1);
    expect(g.decision).toEqual({ kind: 'priority', player: 'p1' });
    g.passBoth();
    expect(g.life('p2')).toBe(18);
  });

  it('optional targeted trigger can be declined', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['fighter'], battlefield: ['forest'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'fighter', 'hand'),
      targets: [],
    }).passBoth();
    expect(g.legal().filter((a) => a.type === 'chooseTargets')).toHaveLength(2);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    expect(g.state.stack).toHaveLength(0);
  });

  it('fight: both deal damage equal to their power', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['fighter'], battlefield: ['forest'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'fighter', 'hand'),
      targets: [],
    }).passBoth();
    const ogre = g.id('p2', 'ogre');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(ogre)] }).passBoth();
    expect(g.zoneOf(ogre)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'fighter')).damage).toBe(3);
  });

  it('prowess-style trigger on noncreature spells', () => {
    const g = new Game(scenario({ p1: { hand: ['shock'], battlefield: ['mountain', 'prowler'] } }));
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [{ player: 'p2' }],
    });
    // Trigger goes on the stack above the spell.
    expect(g.state.stack).toHaveLength(2);
    g.passBoth();
    expect(g.state.effects).toHaveLength(1);
  });

  it('dies trigger resolves after the creature is gone', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['wurm'] },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
      }),
    );
    const wurm = g.id('p1', 'wurm');
    g.obj(wurm).damage = 6;
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(wurm)],
    }).passBoth();
    expect(g.zoneOf(wurm)).toBe('graveyard');
    expect(g.state.stack).toHaveLength(1);
    g.passBoth();
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('landfall', () => {
    const g = new Game(scenario({ p1: { hand: ['forest'], battlefield: ['landfaller'] } }));
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') }).passBoth();
    expect(g.life('p2')).toBe(19);
  });

  it('beginning-of-upkeep trigger for its controller only', () => {
    const g = new Game(
      scenario({ step: 'end', p1: { battlefield: ['upkeeper'] }, p2: { battlefield: [] } }),
    );
    g.passBoth(); // p2's upkeep
    expect(g.state.stack).toHaveLength(0);
    g.passUntilStep('end').passBoth(); // p1's upkeep
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.state.stack).toHaveLength(1);
    g.passBoth();
    expect(g.life('p1')).toBe(19);
  });
});

describe('continuous effects and targeting', () => {
  it('lords pump other creatures of their subtype', () => {
    const g = new Game(scenario({ p1: { battlefield: ['elf-lord', 'elf', 'bear'] } }));
    const elf = g.id('p1', 'elf');
    const bear = g.id('p1', 'bear');
    expect(getCharacteristics(g.state, DB, elf)).toMatchObject({ power: 2, toughness: 2 });
    expect(getCharacteristics(g.state, DB, bear)).toMatchObject({ power: 2, toughness: 2 });
    expect(getCharacteristics(g.state, DB, g.id('p1', 'elf-lord'))).toMatchObject({ power: 2 });
  });

  it('hexproof prevents opponents from targeting', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['veil'], battlefield: ['forest', 'bear'] },
        p2: { hand: ['shock'], battlefield: ['mountain'] },
      }),
    );
    const bear = g.id('p1', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'veil', 'hand'),
      targets: [g.ref(bear)],
    }).passBoth();
    expect(g.obj(bear).plusOneCounters).toBe(1);
    g.pass();
    const shocks = g.legal('p2').filter((a) => a.type === 'castSpell');
    expect(shocks.map((a) => (a.type === 'castSpell' ? a.targets[0] : null))).toEqual([
      { player: 'p1' },
      { player: 'p2' },
    ]);
  });

  it('bite: your creature deals damage equal to its power', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['bite'], battlefield: ['forest', 'forest', 'ogre'] },
        p2: { battlefield: ['bear'] },
      }),
    );
    const bear = g.id('p2', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'bite', 'hand'),
      targets: [g.ref(g.id('p1', 'ogre')), g.ref(bear)],
    }).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'ogre')).damage).toBe(0);
  });

  it('group damage respects filters (fliers are spared)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['rupture'], battlefield: Array(3).fill('mountain') },
        p2: { battlefield: ['bear', 'flier'] },
      }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'rupture', 'hand'),
      targets: [],
    }).passBoth();
    expect(g.state.players.p2.graveyard.map((id) => g.obj(id).defId)).toEqual(['bear']);
  });
});
