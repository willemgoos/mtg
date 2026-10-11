import { type CardDefinition, createEngine, getCharacteristics } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  amassOrcs,
  cardsLookedAt,
  chosenOtherThanThis,
  entersTappedUnlessLegendary,
  hasRingBearer,
  historic,
  isRingBearer,
  legendaryCreature,
  noRingBearer,
  ringBearer,
  ringBearerPower,
  ringTemptedTimes,
  ringTempts,
  whenRingBearerChosen,
  whenRingTempts,
  whenYouCreateToken,
  whenYouScry,
} from '../src/ltr-vocab.ts';
import { HOB_HUMAN_SOLDIER } from '../src/hob/tokens.ts';
import { LTR_ORC_ARMY, LTR_SHARED_TOKENS, LTR_SPIRIT, LTR_THE_RING } from '../src/ltr/tokens.ts';

// The Lord of the Rings (21a): the builders produce what the engine runs.

const card = (d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition => ({
  name: d.id,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: [],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...d,
});
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['W'], ...extra });
const land = (id: string, produces: 'W' | 'U' | 'B' | 'R' | 'G'): CardDefinition =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });

const SOLDIER: CardDefinition = card({
  id: HOB_HUMAN_SOLDIER,
  name: 'Human Soldier',
  isToken: true,
  types: ['Creature'],
  subtypes: ['Human', 'Soldier'],
  power: 1,
  toughness: 1,
});

const CARDS: CardDefinition[] = [
  land('plains', 'W'),
  land('forest', 'G'),
  ...LTR_SHARED_TOKENS,
  SOLDIER,
  creature('bear', 2, 2),
  creature('big', 4, 4),
  // Faramir, Field Commander (the Ring half).
  creature('faramir', 2, 2, {
    supertypes: ['Legendary'],
    abilities: [
      whenRingTempts([{ kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 1 }], {
        condition: chosenOtherThanThis,
      }),
    ],
  }),
  // Call of the Ring.
  card({
    id: 'call',
    types: ['Enchantment'],
    abilities: [whenRingBearerChosen([{ kind: 'draw', who: 'controller', amount: 1 }])],
  }),
  // Sam's Desperate Rescue-like: "The Ring tempts you."
  card({ id: 'rescue', types: ['Sorcery'], spell: { targets: [], effects: [ringTempts] } }),
  // Ringwraiths: "When the Ring tempts you, return this card from your graveyard to your hand."
  creature('ringwraiths', 6, 6, {
    abilities: [whenRingTempts([{ kind: 'returnSource', to: 'hand' }], { fromGraveyard: true })],
  }),
  // Sauron, the Necromancer: a pump while it is the Ring-bearer.
  creature('necromancer', 3, 3, {
    abilities: [
      { kind: 'static', effect: { kind: 'while', condition: isRingBearer, power: 2, toughness: 0 } },
    ],
  }),
  // Dúnedain Rangers: "Landfall - if you don't control a Ring-bearer, the Ring tempts you."
  creature('dunedain', 3, 3, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [ringTempts],
        condition: noRingBearer,
      },
    ],
  }),
  // Frodo-like.
  card({
    id: 'frodo',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: ringTemptedTimes(4),
          then: [{ kind: 'loseLife', who: 'controller', amount: 5 }],
          else: [ringTempts],
        },
      ],
    },
  }),
  // One Ring to Rule Them All (I).
  card({
    id: 'one-ring',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [ringTempts, { kind: 'mill', who: 'eachPlayer', count: ringBearerPower }],
    },
  }),
  card({
    id: 'pump',
    types: ['Instant'],
    spell: { targets: [], effects: [{ kind: 'pump', to: ringBearer, power: 3, toughness: 3 }] },
  }),
  // Scry.
  card({ id: 'scry', types: ['Sorcery'], spell: { targets: [], effects: [{ kind: 'scry', amount: 2 }] } }),
  // Celeborn-like: "Whenever you scry, draw a card for each card looked at while scrying this way."
  creature('celeborn', 1, 1, {
    abilities: [whenYouScry([{ kind: 'draw', who: 'controller', amount: cardsLookedAt }])],
  }),
  // Rosie Cotton-like: tokens.
  creature('rosie', 1, 1, {
    abilities: [whenYouCreateToken([{ kind: 'counters', to: 'self', amount: 1 }])],
  }),
  card({
    id: 'tokens',
    types: ['Sorcery'],
    spell: { targets: [], effects: [{ kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 2 }] },
  }),
  // Mordor Muster.
  card({
    id: 'muster',
    types: ['Sorcery'],
    spell: { targets: [], effects: [amassOrcs(1)] },
  }),
  // Foray of Orcs.
  card({
    id: 'foray',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [amassOrcs(2), { kind: 'reflexiveTrigger', ability: 0, subject: 'chosen' }],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'damage', amount: { powerOf: 'subject' }, to: { target: 0 } }],
      },
    ],
  }),
  // The Shire-like land.
  card({
    id: 'shire',
    types: ['Land'],
    supertypes: ['Legendary'],
    ...entersTappedUnlessLegendary,
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }],
  }),
  creature('legend', 2, 2, { supertypes: ['Legendary'] }),
  // A spell that targets a historic permanent.
  card({
    id: 'lost-to-legend',
    types: ['Instant'],
    spell: {
      targets: [{ what: 'permanent', filter: { ...historic, nonland: true } }],
      effects: [{ kind: 'destroy', what: { target: 0 } }],
    },
  }),
  card({ id: 'relic', types: ['Artifact'] }),
  card({ id: 'saga', types: ['Enchantment'], subtypes: ['Saga'] }),
  card({ id: 'plain-enchantment', types: ['Enchantment'] }),
  // A legendary-creature spell target.
  card({
    id: 'legend-hunter',
    types: ['Instant'],
    spell: {
      targets: [{ what: 'creature', filter: legendaryCreature }],
      effects: [{ kind: 'destroy', what: { target: 0 } }],
    },
  }),
];
const db = new Map(CARDS.map((c) => [c.id, c]));
const engine = createEngine(db);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(db, spec));
const settle = (g: GameDriver) => {
  for (let i = 0; i < 30; i++) {
    if (g.decision.kind === 'scry') g.do(g.legal('p1').find((a) => a.type === 'scry')!);
    else if (g.state.stack.length > 0 && g.decision.kind === 'priority') g.passBoth();
    else return;
  }
};
const cast = (g: GameDriver, id: string) => {
  const a = g.legal('p1').find((x) => x.type === 'castSpell' && x.card === g.id('p1', id, 'hand'));
  if (!a) throw new Error(`cannot cast ${id}`);
  g.do(a);
};
const count = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.state.objects[id]!.defId === defId && g.state.objects[id]!.controller === p)
    .length;

describe('the Lord of the Rings tokens', () => {
  it('are registered with the game: the Orc Army, the Spirit and the Ring', () => {
    expect(cardDb.get(LTR_ORC_ARMY)).toMatchObject({
      name: 'Orc Army',
      colors: ['B'],
      subtypes: ['Orc', 'Army'],
      power: 0,
      toughness: 0,
      isToken: true,
    });
    expect(cardDb.get(LTR_SPIRIT)).toMatchObject({ colors: ['W'], keywords: ['flying'], power: 1 });
    expect(cardDb.get(LTR_THE_RING)?.name).toBe('The Ring');
  });
});

describe('the Ring tempts you', () => {
  it('builds the engine effect and the abilities', () => {
    expect(ringTempts).toEqual({ kind: 'ringTempts' });
    expect(whenRingTempts([ringTempts], { condition: chosenOtherThanThis })).toEqual({
      kind: 'triggered',
      trigger: { on: 'ringTempts' },
      targets: [],
      effects: [{ kind: 'ringTempts' }],
      condition: { kind: 'ringBearerChosenOther' },
    });
    expect(whenRingBearerChosen([])).toMatchObject({ trigger: { on: 'ringBearerChosen' } });
    expect(whenRingTempts([], { fromGraveyard: true })).toMatchObject({ fromGraveyard: true });
    expect(hasRingBearer).toEqual({ kind: 'hasRingBearer' });
    expect(noRingBearer).toEqual({ kind: 'not', condition: { kind: 'hasRingBearer' } });
    expect(ringTemptedTimes(4)).toEqual({ kind: 'ringTemptedAtLeast', min: 4 });
    expect(ringBearer).toBe('ringBearer');
    expect(ringBearerPower).toEqual({ powerOf: 'ringBearer' });
  });

  it('runs: Faramir makes a Soldier for a Ring-bearer that is not him; the Ring-bearer is legendary', () => {
    const g = game({ p1: { hand: ['rescue'], battlefield: ['faramir', 'bear'] }, p2: {} });
    cast(g, 'rescue');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseObject');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'bear') });
    settle(g);
    expect(count(g, HOB_HUMAN_SOLDIER)).toBe(1);
    expect(g.state.players.p1.ring).toMatchObject({ tempted: 1 });
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'bear'));
  });

  it('runs: Call of the Ring draws at every choice', () => {
    const g = game({ p1: { hand: ['rescue'], battlefield: ['call', 'bear'] }, p2: {} });
    const hand = g.state.players.p1.hand.length;
    cast(g, 'rescue');
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 1);
  });

  it('runs: Ringwraiths comes back from the graveyard when the Ring tempts you', () => {
    const g = game({ p1: { hand: ['rescue'], graveyard: ['ringwraiths'] }, p2: {} });
    cast(g, 'rescue');
    settle(g);
    expect(g.state.players.p1.hand.map((id) => g.state.objects[id]!.defId)).toContain('ringwraiths');
  });

  it('runs: "while this is your Ring-bearer", "if you don\'t control a Ring-bearer", "tempted four or more times"', () => {
    const state = buildScenario(db, { p1: { battlefield: ['necromancer'] }, p2: {} });
    const nec = state.battlefield[0]!;
    const g0 = new GameDriver(engine, state);
    expect(getCharacteristics(g0.state, db, nec).power).toBe(3);
    state.players.p1.ring = { tempted: 1, bearer: { id: nec, zcc: state.objects[nec]!.zcc } };
    const g1 = new GameDriver(engine, state);
    expect(getCharacteristics(g1.state, db, nec).power).toBe(5);

    const dun = game({ p1: { hand: ['forest', 'forest'], battlefield: ['dunedain'] }, p2: {} });
    dun.do(dun.legal('p1').find((a) => a.type === 'playLand')!);
    settle(dun);
    expect(dun.state.players.p1.ring?.tempted).toBe(1);

    const frodo = game({ p1: { hand: ['frodo'] }, p2: {} });
    frodo.state.players.p1.ring = { tempted: 4 };
    cast(frodo, 'frodo');
    settle(frodo);
    expect(frodo.life('p1')).toBe(15);
  });

  it('runs: the Ring-bearer as a Ref and its power as an Amount', () => {
    const g = game({ p1: { hand: ['one-ring'], battlefield: ['big'] }, p2: {} });
    const lib = g.state.players.p2.library.length;
    cast(g, 'one-ring');
    settle(g);
    expect(g.state.players.p2.library.length).toBe(lib - 4);
    const g2 = game({ p1: { hand: ['pump'], battlefield: ['bear', 'big'] }, p2: {} });
    g2.state.players.p1.ring = {
      tempted: 1,
      bearer: { id: g2.id('p1', 'bear'), zcc: g2.obj(g2.id('p1', 'bear')).zcc },
    };
    cast(g2, 'pump');
    settle(g2);
    expect(getCharacteristics(g2.state, db, g2.id('p1', 'bear')).power).toBe(5);
    expect(getCharacteristics(g2.state, db, g2.id('p1', 'big')).power).toBe(4);
  });
});

describe('scry and tokens', () => {
  it('whenever you scry: the cards looked at are the amount', () => {
    const g = game({ p1: { hand: ['scry'], battlefield: ['celeborn'] }, p2: {} });
    const hand = g.state.players.p1.hand.length;
    cast(g, 'scry');
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 2);
  });

  it('whenever you create a token: once for each', () => {
    const g = game({ p1: { hand: ['tokens'], battlefield: ['rosie'] }, p2: {} });
    cast(g, 'tokens');
    settle(g);
    expect(g.state.objects[g.id('p1', 'rosie')]!.plusOneCounters).toBe(2);
  });
});

describe('amass Orcs', () => {
  it('builds the general amass with the Orc Army token', () => {
    expect(amassOrcs(2)).toEqual({
      kind: 'amass',
      subtype: 'Orc',
      amount: 2,
      token: 'ltr-orc-army-token',
    });
    expect(amassOrcs({ event: 'amount' }, { controllerOf: 0 })).toMatchObject({
      who: { controllerOf: 0 },
      amount: { event: 'amount' },
    });
  });

  it('runs: Mordor Muster-like amass 1 makes a 1/1 Orc Army', () => {
    const g = game({ p1: { hand: ['muster', 'muster'] }, p2: {} });
    cast(g, 'muster');
    settle(g);
    const army = g.state.battlefield.find((id) => g.state.objects[id]!.defId === LTR_ORC_ARMY)!;
    expect(getCharacteristics(g.state, db, army).subtypes).toEqual(
      expect.arrayContaining(['Orc', 'Army']),
    );
    expect(getCharacteristics(g.state, db, army).power).toBe(1);
    cast(g, 'muster');
    settle(g);
    expect(getCharacteristics(g.state, db, army).power).toBe(2);
  });

  it('runs: Foray of Orcs deals damage equal to the amassed Army\'s power', () => {
    const g = game({ p1: { hand: ['foray'] }, p2: { battlefield: ['big'] } });
    cast(g, 'foray');
    g.passBoth();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do(g.legal('p1').find((a) => a.type === 'chooseTargets')!);
    settle(g);
    expect(g.state.objects[g.id('p2', 'big')]!.damage).toBe(2);
  });
});

describe('legendary and historic', () => {
  it('a land enters tapped unless you control a legendary creature', () => {
    const tapped = game({ p1: { hand: ['shire'] }, p2: {} });
    tapped.do(tapped.legal('p1').find((a) => a.type === 'playLand')!);
    expect(tapped.obj(tapped.id('p1', 'shire')).tapped).toBe(true);
    const untapped = game({ p1: { hand: ['shire'], battlefield: ['legend'] }, p2: {} });
    untapped.do(untapped.legal('p1').find((a) => a.type === 'playLand')!);
    expect(untapped.obj(untapped.id('p1', 'shire')).tapped).toBe(false);
    // The Ring-bearer is legendary: it counts.
    const ring = game({ p1: { hand: ['shire'], battlefield: ['bear'] }, p2: {} });
    ring.state.players.p1.ring = {
      tempted: 1,
      bearer: { id: ring.id('p1', 'bear'), zcc: ring.obj(ring.id('p1', 'bear')).zcc },
    };
    ring.do(ring.legal('p1').find((a) => a.type === 'playLand')!);
    expect(ring.obj(ring.id('p1', 'shire')).tapped).toBe(false);
  });

  it('historic: artifacts, legendary permanents and Sagas, not other permanents', () => {
    const g = game({
      p1: { hand: ['lost-to-legend'], battlefield: ['relic', 'saga', 'plain-enchantment', 'legend', 'bear'] },
      p2: {},
    });
    const spell = g.legal('p1').filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'lost-to-legend', 'hand'));
    const targeted = new Set(
      spell.flatMap((a) =>
        a.type === 'castSpell' ? a.targets.flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : [])) : [],
      ),
    );
    expect(targeted).toEqual(new Set(['relic', 'saga', 'legend']));
  });

  it('a legendary creature target includes the Ring-bearer', () => {
    const g = game({ p1: { hand: ['legend-hunter'], battlefield: ['bear', 'big'] }, p2: {} });
    g.state.players.p1.ring = {
      tempted: 1,
      bearer: { id: g.id('p1', 'big'), zcc: g.obj(g.id('p1', 'big')).zcc },
    };
    const targets = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'legend-hunter', 'hand'))
      .flatMap((a) => (a.type === 'castSpell' ? a.targets.flatMap((t) => ('object' in t ? [g.obj(t.object.id).defId] : [])) : []));
    expect(targets).toEqual(['big']);
  });
});
