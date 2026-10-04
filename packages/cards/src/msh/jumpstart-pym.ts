import type { AbilityDef, CardDefinition, Color, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, mana, onEnter, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Pym Particles (U, shrinking creatures' power).

/** "Whenever you cast a <colour> spell, ..." */
const castColor = (color: Color, ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'any', spell: { colors: [color] } },
  targets: [],
  effects,
});

const attacks = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets,
  effects,
});

/** Creatures with power less than 0, on either side. */
const negativePower = { types: ['Creature' as const], maxPower: -1 };

export const MSH_JUMPSTART_PYM_TOKENS: CardDefinition[] = [
  {
    id: 'robot-flying-token',
    name: 'Robot',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Robot'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];

export const MSH_JUMPSTART_PYM: Record<string, Behavior> = {
  "Ant-Man's Air Force": {
    abilities: [
      attacks([{ ...creature, optional: true }], {
        kind: 'pump',
        to: t0,
        power: -1,
        toughness: 0,
      }),
    ],
  },
  'Ant-Man, Reformed Rogue': {
    abilities: [
      castColor('G', { kind: 'pump', to: 'self', power: 1, toughness: 0, keywords: ['trample'] }),
      castColor('U', { kind: 'pump', to: 'self', power: -1, toughness: 0, cantBeBlocked: true }),
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Wasp, Shrinking Savior': {
    abilities: [
      attacks(
        [{ ...creature, filter: { other: true }, optional: true }],
        { kind: 'pump', to: t0, power: -3, toughness: 0, untilYourNextTurn: true },
        {
          kind: 'draw',
          who: 'controller',
          amount: {
            sum: [
              { count: 'permanentsYouControl', filter: negativePower },
              { count: 'permanentsOpponentsControl', filter: negativePower },
            ],
          },
        },
      ),
    ],
  },
  // Teamwork 2, and flash only when cast using teamwork (the engine's `kicker.flash`).
  'Quantum Reduction': {
    enchant: creature,
    kicker: { cost: mana(''), teamwork: 2, flash: true },
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: -5, toughness: 0, loseAbilities: true },
      },
    ],
  },
  'Robotics Mastery': {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'createToken', token: 'robot-flying-token', count: 2 }),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 2 } },
    ],
  },
};
