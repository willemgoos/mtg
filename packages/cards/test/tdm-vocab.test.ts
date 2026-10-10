import { createEngine, type CardDefinition } from '@mtg/engine';
import { mapKeywords } from '../src/build.ts';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  beholdDragonOrPay,
  controlsDragon,
  DRAGON,
  endure,
  flurry,
  grantHarmonize,
  harmonize,
  mayBeholdDragon,
  mayBeholdDragonThen,
  mobilize,
  renew,
  enterChoiceVariants,
  returnWhenDragonEnters,
  TDM_SPIRIT,
  TDM_VOCAB_TOKENS,
  TDM_WARRIOR,
  withEnterChoice,
} from '../src/tdm-vocab.ts';

// Tarkir: Dragonstorm (19a): the builders produce what the engine runs.

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

const SIEGE = card({
  id: 'siege',
  types: ['Enchantment'],
  colors: ['G'],
  manaCost: { generic: 0, colored: { G: 1 } },
  enterChoices: [
    {
      label: 'Abzan',
      abilities: [
        {
          kind: 'static',
          effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 2, toughness: 2 },
        },
      ],
    },
    {
      label: 'Mardu',
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'creaturesYouControl',
            power: 0,
            toughness: 0,
            keywords: ['haste'],
          },
        },
      ],
    },
  ],
});

const DB = new Map(
  [
    land('forest', 'G'),
    withEnterChoice(SIEGE),
    ...enterChoiceVariants(SIEGE),
    land('mountain', 'R'),
    ...TDM_VOCAB_TOKENS,
    creature('ogre', 3, 3),
    creature('duelist', 2, 1, {
      abilities: [flurry([{ kind: 'damage', amount: 1, to: 'eachOpponent' }])],
    }),
    creature('warband', 2, 2, { abilities: [mobilize(2)] }),
    creature('guard', 1, 1, {
      manaCost: { generic: 0, colored: { G: 1 } },
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [],
          effects: [endure(1)],
        },
      ],
    }),
    creature('sage', 2, 2, {
      abilities: [
        renew(
          { generic: 0, colored: { G: 1 } },
          [{ what: 'creature' }],
          [{ kind: 'counters', to: { target: 0 }, amount: 2 }],
        ),
      ],
    }),
    card({
      id: 'unending',
      types: ['Sorcery'],
      colors: ['G'],
      manaCost: { generic: 0, colored: { G: 1 } },
      ...harmonize({ generic: 3, colored: { G: 1 } }),
      spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 1 }] },
    }),
    creature('mage', 2, 2, {
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [
            { what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } },
          ],
          effects: [grantHarmonize],
        },
      ],
    }),
    creature('wyrm', 4, 4, { subtypes: ['Dragon'] }),
    creature('sarkhan', 1, 1, {
      manaCost: { generic: 0, colored: { R: 1 } },
      abilities: [
        {
          kind: 'triggered',
          trigger: { on: 'etb' },
          targets: [],
          effects: [mayBeholdDragonThen([{ kind: 'gainLife', who: 'controller', amount: 3 }])],
        },
      ],
    }),
    card({
      id: 'exhale',
      types: ['Instant'],
      colors: ['R'],
      manaCost: { generic: 0, colored: { R: 1 } },
      ...beholdDragonOrPay({ generic: 1, colored: {} }),
      spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 1 }] },
    }),
    card({
      id: 'osseous',
      types: ['Instant'],
      colors: ['R'],
      manaCost: { generic: 0, colored: { R: 1 } },
      ...mayBeholdDragon(),
      spell: {
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'wasKicked' },
            then: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
            else: [],
          },
        ],
      },
    }),
    card({
      id: 'dragonstorm',
      types: ['Enchantment'],
      colors: ['R'],
      manaCost: { generic: 1, colored: { R: 1 } },
      abilities: [returnWhenDragonEnters],
    }),
    card({
      id: 'check',
      types: ['Sorcery'],
      colors: ['R'],
      spell: {
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: controlsDragon,
            then: [{ kind: 'draw', who: 'controller', amount: 1 }],
            else: [],
          },
        ],
      },
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(DB);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(DB, spec));

describe('Tarkir: Dragonstorm builders', () => {
  it('the vocabulary tokens exist: a 0/0 white Spirit and a 1/1 red Warrior', () => {
    const spirit = TDM_VOCAB_TOKENS.find((t) => t.id === TDM_SPIRIT)!;
    const warrior = TDM_VOCAB_TOKENS.find((t) => t.id === TDM_WARRIOR)!;
    expect([spirit.colors, spirit.power, spirit.toughness]).toEqual([['W'], 0, 0]);
    expect([warrior.colors, warrior.power, warrior.toughness]).toEqual([['R'], 1, 1]);
    expect(DRAGON).toEqual({ subtype: 'Dragon' });
  });

  it('flurry(): triggers on the second spell only', () => {
    const g = game({
      p1: { hand: ['unending', 'unending'], battlefield: ['duelist', 'forest', 'forest'] },
      p2: {},
    });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    expect(g.life('p2')).toBe(20);
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth(); // the flurry trigger is on top of the second spell
    expect(g.life('p2')).toBe(19);
  });

  it('mobilize(2): two tapped and attacking Warriors, gone at the end step', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['warband'] }, p2: {} });
    g.passBoth();
    g.attack(g.id('p1', 'warband'));
    g.passBoth();
    const warriors = () =>
      g.state.battlefield.filter((id) => g.state.objects[id]!.defId === TDM_WARRIOR);
    expect(warriors()).toHaveLength(2);
    g.passUntilStep('end');
    while (g.state.stack.length) g.passBoth();
    expect(warriors()).toHaveLength(0);
  });

  it('endure(1): counter or Spirit', () => {
    const g = game({ p1: { hand: ['guard'], battlefield: ['forest'] }, p2: {} });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 1 });
    const spirit = g.state.battlefield.find((id) => g.state.objects[id]!.defId === TDM_SPIRIT)!;
    expect(spirit).toBeDefined();
  });

  it('renew(): from the graveyard, as a sorcery, exiling the card', () => {
    const g = game({
      p1: { graveyard: ['sage'], battlefield: ['forest', 'ogre'] },
      p2: {},
    });
    const sage = g.id('p1', 'sage', 'graveyard');
    g.do(g.legal('p1').find((a) => a.type === 'activateAbility' && a.source === sage)!);
    expect(g.zoneOf(sage)).toBe('exile');
    g.passBoth();
    expect(g.obj(g.id('p1', 'ogre')).plusOneCounters).toBe(2);
  });

  it('harmonize() and grantHarmonize', () => {
    const g = game({
      p1: { graveyard: ['unending'], battlefield: ['forest', 'forest', 'ogre'] },
      p2: {},
    });
    const spell = g.id('p1', 'unending', 'graveyard');
    const tapped = g
      .legal('p1')
      .find((a) => a.type === 'castSpell' && a.card === spell && a.harmonizeTap)!;
    expect(tapped).toBeDefined();
    g.do(tapped);
    g.passBoth();
    expect(g.zoneOf(spell)).toBe('exile');
    const h = game({
      p1: { graveyard: ['unending'], hand: ['mage'], battlefield: ['forest', 'forest'] },
      p2: {},
    });
    h.do(h.legal('p1').find((a) => a.type === 'castSpell')!);
    h.passBoth();
    h.do(h.legal('p1')[0]!);
    h.passBoth();
    const again = h
      .legal('p1')
      .find((a) => a.type === 'castSpell' && a.card === h.id('p1', 'unending', 'graveyard'));
    expect(again).toBeDefined();
  });

  it('behold a Dragon: or pay, optional, the effect, the condition and the Dragonstorm return', () => {
    const g = game({
      p1: { hand: ['exhale', 'osseous', 'check'], battlefield: ['mountain', 'wyrm'] },
      p2: {},
    });
    const exhale = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'exhale', 'hand'));
    expect(exhale.some((a) => a.type === 'castSpell' && a.beheld)).toBe(true);
    const osseous = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'osseous', 'hand'));
    expect(osseous.some((a) => a.type === 'castSpell' && a.kicked)).toBe(true);
    const check = g
      .legal('p1')
      .find((a) => a.type === 'castSpell' && a.card === g.id('p1', 'check', 'hand'));
    expect(check).toBeDefined();
    g.do(check!);
    g.passBoth();
    expect(g.state.players.p1.hand.length).toBe(3); // drew a card: 'check' left, one drawn
    const s = game({
      p1: { hand: ['sarkhan', 'wyrm'], battlefield: ['mountain'] },
      p2: {},
    });
    s.do(
      s
        .legal('p1')
        .find((a) => a.type === 'castSpell' && a.card === s.id('p1', 'sarkhan', 'hand'))!,
    );
    s.passBoth();
    s.passBoth();
    expect(s.decision.kind).toBe('chooseOption');
    const storm = game({
      p1: { hand: ['wyrm'], battlefield: ['dragonstorm', 'forest', 'forest', 'forest', 'forest'] },
      p2: {},
    });
    storm.do(storm.legal('p1').find((a) => a.type === 'castSpell')!);
    while (storm.state.stack.length) storm.passBoth();
    expect(
      storm.state.players.p1.hand.some((id) => storm.state.objects[id]!.defId === 'dragonstorm'),
    ).toBe(true);
  });

  it('enterChoices: the card asks, the choice makes a hidden definition with its abilities', () => {
    expect(enterChoiceVariants(SIEGE).map((v) => [v.id, v.variantOf])).toEqual([
      ['siege--abzan', 'siege'],
      ['siege--mardu', 'siege'],
    ]);
    const g = game({ p1: { hand: ['siege'], battlefield: ['forest', 'ogre'] }, p2: {} });
    g.do(g.legal('p1').find((a) => a.type === 'castSpell')!);
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    g.do({ type: 'chooseOption', player: 'p1', index: 0 });
    const siege = g.state.battlefield.find((id) => g.state.objects[id]!.defId === 'siege--abzan');
    expect(siege).toBeDefined();
    expect(g.state.objects[siege!]!.front).toBe('siege');
  });

  it('mapKeywords: the Tarkir keywords are abilities in the behaviour, and Ureni has its two protections', () => {
    expect(mapKeywords(['Mobilize', 'Deathtouch'], 'Deathtouch\nMobilize 1 (...)')).toEqual([
      'deathtouch',
    ]);
    expect(mapKeywords(['Endure'], 'When this creature enters, it endures 2.')).toEqual([]);
    expect(mapKeywords(['Harmonize'], 'Draw a card.\nHarmonize {5}{U}')).toEqual([]);
    expect(
      mapKeywords(['Flurry'], 'Flurry — Whenever you cast your second spell each turn, draw.'),
    ).toEqual([]);
    expect(mapKeywords(['Renew'], 'Renew — {B}, Exile this card from your graveyard: ...')).toEqual(
      [],
    );
    expect(
      mapKeywords(
        ['Flying', 'Protection'],
        'Flying, protection from white and from black\nWhen Ureni enters...',
      ),
    ).toEqual(['flying', 'protectionWhite', 'protectionBlack']);
    // A card that only grants protection from white gets no keyword.
    expect(
      mapKeywords(['Protection'], 'Target creature gains protection from white until end of turn.'),
    ).toEqual([]);
  });
});
