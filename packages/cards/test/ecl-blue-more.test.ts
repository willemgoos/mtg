import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { ECL_BLUE } from '../src/ecl/blue.ts';
import { all, cast, game, n, pt } from './blb-helpers.ts';
import {
  activate,
  chars,
  hasType,
  nextTurn,
  toAttackers,
  combat,
  done,
  exile,
  gy,
  hand,
  keywords,
  minus,
  stun,
  tappedLands,
  targeting,
  toStep,
} from './ecl-blue-helpers.ts';

// Lorwyn Eclipsed 18b: the blue cards (second half).

describe("Aquitect's Defenses", () => {
  it('flash; gains hexproof until end of turn and gets +1/+2', () => {
    const g = game({
      p1: { hand: ['aquitects-defenses'], battlefield: [...n('island', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    expect(keywords(g, g.id('p1', 'aquitects-defenses', 'hand')).has('flash')).toBe(true);
    cast(g, 'aquitects-defenses', [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([3, 3]);
    expect(keywords(g, lions).has('hexproof')).toBe(true);
    // The hexproof lasts until end of turn only; the bonus stays.
    nextTurn(g);
    expect(keywords(g, lions).has('hexproof')).toBe(false);
    expect(pt(g, lions)).toEqual([3, 3]);
  });

  it('can only enchant a creature you control', () => {
    const g = game({
      p1: { hand: ['aquitects-defenses'], battlefield: n('island', 2) },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Lofty Dreams', () => {
  it('convoke; draws a card when it enters; enchanted creature gets +2/+2 and flying', () => {
    const g = game({
      p1: {
        hand: ['lofty-dreams'],
        battlefield: [...n('island', 3), 'savannah-lions', 'savannah-lions'],
        library: n('forest', 4),
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'lofty-dreams', [g.ref(lions)]);
    done(g);
    expect(hand(g)).toEqual(['forest']);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('flying')).toBe(true);
  });
});

describe('Champions of the Shoal', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['champions-of-the-shoal', 'pestered-wellguard'],
        battlefield: n('island', 4),
      },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
  const castExiling = (g: ReturnType<typeof setup>) => {
    const wellguard = g.id('p1', 'pestered-wellguard', 'hand');
    const action = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.card === g.id('p1', 'champions-of-the-shoal', 'hand') &&
          a.beholdCard === wellguard,
      );
    expect(action).toBeDefined();
    g.do(action!);
    return wellguard;
  };

  it('behold and exile a Merfolk from your hand; taps a creature and stuns it when it enters', () => {
    const g = setup();
    const angel = g.id('p2', 'serra-angel');
    const wellguard = castExiling(g);
    done(g, { pick: targeting(angel) });
    expect(g.zoneOf(wellguard)).toBe('exile');
    expect(exile(g)).toEqual(['pestered-wellguard']);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });

  it('is not castable without a Merfolk to behold', () => {
    const g = game({
      p1: { hand: ['champions-of-the-shoal'], battlefield: n('island', 4) },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('when it leaves the battlefield, the exiled card returns to its owner hand', () => {
    const g = setup();
    castExiling(g);
    done(g);
    const champions = g.id('p1', 'champions-of-the-shoal');
    g.obj(champions).damage = 6;
    g.pass();
    done(g);
    expect(gy(g)).toContain('champions-of-the-shoal');
    expect(hand(g)).toEqual(['pestered-wellguard']);
  });

  it('whenever it becomes tapped, taps up to one target creature and puts a stun counter on it', () => {
    const g = combat(['champions-of-the-shoal'], ['serra-angel']);
    const angel = g.id('p2', 'serra-angel');
    g.attack(g.id('p1', 'champions-of-the-shoal'));
    done(g, { pick: targeting(angel) });
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });
});

describe('Pestered Wellguard', () => {
  it('whenever it becomes tapped, creates a 1/1 blue and black Faerie token with flying', () => {
    const g = combat(['pestered-wellguard']);
    g.attack(g.id('p1', 'pestered-wellguard'));
    done(g);
    const faeries = all(g, 'ecl-faerie-token');
    expect(faeries).toHaveLength(1);
    expect(pt(g, faeries[0]!)).toEqual([1, 1]);
    expect(keywords(g, faeries[0]!).has('flying')).toBe(true);
    expect([...cardDb.get('ecl-faerie-token')!.colors].sort()).toEqual(['B', 'U']);
  });
});

describe('Silvergill Peddler', () => {
  it('whenever it becomes tapped, draw a card, then discard a card', () => {
    const g = combat(['silvergill-peddler'], [], n('forest', 5));
    g.attack(g.id('p1', 'silvergill-peddler'));
    done(g);
    expect(hand(g)).toHaveLength(0);
    expect(gy(g)).toEqual(['forest']);
  });
});

describe('Wanderwine Distracter', () => {
  it('whenever it becomes tapped, target creature an opponent controls gets -3/-0 until end of turn', () => {
    const g = combat(['wanderwine-distracter'], ['serra-angel']);
    const angel = g.id('p2', 'serra-angel');
    g.attack(g.id('p1', 'wanderwine-distracter'));
    done(g);
    expect(pt(g, angel)).toEqual([1, 4]);
  });
});

describe('Silvergill Mentor', () => {
  it('behold a Merfolk or pay {2}: paying makes a 1/1 white and blue Merfolk token', () => {
    const g = game({ p1: { hand: ['silvergill-mentor'], battlefield: n('island', 4) } });
    cast(g, 'silvergill-mentor');
    done(g);
    expect(tappedLands(g)).toBe(4);
    const merfolk = all(g, 'ecl-merfolk-token');
    expect(merfolk).toHaveLength(1);
    expect(pt(g, merfolk[0]!)).toEqual([1, 1]);
    expect(pt(g, g.id('p1', 'silvergill-mentor'))).toEqual([2, 1]);
  });

  it('beholding a Merfolk skips the {2}', () => {
    const g = game({
      p1: { hand: ['silvergill-mentor'], battlefield: [...n('island', 2), 'silvergill-peddler'] },
    });
    const peddler = g.id('p1', 'silvergill-peddler');
    cast(g, 'silvergill-mentor', [], { beheld: true, beholdCard: peddler });
    done(g);
    expect(tappedLands(g)).toBe(2);
    expect(g.obj(peddler).tapped).toBe(false);
    expect(all(g, 'ecl-merfolk-token')).toHaveLength(1);
  });

  it("can't be cast with only two lands and nothing to behold", () => {
    const g = game({ p1: { hand: ['silvergill-mentor'], battlefield: n('island', 2) } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Wanderwine Farewell', () => {
  it('returns one or two target nonland permanents, then makes a Merfolk for each if you control a Merfolk', () => {
    const g = game({
      p1: { hand: ['wanderwine-farewell'], battlefield: [...n('island', 7), 'silvergill-peddler'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions', 'plains'] },
    });
    cast(g, 'wanderwine-farewell', [
      g.ref(g.id('p2', 'serra-angel')),
      g.ref(g.id('p2', 'savannah-lions')),
    ]);
    done(g);
    expect(hand(g, 'p2').sort()).toEqual(['savannah-lions', 'serra-angel']);
    expect(all(g, 'ecl-merfolk-token')).toHaveLength(2);
  });

  it('a Merfolk returned by it does not count: no tokens', () => {
    const g = game({
      p1: { hand: ['wanderwine-farewell'], battlefield: [...n('island', 7), 'silvergill-peddler'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'wanderwine-farewell', [g.ref(g.id('p1', 'silvergill-peddler'))]);
    done(g);
    expect(hand(g)).toEqual(['silvergill-peddler']);
    expect(all(g, 'ecl-merfolk-token')).toHaveLength(0);
  });

  it('one target is enough', () => {
    const g = game({
      p1: { hand: ['wanderwine-farewell'], battlefield: [...n('island', 7), 'silvergill-peddler'] },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'wanderwine-farewell', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(all(g, 'ecl-merfolk-token')).toHaveLength(1);
  });
});

describe('Stratosoarer', () => {
  it('when it enters, target creature gains flying until end of turn', () => {
    const g = game({
      p1: { hand: ['stratosoarer'], battlefield: [...n('island', 5), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'stratosoarer');
    done(g, { pick: targeting(lions) });
    expect(keywords(g, lions).has('flying')).toBe(true);
    expect(keywords(g, g.id('p1', 'stratosoarer')).has('flying')).toBe(true);
  });

  it('basic landcycling {1}{U}', () => {
    const g = game({
      p1: {
        hand: ['stratosoarer'],
        battlefield: n('island', 2),
        library: ['forest', 'serra-angel'],
      },
    });
    const so = g.id('p1', 'stratosoarer', 'hand');
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === so)!);
    done(g);
    expect(gy(g)).toEqual(['stratosoarer']);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Summit Sentinel', () => {
  it('when it dies, draw a card', () => {
    const g = game({ p1: { battlefield: ['summit-sentinel'], library: n('forest', 3) } });
    g.obj(g.id('p1', 'summit-sentinel')).damage = 3;
    g.pass();
    done(g);
    expect(gy(g)).toContain('summit-sentinel');
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Unwelcome Sprite', () => {
  it('surveils 2 when you cast a spell during an opponent turn', () => {
    const g = game({
      active: 'p2',
      p1: {
        hand: ['shock'],
        battlefield: ['unwelcome-sprite', 'mountain'],
        library: ['island', 'plains', 'forest'],
      },
    });
    g.pass();
    cast(g, 'shock', [{ player: 'p2' }]);
    // The surveil trigger is above Shock; look at the top two cards and put both into the graveyard.
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('scry');
    const both = g.legal().find((a) => a.type === 'scry' && a.bottom.length === 2)!;
    g.do(both);
    done(g);
    expect(gy(g).sort()).toEqual(['island', 'plains', 'shock']);
  });

  it('does nothing on your own turn', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['unwelcome-sprite', 'mountain'],
        library: ['island', 'plains', 'forest'],
      },
    });
    cast(g, 'shock', [{ player: 'p2' }]);
    g.pass();
    g.pass();
    expect(g.decision.kind).not.toBe('scry');
  });
});

describe('Flitterwing Nuisance', () => {
  it('flying 2/2 that enters with a -1/-1 counter', () => {
    const g = game({ p1: { hand: ['flitterwing-nuisance'], battlefield: ['island'] } });
    cast(g, 'flitterwing-nuisance');
    done(g);
    const f = g.id('p1', 'flitterwing-nuisance');
    expect(minus(g, f)).toBe(1);
    expect(pt(g, f)).toEqual([1, 1]);
    expect(keywords(g, f).has('flying')).toBe(true);
  });

  const prepared = (p1: string[], p2: string[] = []) => {
    const g = game({ p1: { battlefield: p1, library: n('forest', 6) }, p2: { battlefield: p2 } });
    const f = g.id('p1', 'flitterwing-nuisance');
    g.obj(f).counters = { '-1/-1': 1 };
    activate(g, f, 0);
    done(g);
    expect(minus(g, f)).toBe(0);
    return toAttackers(g);
  };

  it('{2}{U}, remove a counter: this turn, whenever a creature you control deals combat damage to a player, draw a card', () => {
    const g = prepared([
      'flitterwing-nuisance',
      'savannah-lions',
      'savannah-lions',
      ...n('island', 3),
    ]);
    g.attack(...all(g, 'savannah-lions'));
    toStep(g, 'endCombat');
    // Two creatures dealt combat damage to the player: two cards.
    expect(g.life('p2')).toBe(16);
    expect(hand(g)).toHaveLength(2);
  });

  it('does not draw for damage to a creature', () => {
    const g = prepared(
      ['flitterwing-nuisance', 'savannah-lions', ...n('island', 3)],
      ['serra-angel'],
    );
    g.attack(g.id('p1', 'savannah-lions'));
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    g.block([g.id('p2', 'serra-angel'), g.id('p1', 'savannah-lions')]);
    toStep(g, 'endCombat');
    expect(hand(g)).toHaveLength(0);
  });

  it('only lasts this turn', () => {
    const g = prepared(['flitterwing-nuisance', 'savannah-lions', ...n('island', 3)]);
    toStep(g, 'main2');
    nextTurn(g);
    nextTurn(g);
    // p1's next turn: attack with the Lions, no draw trigger any more.
    toAttackers(g);
    g.attack(g.id('p1', 'savannah-lions'));
    toStep(g, 'endCombat');
    expect(hand(g)).toHaveLength(1); // only the turn's regular draw
  });
});

describe('Loch Mare', () => {
  it('enters with three -1/-1 counters (a 1/2)', () => {
    const g = game({ p1: { hand: ['loch-mare'], battlefield: n('island', 2) } });
    cast(g, 'loch-mare');
    done(g);
    const m = g.id('p1', 'loch-mare');
    expect(minus(g, m)).toBe(3);
    expect(pt(g, m)).toEqual([1, 2]);
  });

  it('{1}{U}, remove a counter: draw a card', () => {
    const g = game({
      p1: { battlefield: ['loch-mare', ...n('island', 2)], library: n('forest', 3) },
    });
    const m = g.id('p1', 'loch-mare');
    g.obj(m).counters = { '-1/-1': 3 };
    activate(g, m, 0);
    done(g);
    expect(minus(g, m)).toBe(2);
    expect(hand(g)).toEqual(['forest']);
  });

  it('{2}{U}, remove two counters: tap target creature and put a stun counter on it', () => {
    const g = game({
      p1: { battlefield: ['loch-mare', ...n('island', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const m = g.id('p1', 'loch-mare');
    const angel = g.id('p2', 'serra-angel');
    g.obj(m).counters = { '-1/-1': 3 };
    activate(g, m, 1, [g.ref(angel)]);
    done(g);
    expect(minus(g, m)).toBe(1);
    expect(g.obj(angel).tapped).toBe(true);
    expect(stun(g, angel)).toBe(1);
  });

  it('cannot pay for two counters with only one left', () => {
    const g = game({
      p1: { battlefield: ['loch-mare', ...n('island', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const m = g.id('p1', 'loch-mare');
    g.obj(m).counters = { '-1/-1': 1 };
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === m && a.abilityIndex === 1),
    ).toBe(false);
  });
});

describe('Rime Chill', () => {
  it('taps up to two target creatures, puts a stun counter on each, draws a card; costs {1} less per color', () => {
    const g = game({
      p1: {
        hand: ['rime-chill'],
        // Savannah Lions (white) and Llanowar Elves (green): two colors, so {4}{U} (five lands).
        battlefield: [...n('island', 5), 'savannah-lions', 'llanowar-elves'],
        library: n('forest', 3),
      },
      p2: { battlefield: ['serra-angel', 'vampire-nighthawk'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const nighthawk = g.id('p2', 'vampire-nighthawk');
    cast(g, 'rime-chill', [g.ref(angel), g.ref(nighthawk)]);
    done(g);
    expect(tappedLands(g)).toBe(5);
    for (const id of [angel, nighthawk]) {
      expect(g.obj(id).tapped).toBe(true);
      expect(stun(g, id)).toBe(1);
    }
    expect(hand(g)).toEqual(['forest']);
  });

  it('one target, or none, is fine', () => {
    const g = game({
      p1: {
        hand: ['rime-chill'],
        battlefield: [...n('island', 6), 'savannah-lions'],
        library: n('forest', 3),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'rime-chill', [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(stun(g, g.id('p2', 'serra-angel'))).toBe(1);
    expect(hand(g)).toEqual(['forest']);
  });

  it('full price {6}{U} with no colors... only blue lands give no colored permanents', () => {
    const g = game({ p1: { hand: ['rime-chill'], battlefield: n('island', 6) } });
    // Lands are colorless: no vivid reduction, 7 mana needed.
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('Glamermite', () => {
  it('flash flying; the mode taps or untaps a target creature', () => {
    const g = game({
      p1: { hand: ['glamermite', 'glamermite'], battlefield: n('island', 6) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }, 'savannah-lions'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    const mite = g.id('p1', 'glamermite', 'hand');
    expect(keywords(g, mite).has('flash')).toBe(true);
    cast(g, 'glamermite');
    done(g, {
      pick: (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseTargets' && a.mode === 0 && JSON.stringify(a.targets).includes(lions),
        ),
    });
    expect(g.obj(lions).tapped).toBe(true);
    cast(g, 'glamermite');
    done(g, {
      pick: (legal) =>
        legal.find(
          (a) =>
            a.type === 'chooseTargets' && a.mode === 1 && JSON.stringify(a.targets).includes(angel),
        ),
    });
    expect(g.obj(angel).tapped).toBe(false);
  });
});

describe('Rimekin Recluse', () => {
  it('when it enters, returns up to one other target creature to its owner hand', () => {
    const g = game({
      p1: { hand: ['rimekin-recluse'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'rimekin-recluse');
    done(g);
    expect(hand(g, 'p2')).toEqual(['serra-angel']);
    expect(all(g, 'rimekin-recluse')).toHaveLength(1);
  });

  it("can't return itself (other); with no other creature it just enters", () => {
    const g = game({ p1: { hand: ['rimekin-recluse'], battlefield: n('island', 3) } });
    cast(g, 'rimekin-recluse');
    done(g);
    expect(all(g, 'rimekin-recluse')).toHaveLength(1);
    expect(hand(g)).toEqual([]);
  });
});

describe('Glamer Gifter', () => {
  it('another creature has base power and toughness 4/4 and all creature types until end of turn', () => {
    const g = game({
      p1: { hand: ['glamer-gifter'], battlefield: [...n('island', 2), 'savannah-lions'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'glamer-gifter');
    done(g, { pick: targeting(lions) });
    expect(pt(g, lions)).toEqual([4, 4]);
    // All creature types: now a Merfolk, a Faerie, ...
    for (const t of ['Merfolk', 'Faerie', 'Elemental', 'Goblin'])
      expect(hasType(g, lions, t), t).toBe(true);
    expect(hasType(g, g.id('p1', 'glamer-gifter'), 'Merfolk')).toBe(false);
    // Until end of turn.
    nextTurn(g);
    expect(pt(g, lions)).toEqual([2, 1]);
    expect(hasType(g, lions, 'Merfolk')).toBe(false);
  });
});

describe('Illusion Spinners', () => {
  it('has hexproof only while untapped', () => {
    const g = game({ p1: { battlefield: ['illusion-spinners'] } });
    const s = g.id('p1', 'illusion-spinners');
    expect(keywords(g, s).has('hexproof')).toBe(true);
    g.obj(s).tapped = true;
    expect(keywords(g, s).has('hexproof')).toBe(false);
  });

  it('can be cast at instant speed only if you control a Faerie', () => {
    const noFaerie = game({
      active: 'p2',
      p1: { hand: ['illusion-spinners'], battlefield: n('island', 5) },
    });
    noFaerie.pass();
    expect(noFaerie.legal('p1').some((a) => a.type === 'castSpell')).toBe(false);
    const faerie = game({
      active: 'p2',
      p1: { hand: ['illusion-spinners'], battlefield: [...n('island', 5), 'glamermite'] },
    });
    faerie.pass();
    expect(faerie.legal('p1').some((a) => a.type === 'castSpell')).toBe(true);
  });

  it('is cast at sorcery speed without a Faerie on your own turn', () => {
    const g = game({ p1: { hand: ['illusion-spinners'], battlefield: n('island', 5) } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
  });
});

describe('Sunderflock', () => {
  it('costs {X} less, X the greatest mana value among Elementals you control', () => {
    const g = game({
      p1: { hand: ['sunderflock'], battlefield: [...n('island', 4), 'stratosoarer'] },
    });
    // {7}{U}{U} less 5 (Stratosoarer is MV 5): {2}{U}{U}.
    cast(g, 'sunderflock');
    done(g);
    expect(all(g, 'sunderflock')).toHaveLength(1);
    expect(tappedLands(g)).toBe(4);
  });

  it('is too expensive without an Elemental', () => {
    const g = game({ p1: { hand: ['sunderflock'], battlefield: n('island', 8) } });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('when cast, returns all non-Elemental creatures to their owners hands', () => {
    const g = game({
      p1: {
        hand: ['sunderflock'],
        battlefield: [...n('island', 4), 'stratosoarer', 'savannah-lions', 'changeling-outcast'],
      },
      p2: { battlefield: ['serra-angel', 'summit-sentinel'] },
    });
    cast(g, 'sunderflock');
    done(g);
    expect(hand(g, 'p1')).toEqual(['savannah-lions']);
    expect(hand(g, 'p2').sort()).toEqual(['serra-angel']);
    // Elementals stay: Stratosoarer, Summit Sentinel (Elemental Soldier), and the changeling.
    expect(all(g, 'stratosoarer')).toHaveLength(1);
    expect(all(g, 'summit-sentinel')).toHaveLength(1);
    expect(all(g, 'changeling-outcast')).toHaveLength(1);
    expect(all(g, 'sunderflock')).toHaveLength(1);
  });
});

describe('Omni-Changeling', () => {
  it('enters as a copy of any creature on the battlefield, except it has changeling', () => {
    const g = game({
      p1: { hand: ['omni-changeling'], battlefield: n('island', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const options = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'omni-changeling', 'hand'));
    const copy = options.find(
      (a) => a.type === 'castSpell' && a.copyOf === g.id('p2', 'serra-angel'),
    );
    expect(copy).toBeDefined();
    g.do(copy!);
    done(g);
    const mine = g.state.battlefield.find(
      (id) => g.obj(id).controller === 'p1' && chars(g, id).power === 4,
    )!;
    expect(mine).toBeDefined();
    expect(keywords(g, mine).has('flying')).toBe(true);
    expect(keywords(g, mine).has('changeling')).toBe(true);
    // It has every creature type.
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(2);
  });

  it('may also just enter as itself: a 0/0 that dies', () => {
    const g = game({ p1: { hand: ['omni-changeling'], battlefield: n('island', 5) } });
    cast(g, 'omni-changeling');
    done(g);
    expect(gy(g)).toEqual(['omni-changeling']);
  });

  it('convoke: creatures can pay', () => {
    const g = game({
      p1: {
        hand: ['omni-changeling'],
        battlefield: [...n('island', 2), 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const action = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.copyOf === g.id('p2', 'serra-angel'));
    expect(action).toBeDefined();
  });
});

describe('Thirst for Identity', () => {
  it('draws three, then discards a creature card or two cards', () => {
    const g = game({
      p1: {
        hand: ['thirst-for-identity'],
        battlefield: n('island', 3),
        library: ['savannah-lions', 'forest', 'island', 'plains'],
      },
    });
    cast(g, 'thirst-for-identity');
    done(g, { option: /Discard Savannah Lions/ });
    expect(hand(g).sort()).toEqual(['forest', 'island']);
    expect(gy(g)).toContain('savannah-lions');
  });

  it('or discard two cards', () => {
    const g = game({
      p1: {
        hand: ['thirst-for-identity'],
        battlefield: n('island', 3),
        library: ['savannah-lions', 'forest', 'island', 'plains'],
      },
    });
    cast(g, 'thirst-for-identity');
    done(g, { option: /Discard two cards/ });
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(3);
  });

  it('no creature card: just discard two cards', () => {
    const g = game({
      p1: {
        hand: ['thirst-for-identity'],
        battlefield: n('island', 3),
        library: ['forest', 'island', 'plains', 'swamp'],
      },
    });
    cast(g, 'thirst-for-identity');
    expect(g.decision.kind).toBe('priority');
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('discard');
    done(g);
    expect(hand(g)).toHaveLength(1);
    expect(gy(g)).toHaveLength(3);
  });
});

describe('Harmonized Crescendo with no permanents of the type', () => {
  it('draws nothing', () => {
    const g = game({
      p1: {
        hand: ['harmonized-crescendo'],
        battlefield: [...n('island', 6), 'savannah-lions'],
        library: n('forest', 3),
      },
    });
    cast(g, 'harmonized-crescendo');
    done(g, { option: /^Faerie$/ });
    expect(hand(g)).toEqual([]);
  });
});

describe('Rimefire Torque', () => {
  it('choose a creature type; a permanent you control of that type entering puts a charge counter on it', () => {
    const g = game({
      p1: {
        hand: ['rimefire-torque', 'savannah-lions', 'pestered-wellguard'],
        battlefield: [...n('island', 6), ...n('plains', 2)],
      },
    });
    const torque = () => g.id('p1', 'rimefire-torque');
    cast(g, 'rimefire-torque');
    done(g, { option: /^Cat$/ });
    expect(g.obj(torque()).chosenType).toBe('Cat');
    cast(g, 'savannah-lions');
    done(g);
    expect(g.obj(torque()).counters?.charge).toBe(1);
    // A Merfolk is not a Cat.
    cast(g, 'pestered-wellguard');
    done(g);
    expect(g.obj(torque()).counters?.charge).toBe(1);
  });

  it('{T}, remove three charge counters: the next instant or sorcery spell you cast this turn is copied', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['rimefire-torque', 'mountain'],
      },
      p2: { battlefield: ['savannah-lions', 'serra-angel'], life: 20 },
    });
    const torque = g.id('p1', 'rimefire-torque');
    g.obj(torque).counters = { charge: 3 };
    activate(g, torque, 2);
    done(g);
    expect(g.obj(torque).tapped).toBe(true);
    expect(g.obj(torque).counters?.charge ?? 0).toBe(0);
    cast(g, 'shock', [{ player: 'p2' }]);
    // The copy asks for new targets (it may keep them): keep the same player.
    done(g);
    expect(g.life('p2')).toBe(16);
  });

  it('cannot be activated with fewer than three counters', () => {
    const g = game({ p1: { battlefield: ['rimefire-torque'] } });
    g.obj(g.id('p1', 'rimefire-torque')).counters = { charge: 2 };
    expect(g.legal().some((a) => a.type === 'activateAbility')).toBe(false);
  });
});

describe('random games with the blue cards', () => {
  it('plays short random games without errors', () => {
    const engine = createEngine(cardDb);
    const blue = Object.keys(ECL_BLUE).map(slug);
    expect(blue).toHaveLength(37);
    // A few plain creatures give the bots something to attack with, so the cards matter.
    const ids = [...blue, ...n('island', 18), ...n('savannah-lions', 5)];
    const decks = { p1: ids, p2: ids };
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.final.decision.kind === 'gameOver' || r.truncated, `seed ${seed}`).toBe(true);
    }
  });
});
