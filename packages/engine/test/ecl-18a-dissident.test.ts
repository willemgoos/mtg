import { describe, expect, it } from 'vitest';
import { casts, counters, Game, scenario } from './ecl-fixtures.ts';

// Dawnhand Dissident: cast creature spells exiled with it by removing three counters from among your creatures.

/** The Dissident exiles `card` from a graveyard, blighting the ogre twice. */
function exile(g: Game, owner: 'p1' | 'p2', card: string) {
  const dissident = g.id('p1', 'dissident');
  const target = g.id(owner, card, 'graveyard');
  g.do(
    g
      .legal('p1')
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === dissident &&
          a.blight === g.id('p1', 'ogre') &&
          a.targets.some((t) => 'object' in t && t.object.id === target),
      )!,
  );
  g.passBoth();
  return { dissident, target };
}

describe('Dawnhand Dissident', () => {
  it('exiles a card from a graveyard and remembers it, for a blight 2', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['dissident', 'ogre'] }, p2: { graveyard: ['bear'] } }),
    );
    const { dissident, target } = exile(g, 'p2', 'bear');
    expect(g.zoneOf(target)).toBe('exile');
    expect(g.obj(dissident).exiledWith).toEqual([target]);
    expect(counters(g, g.id('p1', 'ogre'))).toBe(2);
  });

  it("can't cast a card it owns no part of (the opponent's card)", () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['dissident', 'ogre'] }, p2: { graveyard: ['bear'] } }),
    );
    const { target } = exile(g, 'p2', 'bear');
    g.obj(g.id('p1', 'ogre')).counters = { '-1/-1': 5 };
    expect(casts(g, 'p1', target)).toHaveLength(0);
  });

  it('needs three counters among your creatures; with exactly three nothing is chosen', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['dissident', 'ogre', 'forest'], graveyard: ['elf'] } }),
    );
    const { target } = exile(g, 'p1', 'elf');
    // Two -1/-1 counters on the ogre: not enough.
    expect(casts(g, 'p1', target)).toHaveLength(0);
    g.obj(g.id('p1', 'ogre')).counters = { '-1/-1': 2, stun: 1 };
    const options = casts(g, 'p1', target);
    expect(options).toHaveLength(1);
    expect(options[0]!.via).toBe('exiledWithSelf');
    g.do(options[0]!);
    // All three go at once.
    expect(g.decision.kind).toBe('priority');
    expect(counters(g, g.id('p1', 'ogre'))).toBe(0);
    expect(g.obj(g.id('p1', 'ogre')).counters?.stun).toBe(0);
    g.passBoth();
    expect(g.zoneOf(target)).toBe('battlefield');
  });

  it('with more counters than that, the player picks which ones, one at a time', () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['dissident', 'ogre', 'forest'], graveyard: ['elf'] } }),
    );
    const { dissident, target } = exile(g, 'p1', 'elf');
    const ogre = g.id('p1', 'ogre');
    g.obj(ogre).counters = { '-1/-1': 2, stun: 1 };
    g.obj(dissident).plusOneCounters = 2;
    g.do(casts(g, 'p1', target)[0]!);
    expect(g.decision.kind).toBe('payCounters');
    // A -1/-1 or the stun counter on the ogre, or a +1/+1 counter on the Dissident.
    expect(g.legal('p1')).toHaveLength(3);
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    expect(g.decision.kind).toBe('payCounters');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const left =
      counters(g, ogre) + (g.obj(ogre).counters?.stun ?? 0) + g.obj(dissident).plusOneCounters;
    expect(left).toBe(2);
    expect(g.decision.kind).toBe('priority');
    g.passBoth();
    expect(g.zoneOf(target)).toBe('battlefield');
  });

  it("is not offered on the opponent's turn", () => {
    const g = new Game(
      scenario({ p1: { battlefield: ['dissident', 'ogre', 'forest'], graveyard: ['elf'] } }),
    );
    const { target } = exile(g, 'p1', 'elf');
    g.obj(g.id('p1', 'ogre')).counters = { '-1/-1': 4 };
    g.state.turn.activePlayer = 'p2';
    expect(casts(g, 'p1', target)).toHaveLength(0);
  });
});
