import { createEngine, type CardDefinition } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  additionalCostPaid,
  BLIGHTED,
  blight,
  enterIfSpent,
  entersOrTransforms,
  entersWithMinusCounters,
  evoke,
  firstMainTransform,
  hasMinusCounter,
  mayBlight,
  optionalBlight,
  returnBeheldWhenLeaves,
  transformsInto,
  VIVID,
  withBlight,
  withRemovedCounters,
} from '../src/ecl-vocab.ts';

// Lorwyn Eclipsed (18a): the builders produce what the engine runs.

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
const land = (id: string, produces: 'G' | 'R'): CardDefinition =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['G'], ...extra });

const DB = new Map(
  [
    land('forest', 'G'),
    land('mountain', 'R'),
    creature('ogre', 3, 3),
    creature('seizer', 2, 2, {
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [],
          effects: [
            mayBlight(1, [
              { kind: 'gainLife', who: 'controller', amount: { toughnessOf: BLIGHTED } },
            ]),
          ],
        },
      ],
    }),
    creature('legend', 3, 3, {
      back: 'legend-back',
      abilities: [
        entersOrTransforms([{ kind: 'draw', who: 'controller', amount: 1 }]),
        firstMainTransform({ generic: 0, colored: { G: 1 } }),
      ],
    }),
    creature('legend-back', 4, 4, {
      noManaCost: true,
      abilities: [
        transformsInto([{ kind: 'gainLife', who: 'controller', amount: 4 }]),
        firstMainTransform({ generic: 0, colored: { G: 1 } }),
      ],
    }),
    creature('drake', 2, 2, {
      ...evoke({ generic: 0, colored: { R: 1 } }),
      abilities: [enterIfSpent({ R: 1 }, [{ kind: 'draw', who: 'controller', amount: VIVID }])],
    }),
    creature('burdened', 4, 4, {
      ...entersWithMinusCounters(2),
      abilities: [
        {
          kind: 'activated',
          sorcerySpeed: true,
          cost: withRemovedCounters(1, { mana: { generic: 0, colored: { R: 1 } } }),
          targets: [],
          effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        },
        {
          kind: 'activated',
          cost: withBlight(1, { tapSelf: true }),
          targets: [],
          effects: [blight(1)],
        },
      ],
    }),
    card({
      id: 'strike',
      types: ['Sorcery'],
      colors: ['R'],
      ...optionalBlight(1),
      spell: {
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: additionalCostPaid,
            then: [{ kind: 'draw', who: 'controller', amount: 2 }],
            else: [{ kind: 'draw', who: 'controller', amount: 1 }],
          },
        ],
      },
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(DB);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(DB, spec));

describe('Lorwyn Eclipsed builders', () => {
  it('mayBlight with BLIGHTED: "the blighted creature" is the one chosen', () => {
    const g = game({ p1: { hand: ['seizer'], battlefield: ['ogre'] } });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    g.passBoth();
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'ogre') });
    // The ogre is a 3/3 with a -1/-1 counter: toughness 2.
    expect(g.life('p1')).toBe(22);
  });

  it('firstMainTransform, entersOrTransforms and transformsInto', () => {
    const g = game({ step: 'upkeep', p1: { battlefield: ['legend', 'forest'] } });
    const legend = g.id('p1', 'legend');
    g.passUntilStep('main1');
    g.passBoth();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.obj(legend).defId).toBe('legend-back');
    g.passBoth();
    expect(g.life('p1')).toBe(24);
  });

  it('evoke and enterIfSpent', () => {
    const g = game({ p1: { hand: ['drake'], battlefield: ['mountain'] } });
    const hand = g.state.players.p1.hand.length;
    g.do(g.legal('p1').find((a) => a.type === 'castSpell' && a.evoked)!);
    for (let i = 0; i < 6 && g.state.stack.length > 0; i++) g.passBoth();
    // R spent: it draws a card for each color among our permanents (its own green), then it is sacrificed.
    expect(g.state.players.p1.hand.length).toBe(hand);
    expect(g.zoneOf(g.state.players.p1.graveyard[0]!)).toBe('graveyard');
  });

  it('withRemovedCounters, entersWithMinusCounters and withBlight', () => {
    const g = game({ p1: { hand: ['burdened'], battlefield: ['mountain', 'mountain'] } });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    const b = g.id('p1', 'burdened');
    expect(g.obj(b).counters?.['-1/-1']).toBe(2);
    g.obj(b).summoningSick = false;
    const remove = g.legal('p1').find((a) => a.type === 'activateAbility' && a.abilityIndex === 0)!;
    g.do(remove);
    expect(g.obj(b).counters?.['-1/-1']).toBe(1);
    const blighted = g
      .legal('p1')
      .find((a) => a.type === 'activateAbility' && a.abilityIndex === 1);
    expect(blighted?.type === 'activateAbility' && blighted.blight).toBe(b);
  });

  it('optionalBlight and additionalCostPaid', () => {
    const g = game({ p1: { hand: ['strike'], battlefield: ['mountain', 'ogre'] } });
    const strike = g.id('p1', 'strike', 'hand');
    const paid = g
      .legal('p1')
      .find((a) => a.type === 'castSpell' && a.card === strike && a.blight)!;
    const hand = g.state.players.p1.hand.length;
    g.do(paid);
    g.passBoth();
    // The strike left the hand (-1) and two cards were drawn.
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 2);
  });

  it('the flags builders are plain data', () => {
    expect(hasMinusCounter).toEqual({ kind: 'sourceNamedCounters', name: '-1/-1', min: 1 });
    expect(returnBeheldWhenLeaves).toMatchObject({ trigger: { on: 'leavesBattlefield' } });
  });
});
