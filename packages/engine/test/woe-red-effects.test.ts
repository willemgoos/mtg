import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  AbilityDef,
  CardDefinition,
  EffectDef,
  GameState,
  Keyword,
  ManaCost,
  PlayerId,
  TargetSpec,
} from '../src/types.ts';
import { DB as WOE_DB } from './woe-fixtures.ts';

// Wilds of Eldraine (23b, red): the engine pieces of engine/src/woe-red-effects.ts, on fixture cards.

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});
const card = (d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition => ({
  name: d.id,
  manaCost: cost(0),
  colors: [],
  types: [],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
  ...d,
});
const creature = (
  id: string,
  p: number,
  t: number,
  extra: Partial<CardDefinition> = {},
  keywords: Keyword[] = [],
) => card({ id, types: ['Creature'], power: p, toughness: t, keywords, ...extra });
const t0 = { target: 0 } as const;
const anyCreature: TargetSpec = { what: 'creature' };

const triggered = (
  trig: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({ kind: 'triggered', trigger: trig, targets, effects });

const rat = card({
  id: 'r-rat',
  name: 'Rat',
  types: ['Creature'],
  subtypes: ['Rat'],
  colors: ['B'],
  power: 1,
  toughness: 1,
  isToken: true,
  abilities: [{ kind: 'static', effect: { kind: 'cantBlock' } }],
});

const FIXTURE: CardDefinition[] = [
  rat,
  // Gnawing Crescendo: creatures you control get +2/+0; whenever a nontoken creature you control dies this turn, a Rat.
  card({
    id: 'r-crescendo',
    types: ['Instant'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'emblem',
          until: 'endOfTurn',
          ability: triggered({ on: 'otherCreatureDies', controller: 'you', nontoken: true }, [
            { kind: 'createToken', token: 'r-rat', count: 1 },
          ]),
        },
      ],
    },
  }),
  // A removal spell for either side's creatures.
  card({
    id: 'r-bolt',
    types: ['Instant'],
    manaCost: cost(0, { R: 1 }),
    spell: { targets: [anyCreature], effects: [{ kind: 'damage', amount: 3, to: t0 }] },
  }),
  // Two targets: damage to the first, and a second target that may be the same creature.
  card({
    id: 'r-twin',
    types: ['Sorcery'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [anyCreature, { ...anyCreature, optional: true, modeStart: 1 }],
      effects: [{ kind: 'damage', amount: 2, to: t0 }],
    },
  }),
  // Imodane.
  creature('r-imodane', 4, 4, {
    abilities: [
      triggered({ on: 'yourSpellDamagesItsSingleTarget' }, [
        { kind: 'damage', amount: { event: 'amount' }, to: 'eachOpponent' },
      ]),
    ],
  }),
  // Kellan.
  creature(
    'r-kellan',
    2,
    2,
    {
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'otherCreaturesYouControl',
            power: {
              count: 'attachedToSource',
              filter: { anyOf: [{ subtype: 'Aura' }, { subtype: 'Equipment' }] },
            },
            toughness: 0,
          },
        },
      ],
    },
    ['doubleStrike'],
  ),
  card({
    id: 'r-aura',
    types: ['Enchantment'],
    subtypes: ['Aura'],
    manaCost: cost(0, { W: 1 }),
    enchant: { what: 'creature' },
  }),
  card({
    id: 'r-blade',
    types: ['Artifact'],
    subtypes: ['Equipment'],
    manaCost: cost(1),
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 0 } },
      {
        kind: 'activated',
        cost: { mana: cost(1) },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
      },
    ],
  }),
  // Food Fight: artifacts you control have "{2}, Sacrifice this artifact: 1 damage to any target".
  card({
    id: 'r-fight',
    types: ['Enchantment'],
    manaCost: cost(1, { R: 1 }),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'artifactsYouControlHave',
          ability: {
            kind: 'activated',
            cost: { mana: cost(2), sacrificeSelf: true },
            targets: [{ what: 'any' }],
            effects: [{ kind: 'damage', amount: 1, to: t0 }],
          },
        },
      },
    ],
  }),
  card({ id: 'r-trinket', types: ['Artifact'], manaCost: cost(1) }),
  // Goddric.
  creature(
    'r-goddric',
    3,
    3,
    {
      subtypes: ['Human', 'Noble'],
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'while',
            condition: { kind: 'celebration' },
            power: 0,
            toughness: 0,
            basePT: [4, 4],
            keywords: ['flying'],
          },
        },
        {
          kind: 'static',
          effect: {
            kind: 'becomesWhileCelebrating',
            subtypes: ['Dragon'],
            abilities: [
              {
                kind: 'activated',
                cost: { mana: cost(0, { R: 1 }) },
                targets: [],
                effects: [
                  {
                    kind: 'pump',
                    to: { each: 'creature', controller: 'you', filter: { subtype: 'Dragon' } },
                    power: 1,
                    toughness: 0,
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    ['haste'],
  ),
  // Skewer Slinger.
  creature(
    'r-slinger',
    1,
    3,
    {
      abilities: [
        triggered({ on: 'blocksOrBecomesBlocked' }, [{ kind: 'damage', amount: 1, to: 'subject' }]),
      ],
    },
    ['reach'],
  ),
  // Korvold chapter III as a spell: exile the top three of target opponent's library; play them this turn.
  card({
    id: 'r-korvold',
    types: ['Sorcery'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [{ what: 'player', controller: 'opponent' }],
      effects: [{ kind: 'custom', handler: 'woeKorvoldExile' }],
    },
  }),
  card({
    id: 'r-plains',
    types: ['Land'],
    supertypes: ['Basic'],
    subtypes: ['Plains'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'W' }],
  }),
  card({
    id: 'r-mountain',
    types: ['Land'],
    supertypes: ['Basic'],
    subtypes: ['Mountain'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'R' }],
  }),
  creature('r-bear', 2, 2),
  creature('r-wall', 0, 5),
  card({
    id: 'r-scion',
    types: ['Instant'],
    manaCost: cost(0, { R: 1 }),
    spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 1 }] },
  }),
];

const DB = new Map([...WOE_DB, ...FIXTURE.map((c) => [c.id, c] as const)]);
const engine = createEngine(DB);
const scenario = (spec: ScenarioSpec = {}): GameState => buildScenario(DB, spec);
const game = (spec: ScenarioSpec) => new GameDriver(engine, scenario(spec));
const mountains = (n: number) => Array<string>(n).fill('r-mountain');
const ref = (g: GameDriver, id: string) => g.ref(id);
const power = (g: GameDriver, id: string) => getCharacteristics(g.state, DB, id).power;
const settle = (g: GameDriver) => {
  for (let i = 0; i < 40 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};
const castAt = (g: GameDriver, player: PlayerId, def: string, ...targets: string[]) => {
  const card = g.id(player, def, 'hand');
  const a = g
    .legal(player)
    .find(
      (x) =>
        x.type === 'castSpell' &&
        x.card === card &&
        x.targets.length === targets.length &&
        targets.every(
          (t, i) =>
            'object' in x.targets[i]! &&
            (x.targets[i] as { object: { id: string } }).object.id === t,
        ),
    );
  if (!a) throw new Error(`No cast of ${def}`);
  return g.do(a);
};
const castPlayer = (g: GameDriver, def: string, player: PlayerId) => {
  const card = g.id(g.actor, def, 'hand');
  return g.do({
    type: 'castSpell',
    player: g.actor,
    card,
    targets: [{ player }],
  });
};

describe('an emblem that sees your nontoken creatures die (Gnawing Crescendo)', () => {
  it('triggers for your nontoken creatures only, this turn only', () => {
    const g = game({
      p1: {
        hand: ['r-crescendo', 'r-bolt', 'r-bolt', 'r-bolt'],
        battlefield: ['r-bear', 'r-bear', 'r-rat', ...mountains(6)],
      },
      p2: { battlefield: ['r-bear'] },
    });
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'r-bear');
    const [mine, , theirs] = [bears[0]!, bears[1]!, bears[2]!];
    expect(g.obj(theirs).controller).toBe('p2');
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'r-crescendo', 'hand'), targets: [] });
    settle(g);
    castAt(g, 'p1', 'r-bolt', mine);
    settle(g);
    expect(g.zoneOf(mine)).toBe('graveyard');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'r-rat')).toHaveLength(2);
    // The opponent's creature dying changes nothing.
    castAt(g, 'p1', 'r-bolt', theirs);
    settle(g);
    expect(g.zoneOf(theirs)).toBe('graveyard');
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'r-rat')).toHaveLength(2);
  });
});

describe('Imodane, the Pyrohammer: yourSpellDamagesItsSingleTarget', () => {
  it('a spell with a single creature target that damages it', () => {
    const g = game({
      p1: { hand: ['r-bolt'], battlefield: ['r-imodane', ...mountains(2)] },
      p2: { battlefield: ['r-wall'] },
    });
    castAt(g, 'p1', 'r-bolt', g.id('p2', 'r-wall'));
    settle(g);
    expect(g.life('p2')).toBe(17);
  });

  it('not with two different targets, yes when both are the same creature, never for a creature spell’s own player target', () => {
    const g = game({
      p1: { hand: ['r-twin', 'r-twin'], battlefield: ['r-imodane', 'r-wall', ...mountains(2)] },
      p2: { battlefield: ['r-wall'] },
    });
    const mine = g.id('p1', 'r-wall');
    const theirs = g.id('p2', 'r-wall');
    castAt(g, 'p1', 'r-twin', theirs, mine);
    settle(g);
    expect(g.life('p2')).toBe(20);
    castAt(g, 'p1', 'r-twin', theirs, theirs);
    settle(g);
    expect(g.life('p2')).toBe(18);
  });

  it('only spells you control', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['r-imodane', 'r-wall'] },
      p2: { hand: ['r-bolt'], battlefield: mountains(1) },
    });
    castAt(g, 'p2', 'r-bolt', g.id('p1', 'r-wall'));
    settle(g);
    expect(g.life('p2')).toBe(20);
  });
});

describe('count: attachedToSource (Kellan, the Fae-Blooded)', () => {
  it('counts Auras and Equipment attached to the source, whoever controls them', () => {
    const g = game({
      p1: { battlefield: ['r-kellan', 'r-bear', 'r-blade', ...mountains(2)] },
      p2: { hand: ['r-aura'], battlefield: ['r-plains'] },
    });
    const kellan = g.id('p1', 'r-kellan');
    const bear = g.id('p1', 'r-bear');
    expect(power(g, bear)).toBe(2);
    const equip = g
      .legal('p1')
      .find((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'r-blade'))!;
    g.do({ ...equip, targets: [ref(g, kellan)] } as never);
    settle(g);
    expect(power(g, bear)).toBe(3);
    expect(power(g, kellan)).toBe(3);
    // The opponent's Aura on Kellan counts as well.
    const h = game({
      active: 'p2',
      p1: { battlefield: ['r-kellan', 'r-bear'] },
      p2: { hand: ['r-aura'], battlefield: ['r-plains'] },
    });
    castAt(h, 'p2', 'r-aura', h.id('p1', 'r-kellan'));
    settle(h);
    expect(power(h, h.id('p1', 'r-bear'))).toBe(3);
  });
});

describe('artifactsYouControlHave (Food Fight)', () => {
  it('your artifacts have the ability, the opponent’s and a non-artifact do not', () => {
    const g = game({
      p1: { battlefield: ['r-fight', 'r-trinket', ...mountains(2)] },
      p2: { battlefield: ['r-trinket'] },
    });
    const mine = g.id('p1', 'r-trinket');
    const acts = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === mine);
    expect(acts.length).toBeGreaterThan(0);
    expect(
      g
        .legal('p1')
        .some((a) => a.type === 'activateAbility' && a.source === g.id('p2', 'r-trinket')),
    ).toBe(false);
    expect(
      g.legal('p1').some((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'r-fight')),
    ).toBe(false);
    g.do(
      acts.find(
        (a) =>
          a.type === 'activateAbility' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!,
    );
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.zoneOf(mine)).toBe('graveyard');
  });
});

describe('becomesWhileCelebrating (Goddric, Cloaked Reveler)', () => {
  it('base 4/4, flying, a Dragon with the ability while two nonland permanents entered; nothing before', () => {
    const g = game({
      p1: {
        hand: ['r-trinket', 'r-bear'],
        battlefield: ['r-goddric', ...mountains(5)],
      },
    });
    const goddric = g.id('p1', 'r-goddric');
    const chars = () => getCharacteristics(g.state, DB, goddric);
    expect([chars().power, chars().toughness]).toEqual([3, 3]);
    expect(chars().subtypes).toEqual(['Human', 'Noble']);
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'r-trinket', 'hand'), targets: [] });
    settle(g);
    expect(chars().subtypes).toEqual(['Human', 'Noble']);
    g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'r-bear', 'hand'), targets: [] });
    settle(g);
    expect([chars().power, chars().toughness]).toEqual([4, 4]);
    expect(chars().subtypes).toEqual(['Dragon']);
    expect(chars().keywords.has('flying')).toBe(true);
    expect(chars().keywords.has('haste')).toBe(true);
    const pump = g.legal('p1').filter((a) => a.type === 'activateAbility' && a.source === goddric);
    expect(pump).toHaveLength(1);
    g.do(pump[0]!);
    settle(g);
    expect(power(g, goddric)).toBe(5);
    expect(power(g, g.id('p1', 'r-bear'))).toBe(2);
  });
});

describe('blocksOrBecomesBlocked (Skewer Slinger)', () => {
  it('1 damage to each creature on the other side, whether it blocks or is blocked', () => {
    const g = game({
      p1: { battlefield: ['r-slinger', 'r-bear'] },
      p2: { battlefield: ['r-wall', 'r-bear'] },
    });
    const slinger = g.id('p1', 'r-slinger');
    const wall = g.id('p2', 'r-wall');
    const theirBear = g.id('p2', 'r-bear');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(slinger);
    for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.block([wall, slinger], [theirBear, slinger]);
    settle(g);
    expect(g.obj(wall).damage).toBe(1);
    expect(g.obj(theirBear).damage).toBe(1);
    expect(g.obj(slinger).damage).toBe(0);
  });

  it('blocking an attacker deals it 1 damage', () => {
    const g = game({
      p1: { battlefield: ['r-bear'] },
      p2: { battlefield: ['r-slinger'] },
    });
    const bear = g.id('p1', 'r-bear');
    for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
    g.attack(bear);
    for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    g.block([g.id('p2', 'r-slinger'), bear]);
    settle(g);
    expect(g.obj(bear).damage).toBe(1);
  });
});

describe('woeKorvoldExile (Korvold and the Noble Thief, chapter III)', () => {
  it('exiles the top three of the opponent’s library; only you may play them, this turn', () => {
    const g = game({
      p1: { hand: ['r-korvold'], battlefield: mountains(2) },
      p2: { library: ['r-mountain', 'r-scion', 'r-bear', 'r-bear', 'r-bear'] },
    });
    castPlayer(g, 'r-korvold', 'p2');
    settle(g);
    expect(g.state.players.p2.exile.map((id) => g.obj(id).defId)).toEqual([
      'r-mountain',
      'r-scion',
      'r-bear',
    ]);
    expect(g.state.players.p2.library).toHaveLength(2);
    const [land, scion, bear] = g.state.players.p2.exile;
    expect(g.legal('p1').some((a) => a.type === 'playLand' && a.card === land)).toBe(true);
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === scion)).toBe(true);
    expect(g.legal('p1').some((a) => a.type === 'castSpell' && a.card === bear)).toBe(true);
    expect(
      g
        .legal('p2')
        .some((a) => (a.type === 'castSpell' || a.type === 'playLand') && a.card === scion),
    ).toBe(false);
  });
});
