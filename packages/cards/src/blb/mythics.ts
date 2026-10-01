import type { TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, gift, mana, onEnter, t0, when } from './helpers.ts';

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
};
