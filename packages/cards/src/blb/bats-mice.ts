import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  atYourEndStep,
  creature,
  drain,
  draw,
  gain,
  gift,
  lifeChanged,
  mana,
  offspring,
  onEnter,
  prowess,
  pump,
  t0,
  t1,
  theirCreature,
  valiant,
  when,
  youControl,
  yourCreature,
  yourCreaturesOf,
  yours,
} from './helpers.ts';

// Orzhov Bats (life gained and lost) and Boros Mice (valiant).

const yourMouse: TargetSpec = { what: 'creature', controller: 'you', filter: { subtype: 'Mouse' } };
const nonlandPermanentCardMv3: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { nonland: true, notTypes: ['Instant', 'Sorcery'], maxManaValue: 3 },
};

/** Zoraline: "you may pay {W}{B} and 2 life. When you do, return ... with a finality counter". */
const zoralineReturn = (on: 'etb' | 'attacks'): AbilityDef => ({
  kind: 'triggered',
  trigger: { on },
  targets: [nonlandPermanentCardMv3],
  cost: mana('{W}{B}'),
  lifeCost: 2,
  effects: [{ kind: 'returnToBattlefield', what: t0, counter: 'finality' }],
});

/** "Whenever you gain or lose life during your turn". */
const onLifeChangeYourTurn = (...effects: EffectDef[]): AbilityDef =>
  when({ on: 'youGainOrLoseLife', duringYourTurn: true }, [], ...effects);

export const BATS_MICE: Record<string, Behavior> = {
  // ------------------------------------------------------------------ Orzhov Bats
  'Lifecreed Duo': {
    abilities: [when({ on: 'otherCreatureEtb', controller: 'you' }, [], gain(1))],
  },
  'Starscape Cleric': offspring(
    '{2}{B}',
    { kind: 'static', effect: { kind: 'cantBlock' } },
    when({ on: 'youGainLife' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 1 }),
  ),
  'Essence Channeler': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'lifeThisTurn', who: 'you', lost: true },
          power: 0,
          toughness: 0,
          keywords: ['flying', 'vigilance'],
        },
      },
      when({ on: 'youGainLife' }, [], { kind: 'counters', to: 'self', amount: 1 }),
      when({ on: 'dies' }, [yourCreature], {
        kind: 'counters',
        to: t0,
        amount: { countersOn: 'self' },
      }),
    ],
  },
  'Moonrise Cleric': { abilities: [when({ on: 'attacks' }, [], gain(1))] },
  'Moonstone Harbinger': {
    abilities: [
      {
        ...onLifeChangeYourTurn(pump(yourCreaturesOf('Bat'), 1, 0, ['deathtouch'])),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Starlit Soothsayer': {
    abilities: [atYourEndStep(lifeChanged, [], { kind: 'surveil', amount: 1 })],
  },
  'Wax-Wane Witness': { abilities: [onLifeChangeYourTurn(pump('self', 1, 0))] },
  'Star Charter': {
    abilities: [
      atYourEndStep(lifeChanged, [], {
        kind: 'lookAndTake',
        count: 4,
        filter: { types: ['Creature'], maxPower: 3 },
      }),
    ],
  },
  'Zoraline, Cosmos Caller': {
    abilities: [
      when({ on: 'creatureYouControlAttacks', filter: { subtype: 'Bat' } }, [], gain(1)),
      zoralineReturn('etb'),
      zoralineReturn('attacks'),
    ],
  },
  'Starseer Mentor': {
    abilities: [atYourEndStep(lifeChanged, [], { kind: 'punisher', life: 3 })],
  },
  'Glidedive Duo': { abilities: [onEnter(...drain(2))] },
  'Brightblade Stoat': {},
  'Sonar Strike': {
    spell: {
      targets: [
        {
          what: 'creature',
          filter: { anyOf: [{ attackingOrBlocking: true }, { tapped: true }] },
        },
      ],
      effects: [
        { kind: 'damage', amount: 4, to: t0 },
        { kind: 'if', condition: youControl('Bat'), then: [gain(3)] },
      ],
    },
  },
  Fell: { spell: { targets: [creature], effects: [{ kind: 'destroy', what: t0 }] } },
  Diresight: {
    spell: {
      targets: [],
      effects: [
        { kind: 'surveil', amount: 2 },
        draw(2),
        { kind: 'loseLife', who: 'controller', amount: 2 },
      ],
    },
  },
  'Sinister Monolith': {
    abilities: [
      atYourCombat([], ...drain(1)),
      {
        kind: 'activated',
        cost: { tapSelf: true, life: 2, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [draw(2)],
      },
    ],
  },
  'Lunar Convocation': {
    abilities: [
      atYourEndStep({ kind: 'lifeThisTurn', who: 'you', gained: true }, [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: 1,
      }),
      atYourEndStep({ kind: 'lifeThisTurn', who: 'you', gained: true, lost: true }, [], {
        kind: 'createToken',
        token: 'bat-token',
        count: 1,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), life: 2 },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Starfall Invocation': gift(
    'card',
    { targets: [], effects: [{ kind: 'destroyAll' }] },
    { targets: [], effects: [{ kind: 'destroyAll', returnOne: true }] },
  ),

  // ------------------------------------------------------------------ Boros Mice
  'Heartfire Hero': {
    abilities: [
      valiant([], { kind: 'counters', to: 'self', amount: 1 }),
      when({ on: 'dies' }, [], {
        kind: 'damage',
        amount: { powerOf: 'self' },
        to: 'eachOpponent',
      }),
    ],
  },
  'Flowerfoot Swordmaster': offspring('{2}', valiant([], pump(yourCreaturesOf('Mouse'), 1, 0))),
  'Emberheart Challenger': {
    abilities: [prowess, valiant([], { kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' })],
  },
  'Whiskerquill Scribe': {
    abilities: [
      {
        ...valiant([], {
          kind: 'if',
          condition: { kind: 'handSize', min: 1 },
          then: [{ kind: 'discard', count: 1 }, draw(1)],
        }),
        optional: true,
      } as AbilityDef,
    ],
  },
  'Manifold Mouse': offspring('{2}', {
    kind: 'triggered',
    trigger: { on: 'beginningOfCombat', whose: 'yours' },
    targets: [],
    effects: [],
    modes: [
      { label: 'Double strike', targets: [yourMouse], effects: [pump(t0, 0, 0, ['doubleStrike'])] },
      { label: 'Trample', targets: [yourMouse], effects: [pump(t0, 0, 0, ['trample'])] },
    ],
  }),
  'Seedglaive Mentor': { abilities: [valiant([], { kind: 'counters', to: 'self', amount: 1 })] },
  'Mabel, Heir to Cragflame': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Mouse' },
          power: 1,
          toughness: 1,
        },
      },
      onEnter({ kind: 'createToken', token: 'cragflame-token', count: 1 }),
    ],
  },
  'Mouse Trapper': { abilities: [valiant([theirCreature], { kind: 'tap', what: t0 })] },
  'Thistledown Players': {
    abilities: [
      when({ on: 'attacks' }, [{ what: 'permanent', filter: { nonland: true } }], {
        kind: 'untap',
        what: t0,
      }),
    ],
  },
  'Brambleguard Captain': {
    abilities: [atYourCombat([yourCreature], pump(t0, { powerOf: 'self' }, 0))],
  },
  'Veteran Guardmouse': {
    abilities: [valiant([], pump('self', 1, 0, ['firstStrike']), { kind: 'scry', amount: 1 })],
  },
  'Might of the Meek': {
    spell: {
      targets: [creature],
      effects: [
        pump(t0, 0, 0, ['trample']),
        { kind: 'if', condition: youControl('Mouse'), then: [pump(t0, 1, 0)] },
        draw(1),
      ],
    },
  },
  'Rabid Gnaw': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [pump(t0, 1, 0), { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 }],
    },
  },
  'War Squeak': {
    enchant: creature,
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['haste'] } },
      when({ on: 'etb' }, [theirCreature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        cantBlock: true,
      }),
    ],
  },
  'Blooming Blast': gift(
    'treasure',
    { targets: [creature], effects: [{ kind: 'damage', amount: 2, to: t0 }] },
    {
      targets: [creature],
      effects: [
        { kind: 'damage', amount: 2, to: t0 },
        { kind: 'damage', amount: 3, to: { controllerOf: 0 } },
      ],
    },
  ),
  'Valley Rally': gift(
    'food',
    { targets: [], effects: [pump(yours, 2, 0)] },
    { targets: [yourCreature], effects: [pump(yours, 2, 0), pump(t0, 0, 0, ['firstStrike'])] },
  ),
  'Playful Shove': {
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 1, to: t0 }, draw(1)],
    },
  },
};
