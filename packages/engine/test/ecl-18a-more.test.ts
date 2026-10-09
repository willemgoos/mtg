import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { counters, DB, Game, getPower, scenario } from './ecl-fixtures.ts';

describe('persist', () => {
  it('a persist creature returns with a -1/-1 counter, and not a second time', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['persister', 'mountain', 'mountain'], hand: ['shock', 'shock'] },
      }),
    );
    const p = g.id('p1', 'persister');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(p)],
    });
    g.passBoth();
    // Dead, with the persist trigger on the stack.
    expect(g.zoneOf(p)).toBe('graveyard');
    g.passBoth();
    expect(g.zoneOf(p)).toBe('battlefield');
    expect(counters(g, p)).toBe(1);
    expect(getPower(g, p)).toBe(1);
    // It dies again: with a -1/-1 counter on it, it stays dead.
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(p)],
    });
    g.passBoth();
    g.passBoth();
    expect(g.zoneOf(p)).toBe('graveyard');
  });

  it('a 1/1 persist creature returns as a 0/0 and dies again at once', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['one-persist', 'mountain'], hand: ['shock'] } }),
    );
    const p = g.id('p1', 'one-persist');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'shock', 'hand'),
      targets: [g.ref(p)],
    });
    g.passBoth();
    g.passBoth();
    expect(g.zoneOf(p)).toBe('graveyard');
    expect(
      g.events.filter((e) => e.type === 'objectMoved' && e.id === p && e.to === 'battlefield'),
    ).toHaveLength(1);
  });

  it('Isilu gives the other nontoken creatures persist; creatures dying together look back at it', () => {
    const g = new Game(
      scenario({
        p1: {
          battlefield: ['isilu', 'bear', 'goblin', 'mountain', 'mountain', 'mountain'],
          hand: ['rupture'],
        },
      }),
    );
    g.obj(g.id('p1', 'goblin')).isToken = true;
    const bear = g.id('p1', 'bear');
    const keywords = (id: string) => getCharacteristics(g.state, DB, id).keywords;
    expect(keywords(bear).has('persist')).toBe(true);
    expect(keywords(g.id('p1', 'goblin')).has('persist')).toBe(false);
    expect(keywords(g.id('p1', 'isilu')).has('persist')).toBe(false);
    // 2 damage to each creature without flying kills the bear, the token and the 3/3 Isilu stays.
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'rupture', 'hand'), targets: [] });
    g.passBoth();
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(counters(g, bear)).toBe(1);
  });

  it('Isilu dying together with the others does not stop their persist', () => {
    const g = new Game(scenario({ p1: { battlefield: ['isilu', 'bear'] } }));
    const isilu = g.id('p1', 'isilu');
    const bear = g.id('p1', 'bear');
    g.obj(isilu).damage = 3;
    g.obj(bear).damage = 2;
    // State-based actions: both die at the same time.
    g.pass();
    expect(g.zoneOf(isilu)).toBe('graveyard');
    expect(g.zoneOf(bear)).toBe('graveyard');
    g.passBoth();
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(counters(g, bear)).toBe(1);
  });
});
