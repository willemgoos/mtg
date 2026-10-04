import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { creature, draw, onEnter, pump, t0, t1, when } from '../blb/helpers.ts';
import { landcycling } from '../fic/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { empowerJace } from './helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17c): the planeswalker core: Jace token, Empower Jace and the commons. Printed characteristics come from Scryfall;
 * this file has the rules text. See docs/reality-fracture-plan.md.
 */

const creatureOrWalker: TargetSpec = {
  what: 'permanent',
  controller: 'opponent',
  filter: { types: ['Creature', 'Planeswalker'] },
};

export const FRA_PW_CORE: Record<string, Behavior> = {
  // "Target creature gets +2/+2 and gains flying until end of turn. Empower Jace 2."
  'Academic Ascent': {
    spell: { targets: [creature], effects: [pump(t0, 2, 2, ['flying']), empowerJace(2)] },
  },
  // "Deathtouch. When this creature enters, empower Jace 2."
  'Arcane Amphisbaena': { abilities: [onEnter(empowerJace(2))] },
  // "{1}, Exile this card from your graveyard: Empower Jace 2."
  'Campus Crier': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), exileSelf: true },
        fromGraveyard: true,
        targets: [],
        effects: [empowerJace(2)],
        label: '{1}, Exile this card from your graveyard: Empower Jace 2',
      },
    ],
  },
  'Compel Brutality': {
    modes: [
      mode(
        'Target creature you control deals damage equal to its power to target creature or planeswalker an opponent controls',
        [{ what: 'creature', controller: 'you' }, creatureOrWalker],
        { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
      ),
      mode(
        'Target planeswalker you control deals damage equal to its loyalty to target creature or planeswalker an opponent controls',
        [
          { what: 'permanent', controller: 'you', filter: { types: ['Planeswalker'] } },
          creatureOrWalker,
        ],
        { kind: 'damage', amount: { loyaltyOf: t0 }, to: t1, from: t0 },
      ),
    ],
  },
  // "Create three 2/2 colorless Wizard Soldier creature tokens named Cadet. Empower Jace 2. Basic landcycling {2}."
  'Hexhaven Battalion': {
    spell: {
      targets: [],
      effects: [{ kind: 'createToken', token: FRA_CADET, count: 3 }, empowerJace(2)],
    },
    abilities: [landcycling('{2}')],
  },
  // "Whenever you put one or more loyalty counters on a planeswalker, put a +1/+1 counter on this creature.
  // {6}: Empower Jace 2."
  'Inspired Tethermage': {
    abilities: [
      when({ on: 'youPutLoyaltyCounters' }, [], { kind: 'counters', to: 'self', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [],
        effects: [empowerJace(2)],
        label: '{6}: Empower Jace 2',
      },
    ],
  },
  'Keeper of the Quiet Hour': { abilities: [onEnter(empowerJace(2))] },
  'Mindseeker Oculus': { abilities: [onEnter(empowerJace(4))] },
  // "No Admittance deals 3 damage to any target. Empower Jace 1."
  'No Admittance': {
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 3, to: t0 }, empowerJace(1)],
    },
  },
  // "Empower Jace 6. Draw a card."
  "Protege's Awakening": { spell: { targets: [], effects: [empowerJace(6), draw(1)] } },
  // "Target opponent reveals their hand. You choose a nonland permanent card from it. That player discards that card.
  // Empower Jace 1."
  'Solve for Disappointment': {
    spell: {
      targets: [{ what: 'player', controller: 'opponent' }],
      effects: [
        {
          kind: 'chooseFromOpponentHand',
          filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Planeswalker'] },
          then: 'discard',
        },
        empowerJace(1),
      ],
    },
  },
  // "Put a +1/+1 counter on up to one target creature. It gains vigilance until end of turn. Empower Jace 4."
  "Tam's Resistance": {
    spell: {
      targets: [{ ...creature, optional: true }],
      effects: [
        { kind: 'counters', to: t0, amount: 1 } as EffectDef,
        pump(t0, 0, 0, ['vigilance']),
        empowerJace(4),
      ],
    },
  },
};

/** Back faces (none expected here). */
export const FRA_PW_CORE_BACKS: Record<string, Behavior> = {};

/** Tokens only these cards make (the Jace token is shared: `fra/tokens.ts`). */
export const FRA_PW_CORE_TOKENS: CardDefinition[] = [];
