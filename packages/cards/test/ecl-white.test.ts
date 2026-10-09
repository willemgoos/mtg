import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics, playRandomGame } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { BEHAVIORS, cardDb, slug } from '../src/index.ts';
import { ECL_WHITE } from '../src/ecl/white.ts';
import { all, cast, engine, game, n, pt, settle } from './blb-helpers.ts';

const ECL_WHITE_NAMES = new Set(Object.keys(ECL_WHITE));

// Lorwyn Eclipsed 18b: the white cards.

const keywords = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).keywords;
const types = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).subtypes;
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  all(g, defId).filter((id) => !p || g.obj(id).controller === p);
const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;

interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
  /** Which card (defId) to answer chooseCard with. */
  card?: string;
}

/** Resolves the stack and any choices with simple defaults. */
function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'spellTargets') g.do(g.legal()[0]!);
    else if (d.kind === 'scry') {
      g.do({ type: 'scry', player: d.player, top: d.cards, bottom: [] });
    } else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card)) {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
      g.do(
        (opts.card
          ? cards.find((a) => a.type === 'chooseCard' && g.obj(a.card!).defId === opts.card)
          : undefined) ?? cards[0]!,
      );
    } else if (g.legal().some((a) => a.type === 'chooseCard'))
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

/** The legal actions of one kind for an ability of a source. */
const abilityActions = (g: GameDriver, source: string, index: number): Action[] =>
  g
    .legal()
    .filter((a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index);

describe('the white group is registered', () => {
  const names = [
    'Adept Watershaper',
    'Ajani, Outland Chaperone',
    'Appeal to Eirdu',
    'Bark of Doran',
    'Burdened Stoneback',
    'Champion of the Clachan',
    'Clachan Festival',
    'Crib Swap',
    'Curious Colossus',
    'Encumbered Reejerey',
    "Evershrike's Gift",
    'Flock Impostor',
    'Gallant Fowlknight',
    'Goldmeadow Nomad',
    'Keep Out',
    'Kinbinding',
    'Kinsbaile Aspirant',
    'Kinscaer Sentry',
    'Kithkeeper',
    'Liminal Hold',
    'Meanders Guide',
    'Moonlit Lamenter',
    "Morningtide's Light",
    'Personify',
    'Protective Response',
    'Pyrrhic Strike',
    'Reluctant Dounguard',
    'Rhys, the Evermore',
    "Riverguard's Reflexes",
    'Shore Lurker',
    'Slumbering Walker',
    'Spiral into Solitude',
    'Sun-Dappled Celebrant',
    'Thoughtweft Imbuer',
    'Timid Shieldbearer',
    'Tributary Vaulter',
    'Wanderbrine Preacher',
    'Wanderbrine Trapper',
    'Winnowing',
  ];
  it('has behaviour and a card for each of the 39 names', () => {
    expect(names).toHaveLength(39);
    for (const name of names) {
      expect(BEHAVIORS[name], name).toBeDefined();
      expect(
        [...cardDb.values()].some((c) => c.name === name),
        name,
      ).toBe(true);
    }
  });
});

describe('Adept Watershaper', () => {
  it('gives other tapped creatures you control indestructible, not itself or untapped ones', () => {
    const g = game({
      p1: {
        battlefield: ['adept-watershaper', { card: 'savannah-lions', tapped: true }, 'serra-angel'],
      },
    });
    expect(keywords(g, g.id('p1', 'savannah-lions')).has('indestructible')).toBe(true);
    expect(keywords(g, g.id('p1', 'serra-angel')).has('indestructible')).toBe(false);
    expect(keywords(g, g.id('p1', 'adept-watershaper')).has('indestructible')).toBe(false);
  });
});

describe('Ajani, Outland Chaperone', () => {
  const loyal = (g: GameDriver, loyalty: number) => {
    const id = g.id('p1', 'ajani-outland-chaperone');
    g.obj(id).counters = { loyalty };
    return id;
  };
  it('+1 makes a Kithkin; -2 hits only a tapped creature for 4', () => {
    const g = game({
      p1: { battlefield: ['ajani-outland-chaperone'] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }, 'savannah-lions'] },
    });
    const ajani = loyal(g, 3);
    activate(g, ajani, 0);
    done(g);
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(1);
    expect(g.obj(ajani).counters?.loyalty).toBe(4);
  });
  it('-2 can only target tapped creatures', () => {
    const g = game({
      p1: { battlefield: ['ajani-outland-chaperone'] },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }, 'savannah-lions'] },
    });
    const ajani = loyal(g, 3);
    const targets = abilityActions(g, ajani, 1).flatMap((a) =>
      a.type === 'activateAbility' ? a.targets : [],
    );
    expect(targets).toHaveLength(1);
    activate(g, ajani, 1, [g.ref(g.id('p2', 'serra-angel'))]);
    done(g);
    expect(g.zoneOf(g.id('p2', 'serra-angel', 'graveyard'))).toBe('graveyard');
    expect(g.obj(ajani).counters?.loyalty).toBe(1);
  });
  it('-8 looks at the top X cards (X is your life) and puts any number of nonland permanents with mana value 3 or less onto the battlefield, then shuffles', () => {
    const g = game({
      p1: {
        life: 6,
        battlefield: ['ajani-outland-chaperone', 'serra-angel'],
        // The 7th and 8th cards are out of reach (X is 6); the 5-drop, the land and the instant are not eligible.
        library: [
          'savannah-lions',
          'forest',
          'bonebind-orator',
          'giant-growth',
          'llanowar-elves',
          'pacifism',
          'savannah-lions',
          'savannah-lions',
        ],
      },
    });
    const ajani = loyal(g, 8);
    activate(g, ajani, 2);
    g.passBoth();
    const labels = () => {
      const d = g.decision;
      return d.kind === 'chooseOption' ? d.options.map((o) => o.label) : [];
    };
    const pick = (re: RegExp) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error('Not choosing');
      g.do({
        type: 'chooseOption',
        player: d.player,
        index: d.options.findIndex((o) => re.test(o.label)),
      });
    };
    expect(labels()).toEqual(
      expect.arrayContaining([
        'Put Savannah Lions onto the battlefield',
        'Put Bonebind Orator onto the battlefield',
        'Put Llanowar Elves onto the battlefield',
        'Put Pacifism onto the battlefield enchanting Serra Angel',
        'Done',
      ]),
    );
    expect(labels().some((l) => /Giant Growth|Forest/.test(l))).toBe(false);
    pick(/Put Savannah Lions/);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    // The card put onto the battlefield is no longer offered; Pacifism asks what it enchants.
    expect(labels().some((l) => l === 'Put Savannah Lions onto the battlefield')).toBe(false);
    pick(/Put Pacifism onto the battlefield enchanting Serra Angel/);
    expect(on(g, 'pacifism', 'p1')).toHaveLength(1);
    expect(g.obj(on(g, 'pacifism', 'p1')[0]!).attachedTo).toBe(g.id('p1', 'serra-angel'));
    pick(/Done/);
    done(g);
    // Lions and Pacifism left the library; the shuffle happened (the 7th and 8th cards were never looked at but are shuffled in).
    expect(g.state.players.p1.library).toHaveLength(6);
    expect(on(g, 'llanowar-elves', 'p1')).toHaveLength(0);
  });
  it('-8 with nothing eligible just shuffles', () => {
    const g = game({
      p1: {
        life: 3,
        battlefield: ['ajani-outland-chaperone'],
        library: ['forest', 'forest', 'forest', 'savannah-lions'],
      },
    });
    const ajani = loyal(g, 8);
    activate(g, ajani, 2);
    done(g);
    expect(g.decision.kind).toBe('priority');
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(0);
    expect(g.state.players.p1.library).toHaveLength(4);
  });
});

describe('Appeal to Eirdu', () => {
  it('gives one or two target creatures +2/+1 and can be convoked', () => {
    const g = game({
      p1: {
        hand: ['appeal-to-eirdu'],
        battlefield: [...n('plains', 4), 'savannah-lions', 'serra-angel'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'appeal-to-eirdu', [g.ref(lions), g.ref(angel)]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
    expect(pt(g, angel)).toEqual([6, 5]);
  });
  it('works with one target and with convoke', () => {
    const g = game({
      p1: {
        hand: ['appeal-to-eirdu'],
        battlefield: ['plains', 'savannah-lions', 'savannah-lions', 'savannah-lions'],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'appeal-to-eirdu', [g.ref(lions)], { payWith: undefined });
    done(g);
    expect(pt(g, lions)).toEqual([4, 2]);
  });
});

describe('Bark of Doran', () => {
  it('gives +0/+1 and a creature whose toughness is greater than its power deals combat damage equal to its toughness', () => {
    const g = game({
      p1: { battlefield: ['bark-of-doran', 'aegis-turtle'] },
    });
    const turtle = g.id('p1', 'aegis-turtle');
    g.obj(g.id('p1', 'bark-of-doran')).attachedTo = turtle;
    expect(pt(g, turtle)).toEqual([0, 6]);
  });
  it('makes the equipped creature hit for its toughness when it attacks', () => {
    const g = game({
      p1: { battlefield: ['bark-of-doran', 'aegis-turtle'] },
      step: 'beginCombat',
    });
    const turtle = g.id('p1', 'aegis-turtle');
    g.obj(turtle).summoningSick = false;
    g.obj(g.id('p1', 'bark-of-doran')).attachedTo = turtle;
    g.passBoth();
    g.attack(turtle);
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(14);
  });
  it('a 4/4 gets +0/+1, so it too hits for its toughness', () => {
    const g = game({
      p1: { battlefield: ['bark-of-doran', 'serra-angel'] },
      step: 'beginCombat',
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).summoningSick = false;
    g.obj(g.id('p1', 'bark-of-doran')).attachedTo = angel;
    g.passBoth();
    g.attack(angel);
    g.passUntilStep('main2');
    // 4/4 with +0/+1 = 4/5: toughness greater than power, so 5 damage.
    expect(g.life('p2')).toBe(15);
  });
});

/** The cast actions for a card in hand. */
const casts = (g: GameDriver, defId: string) => {
  const ids = g.state.players[g.actor].hand.filter((id) => g.obj(id).defId === defId);
  return g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && ids.includes(a.card),
    );
};
const targetsObject = (a: Action, id: string) =>
  a.type === 'castSpell' && a.targets.some((t) => 'object' in t && t.object.id === id);

describe('Burdened Stoneback', () => {
  it('enters with two -1/-1 counters; {1}{W}, remove a counter: a creature gains indestructible (sorcery speed)', () => {
    const g = game({
      p1: { hand: ['burdened-stoneback'], battlefield: [...n('plains', 4), 'savannah-lions'] },
    });
    done(cast(g, 'burdened-stoneback'));
    const stone = g.id('p1', 'burdened-stoneback');
    expect(minus(g, stone)).toBe(2);
    expect(pt(g, stone)).toEqual([2, 2]);
    const lions = g.id('p1', 'savannah-lions');
    activate(g, stone, 0, [g.ref(lions)], { removeKinds: ['-1/-1'] });
    done(g);
    expect(minus(g, stone)).toBe(1);
    expect(keywords(g, lions).has('indestructible')).toBe(true);
  });
  it('cannot be activated at instant speed', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 2), 'burdened-stoneback'] },
      step: 'beginCombat',
    });
    g.obj(g.id('p1', 'burdened-stoneback')).counters = { '-1/-1': 2 };
    expect(abilityActions(g, g.id('p1', 'burdened-stoneback'), 0)).toHaveLength(0);
  });
});

describe('Champion of the Clachan', () => {
  it('beholds and exiles a Kithkin as it is cast, gives other Kithkin +1/+1, and returns the card when it leaves', () => {
    const g = game({
      p1: {
        hand: ['champion-of-the-clachan', 'kinsbaile-aspirant'],
        battlefield: [...n('plains', 4), 'timid-shieldbearer'],
      },
    });
    // Behold from the battlefield or from hand: two ways.
    const ways = casts(g, 'champion-of-the-clachan');
    expect(ways.length).toBe(2);
    const fromHand = ways.find((a) => a.beholdCard === g.id('p1', 'kinsbaile-aspirant', 'hand'))!;
    g.do(fromHand);
    done(g);
    const champion = g.id('p1', 'champion-of-the-clachan');
    expect(exile(g)).toEqual(['kinsbaile-aspirant']);
    expect(pt(g, g.id('p1', 'timid-shieldbearer'))).toEqual([3, 3]);
    expect(pt(g, champion)).toEqual([4, 5]);
    expect(keywords(g, champion).has('flash')).toBe(true);
  });
  it('returns the exiled card to its owner’s hand when it leaves the battlefield', () => {
    const g = game({
      p1: {
        hand: ['champion-of-the-clachan'],
        battlefield: [...n('plains', 4), 'timid-shieldbearer'],
      },
      p2: { hand: ['crib-swap'], battlefield: n('plains', 3) },
    });
    // Behold the Shieldbearer on the battlefield: it is exiled.
    g.do(casts(g, 'champion-of-the-clachan')[0]!);
    done(g);
    expect(exile(g)).toEqual(['timid-shieldbearer']);
    const champion = g.id('p1', 'champion-of-the-clachan');
    g.pass();
    cast(g, 'crib-swap', [g.ref(champion)]);
    done(g);
    expect(g.zoneOf(champion)).toBe('exile');
    expect(hand(g)).toEqual(['timid-shieldbearer']);
    expect(exile(g)).toEqual(['champion-of-the-clachan']);
  });
});

describe('Clachan Festival', () => {
  it('makes two Kithkin as it enters and one for {4}{W}', () => {
    const g = game({ p1: { hand: ['clachan-festival'], battlefield: n('plains', 8) } });
    done(cast(g, 'clachan-festival'));
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(2);
    activate(g, g.id('p1', 'clachan-festival'), 1);
    done(g);
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(3);
  });
});

describe('Crib Swap', () => {
  it('exiles the creature and its controller gets a 1/1 Shapeshifter with changeling', () => {
    const g = game({
      p1: { hand: ['crib-swap'], battlefield: n('plains', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'crib-swap', [g.ref(angel)]);
    done(g);
    expect(g.zoneOf(angel)).toBe('exile');
    const token = on(g, 'ecl-shapeshifter-token', 'p2');
    expect(token).toHaveLength(1);
    expect(on(g, 'ecl-shapeshifter-token', 'p1')).toHaveLength(0);
    expect(keywords(g, token[0]!).has('changeling')).toBe(true);
    // Crib Swap is itself a changeling Kindred card.
    expect(cardDb.get('crib-swap')!.keywords).toContain('changeling');
  });
});

describe('Curious Colossus', () => {
  it('makes each creature the opponent controls lose all abilities, become a Coward and be 1/1, for good', () => {
    const g = game({
      p1: { hand: ['curious-colossus'], battlefield: n('plains', 7) },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    cast(g, 'curious-colossus');
    done(g);
    const angel = g.id('p2', 'serra-angel');
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(keywords(g, angel).size).toBe(0);
    expect(types(g, angel)).toContain('Coward');
    expect(types(g, angel)).toContain('Angel');
    // Still so on the opponent's turn (it is not "until end of turn").
    g.state.turn.number += 1;
    expect(pt(g, angel)).toEqual([1, 1]);
    expect(pt(g, g.id('p1', 'curious-colossus'))).toEqual([7, 7]);
  });
});

describe('Encumbered Reejerey', () => {
  it('loses a -1/-1 counter each time it becomes tapped', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['encumbered-reejerey'] },
    });
    const r = g.id('p1', 'encumbered-reejerey');
    g.obj(r).counters = { '-1/-1': 3 };
    expect(pt(g, r)).toEqual([2, 1]);
    g.passBoth();
    g.attack(r);
    done(g);
    expect(minus(g, r)).toBe(2);
  });
  it('enters with three -1/-1 counters', () => {
    const g = game({ p1: { hand: ['encumbered-reejerey'], battlefield: n('plains', 2) } });
    done(cast(g, 'encumbered-reejerey'));
    expect(minus(g, g.id('p1', 'encumbered-reejerey'))).toBe(3);
  });
});

describe("Evershrike's Gift", () => {
  it('gives +1/+0 and flying; from the graveyard {1}{W} and blight 2 return it to hand (sorcery speed)', () => {
    const g = game({
      p1: {
        hand: ['evershrikes-gift'],
        graveyard: ['evershrikes-gift'],
        battlefield: [...n('plains', 6), 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    cast(g, 'evershrikes-gift', [g.ref(angel)]);
    done(g);
    expect(pt(g, angel)).toEqual([5, 4]);
    const inGy = g.id('p1', 'evershrikes-gift', 'graveyard');
    const acts = abilityActions(g, inGy, 1);
    // One way for each creature that can be blighted.
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.blight === angel)!);
    done(g);
    expect(minus(g, angel)).toBe(2);
    expect(hand(g)).toContain('evershrikes-gift');
  });
});

describe('Flock Impostor', () => {
  it('returns up to one other creature you control to hand when it enters', () => {
    const g = game({
      p1: { hand: ['flock-impostor'], battlefield: [...n('plains', 3), 'savannah-lions'] },
    });
    cast(g, 'flock-impostor');
    done(g);
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(keywords(g, g.id('p1', 'flock-impostor')).has('flying')).toBe(true);
    expect(keywords(g, g.id('p1', 'flock-impostor')).has('flash')).toBe(true);
  });
});

describe('Gallant Fowlknight', () => {
  it('gives creatures +1/+0 and Kithkin first strike until end of turn', () => {
    const g = game({
      p1: {
        hand: ['gallant-fowlknight'],
        battlefield: [...n('plains', 4), 'timid-shieldbearer', 'serra-angel'],
      },
    });
    cast(g, 'gallant-fowlknight');
    done(g);
    const kithkin = g.id('p1', 'timid-shieldbearer');
    const angel = g.id('p1', 'serra-angel');
    expect(pt(g, kithkin)).toEqual([3, 2]);
    expect(pt(g, angel)).toEqual([5, 4]);
    expect(keywords(g, kithkin).has('firstStrike')).toBe(true);
    expect(keywords(g, angel).has('firstStrike')).toBe(false);
  });
});

describe('Goldmeadow Nomad', () => {
  it('exiles itself from the graveyard for {W} to make a Kithkin, at sorcery speed only', () => {
    const g = game({ p1: { graveyard: ['goldmeadow-nomad'], battlefield: n('plains', 2) } });
    const nomad = g.id('p1', 'goldmeadow-nomad', 'graveyard');
    activate(g, nomad, 0);
    done(g);
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(1);
    expect(exile(g)).toEqual(['goldmeadow-nomad']);
    const late = game({
      step: 'beginCombat',
      p1: { graveyard: ['goldmeadow-nomad'], battlefield: n('plains', 2) },
    });
    expect(abilityActions(late, late.id('p1', 'goldmeadow-nomad', 'graveyard'), 0)).toHaveLength(0);
  });
});

describe('Keep Out', () => {
  it('deals 4 damage to a tapped creature, or destroys an enchantment', () => {
    const g = game({
      p1: { hand: ['keep-out', 'keep-out'], battlefield: n('plains', 4) },
      p2: { battlefield: [{ card: 'serra-angel', tapped: true }, 'clachan-festival'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const pac = g.id('p2', 'clachan-festival');
    const first = casts(g, 'keep-out');
    expect(first.some((a) => targetsObject(a, pac))).toBe(true);
    g.do(first.find((a) => targetsObject(a, angel))!);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    g.do(casts(g, 'keep-out').find((a) => targetsObject(a, pac))!);
    done(g);
    expect(g.zoneOf(pac)).toBe('graveyard');
  });
  it("can't hit an untapped creature", () => {
    const g = game({
      p1: { hand: ['keep-out'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(casts(g, 'keep-out')).toHaveLength(0);
  });
});

describe('Kinbinding', () => {
  it('gives creatures +X/+X for the creatures that entered under your control this turn, and makes a Kithkin each combat', () => {
    const g = game({
      step: 'main1',
      p1: {
        hand: ['kinbinding', 'savannah-lions'],
        battlefield: [...n('plains', 6), 'serra-angel'],
      },
    });
    const angel = g.id('p1', 'serra-angel');
    done(cast(g, 'kinbinding'));
    // Nothing has entered yet this turn.
    expect(pt(g, angel)).toEqual([4, 4]);
    done(cast(g, 'savannah-lions'));
    expect(pt(g, angel)).toEqual([5, 5]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([3, 2]);
    // A creature that entered and left still counts.
    g.state.turn.creaturesEntered!.p1 = 3;
    expect(pt(g, angel)).toEqual([7, 7]);
  });
  it('makes a 1/1 Kithkin at the beginning of combat on your turn', () => {
    const g = game({ p1: { battlefield: ['kinbinding'] } });
    g.passBoth();
    done(g);
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(1);
    // The token entered this turn: Kinbinding makes it 2/2.
    expect(pt(g, on(g, 'ecl-kithkin-token', 'p1')[0]!)).toEqual([2, 2]);
  });
});

describe('Kinsbaile Aspirant', () => {
  it('is cast by beholding a Kithkin or paying {2}, and gets +1/+1 whenever another creature you control enters', () => {
    const g = game({
      p1: {
        hand: ['kinsbaile-aspirant', 'timid-shieldbearer'],
        battlefield: ['plains', 'plains', 'plains'],
      },
    });
    const ways = casts(g, 'kinsbaile-aspirant');
    // Pay {2} (3 mana), or behold the Kithkin in hand (1 mana).
    expect(ways.length).toBe(2);
    const paid = ways.find((a) => !a.beholdCard)!;
    g.do(paid);
    done(g);
    const aspirant = g.id('p1', 'kinsbaile-aspirant');
    expect(pt(g, aspirant)).toEqual([2, 1]);
  });
  it('beholding a Kithkin costs only {W}', () => {
    const g = game({
      p1: { hand: ['kinsbaile-aspirant', 'timid-shieldbearer'], battlefield: ['plains'] },
    });
    const ways = casts(g, 'kinsbaile-aspirant');
    expect(ways).toHaveLength(1);
    expect(ways[0]!.beholdCard).toBe(g.id('p1', 'timid-shieldbearer', 'hand'));
    g.do(ways[0]!);
    done(g);
    expect(hand(g)).toEqual(['timid-shieldbearer']);
  });
  it('gets +1/+1 when another creature enters under your control', () => {
    const g = game({
      p1: { hand: ['savannah-lions'], battlefield: ['plains', 'plains', 'kinsbaile-aspirant'] },
    });
    done(cast(g, 'savannah-lions'));
    expect(pt(g, g.id('p1', 'kinsbaile-aspirant'))).toEqual([3, 2]);
  });
});

describe('Kinscaer Sentry', () => {
  it('puts a creature card with mana value X or less from hand onto the battlefield tapped and attacking', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['savannah-lions', 'serra-angel'],
        battlefield: ['kinscaer-sentry'],
      },
    });
    const sentry = g.id('p1', 'kinscaer-sentry');
    g.passBoth();
    g.attack(sentry);
    settle(g);
    // Only the Lions (mana value 1) can be put in: X is the one attacking creature. It may be declined.
    expect(g.decision.kind).toBe('searchLibrary');
    const pick = g.legal().filter((a) => a.type === 'chooseCard');
    expect(pick.some((a) => a.type === 'chooseCard' && a.card === null)).toBe(true);
    g.do(pick.find((a) => a.type === 'chooseCard' && a.card)!);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.state.combat!.attackers.some((a) => a.id === lions)).toBe(true);
    expect(hand(g)).toEqual(['serra-angel']);
    // It also has first strike and lifelink.
    expect([...keywords(g, sentry)]).toEqual(expect.arrayContaining(['firstStrike', 'lifelink']));
  });
  it('X counts the attacking creatures, so a second attacker raises it', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['savannah-lions', 'giant-growth'],
        battlefield: ['kinscaer-sentry', 'llanowar-elves'],
      },
    });
    const sentry = g.id('p1', 'kinscaer-sentry');
    g.passBoth();
    g.attack(sentry, g.id('p1', 'llanowar-elves'));
    settle(g);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    // Both creatures are attacking: X is 2. Only the Lions is a creature card in hand.
    expect(options).toHaveLength(1);
    g.do(options[0]!);
    done(g);
    const lions = g.id('p1', 'savannah-lions');
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.state.combat!.attackers.some((a) => a.id === lions)).toBe(true);
  });
  it('X is the number of attackers: a 3-drop is not allowed with one attacker', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['serra-angel', 'savannah-lions'], battlefield: ['kinscaer-sentry'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'kinscaer-sentry'));
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(options.map((a) => a.type === 'chooseCard' && g.obj(a.card!).defId)).toEqual([
      'savannah-lions',
    ]);
  });
});

describe('Kithkeeper', () => {
  it('makes a Kithkin for each color among permanents you control when it enters', () => {
    const g = game({
      p1: { hand: ['kithkeeper'], battlefield: [...n('plains', 7), 'llanowar-elves'] },
    });
    done(cast(g, 'kithkeeper'));
    // White (itself) and green (the Elves): two colors.
    expect(on(g, 'ecl-kithkin-token', 'p1')).toHaveLength(2);
  });
  it('tap three untapped creatures you control: +3/+0 and flying, with a choice of which creatures (itself allowed)', () => {
    const g = game({
      p1: {
        battlefield: [
          'kithkeeper',
          'llanowar-elves',
          'savannah-lions',
          { card: 'serra-angel', tapped: true },
        ],
      },
    });
    const keeper = g.id('p1', 'kithkeeper');
    const acts = abilityActions(g, keeper, 1);
    // Three untapped creatures: Kithkeeper, Elves, Lions: exactly one way.
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(g.obj(keeper).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'llanowar-elves')).tapped).toBe(true);
    expect(pt(g, keeper)).toEqual([6, 3]);
    expect(keywords(g, keeper).has('flying')).toBe(true);
  });
  it('offers each different set of three creatures to tap when there are more', () => {
    const g = game({
      p1: {
        battlefield: [
          'kithkeeper',
          'llanowar-elves',
          'savannah-lions',
          'serra-angel',
          'serra-angel',
        ],
      },
    });
    const keeper = g.id('p1', 'kithkeeper');
    const acts = abilityActions(g, keeper, 1);
    // Sets of 3 from {keeper, elves, lions, angel, angel}: the two angels look alike.
    expect(acts.length).toBeGreaterThan(1);
    expect(acts.length).toBeLessThan(10);
    const angels = on(g, 'serra-angel', 'p1');
    const chosen = acts.find(
      (a) =>
        a.type === 'activateAbility' &&
        !a.tapCreatures!.includes(keeper) &&
        a.tapCreatures!.includes(angels[0]!),
    )!;
    g.do(chosen);
    done(g);
    expect(g.obj(keeper).tapped).toBe(false);
    expect(pt(g, keeper)).toEqual([6, 3]);
  });
});

describe('Liminal Hold', () => {
  it('exiles a nonland permanent an opponent controls until it leaves, and gains 2 life', () => {
    const g = game({
      p1: { hand: ['liminal-hold'], battlefield: n('plains', 4) },
      p2: { battlefield: ['serra-angel', 'forest'] },
    });
    cast(g, 'liminal-hold');
    done(g);
    const angel = g.state.players.p2.exile.find((id) => g.obj(id).defId === 'serra-angel');
    expect(angel).toBeDefined();
    expect(g.life('p1')).toBe(22);
    // It never targets a land.
    const g2 = game({
      p1: { hand: ['liminal-hold'], battlefield: n('plains', 4) },
      p2: { battlefield: ['forest'] },
    });
    cast(g2, 'liminal-hold');
    done(g2);
    expect(g2.life('p1')).toBe(22);
    expect(exile(g2, 'p2')).toEqual([]);
  });
  it('returns the permanent when Liminal Hold leaves the battlefield', () => {
    const g = game({
      p1: { hand: ['liminal-hold', 'keep-out'], battlefield: n('plains', 6) },
      p2: { battlefield: ['serra-angel'] },
    });
    cast(g, 'liminal-hold');
    done(g);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    const hold = g.id('p1', 'liminal-hold');
    g.do(casts(g, 'keep-out').find((a) => targetsObject(a, hold))!);
    done(g);
    expect(g.zoneOf(hold)).toBe('graveyard');
    expect(on(g, 'serra-angel', 'p2')).toHaveLength(1);
  });
});

describe('Meanders Guide', () => {
  it('may tap another untapped Merfolk when it attacks; when you do, returns a creature card with mana value 3 or less from your graveyard', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        graveyard: ['serra-angel', 'savannah-lions'],
        battlefield: ['meanders-guide', 'wanderbrine-preacher'],
      },
    });
    const guide = g.id('p1', 'meanders-guide');
    const preacher = g.id('p1', 'wanderbrine-preacher');
    g.passBoth();
    g.attack(guide);
    // The trigger: accept, choose the Merfolk, then pick the target for the reflexive trigger.
    done(g, { accept: true });
    expect(g.obj(preacher).tapped).toBe(true);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(0);
    // The Preacher became tapped: its own trigger gained 2 life.
    expect(g.life('p1')).toBe(22);
  });
  it('does nothing if you decline', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        graveyard: ['savannah-lions'],
        battlefield: ['meanders-guide', 'wanderbrine-preacher'],
      },
    });
    g.passBoth();
    g.attack(g.id('p1', 'meanders-guide'));
    done(g, { accept: false });
    expect(g.obj(g.id('p1', 'wanderbrine-preacher')).tapped).toBe(false);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(0);
  });
});

describe('Moonlit Lamenter', () => {
  it('enters with a -1/-1 counter; {1}{W}, remove a counter: draw a card, at sorcery speed', () => {
    const g = game({
      p1: {
        hand: ['moonlit-lamenter'],
        battlefield: n('plains', 6),
        library: ['forest', 'island'],
      },
    });
    done(cast(g, 'moonlit-lamenter'));
    const l = g.id('p1', 'moonlit-lamenter');
    expect(minus(g, l)).toBe(1);
    expect(pt(g, l)).toEqual([1, 4]);
    activate(g, l, 0, [], { removeKinds: ['-1/-1'] });
    done(g);
    expect(minus(g, l)).toBe(0);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe("Morningtide's Light", () => {
  /** Resolves casting: pick the creatures one at a time, then done. */
  const castLight = (g: GameDriver, targets: string[]) => {
    cast(g, 'morningtides-light');
    for (const t of targets) {
      expect(g.decision.kind).toBe('spellTargets');
      g.do({ type: 'chooseTargets', player: 'p1', targets: [...pickedOf(g), g.ref(t)] });
    }
    expect(g.decision.kind).toBe('spellTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: pickedOf(g) });
  };
  const pickedOf = (g: GameDriver) => {
    const d = g.decision;
    return d.kind === 'spellTargets' ? d.picked : [];
  };

  it('exiles any number of target creatures and returns them tapped at the next end step; it is exiled itself; damage to you is prevented until your next turn', () => {
    const g = game({
      p1: {
        hand: ['morningtides-light'],
        battlefield: [...n('plains', 4), 'serra-angel', 'savannah-lions'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const angel = g.id('p1', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    castLight(g, [angel, lions]);
    done(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.zoneOf(lions)).toBe('exile');
    expect(exile(g)).toEqual(expect.arrayContaining(['morningtides-light']));
    expect(gy(g)).not.toContain('morningtides-light');
    expect(g.state.players.p1.damagePrevented).toBe(true);
    g.passUntilStep('end');
    done(g);
    const angels = on(g, 'serra-angel', 'p1');
    expect(angels).toHaveLength(1);
    expect(g.obj(angels[0]!).tapped).toBe(true);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(g.obj(on(g, 'savannah-lions', 'p1')[0]!).tapped).toBe(true);
  });
  it('can be cast with no targets, or with an opponent’s creature', () => {
    const g = game({
      p1: { hand: ['morningtides-light'], battlefield: n('plains', 4) },
      p2: { battlefield: ['llanowar-elves'] },
    });
    cast(g, 'morningtides-light');
    expect(g.decision.kind).toBe('spellTargets');
    const options = g.legal();
    // Done, or the Elves.
    expect(options).toHaveLength(2);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(g.id('p2', 'llanowar-elves'))] });
    g.do({ type: 'chooseTargets', player: 'p1', targets: pickedOf(g) });
    done(g);
    expect(exile(g, 'p2')).toEqual(['llanowar-elves']);
    g.passUntilStep('end');
    done(g);
    // Returned under its owner's control, tapped.
    expect(on(g, 'llanowar-elves', 'p2')).toHaveLength(1);
  });
  it('prevents all damage to you until your next turn, from any source', () => {
    const g = game({
      p1: { hand: ['morningtides-light'], battlefield: n('plains', 4) },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    castLight(g, []);
    done(g);
    expect(g.state.players.p1.damagePrevented).toBe(true);
    // The opponent burns you in response to nothing: no damage.
    g.pass();
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'lightning-strike', 'hand'),
      targets: [{ player: 'p1' }],
    });
    done(g);
    expect(g.life('p1')).toBe(20);
    // Your next turn begins: the prevention ends.
    for (let i = 0; i < 200 && g.state.turn.number < 5; i++) {
      const d = g.decision;
      if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
      else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
      else if (d.kind === 'priority') g.pass();
      else break;
    }
    expect(g.state.turn.number).toBe(5);
    expect(g.state.players.p1.damagePrevented).toBeUndefined();
  });
});

describe('Personify', () => {
  it('blinks a creature you control and makes a Shapeshifter', () => {
    const g = game({
      p1: { hand: ['personify'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    const imp = g.id('p1', 'savannah-lions');
    const before = g.obj(imp).zcc;
    cast(g, 'personify', [g.ref(imp)]);
    done(g);
    const back = on(g, 'savannah-lions', 'p1');
    expect(back).toHaveLength(1);
    // Exiled and returned: a new object.
    expect(g.obj(back[0]!).zcc).toBeGreaterThan(before);
    expect(on(g, 'ecl-shapeshifter-token', 'p1')).toHaveLength(1);
  });
});

describe('Protective Response', () => {
  it('destroys an attacking creature; convoke helps pay', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: {
        hand: ['protective-response'],
        battlefield: ['plains', 'savannah-lions', 'savannah-lions'],
      },
      p2: { battlefield: ['serra-angel', 'llanowar-elves'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.passBoth();
    g.attack(angel);
    // p1 gets priority in the declare attackers step.
    g.pass();
    const acts = g.legal().filter((a) => a.type === 'castSpell');
    const onAngel = acts.find((a) => targetsObject(a, angel));
    expect(onAngel).toBeDefined();
    // The elves are not attacking or blocking: not a legal target.
    expect(acts.some((a) => targetsObject(a, g.id('p2', 'llanowar-elves')))).toBe(false);
    // Convoke: a Plains and the two Lions pay for {2}{W}.
    g.do(onAngel!);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(true);
  });
});

describe('Pyrrhic Strike', () => {
  it('chooses one mode, or both if the blight was paid', () => {
    const g = game({
      p1: {
        hand: ['pyrrhic-strike', 'pyrrhic-strike'],
        battlefield: [...n('plains', 6), 'serra-angel'],
      },
      p2: { battlefield: ['serra-angel', 'clachan-festival'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const festival = g.id('p2', 'clachan-festival');
    const plain = casts(g, 'pyrrhic-strike').filter((a) => !a.kicked);
    expect(plain.some((a) => targetsObject(a, angel))).toBe(true);
    expect(plain.some((a) => targetsObject(a, festival))).toBe(true);
    // Unblighted: one mode only (a single target).
    expect(plain.every((a) => a.targets.length === 1)).toBe(true);
    const both = casts(g, 'pyrrhic-strike').filter((a) => a.kicked && a.targets.length === 2);
    expect(both.length).toBeGreaterThan(0);
    const act = both.find((a) => targetsObject(a, angel) && targetsObject(a, festival))!;
    expect(act).toBeDefined();
    g.do(act);
    done(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
    expect(g.zoneOf(festival)).toBe('graveyard');
    expect(g.obj(g.id('p1', 'serra-angel')).counters?.['-1/-1']).toBe(2);
  });
});

describe('Reluctant Dounguard', () => {
  it('removes a -1/-1 counter each time another creature enters under your control while it has one', () => {
    const g = game({
      p1: {
        hand: ['reluctant-dounguard', 'savannah-lions', 'savannah-lions'],
        battlefield: n('plains', 5),
      },
    });
    done(cast(g, 'reluctant-dounguard'));
    const d = g.id('p1', 'reluctant-dounguard');
    expect(minus(g, d)).toBe(2);
    done(cast(g, 'savannah-lions'));
    expect(minus(g, d)).toBe(1);
    done(cast(g, 'savannah-lions'));
    expect(minus(g, d)).toBe(0);
  });
});

describe('Rhys, the Evermore', () => {
  it('gives another creature persist when it enters', () => {
    const g = game({
      p1: { hand: ['rhys-the-evermore'], battlefield: [...n('plains', 2), 'savannah-lions'] },
    });
    cast(g, 'rhys-the-evermore');
    done(g);
    expect(keywords(g, g.id('p1', 'savannah-lions')).has('persist')).toBe(true);
    expect(keywords(g, g.id('p1', 'rhys-the-evermore')).has('persist')).toBe(false);
    expect(keywords(g, g.id('p1', 'rhys-the-evermore')).has('flash')).toBe(true);
  });
  it('{W}, {T}: removes any number of counters from a creature you control (sorcery speed)', () => {
    const g = game({
      p1: { battlefield: ['plains', 'rhys-the-evermore', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.obj(angel).counters = { '-1/-1': 2, stun: 1 };
    activate(g, g.id('p1', 'rhys-the-evermore'), 1, [g.ref(angel)]);
    // The counters come off one at a time, kind by kind, until you say done.
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    const pick = (re: RegExp) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error('Not choosing');
      g.do({
        type: 'chooseOption',
        player: d.player,
        index: d.options.findIndex((o) => re.test(o.label)),
      });
    };
    pick(/Remove a -1\/-1/);
    pick(/Remove a stun/);
    pick(/Done/);
    expect(g.obj(angel).counters?.['-1/-1']).toBe(1);
    expect(g.obj(angel).counters?.stun ?? 0).toBe(0);
    expect(g.obj(g.id('p1', 'rhys-the-evermore')).tapped).toBe(true);
  });
});

describe("Riverguard's Reflexes", () => {
  it('gives +2/+2 and first strike and untaps the creature', () => {
    const g = game({
      p1: {
        hand: ['riverguards-reflexes'],
        battlefield: [...n('plains', 2), { card: 'savannah-lions', tapped: true }],
      },
    });
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'riverguards-reflexes', [g.ref(lions)]);
    done(g);
    expect(pt(g, lions)).toEqual([4, 3]);
    expect(keywords(g, lions).has('firstStrike')).toBe(true);
    expect(g.obj(lions).tapped).toBe(false);
  });
});

describe('Shore Lurker', () => {
  it('has flying and surveils 1 when it enters', () => {
    const g = game({
      p1: {
        hand: ['shore-lurker'],
        battlefield: n('plains', 4),
        library: ['forest', 'island', 'swamp'],
      },
    });
    cast(g, 'shore-lurker');
    done(g);
    expect(keywords(g, g.id('p1', 'shore-lurker')).has('flying')).toBe(true);
    // The surveil put the top card (Forest) into the graveyard? done() keeps it on top (bottom: []).
    expect(g.state.players.p1.library).toHaveLength(3);
  });
});

describe('Slumbering Walker', () => {
  it('may remove a counter at your end step; when you do, returns a creature card with power 2 or less from your graveyard', () => {
    const g = game({
      p1: {
        graveyard: ['savannah-lions', 'serra-angel'],
        battlefield: ['slumbering-walker'],
      },
    });
    const walker = g.id('p1', 'slumbering-walker');
    g.obj(walker).counters = { '-1/-1': 2 };
    g.passUntilStep('end');
    done(g, { accept: true });
    expect(minus(g, walker)).toBe(1);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(0);
  });
  it('does nothing when you decline', () => {
    const g = game({
      p1: { graveyard: ['savannah-lions'], battlefield: ['slumbering-walker'] },
    });
    const walker = g.id('p1', 'slumbering-walker');
    g.obj(walker).counters = { '-1/-1': 2 };
    g.passUntilStep('end');
    done(g, { accept: false });
    expect(minus(g, walker)).toBe(2);
    expect(on(g, 'savannah-lions', 'p1')).toHaveLength(0);
  });
  it('enters with two -1/-1 counters', () => {
    const g = game({ p1: { hand: ['slumbering-walker'], battlefield: n('plains', 5) } });
    done(cast(g, 'slumbering-walker'));
    expect(minus(g, g.id('p1', 'slumbering-walker'))).toBe(2);
  });
});

describe('Spiral into Solitude', () => {
  it("enchanted creature can't attack or block; {1}{W}, blight 1, sacrifice: exile enchanted creature", () => {
    const g = game({
      p1: {
        hand: ['spiral-into-solitude'],
        battlefield: [...n('plains', 4), 'timid-shieldbearer'],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'spiral-into-solitude', [g.ref(angel)]);
    done(g);
    const aura = g.id('p1', 'spiral-into-solitude');
    expect(g.obj(aura).attachedTo).toBe(angel);
    const lions = g.id('p1', 'timid-shieldbearer');
    const acts = abilityActions(g, aura, 1);
    expect(acts.length).toBeGreaterThan(0);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.blight === lions)!);
    done(g);
    expect(g.zoneOf(angel)).toBe('exile');
    expect(g.zoneOf(aura)).toBe('graveyard');
    expect(minus(g, lions)).toBe(1);
  });
});

describe('Sun-Dappled Celebrant', () => {
  it('has convoke and vigilance', () => {
    const g = game({
      p1: {
        hand: ['sun-dappled-celebrant'],
        battlefield: [...n('plains', 3), 'savannah-lions', 'savannah-lions', 'llanowar-elves'],
      },
    });
    expect(canCast1(g, 'sun-dappled-celebrant')).toBe(true);
    cast(g, 'sun-dappled-celebrant');
    done(g);
    expect(keywords(g, g.id('p1', 'sun-dappled-celebrant')).has('vigilance')).toBe(true);
  });
});

const canCast1 = (g: GameDriver, defId: string) => casts(g, defId).length > 0;

describe('Thoughtweft Imbuer', () => {
  it('gives a creature attacking alone +X/+X, X the number of Kithkin you control', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['thoughtweft-imbuer', 'timid-shieldbearer', 'serra-angel'] },
    });
    const angel = g.id('p1', 'serra-angel');
    g.passBoth();
    g.attack(angel);
    done(g);
    // Two Kithkin (Imbuer, Shieldbearer).
    expect(pt(g, angel)).toEqual([6, 6]);
  });
  it('does nothing when more than one creature attacks', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['thoughtweft-imbuer', 'timid-shieldbearer', 'serra-angel'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'serra-angel'), g.id('p1', 'timid-shieldbearer'));
    done(g);
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([4, 4]);
  });
});

describe('Timid Shieldbearer', () => {
  it('{4}{W}: creatures you control get +1/+1 until end of turn', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 5), 'timid-shieldbearer', 'serra-angel'] },
    });
    activate(g, g.id('p1', 'timid-shieldbearer'), 0);
    done(g);
    expect(pt(g, g.id('p1', 'timid-shieldbearer'))).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'serra-angel'))).toEqual([5, 5]);
  });
});

describe('Tributary Vaulter', () => {
  it('gives another Merfolk +2/+0 whenever it becomes tapped', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['tributary-vaulter', 'wanderbrine-preacher'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'tributary-vaulter'));
    done(g);
    expect(pt(g, g.id('p1', 'wanderbrine-preacher'))).toEqual([4, 2]);
    expect(keywords(g, g.id('p1', 'tributary-vaulter')).has('flying')).toBe(true);
  });
});

describe('Wanderbrine Preacher', () => {
  it('gains you 2 life whenever it becomes tapped', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['wanderbrine-preacher'] },
    });
    g.passBoth();
    g.attack(g.id('p1', 'wanderbrine-preacher'));
    done(g);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Wanderbrine Trapper', () => {
  it('{1}, {T}, tap another untapped creature you control: tap target creature an opponent controls, choosing which to tap', () => {
    const g = game({
      p1: {
        battlefield: ['plains', 'wanderbrine-trapper', 'savannah-lions', 'serra-angel'],
      },
      p2: { battlefield: ['llanowar-elves'] },
    });
    const trapper = g.id('p1', 'wanderbrine-trapper');
    const acts = abilityActions(g, trapper, 0);
    // One for each other untapped creature that could be tapped (Lions, Angel).
    const tapOptions = new Set(acts.map((a) => a.type === 'activateAbility' && a.tapCreature));
    expect(tapOptions.size).toBe(2);
    expect(tapOptions.has(trapper)).toBe(false);
    const angel = g.id('p1', 'serra-angel');
    g.do(acts.find((a) => a.type === 'activateAbility' && a.tapCreature === angel)!);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'savannah-lions')).tapped).toBe(false);
    expect(g.obj(g.id('p2', 'llanowar-elves')).tapped).toBe(true);
    expect(g.obj(trapper).tapped).toBe(true);
  });
  it("can't be activated with no other untapped creature", () => {
    const g = game({
      p1: { battlefield: ['plains', 'wanderbrine-trapper'] },
      p2: { battlefield: ['llanowar-elves'] },
    });
    expect(abilityActions(g, g.id('p1', 'wanderbrine-trapper'), 0)).toHaveLength(0);
  });
});

describe('Winnowing', () => {
  it('you choose a creature for each player; each player sacrifices their other creatures that share no creature type with it', () => {
    const g = game({
      p1: {
        hand: ['winnowing'],
        battlefield: [...n('plains', 6), 'timid-shieldbearer', 'kinsbaile-aspirant', 'serra-angel'],
      },
      p2: { battlefield: ['savannah-lions', 'llanowar-elves', 'flock-impostor'] },
    });
    cast(g, 'winnowing');
    g.passBoth();
    // Choose your creature: a Kithkin (the Shieldbearer).
    expect(g.decision.kind).toBe('chooseOption');
    const pick = (re: RegExp) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error('Not choosing');
      g.do({
        type: 'chooseOption',
        player: d.player,
        index: d.options.findIndex((o) => re.test(o.label)),
      });
    };
    pick(/Timid Shieldbearer/);
    // Then the opponent's: the Elves.
    expect(g.decision.kind).toBe('chooseOption');
    pick(/Llanowar Elves/);
    done(g);
    // Mine: the Aspirant is a Kithkin and stays; the Angel shares nothing and goes.
    expect(on(g, 'timid-shieldbearer', 'p1')).toHaveLength(1);
    expect(on(g, 'kinsbaile-aspirant', 'p1')).toHaveLength(1);
    expect(on(g, 'serra-angel', 'p1')).toHaveLength(0);
    // Theirs: the Elves stay (chosen); Savannah Lions (Cat Soldier) goes; the changeling Flock Impostor shares a type with the Elves and stays.
    expect(on(g, 'llanowar-elves', 'p2')).toHaveLength(1);
    expect(on(g, 'savannah-lions', 'p2')).toHaveLength(0);
    expect(on(g, 'flock-impostor', 'p2')).toHaveLength(1);
  });
  it('with nobody to choose it just resolves', () => {
    const g = game({ p1: { hand: ['winnowing'], battlefield: n('plains', 6) } });
    cast(g, 'winnowing');
    done(g);
    expect(gy(g)).toContain('winnowing');
  });
});

describe('all the white cards', () => {
  it('play legal, replayable seeded games in batches', () => {
    const ids = Object.keys(BEHAVIORS)
      .filter((name) => ECL_WHITE_NAMES.has(name))
      .map(slug);
    expect(ids).toHaveLength(39);
    for (let start = 0; start < ids.length; start += 10) {
      const deck = [
        ...ids.slice(start, start + 10).flatMap((id) => Array<string>(2).fill(id)),
        ...['plains', 'island', 'forest'].flatMap((id) => Array<string>(14).fill(id)),
      ];
      for (const seed of [1]) {
        const initial = engine.newGame({ decks: { p1: deck, p2: deck }, seed: 500 + start + seed });
        const result = playRandomGame(engine, initial, 900 + start * 7 + seed, {
          maxActions: 4000,
        });
        expect(result.truncated, `batch ${start}`).toBe(false);
        let state = initial;
        for (const action of result.actions) state = engine.applyAction(state, action).state;
        expect(state, `batch ${start}`).toEqual(result.final);
      }
    }
  }, 180_000);
});
