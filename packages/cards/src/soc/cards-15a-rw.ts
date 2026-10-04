import type { AbilityDef, CardFilter } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost } from '../build.ts';
import { tapFor, unlessTwoOrFewerLands } from '../msc/helpers.ts';
import { SPIRIT } from '../stx/lorehold.ts';

/**
 * Strixhaven Brawl (15a): the red-white cards of Brawl Quintorius, History Chaser.
 * Already implemented elsewhere: Talisman of Conviction, Furycalm Snarl (msc/staples.ts),
 * Wind-Scarred Crag (behaviors.ts). Engine pieces: brawl-15a-rw-effects.ts.
 */

const upToOneReturnable: CardFilter = {
  anyOf: [
    { types: ['Artifact'], maxManaValue: 3 },
    { types: ['Creature'], maxManaValue: 3 },
    { types: ['Enchantment'], notSubtype: 'Aura', maxManaValue: 3 },
  ],
};

/** "{T}: Add {R} or {W}." with the pain, the check, the enters-tapped rules of each land. */
const rwPair = [tapFor('R'), tapFor('W')];

const shockTrigger: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects: [{ kind: 'chooseCustom', handler: 'shockLand' }],
};

export const QUINTORIUS_RW: Record<string, Behavior> = {
  // Loyalty 5. "Can be your commander" is a property of the deck, not of the card.
  'Quintorius, History Chaser': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        targets: [],
        effects: [{ kind: 'createToken', token: SPIRIT, count: 1 }],
        batch: true,
      },
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'quintoriusDiscard' }],
        label: '+1: you may discard a card; if you do, draw two cards, then mill a card',
      },
      {
        kind: 'activated',
        cost: { loyalty: -4 },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { subtype: 'Spirit' } },
            power: 0,
            toughness: 0,
            keywords: ['doubleStrike', 'vigilance'],
          },
        ],
        label: '−4: Spirits you control gain double strike and vigilance until end of turn',
      },
    ],
  },
  'Excava, the Risen Past': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: upToOneReturnable }],
        effects: [{ kind: 'custom', handler: 'excavaReturn' }],
        optional: true,
      },
    ],
  },
  'Lightning Helix': {
    spell: {
      targets: [{ what: 'any' }],
      effects: [
        { kind: 'damage', amount: 3, to: { target: 0 } },
        { kind: 'gainLife', who: 'controller', amount: 3 },
      ],
    },
  },
  'Boros Signet': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: parseManaCost('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['R'], ['W']] }],
        label: '{1}, {T}: Add {R}{W}',
      },
    ],
  },
  "Warleader's Call": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Elegant Parlor': {
    entersTapped: true,
    abilities: [
      ...rwPair,
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
    ],
  },
  'Inspiring Vantage': {
    entersTappedIf: unlessTwoOrFewerLands,
    abilities: rwPair,
  },
  'Sacred Foundry': { abilities: [...rwPair, shockTrigger], entersTapped: true },
};
