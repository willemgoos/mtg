import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, onEnter, powerUp, t0, t1, teamwork } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Wakanda packet (docs/marvel-jumpstart.md): the cards it was
// missing. Wakandan Shield Guard, Ultimate Alliance, Heroic Teamwork, Secure Detention and
// Shuri, Vibranium Technologist are shared with other packets.

export const MSH_JUMPSTART_WAKANDA_TOKENS: CardDefinition[] = [
  {
    id: 'robot-hero-flying-token',
    name: 'Robot Hero',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Robot', 'Hero'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];

const soldier: EffectDef = { kind: 'createToken', token: 'soldier-token', count: 1 };

/** "One or two target creatures each get +2/+1 until end of turn." */
const heroicTargets = [creature, { ...creature, optional: true }];
const heroicPump: EffectDef[] = [
  { kind: 'pump', to: t0, power: 2, toughness: 1 },
  { kind: 'pump', to: t1, power: 2, toughness: 1 },
];

export const MSH_JUMPSTART_WAKANDA: Record<string, Behavior> = {
  'Wakandan Shield Guard': { abilities: [onEnter(soldier)] },
  'Black Panther, Most Dangerous': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dealtDamage' },
        targets: [{ what: 'any', filter: { other: true } }],
        effects: [{ kind: 'damage', amount: { event: 'amount' }, to: t0 }],
      },
      powerUp(
        '{5}{W}{W}',
        { kind: 'counters', to: 'self', amount: 2 },
        {
          kind: 'pump',
          to: { each: 'creature', controller: 'you', filter: { other: true } },
          power: 2,
          toughness: 2,
        },
      ),
    ],
  },
  // Vigilance comes from Scryfall.
  'Shuri, Vibranium Technologist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            targets: [],
            effects: [{ kind: 'createToken', token: 'robot-hero-flying-token', count: 1 }],
            label: 'Create a 1/1 flying Robot Hero',
          },
          { targets: [], effects: [draw(1)], label: 'Draw a card' },
        ],
      },
    ],
  },
  'Ultimate Alliance': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'damage', amount: { count: 'creaturesYouControl' }, to: t0 }],
    },
  },
  'Heroic Teamwork': teamwork(
    3,
    { targets: heroicTargets, effects: heroicPump },
    { targets: heroicTargets, effects: [...heroicPump, draw(1)] },
  ),
  'Secure Detention': {
    enchant: { what: 'permanent', filter: { types: ['Artifact', 'Creature'] } },
    abilities: [
      onEnter(soldier),
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          cantAttackOrBlock: true,
          cantActivate: true,
        },
      },
    ],
  },
};
