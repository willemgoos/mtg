import type { Behavior } from '../build.ts';
import { connive, draw, mana, onEnter, powerUp, t0, transformAbility } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) mythics. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */

const heroes = { subtype: 'Hero' };
const hasShield = { kind: 'sourceHasCounter', name: 'shield' } as const;

export const MSH_MYTHICS: Record<string, Behavior> = {
  'Captain America, Super-Soldier': {
    entersWithNamedCounters: { shield: 1 },
    abilities: [
      { kind: 'static', effect: { kind: 'youHaveHexproof', condition: hasShield } },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: heroes,
          condition: hasShield,
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },
  'Kang the Conqueror': {
    abilities: [
      powerUp(
        '{5}{U}{U}{U}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'extraTurn', noPowerUp: true },
      ),
    ],
  },
  'Bruce Banner': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: mana('{X}{X}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: { x: true } }],
        label: '{X}{X}, {T}: Draw X cards',
      },
      transformAbility('{2}{R}{R}{G}{G}'),
    ],
  },
  'Jennifer Walters': {
    abilities: [
      { kind: 'static', effect: { kind: 'opponentsCantCastDuringYourTurn' } },
      transformAbility('{3}{G}{W}{W}'),
    ],
  },
  "King T'Challa": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard', whose: 'any' },
        targets: [],
        effects: [draw(1)],
      },
      transformAbility('{4}{W}{U}'),
    ],
  },
  'Tony Stark': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'lookAndTake', count: 4, filter: { types: ['Artifact'] } }],
        label: '{1}, {T}: Look at the top four',
      },
      transformAbility('{4}{U}{R}'),
    ],
  },
  "Captain Marvel, Earth's Protector": {
    abilities: [
      powerUp(
        '{5}{W}{W}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'namedCounters', name: 'indestructible', amount: 1, to: 'self' },
      ),
    ],
  },
  'Doctor Doom': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'doombot-token', count: 2 }),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'controlsPermanents',
            filter: {
              anyOf: [
                { types: ['Artifact'], anyOf: [{ types: ['Creature'] }] },
                { subtype: 'Plan' },
              ],
            },
            min: 1,
          },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },
  'M.O.D.O.K.': {
    abilities: [
      {
        kind: 'activated',
        cost: { life: 3 },
        condition: { kind: 'yourTurn' },
        targets: [],
        effects: [connive],
        label: 'Mental Organism: pay 3 life, connive',
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesOpponentsControl',
          power: -1,
          toughness: -1,
        },
      },
    ],
  },
  'Multiversal Incursion': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'tokenCopy',
          of: { each: 'creature', controller: 'you', filter: { nontoken: true } },
          notLegendary: true,
        },
      ],
    },
  },
};

/** Back faces of the double-faced mythics, keyed by the back face's name. */
export const MSH_MYTHIC_BACKS: Record<string, Behavior> = {
  'The Incredible Hulk': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dealtDamage' },
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 1 },
          {
            kind: 'if',
            condition: { kind: 'sourceAttacking' },
            then: [{ kind: 'untap', what: 'self' }, { kind: 'extraCombat' }],
          },
        ],
      },
    ],
  },
  'The Sensational She-Hulk': {
    abilities: [
      { kind: 'static', effect: { kind: 'opponentsCantCastDuringYourTurn' } },
      {
        kind: 'triggered',
        trigger: { on: 'yourCreatureDealtDamage' },
        optional: true,
        oncePerTurn: true,
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: { event: 'amount' }, to: t0 }],
      },
    ],
  },
  'Black Panther, Hope Enduring': {
    abilities: [
      { kind: 'static', effect: { kind: 'preventDamageToSelf' } },
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // "If it's an Equipment, attach it to The Invincible Iron Man" is not modelled.
  'The Invincible Iron Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [
              { kind: 'putFromHandOrGraveyard', filter: { types: ['Artifact'] }, handOnly: true },
            ],
          },
        ],
      },
    ],
  },
};
