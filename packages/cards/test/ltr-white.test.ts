import { describe, expect, it } from 'vitest';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { LTR_WHITE, LTR_WHITE_BACKS, LTR_WHITE_TOKENS } from '../src/ltr/white.ts';
import { LTR_COLORLESS } from '../src/ltr/colorless.ts';
import { cast, game, n, pt } from './blb-helpers.ts';
import { casts, done, keywords, names, obj, toStep } from './hob-white-helpers.ts';
import { attack, settleOn, tokensOf, toBlockers, use } from './ltr-white-helpers.ts';

// Lord of the Rings 21b: the white cards (the colorless ones are in ltr-white-colorless.test.ts).

describe('the white group is registered', () => {
  it('has behaviour and a card for every name', () => {
    expect(Object.keys(LTR_WHITE)).toHaveLength(23);
    expect(Object.keys(LTR_COLORLESS)).toHaveLength(5);
    expect(Object.keys(LTR_WHITE_BACKS)).toHaveLength(0);
    for (const name of [...Object.keys(LTR_WHITE), ...Object.keys(LTR_COLORLESS)]) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
    for (const t of LTR_WHITE_TOKENS) expect(cardDb.get(t.id), t.id).toBeDefined();
  });
});

describe('Banish from Edoras', () => {
  const setup = (lands: number, tapped: boolean) =>
    game({
      p1: { hand: ['banish-from-edoras'], battlefield: n('plains', lands) },
      p2: { battlefield: [{ card: 'serra-angel', tapped }] },
    });
  it('exiles a creature for {4}{W}', () => {
    const g = setup(5, false);
    cast(g, 'banish-from-edoras', [obj(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
  });
  it('costs {2} less if it targets a tapped creature', () => {
    // Three lands: only a tapped creature can be targeted.
    expect(casts(setup(3, false), 'banish-from-edoras')).toHaveLength(0);
    const g = setup(3, true);
    expect(casts(g, 'banish-from-edoras')).toHaveLength(1);
    cast(g, 'banish-from-edoras', [obj(g, g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'exile'))).toBe('exile');
  });
});

describe('Bill the Pony', () => {
  it('makes two Foods as it enters', () => {
    const g = game({ p1: { hand: ['bill-the-pony'], battlefield: n('plains', 4) } });
    cast(g, 'bill-the-pony');
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(2);
  });
  it('sacrificing a Food makes a creature assign damage equal to its toughness rather than its power, until end of turn', () => {
    const g = game({
      p1: { battlefield: ['bill-the-pony', 'food-token', 'savannah-lions'] },
      p2: {},
    });
    const bill = g.id('p1', 'bill-the-pony');
    // Bill is a 1/4: with the Food sacrificed he deals 4.
    use(g, bill, 1, [bill]);
    done(g);
    expect(tokensOf(g, 'food-token')).toHaveLength(0);
    attack(g, [bill]);
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(16);
  });
  it('can be a creature whose toughness is lower than its power (damage equals the toughness)', () => {
    const g = game({
      p1: { battlefield: ['bill-the-pony', 'food-token', 'savannah-lions'] },
      p2: {},
    });
    const lions = g.id('p1', 'savannah-lions'); // 2/1
    use(g, g.id('p1', 'bill-the-pony'), 1, [lions]);
    done(g);
    attack(g, [lions]);
    g.passUntilStep('endCombat');
    expect(g.life('p2')).toBe(19);
  });
});

describe('Eagle of Deliverance', () => {
  it('puts an indestructible counter on another creature and draws if its power is 2 or less', () => {
    const g = game({
      p1: { hand: ['eagle-of-deliverance'], battlefield: [...n('plains', 6), 'savannah-lions'] },
    });
    const before = g.state.players.p1.hand.length;
    cast(g, 'eagle-of-deliverance');
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(lions).counters?.indestructible).toBe(1);
    expect(keywords(g, lions)).toContain('indestructible');
    // The Eagle left the hand, a card was drawn.
    expect(g.state.players.p1.hand.length).toBe(before);
  });
  it('does not draw if the creature has power 3 or more', () => {
    const g = game({
      p1: { hand: ['eagle-of-deliverance'], battlefield: [...n('plains', 6), 'serra-angel'] },
    });
    const before = g.state.players.p1.hand.length;
    cast(g, 'eagle-of-deliverance');
    done(g);
    expect(g.obj(g.id('p1', 'serra-angel')).counters?.indestructible).toBe(1);
    expect(g.state.players.p1.hand.length).toBe(before - 1);
  });
});

describe('East-Mark Cavalier', () => {
  const fight = (blocker: string, counters = 0) => {
    const g = game({
      p1: { battlefield: ['east-mark-cavalier'] },
      p2: { battlefield: [blocker] },
    });
    const b = g.id('p2', blocker);
    g.obj(b).plusOneCounters = counters;
    const cav = g.id('p1', 'east-mark-cavalier');
    attack(g, [cav]);
    toBlockers(g);
    g.block([b, cav]);
    g.passUntilStep('endCombat');
    return { g, b };
  };
  it('destroys a Goblin or Orc it deals damage to', () => {
    // A 5/5 Orc survives the 2 damage unless the Cavalier destroys it.
    const { g, b } = fight('ltr-orc-army-token', 5);
    expect(g.zoneOf(b)).toBe('graveyard');
  });
  it('does not destroy other creatures it damages', () => {
    const { g, b } = fight('serra-angel');
    expect(g.zoneOf(b)).toBe('battlefield');
  });
});

describe('Eastfarthing Farmer', () => {
  it('makes a Food, then a creature gets +1/+1 for each Food you control', () => {
    const g = game({
      p1: {
        hand: ['eastfarthing-farmer'],
        battlefield: [...n('plains', 3), 'food-token', 'savannah-lions'],
      },
    });
    cast(g, 'eastfarthing-farmer');
    const lions = g.id('p1', 'savannah-lions');
    for (
      let i = 0;
      i < 6 && g.state.stack.length + (g.decision.kind === 'chooseTriggerTargets' ? 1 : 0);
      i++
    ) {
      if (g.decision.kind === 'chooseTriggerTargets') settleOn(g, lions);
      else g.pass();
    }
    expect(tokensOf(g, 'food-token')).toHaveLength(2);
    expect(pt(g, lions)).toEqual([4, 3]);
  });
});

describe('Errand-Rider of Gondor', () => {
  it('draws, then puts a card from your hand on the bottom without a legendary creature', () => {
    const g = game({
      p1: { hand: ['errand-rider-of-gondor', 'giant-growth'], battlefield: n('plains', 3) },
    });
    cast(g, 'errand-rider-of-gondor');
    done(g, { option: /Giant Growth/ });
    expect(names(g, 'p1', 'hand')).toEqual(['forest']);
    expect(g.obj(g.state.players.p1.library.at(-1)!).defId).toBe('giant-growth');
  });
  it('just draws with a legendary creature', () => {
    const g = game({
      p1: {
        hand: ['errand-rider-of-gondor', 'giant-growth'],
        battlefield: [...n('plains', 3), 'faramir-field-commander'],
      },
    });
    cast(g, 'errand-rider-of-gondor');
    done(g);
    expect(names(g, 'p1', 'hand').sort()).toEqual(['forest', 'giant-growth']);
  });
});

describe('Escape from Orthanc', () => {
  it('gives +1/+3 and flying until end of turn and untaps the creature', () => {
    const g = game({
      p1: {
        hand: ['escape-from-orthanc'],
        battlefield: ['plains', { card: 'savannah-lions', tapped: true }],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'escape-from-orthanc', [obj(g, lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 4]);
    expect(keywords(g, lions)).toContain('flying');
    expect(g.obj(lions).tapped).toBe(false);
  });
});

describe('Esquire of the King', () => {
  const setup = (legendary: boolean, lands: number) =>
    game({
      p1: {
        battlefield: [
          'esquire-of-the-king',
          'savannah-lions',
          ...n('plains', lands),
          ...(legendary ? ['faramir-field-commander'] : []),
        ],
      },
    });
  it('pumps your creatures for {4}{W}', () => {
    const g = setup(false, 5);
    use(g, g.id('p1', 'esquire-of-the-king'), 0);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    expect(pt(g, g.id('p1', 'esquire-of-the-king'))).toEqual([2, 2]);
  });
  it('costs {2} less with a legendary creature', () => {
    expect(() => use(setup(false, 3), 'o1', 0)).toThrow();
    const g = setup(true, 3);
    use(g, g.id('p1', 'esquire-of-the-king'), 0);
    done(g);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    // Not three lands without the discount.
    const h = setup(false, 3);
    expect(
      h
        .legal()
        .some(
          (a) => a.type === 'activateAbility' && a.source === h.id('p1', 'esquire-of-the-king'),
        ),
    ).toBe(false);
  });
});

describe('Faramir, Field Commander', () => {
  it('draws at your end step if a creature died under your control this turn', () => {
    const g = game({
      p1: { battlefield: ['faramir-field-commander', 'savannah-lions'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    // The opponent kills the Lions in your main phase.
    g.pass();
    cast(g, 'lightning-strike', [obj(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(g.zoneOf(g.id('p1', 'savannah-lions', 'graveyard'))).toBe('graveyard');
    const before = g.state.players.p1.hand.length;
    toStep(g, 'end', 'p1');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before + 1);
  });
  it('does not draw if nothing died', () => {
    const g = game({ p1: { battlefield: ['faramir-field-commander'] } });
    const before = g.state.players.p1.hand.length;
    toStep(g, 'end', 'p1');
    done(g);
    expect(g.state.players.p1.hand.length).toBe(before);
  });
});
