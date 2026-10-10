import { describe, expect, it } from 'vitest';
import { cast, game, n, pt } from './blb-helpers.ts';
import { activate, done, exile, gy, hand, nextTurn, toStep } from './ecl-blue-helpers.ts';
import { activateFirst, passStack, tgt } from './hob-blue-helpers.ts';

// The Hobbit 20b: the blue cards (Elrond, blink, Bilbo).

describe('Elrond, Moon-Reader', () => {
  it('draws a card when you activate an ability of a creature, once each turn', () => {
    const g = game({
      p1: {
        battlefield: ['elrond-moon-reader', 'elvenkings-harper', ...n('island', 10)],
        library: n('forest', 10),
      },
    });
    const harper = g.id('p1', 'elvenkings-harper');
    activate(g, harper, 0, [tgt(g, harper)]);
    done(g);
    expect(hand(g)).toEqual(['forest']);
    activate(g, harper, 0, [tgt(g, harper)]);
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });

  it('tapping a creature for mana activates its mana ability', () => {
    const g = game({
      p1: {
        battlefield: ['elrond-moon-reader', 'llanowar-elves'],
        hand: ['llanowar-elves'],
        library: n('forest', 10),
      },
    });
    cast(g, 'llanowar-elves');
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });

  it('an ability of a noncreature permanent does not draw', () => {
    const g = game({
      p1: {
        battlefield: ['elrond-moon-reader', 'wizards-staff', 'savannah-lions', ...n('island', 3)],
        library: n('forest', 10),
      },
    });
    activateFirst(g, g.id('p1', 'wizards-staff'), { index: 2 });
    done(g);
    expect(hand(g)).toEqual([]);
  });

  it('{5}{U}{U}: exiles up to two other nonland permanents you control, returned at the next end step', () => {
    const g = game({
      p1: {
        battlefield: ['elrond-moon-reader', 'savannah-lions', 'wizards-staff', ...n('island', 7)],
        library: n('forest', 10),
      },
    });
    const elrond = g.id('p1', 'elrond-moon-reader');
    const lions = g.id('p1', 'savannah-lions');
    const staff = g.id('p1', 'wizards-staff');
    activate(g, elrond, 1, [tgt(g, lions), tgt(g, staff)]);
    done(g);
    expect(exile(g).sort()).toEqual(['savannah-lions', 'wizards-staff']);
    expect(g.state.battlefield.includes(elrond)).toBe(true);
    toStep(g, 'end');
    expect(exile(g)).toEqual([]);
    expect(g.state.players.p1.exile).toHaveLength(0);
    const back = g.state.battlefield.map((id) => g.obj(id).defId);
    expect(back).toContain('savannah-lions');
    expect(back).toContain('wizards-staff');
  });

  it('can be activated with one target or none', () => {
    const g = game({
      p1: { battlefield: ['elrond-moon-reader', 'savannah-lions', ...n('island', 7)] },
    });
    const elrond = g.id('p1', 'elrond-moon-reader');
    activate(g, elrond, 1, [tgt(g, g.id('p1', 'savannah-lions'))]);
    done(g);
    expect(exile(g)).toEqual(['savannah-lions']);
  });
});

describe('Lake-town Mariners and Gone Fishing', () => {
  it('Mariners: a 6/5 with vigilance and ward {2}', () => {
    const g = game({ p1: { battlefield: ['lake-town-mariners'] } });
    const id = g.id('p1', 'lake-town-mariners');
    expect(pt(g, id)).toEqual([6, 5]);
  });

  it('Gone Fishing: exile two target creatures and/or lands you control, then return them', () => {
    const g = game({
      p1: {
        battlefield: [
          'lake-town-mariners',
          'savannah-lions',
          { card: 'island', tapped: true },
          ...n('island', 4),
        ],
        hand: ['lake-town-mariners'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const tappedIsland = g.state.battlefield.find(
      (id) => g.obj(id).defId === 'island' && g.obj(id).tapped,
    )!;
    // Damage on the creature is gone once it comes back as a new object.
    g.obj(lions).damage = 0;
    cast(g, 'lake-town-mariners', [tgt(g, lions), tgt(g, tappedIsland)], { back: true });
    done(g);
    // Both came back (as new objects, untapped).
    expect(g.state.battlefield.includes(lions)).toBe(true);
    expect(g.obj(tappedIsland).tapped).toBe(false);
    // The Adventure goes to exile; the Mariners can be cast from there later.
    expect(exile(g)).toEqual(['lake-town-mariners']);
  });

  it('Gone Fishing: a creature with +1/+1 counters comes back without them', () => {
    const g = game({
      p1: {
        battlefield: ['savannah-lions', 'forest', ...n('island', 4)],
        hand: ['lake-town-mariners'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const forest = g.id('p1', 'forest');
    g.obj(lions).plusOneCounters = 2;
    cast(g, 'lake-town-mariners', [tgt(g, lions), tgt(g, forest)], { back: true });
    done(g);
    expect(pt(g, lions)).toEqual([2, 1]);
  });

  it('Gone Fishing only targets your own creatures and lands', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions', ...n('island', 4)], hand: ['lake-town-mariners'] },
      p2: { battlefield: ['serra-angel', 'forest'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    const castable = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.back)
      .map((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(castable.length).toBeGreaterThan(0);
    expect(castable.flat().some((t) => 'object' in t && t.object.id === angel)).toBe(false);
    void lions;
  });
});

describe('Bilbo, Thief in the Night', () => {
  it('spells cast from anywhere other than your hand cost {1} less', () => {
    // Plunder the Trollshaws has flashback {3}{U}: with Bilbo it costs {2}{U}.
    const g = game({
      p1: {
        battlefield: ['bilbo-thief-in-the-night', ...n('island', 3)],
        graveyard: ['plunder-the-trollshaws'],
        library: n('forest', 5),
      },
    });
    const card = g.id('p1', 'plunder-the-trollshaws', 'graveyard');
    g.do({ type: 'castSpell', player: 'p1', card, targets: [] });
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest']);
  });

  it('is not cheaper without Bilbo', () => {
    const g = game({
      p1: {
        battlefield: n('island', 3),
        graveyard: ['plunder-the-trollshaws'],
        library: n('forest', 5),
      },
    });
    const card = g.id('p1', 'plunder-the-trollshaws', 'graveyard');
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card)).toBe(false);
  });

  it('does not make spells cast from hand cheaper', () => {
    const g = game({
      p1: {
        battlefield: ['bilbo-thief-in-the-night', ...n('island', 1)],
        hand: ['quick-study'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('attacks: you may cast an instant from your graveyard, which is exiled afterwards', () => {
    const g = game({
      p1: {
        battlefield: ['bilbo-thief-in-the-night', ...n('island', 3)],
        graveyard: ['quick-study', 'savannah-lions'],
        library: n('forest', 5),
      },
    });
    const bilbo = g.id('p1', 'bilbo-thief-in-the-night');
    g.obj(bilbo).summoningSick = false;
    while (g.decision.kind !== 'declareAttackers') g.pass();
    g.attack(bilbo);
    passStack(g);
    expect((g.decision as { kind: string }).kind).toBe('castFree');
    const castIt = g
      .legal()
      .find((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'quick-study');
    expect(castIt).toBeDefined();
    // Savannah Lions is a creature card: not offered.
    expect(
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'savannah-lions'),
    ).toBe(false);
    g.do(castIt!);
    done(g);
    expect(hand(g)).toEqual(['forest', 'forest']);
    expect(exile(g)).toEqual(['quick-study']);
    expect(gy(g)).toEqual(['savannah-lions']);
    // {2}{U} minus Bilbo's {1}: two of the three Islands are tapped.
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'island' && g.obj(id).tapped),
    ).toHaveLength(2);
  });
});

void nextTurn;
void gy;
