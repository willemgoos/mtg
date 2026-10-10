/**
 * Cards that only Arena's Jump In packets' random slots play (the Bloomburrow and Foundations packets): the alternatives
 * no deck of ours had. Foundations cards and three reprints (Polygraph Orb, Nezumi Informant, Ephara's Dispersal).
 */
import type { AbilityDef, EffectDef, TargetSpec, TriggerDef } from '@mtg/engine';
import { parseManaCost as mana, type Behavior } from './build.ts';

const t0 = { target: 0 } as const;
const creature: TargetSpec = { what: 'creature' };
const when = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Extract<AbilityDef, { kind: 'triggered' }> => ({ kind: 'triggered', trigger, targets, effects });

export const JUMP_IN_SLOT_BEHAVIORS: Record<string, Behavior> = {
  // Bloomburrow: Rats.
  'Polygraph Orb': {
    abilities: [
      when(
        { on: 'etb' },
        [],
        { kind: 'lookTakeRestGraveyard', count: 4, take: 2 },
        { kind: 'loseLife', who: 'controller', amount: 2 },
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, collectEvidence: 3 },
        targets: [],
        effects: [{ kind: 'punisher', life: 3, sacrificeCreature: true }],
      },
    ],
  },
  'Nezumi Informant': {
    abilities: [when({ on: 'etb' }, [], { kind: 'discard', who: 'eachOpponent', count: 1 })],
  },
  // Bloomburrow: Threshold.
  "Ephara's Dispersal": {
    costReductionIfTarget: { filter: { attacking: true }, amount: 2 },
    spell: {
      targets: [creature],
      effects: [
        { kind: 'bounce', what: t0 },
        { kind: 'surveil', amount: 2 },
      ],
    },
  },
  // Foundations: Flyers.
  "Valkyrie's Call": {
    abilities: [
      when({ on: 'creatureYouControlDies', nontoken: true, filter: { notSubtype: 'Angel' } }, [], {
        kind: 'returnToBattlefield',
        what: 'subject',
        underOwner: true,
        plusOneCounters: 1,
        keywords: ['flying'],
        addSubtype: 'Angel',
      }),
    ],
  },
  // Foundations: Growth.
  'Flamewake Phoenix': {
    abilities: [
      { kind: 'static', effect: { kind: 'attacksEachCombat' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        fromGraveyard: true,
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        cost: mana('{R}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield' }],
      },
    ],
  },
  // Foundations: Hares.
  'Raise the Past': {
    spell: {
      targets: [],
      effects: [{ kind: 'reanimateAll', yours: true, filter: { maxManaValue: 2 } }],
    },
  },
  // Foundations: Raiders.
  'Immersturm Predator': {
    abilities: [
      when(
        { on: 'becomesTapped' },
        [{ what: 'graveyardCard', optional: true }],
        { kind: 'exileGraveyardCard', what: t0 },
        { kind: 'counters', to: 'self', amount: 1 },
      ),
      {
        kind: 'activated',
        cost: { sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [],
        effects: [
          { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['indestructible'] },
          { kind: 'tap', what: 'self' },
        ],
      },
    ],
  },
  // Foundations: Threshold.
  'Dread Summons': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'mill',
          count: { x: true },
          who: 'eachPlayer',
          creatureTokens: { token: 'zombie-token', tapped: true },
        },
      ],
    },
  },
  'Imprisoned in the Moon': {
    enchant: {
      what: 'permanent',
      filter: {
        anyOf: [{ types: ['Creature'] }, { types: ['Land'] }, { types: ['Planeswalker'] }],
      },
    },
    abilities: [{ kind: 'static', effect: { kind: 'enchantedIsColorlessLand' } }],
  },
};
