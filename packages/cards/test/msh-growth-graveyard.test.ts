import { describe, expect, it } from 'vitest';
import { all, cast, game, n, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10b: Growing Pains (G/U) and Savage Uprising (B/G).

describe('Growing Pains', () => {
  it('Ant-Man makes an Insect when you put a +1/+1 counter, once a turn', () => {
    const g = game({
      p1: {
        hand: ['go-nuts', 'go-nuts'],
        battlefield: [...n('forest', 2), 'ant-man-colony-commander'],
      },
    });
    const ant = g.id('p1', 'ant-man-colony-commander');
    settle(cast(g, 'go-nuts', [g.ref(ant)], { mode: 0 }));
    settle(cast(g, 'go-nuts', [g.ref(ant)], { mode: 0 }));
    expect(all(g, 'insect-token')).toHaveLength(1);
  });
});

describe('Savage Uprising', () => {
  it('Punishing Punch costs {2} less with two creature cards in your graveyard', () => {
    const cheap = game({
      p1: {
        hand: ['punishing-punch'],
        battlefield: ['forest', 'agent-of-atlas'],
        graveyard: ['agent-of-atlas', 'ninja-of-the-hand'],
      },
      p2: { battlefield: ['agent-of-atlas'] },
    });
    expect(cheap.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const dear = game({
      p1: { hand: ['punishing-punch'], battlefield: ['forest', 'agent-of-atlas'] },
      p2: { battlefield: ['agent-of-atlas'] },
    });
    expect(dear.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Killmonger sacrifices another creature to destroy a nonland permanent', () => {
    const g = game({
      p1: {
        hand: ['killmonger-scourge-of-wakanda'],
        battlefield: [...n('swamp', 2), ...n('forest', 2), 'agents-of-hydra'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'killmonger-scourge-of-wakanda');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0));
    if (g.decision.kind === 'sacrificeSeveral' || g.decision.kind === 'pickCards')
      g.do(g.legal()[0]!);
    settle(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
  });

  it('Arnim Zola needs two creature cards in your graveyard', () => {
    const g = game({ p1: { battlefield: ['arnim-zola-bio-fanatic', ...n('swamp', 3)] } });
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});
