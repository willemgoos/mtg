import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, prowess, spell, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Thor (R, noncombat damage and impulse draw).

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

export const MSH_JUMPSTART_THOR_TOKENS: CardDefinition[] = [
  {
    id: 'red-elemental-token',
    name: 'Elemental',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

export const MSH_JUMPSTART_THOR: Record<string, Behavior> = {
  "Sif's Spearmaster": {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: t0 }],
      },
    ],
  },
  'Molten Lavamancer': {
    abilities: [
      prowess,
      {
        kind: 'triggered',
        trigger: { on: 'yourNoncombatDamageToOpponent' },
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'createToken', token: 'red-elemental-token', count: 1 }],
      },
    ],
  },
  'Asgardian Inspiration': {
    spell: {
      targets: [],
      effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' }],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'yourNoncombatDamageToOpponent' },
        fromGraveyard: true,
        cost: mana('{2}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Lightning Bolt': spell([{ what: 'any' }], { kind: 'damage', amount: 3, to: t0 }),
  'Origin of Thor': {
    saga: 3,
    abilities: [
      chapter([1], [], {
        kind: 'may',
        effects: [
          {
            kind: 'if',
            condition: { kind: 'handSize', min: 1 },
            then: [
              { kind: 'discard', count: 1 },
              { kind: 'draw', who: 'controller', amount: 2 },
            ],
          },
        ],
      }),
      chapter([2], [], {
        kind: 'emblem',
        until: 'endOfTurn',
        ability: {
          kind: 'triggered',
          trigger: { on: 'castSpell', filter: 'any' },
          targets: [yourCreature],
          effects: [{ kind: 'counters', to: t0, amount: 1 }],
        },
      }),
      chapter([3], [yourCreature], {
        kind: 'damage',
        amount: { powerOf: t0 },
        to: 'eachOpponent',
        from: t0,
      }),
    ],
  },
  "Mjölnir's Might": spell(
    [{ what: 'player' }],
    { kind: 'damage', amount: 4, to: t0 },
    { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' },
  ),
};
