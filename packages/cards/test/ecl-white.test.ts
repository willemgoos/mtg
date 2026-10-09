import { describe, expect, it } from 'vitest';
import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { BEHAVIORS, cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

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

const abilityIndex = (defId: string, kind: 'activated' | 'triggered', nth = 0) =>
  cardDb
    .get(defId)!
    .abilities.map((a, i) => [a, i] as const)
    .filter(([a]) => a.kind === kind)[nth]![1];

/** The legal actions of one kind for an ability of a source. */
const abilityActions = (g: GameDriver, source: string, index: number): Action[] =>
  g
    .legal()
    .filter(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === index,
    );

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
        battlefield: [
          'adept-watershaper',
          { card: 'savannah-lions', tapped: true },
          'serra-angel',
        ],
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
      g.do({ type: 'chooseOption', player: d.player, index: d.options.findIndex((o) => re.test(o.label)) });
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
      p1: { life: 3, battlefield: ['ajani-outland-chaperone'], library: ['forest', 'forest', 'forest', 'savannah-lions'] },
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
