/** Foundations cards that Arena's Foundations Jump In packets play and no deck of ours did. */
import type { AbilityDef, ConditionDef, EffectDef, TargetSpec, TriggerDef } from '@mtg/engine';
import { parseManaCost, type Behavior } from './build.ts';

const t0 = { target: 0 } as const;
const t1 = { target: 1 } as const;
const creature: TargetSpec = { what: 'creature' };
const when = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Extract<AbilityDef, { kind: 'triggered' }> => ({ kind: 'triggered', trigger, targets, effects });
const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  { kind: 'gainLife', who: 'controller', amount },
];
const graveyardCard: TargetSpec = { what: 'graveyardCard', optional: true };
const isCreatureCard = (target: number): ConditionDef => ({
  kind: 'targetMatches',
  target,
  filter: { types: ['Creature'] },
});

export const FOUNDATIONS_JUMP_IN_BEHAVIORS: Record<string, Behavior> = {
  // Its colour and creature type stay as they were.
  'Eaten by Piranhas': {
    enchant: creature,
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'loseAbilities',
        what: 'attached',
        basePT: [1, 1],
        whileSource: true,
      }),
    ],
  },
  'Feed the Swarm': {
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Enchantment'] },
        },
      ],
      effects: [
        { kind: 'loseLife', who: 'controller', amount: { manaValueOf: t0 } },
        { kind: 'destroy', what: t0 },
      ],
    },
  },
  'Fleeting Flight': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'counters', to: t0, amount: 1 },
        {
          kind: 'pump',
          to: t0,
          power: 0,
          toughness: 0,
          keywords: ['flying'],
          preventCombatDamage: true,
        },
      ],
    },
  },
  'Garna, Bloodfist of Keld': {
    abilities: [
      when({ on: 'creatureYouControlDies', filter: { leftAttacking: true } }, [], {
        kind: 'draw',
        who: 'controller',
        amount: 1,
      }),
      when({ on: 'creatureYouControlDies', filter: { leftAttacking: false } }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },
  'Goblin Negotiation': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'damage', amount: { x: true }, to: t0, excessTokens: 'goblin-token' }],
    },
  },
  // The Cat gets first strike; any attacker gets the counter.
  'Ingenious Leonin': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: parseManaCost('{3}{W}') },
        targets: [
          { what: 'creature', controller: 'you', filter: { attacking: true, other: true } },
        ],
        effects: [
          { kind: 'counters', to: t0, amount: 1 },
          {
            kind: 'if',
            condition: { kind: 'targetMatches', target: 0, filter: { subtype: 'Cat' } },
            then: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['firstStrike'] }],
          },
        ],
      },
    ],
  },
  'Knight of Malice': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'anyPlayerControls', filter: { colors: ['W'] } },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },
  'Obliterating Bolt': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 4, to: t0 },
      ],
    },
  },
  // The two cards may come from different graveyards.
  'Soul-Shackled Zombie': {
    abilities: [
      when(
        { on: 'etb' },
        [graveyardCard, graveyardCard],
        {
          kind: 'if',
          condition: { kind: 'any', of: [isCreatureCard(0), isCreatureCard(1)] },
          then: drain(2),
        },
        { kind: 'exileGraveyardCard', what: t0 },
        { kind: 'exileGraveyardCard', what: t1 },
      ),
    ],
  },
  // It doesn't become a Knight.
  'Skyknight Squire': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'sourceCounters', min: 3 },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  // The owner picks top or bottom, as with Dire Downdraft.
  'Uncharted Voyage': {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'choose',
          ownerOf: 0,
          options: [
            {
              label: 'Top of library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'top' }],
            },
            {
              label: 'Bottom of library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
            },
          ],
        },
        { kind: 'surveil', amount: 1 },
      ],
    },
  },
  'Wildwood Scourge': {
    entersWithXCounters: true,
    abilities: [
      when(
        {
          on: 'youPutCounters',
          other: true,
          filter: { types: ['Creature'], notSubtype: 'Hydra' },
        },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
};
