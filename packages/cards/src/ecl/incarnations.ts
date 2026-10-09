import type { CardDefinition, Color, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, t0, yours } from '../blb/helpers.ts';
import { enterIfSpent, evoke } from '../ecl-vocab.ts';
import { ECL_KITHKIN } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): the five evoke Elemental Incarnations. Printed characteristics come from Scryfall; this file has the
 * rules text. Each has two enter triggers keyed to the colored mana spent to cast it ({W}{W} and so on); evoking with the hybrid
 * evoke cost still counts that mana. See docs/lorwyn-eclipsed-plan.md.
 */

/** The hybrid evoke cost of every Incarnation: {A/B}{A/B}. */
const hybridEvoke = (a: Color, b: Color) =>
  evoke({
    generic: 0,
    colored: {},
    hybrid: [
      [a, b],
      [a, b],
    ],
  });

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };

export const ECL_INCARNATIONS: Record<string, Behavior> = {
  Catharsis: {
    ...hybridEvoke('R', 'W'),
    abilities: [
      enterIfSpent({ W: 2 }, [{ kind: 'createToken', token: ECL_KITHKIN, count: 2 }]),
      enterIfSpent({ R: 2 }, [
        { kind: 'pump', to: yours, power: 1, toughness: 1, keywords: ['haste'] },
      ]),
    ],
  },
  Deceit: {
    ...hybridEvoke('U', 'B'),
    abilities: [
      enterIfSpent(
        { U: 2 },
        [{ kind: 'bounce', what: t0 }],
        [{ what: 'permanent', filter: { nonland: true, other: true }, optional: true }],
      ),
      enterIfSpent(
        { B: 2 },
        [{ kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' }],
        [opponent],
      ),
    ],
  },
  Emptiness: {
    ...hybridEvoke('W', 'B'),
    abilities: [
      enterIfSpent(
        { W: 2 },
        [{ kind: 'returnToBattlefield', what: t0 }],
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
      ),
      enterIfSpent(
        { B: 2 },
        [{ kind: 'namedCounters', name: '-1/-1', amount: 3, to: t0 }],
        [{ what: 'creature', optional: true }],
      ),
    ],
  },
  Vibrance: {
    ...hybridEvoke('R', 'G'),
    abilities: [
      enterIfSpent({ R: 2 }, [{ kind: 'damage', amount: 3, to: t0 }], [{ what: 'any' }]),
      enterIfSpent({ G: 2 }, [
        { kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'hand', reveal: true },
        gain(2),
      ]),
    ],
  },
  Wistfulness: {
    ...hybridEvoke('G', 'U'),
    abilities: [
      enterIfSpent(
        { G: 2 },
        [{ kind: 'exile', what: t0 }],
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact', 'Enchantment'] },
          },
        ],
      ),
      enterIfSpent({ U: 2 }, [draw(2), { kind: 'discard', count: 1 }]),
    ],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_INCARNATIONS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_INCARNATIONS_TOKENS: CardDefinition[] = [];
