import { describe, expect, it } from 'vitest';
import { Game, scenario } from './helpers.ts';

describe('connive', () => {
  function castConniver(library: string[], hand: string[] = []) {
    const g = new Game(
      scenario({ p1: { hand: ['conniver', ...hand], battlefield: ['forest'], library } }),
    );
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'conniver', 'hand'), targets: [] });
    g.passBoth(); // the creature resolves
    g.passBoth(); // its enters trigger resolves: draw, then a discard prompt
    return g;
  }

  it('draws, then a nonland discard puts a +1/+1 counter on it', () => {
    const g = castConniver(['ogre', 'forest']);
    expect(g.decision).toMatchObject({ kind: 'discard', player: 'p1', count: 1 });
    const ogre = g.id('p1', 'ogre', 'hand');
    g.do({ type: 'discard', player: 'p1', card: ogre });
    expect(g.zoneOf(ogre)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'conniver')).plusOneCounters).toBe(1);
    expect(g.decision).toEqual({ kind: 'priority', player: 'p1' });
  });

  it('a land discard gives no counter', () => {
    const g = castConniver(['forest'], ['ogre']);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    expect(g.obj(g.id('p1', 'conniver')).plusOneCounters).toBe(0);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('a creature that has left still connives, without a counter', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['conniver'], battlefield: ['forest'], library: ['ogre'] },
        p2: { battlefield: ['mountain'], hand: ['shock'] },
      }),
    );
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'conniver', 'hand'), targets: [] });
    g.passBoth();
    const conniver = g.id('p1', 'conniver');
    g.pass(); // the enters trigger is on the stack; p2 responds
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'shock', 'hand'),
      targets: [g.ref(conniver)],
    });
    g.passBoth(); // Shock kills it
    g.passBoth(); // the trigger resolves
    expect(g.zoneOf(conniver)).toBe('graveyard');
    expect(g.decision).toMatchObject({ kind: 'discard', player: 'p1' });
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'ogre', 'hand') });
    expect(g.state.players.p1.hand).toHaveLength(0);
  });

  it('a spell makes the target creature you control connive', () => {
    const g = new Game(
      scenario({ p1: { hand: ['scheme'], battlefield: ['bear'], library: ['ogre'] } }),
    );
    const bear = g.id('p1', 'bear');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'scheme', 'hand'),
      targets: [g.ref(bear)],
    });
    g.passBoth();
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'ogre', 'hand') });
    expect(g.obj(bear).plusOneCounters).toBe(1);
  });
});
