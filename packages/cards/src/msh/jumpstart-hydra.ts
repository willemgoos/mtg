import type { AbilityDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { drain, mana, t0, t1 } from './helpers.ts';

/**
 * Marvel Super Heroes Jumpstart packet HYDRA (docs/marvel-jumpstart.md): the
 * cards it needs that no other file has.
 */

/** "Target creature that's attacking alone". */
const attackingAlone: TargetSpec = { what: 'creature', filter: { attackingAlone: true } };

const creatureCardInYourGraveyard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'] },
};

/** "Basic landcycling {cost}". */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

export const MSH_JUMPSTART_HYDRA: Record<string, Behavior> = {
  // "Return him to his owner's hand. If you do": only while he's still attacking.
  'Bob, Reluctant HYDRA Agent': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks', alone: true },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'sourceAttacking' },
            then: [{ kind: 'bounce', what: 'self' }, ...drain(2)],
          },
        ],
      },
    ],
  },
  'Viper, Cruel Conspirator': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{B}') },
        targets: [attackingAlone],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 1 }],
        label: '{B}: +1/+1',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{B}') },
        targets: [attackingAlone],
        effects: [
          {
            kind: 'choose',
            options: [
              {
                label: 'Deathtouch',
                effects: [
                  { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['deathtouch'] },
                ],
              },
              {
                label: 'Lifelink',
                effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['lifelink'] }],
              },
            ],
          },
        ],
        label: '{B}: deathtouch or lifelink',
      },
    ],
  },
  'HYDRA Disintegrator': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        // Job select's "create the token, then attach this Equipment to it".
        effects: [{ kind: 'jobSelect', token: 'villain-token' }],
      },
      { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 3 } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}') },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
        label: 'Equip {4}',
      },
    ],
  },
  'Infernal Rebirth': {
    spell: {
      targets: [creatureCardInYourGraveyard, { ...creatureCardInYourGraveyard, optional: true }],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
      ],
    },
    abilities: [basicLandcycling('{2}')],
  },
};
