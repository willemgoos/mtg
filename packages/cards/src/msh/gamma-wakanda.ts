import type { Behavior } from '../build.ts';
import {
  creature,
  investigate,
  onEnter,
  powerUp,
  powerUpTargeting,
  spell,
  t0,
  t1,
  teamworkModes,
  theirCreature,
  yourCreature,
} from './helpers.ts';
import { anyColor } from '../blb/helpers.ts';

/**
 * Marvel Super Heroes (MSH) cards for Gamma Smash (R/G power-up and big
 * creatures) and Heroes of Wakanda (G/W +1/+1 counters and Heroes).
 */

const counter = (n = 1) => ({ kind: 'counters', to: 'self', amount: n }) as const;
const artifactOrEnchantment = {
  anyOf: [{ types: ['Artifact' as const] }, { types: ['Enchantment' as const] }],
};

export const GAMMA_WAKANDA: Record<string, Behavior> = {
  // ------------------------------------------------------------ Gamma Smash (R/G)
  'Serpent Specialist': { abilities: [powerUp('{3}{G}', counter(2))] },
  'Knight of Wundagore': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youPutCounters', other: true },
        oncePerTurn: true,
        targets: [],
        effects: [counter()],
      },
    ],
  },
  "Ant-Man's Army": {
    abilities: [
      onEnter({
        kind: 'choose',
        options: [
          { label: 'Food', effects: [{ kind: 'createToken', token: 'food-token', count: 1 }] },
          {
            label: 'Treasure',
            effects: [{ kind: 'createToken', token: 'treasure-token', count: 1 }],
          },
        ],
      }),
    ],
  },
  'Pet Avengers': {
    abilities: [
      powerUp('{6}{G}', counter(), { kind: 'createToken', token: 'hero-token', count: 1 }),
    ],
  },
  'Guerrilla Gorilla': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { sacrificeSelf: true },
        targets: [
          {
            what: 'permanent',
            filter: { ...artifactOrEnchantment, notTypes: ['Creature'] },
          },
        ],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Undercover Skrull': {
    abilities: [
      ...anyColor(),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'graveyardCount', min: 2, types: ['Creature'] },
          power: 2,
          toughness: 2,
        },
      },
    ],
  },
  'Hercules, Prince of Power': {
    abilities: [
      powerUp('{4}{G}', counter(), {
        kind: 'pump',
        to: 'self',
        power: 0,
        toughness: 0,
        keywords: ['vigilance', 'indestructible', 'haste'],
      }),
    ],
  },
  'Abomination, Terrifying Titan': {
    abilities: [
      powerUpTargeting('{5}{R/G}{R/G}', [{ ...theirCreature, optional: true }], counter(), {
        kind: 'fight',
        a: 'self',
        b: t0,
      }),
    ],
  },
  'Hulk, Gamma Goliath': {
    abilities: [
      { kind: 'static', effect: { kind: 'powerUpCostsLess', amount: 3 } },
      powerUp('{6}{R}{G}', counter(5)),
    ],
  },
  'She-Hulk, Jade Defender': {
    abilities: [
      powerUpTargeting(
        '{4}{G}{G}',
        [{ what: 'permanent', filter: artifactOrEnchantment, optional: true }],
        { kind: 'destroy', what: t0 },
        counter(),
      ),
    ],
  },
  // "When you do, he deals damage ...": the other target is chosen as the trigger goes on the stack.
  'Red Hulk': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dealtDamage' },
        targets: [{ what: 'any', filter: { other: true } }],
        effects: [counter(), { kind: 'damage', amount: { countersOn: 'self' }, to: t0 }],
      },
    ],
  },
  // Combat damage only.
  'The Thing, Ben Grimm': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: { subtype: 'Hero' } },
        targets: [],
        effects: [counter(2)],
      },
    ],
  },
  'Giant Growth': spell([creature], { kind: 'pump', to: t0, power: 3, toughness: 3 }),
  'Go Nuts!': teamworkModes(
    3,
    {
      targets: [creature],
      effects: [{ kind: 'counters', to: t0, amount: 1 }],
      label: 'Put a +1/+1 counter on target creature',
    },
    {
      targets: [yourCreature, theirCreature],
      effects: [{ kind: 'fight', a: t0, b: t1 }],
      label: 'Your creature fights their creature',
    },
  ),
  'Blazing Crescendo': spell(
    [creature],
    { kind: 'pump', to: t0, power: 3, toughness: 1 },
    { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' },
  ),
  // "Target player" gains life and searches: always you.
  'Restorative Technique': spell(
    [{ ...creature, optional: true }],
    { kind: 'gainLife', who: 'controller', amount: 2 },
    { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' },
    { kind: 'counters', to: t0, amount: 1 },
  ),

  // ------------------------------------------------------ Heroes of Wakanda (G/W)
  'Wakandan Royal Guard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [creature],
        effects: [
          {
            kind: 'if',
            condition: {
              kind: 'targetMatches',
              target: 0,
              filter: { subtype: 'Hero', other: true },
            },
            then: [{ kind: 'counters', to: t0, amount: 2 }],
            else: [{ kind: 'counters', to: t0, amount: 1 }],
          },
        ],
      },
    ],
  },
  'Black Panther, Vanguard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { subtype: 'Hero', nontoken: true },
        },
        targets: [],
        effects: [],
        modes: [
          {
            targets: [],
            effects: [{ kind: 'createToken', token: 'soldier-token', count: 1 }],
            label: 'Create a 1/1 Soldier',
          },
          {
            targets: [],
            effects: [
              {
                kind: 'pump',
                to: { each: 'creature', controller: 'you' },
                power: 1,
                toughness: 1,
              },
            ],
            label: 'Creatures you control get +1/+1',
          },
        ],
      },
    ],
  },
  // "You may tap him. When you do": the target is chosen up front, and "nonattacking" isn't checked.
  'Spider-Man, To the Rescue': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [
          { kind: 'tap', what: 'self' },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['indestructible'] },
        ],
      },
    ],
  },
  // The Tiger God's "can't be blocked by more than one creature" is not modelled.
  'White Tiger, Ava Ayala': {
    abilities: [
      powerUp('{5}{G}', counter(), { kind: 'createToken', token: 'tiger-god-token', count: 1 }),
    ],
  },
  'Tigra, Feline Fury': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'youGainLife' }, targets: [], effects: [counter()] },
    ],
  },
  'Training Regimen': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  // "Target player investigates": always you.
  'Panther Pounce': spell(
    [creature],
    investigate,
    {
      kind: 'pump',
      to: t0,
      power: 1,
      toughness: 0,
      keywords: ['flying'],
    },
    { kind: 'untap', what: t0 },
  ),
  'Agent 13, Sharon Carter': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlAttacks', alone: true },
        targets: [],
        effects: [investigate],
      },
    ],
  },
};
