import { describe, expect, it } from 'vitest';
import { reduceCost } from '../src/cost.ts';
import { Game, scenario } from './helpers.ts';

describe('power-up', () => {
  const powerUps = (g: Game) => g.legal('p1').filter((a) => a.type === 'activateAbility');

  it('costs its mana cost less the turn it entered', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['powerer'], battlefield: ['forest', 'forest', 'forest', 'forest'] },
      }),
    );
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'powerer', 'hand'), targets: [] });
    g.passBoth();
    // {3}{G} less {1}{G} is {2}: the two forests left pay for it.
    expect(powerUps(g)).toHaveLength(1);
    const p = g.id('p1', 'powerer');
    g.do({ type: 'activateAbility', player: 'p1', source: p, abilityIndex: 0, targets: [] });
    g.passBoth();
    expect(g.obj(p).plusOneCounters).toBe(2);
    expect(powerUps(g)).toHaveLength(0);
  });

  it('pays full price on a later turn, and only once', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['powerer', 'forest', 'forest', 'forest', 'forest'] } }),
    );
    const p = g.id('p1', 'powerer');
    g.obj(p).zoneTurn = 0;
    expect(powerUps(g)).toHaveLength(1);
    g.do({ type: 'activateAbility', player: 'p1', source: p, abilityIndex: 0, targets: [] });
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(4);
    g.passBoth();
    expect(powerUps(g)).toHaveLength(0);
  });

  it('reduces coloured, hybrid and generic parts', () => {
    // Abomination: {5}{R/G}{R/G} less {3}{R/G} is {2}{R/G}.
    expect(
      reduceCost(
        {
          generic: 5,
          colored: {},
          hybrid: [
            ['R', 'G'],
            ['R', 'G'],
          ],
        },
        { generic: 3, colored: {}, hybrid: [['R', 'G']] },
      ),
    ).toEqual({ generic: 2, colored: {}, hybrid: [['R', 'G']] });
    // A colour the cost lacks takes off generic instead.
    expect(
      reduceCost({ generic: 6, colored: { G: 1 } }, { generic: 1, colored: { U: 1 } }),
    ).toEqual({ generic: 4, colored: { G: 1 } });
  });
});
