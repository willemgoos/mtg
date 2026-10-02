import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { connive, draw, mana, onEnter, powerUp, t0, transformAbility } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) mythics. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */

const heroes = { subtype: 'Hero' };
const hasShield = { kind: 'sourceHasCounter', name: 'shield' } as const;

export const MSH_MYTHICS: Record<string, Behavior> = {
  'Avengers Assemble!': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: heroes,
          power: 2,
          toughness: 2,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'heroAttackedOrEnteredThisTurn' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Namor the Sub-Mariner': {
    powerEquals: { count: 'creaturesYouControl', subtype: 'Merfolk' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [
          { kind: 'createToken', token: 'merfolk-token', count: { bluePipsOfSubject: true } },
        ],
      },
    ],
  },
  'Shang-Chi, Master of Kung Fu': {
    abilities: [
      { kind: 'static', effect: { kind: 'abilitiesAsThoughHaste' } },
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        amount: 2,
        onlyFor: 'CreatureAbility',
      })),
    ],
  },
  'The Mind Stone': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      {
        kind: 'activated',
        once: true,
        cost: { mana: mana('{5}{W}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'namedCounters', name: 'harnessed', amount: 1, to: 'self' }],
        label: 'Harness The Mind Stone',
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'sourceHasCounter', name: 'harnessed' },
        targets: [
          {
            what: 'permanent',
            controller: 'you',
            filter: { nonland: true, other: true },
            optional: true,
          },
        ],
        effects: [{ kind: 'blink', what: t0 }],
      },
    ],
  },
  // "Your maximum hand size is ten": no maximum.
  'The Ten Rings': {
    abilities: [
      { kind: 'static', effect: { kind: 'noMaxHandSize' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: { handSizeUpTo: 10 } }],
      },
    ],
  },
  // The exiled card goes to your hand instead of being playable until your next turn ends.
  'Thor, God of Thunder': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { anyOf: [{ subtype: 'Equipment' }, { types: ['Instant', 'Sorcery'] }] },
          },
        ],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: { manaValueOfSubject: true }, to: t0 }],
      },
    ],
  },
  // Transforming a double-faced card it puts onto the battlefield is not offered.
  'Nick Fury, Agent of S.H.I.E.L.D.': {
    abilities: [
      powerUp(
        '{W}{U}{B}{R}{G}',
        { kind: 'counters', to: 'self', amount: 2 },
        {
          kind: 'lookAndTake',
          count: 7,
          filter: {
            anyOf: [{ subtype: 'Hero' }, { subtype: 'Equipment' }, { subtype: 'Vehicle' }],
          },
          battlefieldOnYourTurn: true,
        },
      ),
    ],
  },
  'Thanos, the Mad Titan': {
    abilities: [
      powerUp(
        '{C}{W}{U}{B}{R}{G}',
        { kind: 'counters', to: 'self', amount: 2 },
        {
          kind: 'choose',
          options: ['odd', 'even'].map((parity) => ({
            label: `Destroy each other creature with ${parity} mana value`,
            effects: [
              {
                kind: 'destroyAll',
                filter: { other: true, manaValueParity: parity as 'odd' | 'even' },
              } as EffectDef,
            ],
          })),
        },
      ),
    ],
  },
  'Mjölnir, Hammer of Thor': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', optional: true }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, doubleDamage: true },
      },
      // Equip worthy: only to a legendary creature.
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you', filter: { supertypes: ['Legendary'] } }],
        effects: [{ kind: 'attach', to: t0 }],
        label: 'Equip worthy {1}',
      },
      {
        kind: 'activated',
        fromHand: true,
        cost: { mana: mana('{2}{R}'), discardSelf: true },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: { each: 'creature' } }],
        label: '{2}{R}, discard: 2 damage to each creature',
      },
    ],
  },
  // Its {2} "becomes a 0/0 Construct Hero artifact creature" ability is not modelled.
  'Iron Man Armor': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 1, keywords: ['flying'] },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
        label: 'Equip {2}',
      },
    ],
  },
  // A noncreature copy doesn't become a 2/2 Robot Villain creature.
  'Ultron, Artificial Malevolence': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Artifact'], nontoken: true } },
        optional: true,
        cost: mana('{2}'),
        targets: [],
        effects: [{ kind: 'tokenCopy', of: 'subject' }],
      },
    ],
  },
  // "Exile until a nonland card; you may cast it" is not modelled: always the +1/+1 counter.
  'Black Widow, Super Spy': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
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
