import type { AbilityDef, CardFilter, EffectDef, SpellDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from './build.ts';

/**
 * Bloomburrow (BLB) cards for the two Bloomburrow decks: Golgari Squirrels
 * (forage, Food, gift) and Selesnya Rabbits (tokens, offspring, valiant).
 * Printed characteristics come from Scryfall; only rules text lives here.
 */

const t0 = { target: 0 } as const;
const t1 = { target: 1 } as const;
const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const yourCreatureCard = (optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'] },
  ...(optional ? { optional: true } : {}),
});
const yours = { each: 'creature', controller: 'you' } as const;
const draw = (amount: number): EffectDef => ({ kind: 'draw', who: 'controller', amount });
const gain = (amount: number): EffectDef => ({ kind: 'gainLife', who: 'controller', amount });
const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];
const food: EffectDef = { kind: 'createToken', token: 'food-token', count: 1 };
const rabbit = (count = 1): EffectDef => ({ kind: 'createToken', token: 'rabbit-token', count });

const onEnter = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects,
});
/** "You may forage. If you do, ..." */
const mayForage = (...then: EffectDef[]): EffectDef => ({ kind: 'forage', optional: true, then });
const squirrelOrFood: CardFilter = { anyOf: [{ subtype: 'Squirrel' }, { subtype: 'Food' }] };
const youControlAToken = {
  kind: 'controlsPermanents',
  filter: { token: true },
  min: 1,
} as const;

/**
 * Offspring {cost}: an optional extra cost (kicker under another name); if it
 * was paid, the creature makes a 1/1 token copy of itself as it enters.
 */
function offspring(cost: string, ...abilities: AbilityDef[]): Behavior {
  return {
    kicker: { cost: mana(cost), as: 'offspring' },
    abilities: [
      ...abilities,
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasKicked' },
        targets: [],
        effects: [{ kind: 'offspringCopy' }],
      },
    ],
  };
}

/** The gifts an opponent can be promised. */
const GIFTS = {
  card: { kind: 'draw', who: 'eachOpponent', amount: 1 },
  food: { ...food, forOpponent: true },
  fish: { kind: 'createToken', token: 'fish-token', count: 1, tapped: true, forOpponent: true },
} satisfies Record<string, EffectDef>;

/**
 * Gift: promising the gift is free (a zero-cost kicker). The opponent gets it
 * first as the spell resolves, then the spell does its promised version.
 */
function gift(present: keyof typeof GIFTS, spell: SpellDef, promised: SpellDef): Behavior {
  return {
    spell,
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      spell: { ...promised, effects: [GIFTS[present], ...promised.effects] },
    },
  };
}

export const BLOOMBURROW_BEHAVIORS: Record<string, Behavior> = {
  // ------------------------------------------------------------- Golgari Squirrels
  'Agate-Blade Assassin': {
    abilities: [{ kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: drain(1) }],
  },
  'Bakersbane Duo': {
    abilities: [
      onEnter(food),
      {
        kind: 'triggered',
        trigger: { on: 'expend', amount: 4 },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
      },
    ],
  },
  'Vinereap Mentor': {
    abilities: [
      onEnter(food),
      { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [food] },
    ],
  },
  'Bonebind Orator': {
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{3}{B}'), exileSelf: true },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], other: true },
          },
        ],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
    ],
  },
  'Bushy Bodyguard': offspring(
    '{2}',
    onEnter(mayForage({ kind: 'counters', to: 'self', amount: 2 })),
  ),
  'Daggerfang Duo': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [],
        effects: [{ kind: 'mill', count: 2 }],
      },
    ],
  },
  'Curious Forager': {
    // "When you do, return target permanent card": chosen as it happens.
    abilities: [
      onEnter(
        mayForage({
          kind: 'returnFromGraveyard',
          types: ['Creature', 'Artifact', 'Enchantment', 'Land'],
        }),
      ),
    ],
  },
  'Honored Dreyleader': {
    abilities: [
      onEnter({
        kind: 'counters',
        to: 'self',
        amount: { count: 'permanentsYouControl', filter: squirrelOrFood, other: true },
      }),
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: squirrelOrFood },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Treetop Sentries': { abilities: [onEnter(mayForage(draw(1)))] },
  'Thornplate Intimidator': offspring('{3}', onEnter({ kind: 'punisher', life: 3 })),
  "Wick's Patrol": {
    // The target is chosen as the trigger goes on the stack, before the mill.
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [
          { kind: 'mill', count: 3 },
          {
            kind: 'pump',
            to: t0,
            power: { multiply: -1, amount: { count: 'greatestManaValueInGraveyard' } },
            toughness: { multiply: -1, amount: { count: 'greatestManaValueInGraveyard' } },
          },
        ],
      },
    ],
  },
  'Camellia, the Seedmiser': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Squirrel' },
          power: 0,
          toughness: 0,
          keywords: ['menace'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'youSacrifice', filter: { subtype: 'Food' } },
        targets: [],
        effects: [{ kind: 'createToken', token: 'squirrel-token', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), forage: true },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: {
              each: 'creature',
              controller: 'you',
              filter: { subtype: 'Squirrel', other: true },
            },
            amount: 1,
          },
        ],
      },
    ],
  },
  'Feed the Cycle': {
    forageOrPay: mana('{B}'),
    spell: { targets: [creature], effects: [{ kind: 'destroy', what: t0 }] },
  },
  Savor: {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: -2, toughness: -2 }, food],
    },
  },
  'Nocturnal Hunger': gift(
    'food',
    {
      targets: [creature],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'loseLife', who: 'controller', amount: 2 },
      ],
    },
    { targets: [creature], effects: [{ kind: 'destroy', what: t0 }] },
  ),
  'Longstalk Brawl': gift(
    'fish',
    { targets: [yourCreature, theirCreature], effects: [{ kind: 'fight', a: t0, b: t1 }] },
    {
      targets: [yourCreature, theirCreature],
      effects: [
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'fight', a: t0, b: t1 },
      ],
    },
  ),
  'Consumed by Greed': gift(
    'card',
    { targets: [], effects: [{ kind: 'opponentSacrifices', greatestPower: true }] },
    {
      targets: [yourCreatureCard()],
      effects: [
        { kind: 'opponentSacrifices', greatestPower: true },
        { kind: 'returnToHand', what: t0 },
      ],
    },
  ),
  "Hazel's Nocturne": {
    spell: {
      targets: [yourCreatureCard(true), yourCreatureCard(true)],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
        ...drain(2),
      ],
    },
  },

  // ------------------------------------------------------------- Selesnya Rabbits
  'Seasoned Warrenguard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: youControlAToken,
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 0 }],
      },
    ],
  },
  'Brave-Kin Duo': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 1 }],
      },
    ],
  },
  'Nettle Guard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'valiant' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 2 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Intrepid Rabbit': offspring('{1}', {
    kind: 'triggered',
    trigger: { on: 'etb' },
    targets: [yourCreature],
    effects: [{ kind: 'pump', to: t0, power: 1, toughness: 1 }],
  }),
  'Warren Elder': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{W}') },
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 1, toughness: 1 }],
      },
    ],
  },
  'Burrowguard Mentor': { ptEquals: { count: 'creaturesYouControl' } },
  'Harvestrite Host': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'selfOrCreatureEtb', filter: { subtype: 'Rabbit' } },
        targets: [yourCreature],
        effects: [
          { kind: 'pump', to: t0, power: 1, toughness: 0 },
          { kind: 'noteResolution' },
          { kind: 'if', condition: { kind: 'resolvedThisTurn', n: 2 }, then: [draw(1)] },
        ],
      },
    ],
  },
  'Druid of the Spade': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: youControlAToken,
          power: 2,
          toughness: 0,
          keywords: ['trample'],
        },
      },
    ],
  },
  'Hazardroot Herbalist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [yourCreature],
        effects: [
          { kind: 'pump', to: t0, power: 1, toughness: 0 },
          {
            kind: 'if',
            condition: { kind: 'targetMatches', target: 0, filter: { token: true } },
            then: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['deathtouch'] }],
          },
        ],
      },
    ],
  },
  'Finneas, Ace Archer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: {
              each: 'creature',
              controller: 'you',
              filter: { other: true, anyOf: [{ token: true }, { subtype: 'Rabbit' }] },
            },
            amount: 1,
          },
          {
            kind: 'if',
            condition: {
              kind: 'amountAtLeast',
              amount: { count: 'totalPowerOfCreaturesYouControl' },
              min: 10,
            },
            then: [draw(1)],
          },
        ],
      },
    ],
  },
  'Warren Warleader': offspring('{2}', {
    kind: 'triggered',
    trigger: { on: 'youAttack' },
    targets: [],
    effects: [],
    modes: [
      {
        label: 'Create an attacking Rabbit',
        targets: [],
        effects: [{ kind: 'createToken', token: 'rabbit-token', count: 1, attacking: true }],
      },
      {
        label: 'Attackers get +1/+1',
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { attacking: true } },
            power: 1,
            toughness: 1,
          },
        ],
      },
    ],
  }),
  'Treeguard Duo': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [
          {
            kind: 'pump',
            to: t0,
            power: { count: 'creaturesYouControl' },
            toughness: { count: 'creaturesYouControl' },
            keywords: ['vigilance'],
          },
        ],
      },
    ],
  },
  'Carrot Cake': {
    abilities: [
      onEnter(rabbit(), { kind: 'scry', amount: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'sacrificed' },
        targets: [],
        effects: [rabbit(), { kind: 'scry', amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain(3)],
      },
    ],
  },
  'Hop to It': { spell: { targets: [], effects: [rabbit(3)] } },
  'Crumb and Get It': gift(
    'food',
    { targets: [yourCreature], effects: [{ kind: 'pump', to: t0, power: 2, toughness: 2 }] },
    {
      targets: [yourCreature],
      effects: [{ kind: 'pump', to: t0, power: 2, toughness: 2, keywords: ['indestructible'] }],
    },
  ),
  "Mabel's Mettle": {
    spell: {
      targets: [creature, { what: 'creature', optional: true }],
      effects: [
        { kind: 'pump', to: t0, power: 2, toughness: 2 },
        { kind: 'pump', to: t1, power: 1, toughness: 1 },
      ],
    },
  },
  'Rabbit Response': {
    spell: {
      targets: [],
      effects: [
        { kind: 'pump', to: yours, power: 2, toughness: 1 },
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Rabbit' }, min: 1 },
          then: [{ kind: 'scry', amount: 2 }],
        },
      ],
    },
  },
  'Repel Calamity': {
    spell: {
      targets: [{ what: 'creature', filter: { anyOf: [{ minPower: 4 }, { minToughness: 4 }] } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
};
