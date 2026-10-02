import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, t0, t1, villain, yourCreature, yours } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) Sagas, on Stream A's Sagas: lore counters as
 * they enter and at your precombat main phase; each chapter is a trigger.
 */

const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

const artifacts = { types: ['Artifact' as const] };

export const MSH_SAGAS: Record<string, Behavior> = {
  'The Coming of Galactus': {
    saga: 4,
    abilities: [
      chapter([1], [{ what: 'permanent', filter: { nonland: true }, optional: true }], {
        kind: 'destroy',
        what: t0,
      }),
      chapter([2, 3], [], { kind: 'loseLife', who: 'eachOpponent', amount: 2 }),
      chapter([4], [], { kind: 'createToken', token: 'galactus-token', count: 1 }),
    ],
  },
  // Chapter II ("artifact spells you cast this turn cost {1} less") is not modelled.
  'Armor Wars': {
    saga: 3,
    abilities: [
      chapter([1], [], {
        kind: 'may',
        effects: [
          {
            kind: 'draw',
            who: 'controller',
            amount: { count: 'permanentsYouControl', filter: artifacts },
          },
          { kind: 'draw', who: 'eachOpponent', amount: 1 },
        ],
      }),
      chapter([3], [{ what: 'player', controller: 'opponent' }], {
        kind: 'damage',
        amount: { greatestManaValueYouControl: artifacts },
        to: t0,
      }),
    ],
  },
  'Avengers: Under Siege': {
    saga: 3,
    abilities: [
      chapter([1], [], villain(2)),
      chapter(
        [2],
        [],
        {
          kind: 'damage',
          amount: 2,
          to: { each: 'creature', filter: { notSubtype: 'Villain' } },
        },
        { kind: 'damage', amount: 2, to: 'eachOpponent' },
      ),
      chapter([3], [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: { count: 'creaturesYouControl', subtype: 'Villain' },
      }),
    ],
  },
  'Origin of the Avengers': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'scry', amount: 2 }),
      chapter([2], [], {
        kind: 'choose',
        options: [
          {
            label: 'Put a Hero with mana value 3 or less from your hand onto the battlefield',
            effects: [
              {
                kind: 'putFromHandOrGraveyard',
                filter: { types: ['Creature'], subtype: 'Hero', maxManaValue: 3 },
                handOnly: true,
              },
            ],
          },
          { label: 'Draw a card', effects: [draw(1)] },
        ],
      }),
      chapter([3], [], { kind: 'counters', to: yours, amount: 1 }),
    ],
  },
  // "Total mana value 6 or less" is checked per creature (3 or less each).
  'The Super Hero Civil War': {
    saga: 3,
    abilities: [
      chapter(
        [1],
        [
          { what: 'creature', controller: 'opponent', filter: { maxManaValue: 3 }, optional: true },
          { what: 'creature', controller: 'opponent', filter: { maxManaValue: 3 }, optional: true },
        ],
        { kind: 'gainControl', what: t0, whileSource: true },
        { kind: 'gainControl', what: t1, whileSource: true },
      ),
      chapter([2], [], {
        kind: 'pump',
        to: yours,
        power: 1,
        toughness: 1,
        keywords: ['vigilance'],
      }),
      chapter([3], [yourCreature, { what: 'creature', filter: { other: true }, optional: true }], {
        kind: 'fight',
        a: t0,
        b: t1,
      }),
    ],
  },
  // Chapter I puts a red or green creature card from your hand onto the battlefield instead.
  'World War Hulk': {
    saga: 3,
    abilities: [
      chapter([1], [], {
        kind: 'may',
        effects: [
          {
            kind: 'putFromHandOrGraveyard',
            filter: { types: ['Creature'], colors: ['R', 'G'] },
            handOnly: true,
          },
        ],
      }),
      chapter([2], [yourCreature], { kind: 'counters', to: t0, amount: 3 }),
      chapter([3], [yourCreature], {
        kind: 'pump',
        to: t0,
        power: { powerOf: t0 },
        toughness: { toughnessOf: t0 },
        keywords: ['trample'],
      }),
    ],
  },
};
