import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { pump, t0, t1, theirCreature, when, yourCreature } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { subtypecycling } from '../hob-vocab.ts';
import { amassOrcs, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): red main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const anyTarget: TargetSpec = { what: 'any' };
const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
/** A spell's targets and effects. */
const spell = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });

export const LTR_RED_MAIN: Record<string, Behavior> = {
  // "Target creature an opponent controls deals damage equal to its power to another target creature that player controls. The
  // Ring tempts you." (Two players: both are the opponent's.)
  'Breaking of the Fellowship': {
    spell: spell(
      [theirCreature, theirCreature],
      { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
      ringTempts,
    ),
  },
  // "Choose one — • Cast into the Fire deals 1 damage to each of up to two target creatures. • Exile target artifact."
  'Cast into the Fire': {
    modes: [
      mode(
        'Cast into the Fire deals 1 damage to each of up to two target creatures',
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        { kind: 'damage', amount: 1, to: t0 },
        { kind: 'damage', amount: 1, to: t1 },
      ),
      mode('Exile target artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], {
        kind: 'exile',
        what: t0,
      }),
    ],
  },
  'Fiery Inscription': {
    abilities: [
      // "When this enchantment enters, the Ring tempts you."
      when({ on: 'etb' }, [], ringTempts),
      // "Whenever you cast an instant or sorcery spell, this enchantment deals 2 damage to each opponent."
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'damage',
        amount: 2,
        to: 'eachOpponent',
      }),
    ],
  },
  // "Destroy target artifact or land. Creatures without flying can't block this turn."
  'Fire of Orthanc': {
    spell: spell(
      [{ what: 'permanent', filter: { types: ['Artifact', 'Land'] } }],
      { kind: 'destroy', what: t0 },
      custom('ltrOnlyFlyersBlock'),
    ),
  },
  // "As an additional cost to cast this spell, sacrifice an artifact or creature. Improvised Club deals 4 damage to any target."
  'Improvised Club': {
    sacrificeCreatureToCast: true,
    sacrificeToCastFilter: { types: ['Artifact', 'Creature'] },
    spell: spell([anyTarget], { kind: 'damage', amount: 4, to: t0 }),
  },
  // Trample is printed.
  Oliphaunt: {
    abilities: [
      // "Whenever this creature attacks, another target creature you control gets +2/+0 and gains trample until end of turn."
      when(
        { on: 'attacks' },
        [{ ...yourCreature, filter: { other: true } }],
        pump(t0, 2, 0, ['trample']),
      ),
      // "Mountaincycling {1}"
      subtypecycling('Mountain', '{1}'),
    ],
  },
  // "Ranger's Firebrand deals 2 damage to any target. The Ring tempts you."
  "Ranger's Firebrand": {
    spell: spell([anyTarget], { kind: 'damage', amount: 2, to: t0 }, ringTempts),
  },
  'Warbeast of Gorgoroth': {
    abilities: [
      // "Whenever this creature or another creature you control with power 4 or greater dies, amass Orcs 2." (The power
      // applies to the other creatures; this one always counts.)
      when({ on: 'creatureYouControlDies', minLastPower: 4 }, [], amassOrcs(2)),
    ],
  },
};

export const LTR_RED_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_RED_MAIN_TOKENS: CardDefinition[] = [];
