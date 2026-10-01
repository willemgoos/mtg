import type { Behavior } from '../build.ts';
import { creature, draw, pump, rabbit, t0 } from './helpers.ts';

// Bloomburrow's Seasons: "Choose up to five {P} worth of modes. You may
// choose the same mode more than once."

export const SEASONS: Record<string, Behavior> = {
  'Season of the Burrow': {
    pawprints: [
      { paws: 1, spell: { label: 'Rabbit', targets: [], effects: [rabbit()] } },
      {
        paws: 2,
        spell: {
          label: 'Exile, they draw',
          targets: [{ what: 'permanent', filter: { nonland: true } }],
          effects: [
            { kind: 'exile', what: t0 },
            { kind: 'draw', who: { controllerOf: 0 }, amount: 1 },
          ],
        },
      },
      {
        paws: 3,
        spell: {
          label: 'Return a permanent',
          targets: [
            {
              what: 'graveyardCard',
              controller: 'you',
              filter: { notTypes: ['Instant', 'Sorcery'], maxManaValue: 3 },
            },
          ],
          effects: [{ kind: 'returnToBattlefield', what: t0, counter: 'indestructible' }],
        },
      },
    ],
  },
  'Season of Loss': {
    pawprints: [
      {
        paws: 1,
        spell: {
          label: 'Each player sacrifices',
          targets: [],
          effects: [{ kind: 'eachPlayerSacrifices' }],
        },
      },
      {
        paws: 2,
        spell: {
          label: 'Draw per creature lost',
          targets: [],
          effects: [
            { kind: 'draw', who: 'controller', amount: { count: 'creaturesYouLostThisTurn' } },
          ],
        },
      },
      {
        paws: 3,
        spell: {
          label: 'Drain per creature card',
          targets: [],
          effects: [
            {
              kind: 'loseLife',
              who: 'eachOpponent',
              amount: { count: 'cardsInGraveyard', types: ['Creature'] },
            },
          ],
        },
      },
    ],
  },
  'Season of Gathering': {
    pawprints: [
      {
        paws: 1,
        spell: {
          label: '+1/+1 counter',
          targets: [],
          effects: [
            {
              kind: 'chooseYourPermanent',
              filter: { types: ['Creature'] },
              then: [
                { kind: 'counters', to: 'chosen', amount: 1 },
                pump('chosen', 0, 0, ['vigilance', 'trample']),
              ],
            },
          ],
        },
      },
      {
        paws: 2,
        spell: {
          label: 'Destroy artifacts or enchantments',
          targets: [],
          effects: [
            {
              kind: 'choose',
              options: [
                {
                  label: 'Artifacts',
                  effects: [
                    { kind: 'destroyAll', permanents: true, filter: { types: ['Artifact'] } },
                  ],
                },
                {
                  label: 'Enchantments',
                  effects: [
                    { kind: 'destroyAll', permanents: true, filter: { types: ['Enchantment'] } },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        paws: 3,
        spell: {
          label: 'Draw by power',
          targets: [],
          effects: [
            { kind: 'draw', who: 'controller', amount: { count: 'greatestPowerYouControl' } },
          ],
        },
      },
    ],
  },
  'Season of the Bold': {
    pawprints: [
      {
        paws: 1,
        spell: {
          label: 'Tapped Treasure',
          targets: [],
          effects: [{ kind: 'createToken', token: 'treasure-token', count: 1, tapped: true }],
        },
      },
      {
        paws: 2,
        spell: {
          label: 'Exile two to play',
          targets: [],
          effects: [{ kind: 'exileTopPlayable', count: 2, until: 'endOfNextTurn' }],
        },
      },
      {
        paws: 3,
        spell: {
          label: 'Spells deal 2',
          targets: [],
          effects: [
            {
              kind: 'emblem',
              until: 'endOfYourNextTurn',
              ability: {
                kind: 'triggered',
                trigger: { on: 'castSpell', filter: 'any' },
                targets: [{ ...creature, optional: true }],
                effects: [{ kind: 'damage', amount: 2, to: t0 }],
              },
            },
          ],
        },
      },
    ],
  },
  'Season of Weaving': {
    pawprints: [
      { paws: 1, spell: { label: 'Draw', targets: [], effects: [draw(1)] } },
      {
        paws: 2,
        spell: {
          label: 'Copy your artifact or creature',
          targets: [],
          effects: [
            {
              kind: 'chooseYourPermanent',
              filter: { types: ['Artifact', 'Creature'] },
              then: [{ kind: 'tokenCopy', of: 'chosen' }],
            },
          ],
        },
      },
      {
        paws: 3,
        spell: {
          label: 'Bounce everything',
          targets: [],
          effects: [
            {
              kind: 'bounce',
              what: { each: 'permanent', filter: { nonland: true, nontoken: true } },
            },
          ],
        },
      },
    ],
  },
};
