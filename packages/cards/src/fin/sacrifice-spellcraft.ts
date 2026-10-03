import type { Behavior } from '../build.ts';
import { draw, hero, t0 } from './helpers.ts';
import {
  bigSpell,
  creatureOrArtifact,
  DARKSTAR,
  noncreatureNonlandInGraveyard,
  triggered,
} from './shared-b.ts';

/**
 * Final Fantasy (FIN) 11b, group B: the gold cards of Turks' Contract (W/B
 * creatures and artifacts dying) and Forbidden Magicks (U/R expensive
 * noncreature spells). Their mono-coloured cards are in shared-b.ts.
 */

// ------------------------------------------------------------ W/B: Turks' Contract

export const TURKS_CONTRACT: Record<string, Behavior> = {
  'Judge Magister Gabranth': {
    abilities: [
      triggered({ on: 'permanentYouControlDies', filter: creatureOrArtifact, other: true }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  'Rufus Shinra': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: {
          kind: 'not',
          condition: { kind: 'controlsCreature', filter: { named: DARKSTAR } },
        },
        targets: [],
        effects: [{ kind: 'createToken', token: DARKSTAR, count: 1 }],
      },
    ],
  },
  'Squall, SeeD Mercenary': {
    abilities: [
      triggered({ on: 'creatureYouControlAttacks', alone: true }, [], {
        kind: 'pump',
        to: 'subject',
        power: 0,
        toughness: 0,
        keywords: ['doubleStrike'],
      }),
      triggered(
        { on: 'combatDamageToPlayer' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: {
              types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'],
              maxManaValue: 3,
            },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
    ],
  },
};

// ------------------------------------------------------------ U/R: Forbidden Magicks

export const FORBIDDEN_MAGICKS: Record<string, Behavior> = {
  'Shantotto, Tactician Magician': {
    abilities: [
      triggered({ on: 'castSpell', filter: 'noncreature' }, [], {
        kind: 'pump',
        to: 'self',
        power: { manaSpentOnSubject: true },
        toughness: 0,
      }),
      bigSpell(4, [], draw(1)),
    ],
  },
  'The Emperor of Palamecia': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'U', onlyFor: 'Noncreature' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R', onlyFor: 'Noncreature' },
      bigSpell(
        4,
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        {
          kind: 'if',
          condition: { kind: 'sourceCounters', min: 3 },
          then: [{ kind: 'transform', what: 'self' }],
        },
      ),
    ],
  },
  'Tellah, Great Sage': {
    abilities: [
      triggered({ on: 'castSpell', filter: 'noncreature' }, [], hero()),
      bigSpell(4, [], draw(2)),
      bigSpell(
        8,
        [],
        { kind: 'damage', amount: { manaSpentOnSubject: true }, to: 'eachOpponent' },
        { kind: 'sacrifice', what: 'self' },
      ),
    ],
  },
};

/** Back faces (not cards of their own). */
export const FORBIDDEN_MAGICKS_BACKS: Record<string, Behavior> = {
  'The Lord Master of Hell': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'damage',
        amount: noncreatureNonlandInGraveyard,
        to: 'eachOpponent',
      }),
    ],
  },
};
