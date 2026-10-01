import type { AbilityDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourEndStep,
  classCard,
  draw,
  food,
  gain,
  gift,
  mana,
  onEnter,
  t0,
  when,
} from './helpers.ts';

// Bloomburrow's most involved rares and mythics: casting from other zones,
// copies, and other one-of-a-kind rules.

const instantOrSorceryCard = (maxManaValue?: number): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter: {
    types: ['Instant', 'Sorcery'],
    ...(maxManaValue !== undefined ? { maxManaValue } : {}),
  },
});

export const MYTHICS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ casting from elsewhere
  'Daring Waverider': {
    abilities: [
      when({ on: 'etb' }, [instantOrSorceryCard(4)], {
        kind: 'castFree',
        what: t0,
        exileAfter: true,
      }),
    ],
  },
  'Wishing Well': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        // The card's mana value equals the coin counters after this one.
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: {
              types: ['Instant', 'Sorcery'],
              manaValueIsSourceCounters: { name: 'coin', plus: 1 },
            },
            optional: true,
          },
        ],
        effects: [
          { kind: 'namedCounters', name: 'coin', amount: 1 },
          { kind: 'castFree', what: t0, exileAfter: true },
        ],
      },
    ],
  },
  'Portent of Calamity': { spell: { targets: [], effects: [{ kind: 'portent' }] } },
  'Festival of Embers': {
    abilities: [
      { kind: 'static', effect: { kind: 'castFromGraveyardForLife' } },
      { kind: 'static', effect: { kind: 'graveyardToExile' } },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
        label: 'Sacrifice it',
      },
    ],
  },
  'Osteomancer Adept': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'osteomancer' }],
        label: 'Cast creatures from your graveyard this turn',
      },
    ],
  },
  "Cruelclaw's Heist": gift(
    'card',
    {
      targets: [],
      effects: [{ kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'exile' }],
    },
    {
      targets: [],
      effects: [
        {
          kind: 'chooseFromOpponentHand',
          filter: { nonland: true },
          then: 'exile',
          castable: true,
        },
      ],
    },
  ),
  'The Infamous Cruelclaw': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], { kind: 'exileUntilNonlandCastByDiscard' }),
    ],
  },
  "Glarb, Calamity's Augur": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'playFromTop',
          filter: { anyOf: [{ types: ['Land'] }, { minManaValue: 4 }] },
        },
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'surveil', amount: 2 }],
      },
    ],
  },

  // ------------------------------------------------------------------ X and copies
  Mockingbird: { entersAsCopy: { addSubtype: 'Bird', addKeyword: 'flying' } },
  'Hugs, Grisly Guardian': {
    abilities: [
      onEnter({ kind: 'exileTopPlayable', count: { x: true }, until: 'endOfNextTurn' }),
      { kind: 'static', effect: { kind: 'extraLandDrop' } },
    ],
  },
  Stormsplitter: {
    abilities: [
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'tokenCopy',
        of: 'self',
        exileAtEndStep: true,
      }),
    ],
  },

  // ------------------------------------------------------------------ others
  'Helga, Skittish Seer': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'creature', spell: { minManaValue: 4 } },
        [],
        draw(1),
        gain(1),
        { kind: 'counters', to: 'self', amount: 1 },
      ),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'addMana',
            mana: [['W', 'U', 'B', 'R', 'G']],
            count: { powerOf: 'self' },
            onlyFor: 'BigCreature',
          },
        ],
        label: '{T}: mana for big creature spells',
      },
    ],
  },
  "Dragonhawk, Fate's Tempest": {
    abilities: (['etb', 'attacks'] as const).map((on) =>
      when({ on }, [], {
        kind: 'dragonhawkExile',
        count: { count: 'permanentsYouControl', filter: { types: ['Creature'], minPower: 4 } },
        damage: 2,
      }),
    ),
  },

  // ------------------------------------------------------------------ the rest
  'Ygra, Eater of All': {
    abilities: [
      { kind: 'static', effect: { kind: 'creaturesAreFood' } },
      when({ on: 'foodToGraveyard' }, [], { kind: 'counters', to: 'self', amount: 2 }),
    ],
  },
  'Maha, Its Feathers Night': {
    abilities: [{ kind: 'static', effect: { kind: 'opponentsBaseToughness', toughness: 1 } }],
  },
  'Rottenmouth Viper': {
    sacrificeAnyForReduction: true,
    abilities: (['etb', 'attacks'] as const).map((on) =>
      when(
        { on },
        [],
        { kind: 'namedCounters', name: 'blight', amount: 1 },
        {
          kind: 'repeat',
          count: { namedCountersOnSource: 'blight' },
          effects: [{ kind: 'punisher', life: 4 }],
        },
      ),
    ),
  },
  "Scavenger's Talent": classCard(
    [
      {
        ...when({ on: 'creatureYouControlDies' }, [], food),
        batch: true,
        oncePerTurn: true,
      } as AbilityDef,
    ],
    {
      cost: '{1}{B}',
      abilities: [
        when({ on: 'youSacrifice', filter: {} }, [{ what: 'player' }], {
          kind: 'mill',
          count: 2,
          who: t0,
        }),
      ],
    },
    {
      cost: '{2}{B}',
      abilities: [
        {
          ...atYourEndStep(undefined, [], {
            kind: 'sacrificeSeveral',
            count: 3,
            filter: { nonland: true },
            then: [
              {
                kind: 'putFromHandOrGraveyard',
                filter: { types: ['Creature'] },
                counter: 'finality',
                graveyardOnly: true,
              },
            ],
          }),
          optional: true,
        } as AbilityDef,
      ],
    },
  ),
  'Baylen, the Haymaker': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapTokens: 2 },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']] }],
        label: 'Tap two tokens: one mana',
      },
      {
        kind: 'activated',
        cost: { tapTokens: 3 },
        targets: [],
        effects: [draw(1)],
        label: 'Tap three tokens: draw',
      },
      {
        kind: 'activated',
        cost: { tapTokens: 4 },
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 3 },
          { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['trample'] },
        ],
        label: 'Tap four tokens: three counters',
      },
    ],
  },
  'For the Common Good': {
    spell: {
      targets: [{ what: 'permanent', controller: 'you', filter: { token: true } }],
      effects: [
        { kind: 'tokenCopy', of: t0, count: { x: true } },
        {
          kind: 'pump',
          to: { each: 'permanent', controller: 'you', filter: { token: true } },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
          untilYourNextTurn: true,
        },
        gain({ count: 'permanentsYouControl', filter: { token: true } }),
      ],
    },
  },
  'Eluge, the Shoreless Sea': {
    ptEquals: { count: 'landsYouControl', subtype: 'Island' },
    abilities: [
      ...(['etb', 'attacks'] as const).map((on) =>
        when({ on }, [{ what: 'permanent', filter: { types: ['Land'] } }], {
          kind: 'namedCounters',
          name: 'flood',
          amount: 1,
          to: t0,
        }),
      ),
      { kind: 'static', effect: { kind: 'floodDiscount' } },
    ],
  },
  Kitnap: {
    enchant: { what: 'creature' },
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      gift: { kind: 'draw', who: 'eachOpponent', amount: 1 },
    },
    abilities: [
      onEnter(
        { kind: 'tap', what: 'attached' },
        {
          kind: 'if',
          condition: { kind: 'not', condition: { kind: 'wasKicked' } },
          then: [{ kind: 'namedCounters', name: 'stun', amount: 3, to: 'attached' }],
        },
      ),
      { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, control: true } },
    ],
  },
};
