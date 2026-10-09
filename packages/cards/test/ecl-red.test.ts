import { describe, expect, it } from 'vitest';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { ECL_GOBLIN } from '../src/ecl/tokens.ts';
import { activate, casts, castsAt, exile, gy, keywords, minus } from './ecl-red-helpers.ts';

// Lorwyn Eclipsed 18b: the red cards.

describe('Boldwyr Aggressor', () => {
  it('gives the other Giants you control double strike, and only those', () => {
    const g = game({
      p1: { battlefield: ['boldwyr-aggressor', 'brambleback-brute', 'savannah-lions'] },
      p2: { battlefield: ['brambleback-brute'] },
    });
    expect(keywords(g, g.id('p1', 'boldwyr-aggressor'))).toContain('doubleStrike');
    expect(keywords(g, g.id('p1', 'brambleback-brute'))).toContain('doubleStrike');
    expect(keywords(g, g.id('p1', 'savannah-lions'))).not.toContain('doubleStrike');
    expect(keywords(g, g.id('p2', 'brambleback-brute'))).not.toContain('doubleStrike');
  });
});

describe('Boneclub Berserker', () => {
  it('gets +2/+0 for each other Goblin you control', () => {
    const g = game({
      p1: { battlefield: ['boneclub-berserker', 'scuzzback-scrounger', ECL_GOBLIN] },
      p2: { battlefield: ['scuzzback-scrounger'] },
    });
    const b = g.id('p1', 'boneclub-berserker');
    expect(pt(g, b)).toEqual([6, 4]);
  });
});

describe('Boulder Dash', () => {
  it('deals 2 damage to one target and 1 to another', () => {
    const g = game({
      p1: { hand: ['boulder-dash'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'boulder-dash', [g.ref(g.id('p2', 'serra-angel')), { player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });

  it('the two targets must be different', () => {
    const g = game({
      p1: { hand: ['boulder-dash'], battlefield: n('mountain', 2) },
    });
    expect(() => cast(g, 'boulder-dash', [{ player: 'p2' }, { player: 'p2' }])).toThrow();
  });
});

describe('Brambleback Brute', () => {
  it('enters with two -1/-1 counters; removing one makes a creature unable to block (sorcery speed)', () => {
    const g = game({
      p1: { hand: ['brambleback-brute'], battlefield: n('mountain', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'brambleback-brute');
    settle(g);
    const brute = g.id('p1', 'brambleback-brute');
    expect(minus(g, brute)).toBe(2);
    expect(pt(g, brute)).toEqual([2, 3]);
    const angel = g.id('p2', 'serra-angel');
    activate(g, brute, 0, [g.ref(angel)], { removeKinds: ['-1/-1'] });
    settle(g);
    expect(minus(g, brute)).toBe(1);
    expect(pt(g, brute)).toEqual([3, 4]);
    expect(g.state.effects.some((e) => e.affected.id === angel && e.cantBlock === true)).toBe(true);
  });

  it('is not offered when there is no counter to remove', () => {
    const g = game({ p1: { battlefield: ['brambleback-brute', ...n('mountain', 2)] } });
    expect(
      g
        .legal()
        .filter(
          (a) => a.type === 'activateAbility' && a.source === g.id('p1', 'brambleback-brute'),
        ),
    ).toHaveLength(0);
  });
});

describe('Burning Curiosity', () => {
  it('exiles two cards you may play, or three if you blighted', () => {
    const lib = ['island', 'plains', 'swamp', 'forest', 'forest'];
    const plain = game({
      p1: { hand: ['burning-curiosity'], battlefield: n('mountain', 3), library: lib },
    });
    cast(plain, 'burning-curiosity');
    settle(plain);
    expect(exile(plain)).toEqual(['island', 'plains']);

    const kicked = game({
      p1: {
        hand: ['burning-curiosity'],
        battlefield: [...n('mountain', 3), 'serra-angel'],
        library: lib,
      },
    });
    const lions = kicked.id('p1', 'serra-angel');
    kicked.do(casts(kicked, 'burning-curiosity').find((a) => a.blight === lions)!);
    settle(kicked);
    expect(minus(kicked, lions)).toBe(1);
    expect(exile(kicked)).toEqual(['island', 'plains', 'swamp']);
  });
});

describe('Cinder Strike', () => {
  it('deals 2 damage, or 4 if you blighted', () => {
    const plain = game({
      p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = plain.id('p2', 'serra-angel');
    plain.do(castsAt(plain, 'cinder-strike', angel).find((a) => !a.blight)!);
    settle(plain);
    expect(plain.obj(angel).damage).toBe(2);

    const kicked = game({
      p1: { hand: ['cinder-strike'], battlefield: ['mountain', 'serra-angel'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const lions = kicked.id('p1', 'serra-angel');
    kicked.do(
      castsAt(kicked, 'cinder-strike', kicked.id('p2', 'serra-angel')).find(
        (a) => a.blight === lions,
      )!,
    );
    settle(kicked);
    expect(minus(kicked, lions)).toBe(1);
    expect(gy(kicked, 'p2')).toEqual(['serra-angel']);
  });
});
