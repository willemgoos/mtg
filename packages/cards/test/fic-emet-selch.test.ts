import { describe, expect, it } from 'vitest';
import { cast, game, n, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12f): Brawl Emet-Selch — an Adventure land, Demon
// Wall, spells from the graveyard, Zenos yae Galvus.

describe('Brawl Emet-Selch (12f)', () => {
  it('Jidoor: Overture mills half, then the land is played from exile', () => {
    const g = game({
      p1: { hand: ['jidoor-aristocratic-capital'], battlefield: n('island', 6) },
      p2: { library: n('forest', 10) },
    });
    const jidoor = g.id('p1', 'jidoor-aristocratic-capital', 'hand');
    const overture = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === jidoor && a.back === true);
    expect(overture).toBeDefined();
    g.do(overture!);
    settle(g);
    expect(g.state.players.p2.library).toHaveLength(5);
    expect(g.obj(jidoor).onAdventure).toBe(true);
    const play = g.legal().find((a) => a.type === 'playLand' && a.card === jidoor);
    expect(play).toBeDefined();
    g.do(play!);
    expect(g.zoneOf(jidoor)).toBe('battlefield');
    expect(g.obj(jidoor).defId).toBe('jidoor-aristocratic-capital');
  });

  it('Demon Wall attacks only once it has a counter', () => {
    const g = game({ p1: { battlefield: ['demon-wall'] }, step: 'beginCombat' });
    g.pass().pass();
    const canAttack = () =>
      g.legal().some((a) => a.type === 'addAttacker' && g.obj(a.attacker).defId === 'demon-wall');
    expect(canAttack()).toBe(false);
    const h = game({ p1: { battlefield: ['demon-wall'] }, step: 'beginCombat' });
    h.obj(h.id('p1', 'demon-wall')).plusOneCounters = 2;
    h.pass().pass();
    expect(
      h.legal().some((a) => a.type === 'addAttacker' && h.obj(a.attacker).defId === 'demon-wall'),
    ).toBe(true);
  });

  it('Emet-Selch: graveyard spells cost {2} less; an opponent losing life readies one', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        graveyard: ['dreams-of-laguna'],
        battlefield: ['emet-selch-of-the-third-seat', 'mountain', 'island', 'island'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    const dreams = g.state.players.p1.exile.find((id) => g.obj(id).defId === 'dreams-of-laguna');
    expect(dreams).toBeDefined();
    // Dreams of Laguna ({1}{U}) for {U} after the discount: one Island would do.
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === dreams)).toBe(true);
  });

  it('Zenos yae Galvus transforms when the chosen creature leaves', () => {
    const g = game({
      p1: { hand: ['zenos-yae-galvus', 'shock'], battlefield: n('swamp', 5).concat(['mountain']) },
      p2: { battlefield: ['savannah-lions', 'serra-angel'] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, 'zenos-yae-galvus');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === lions),
      ),
    );
    // The chosen Lions keep their size; the Angel is 2/2 this turn.
    cast(g, 'shock', [g.ref(lions)]);
    settle(g);
    expect(g.zoneOf(lions)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'shinryu-transcendent-rival')).defId).toBe(
      'shinryu-transcendent-rival',
    );
  });
});
