import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, pump, t0, when } from '../blb/helpers.ts';
import { amassOrcs, chosenOtherThanThis, ringTempts, whenRingTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): blue main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const creature: TargetSpec = { what: 'creature' };
const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
/** A spell's targets and effects. */
const spell = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });

export const LTR_BLUE_MAIN: Record<string, Behavior> = {
  // "Draw a card. The Ring tempts you."
  'Birthday Escape': { spell: spell([], draw(1), ringTempts) },
  // "Target creature gets -3/-0 until end of turn. Amass Orcs 1."
  'Deceive the Messenger': { spell: spell([creature], pump(t0, -3, 0), amassOrcs(1)) },
  // "Target creature has base power and toughness 5/5 until end of turn. The Ring tempts you."
  'Dreadful as the Storm': {
    spell: spell(
      [creature],
      { kind: 'pump', to: t0, power: 0, toughness: 0, basePT: [5, 5] },
      ringTempts,
    ),
  },
  // Flash is printed.
  'Gandalf, Friend of the Shire': {
    abilities: [
      // "You may cast sorcery spells as though they had flash."
      { kind: 'static', effect: { kind: 'flashForAll', filter: { types: ['Sorcery'] } } },
      // "Whenever the Ring tempts you, if you chose a creature other than Gandalf as your Ring-bearer, draw a card."
      whenRingTempts([draw(1)], { condition: chosenOtherThanThis }),
    ],
  },
  // Flash is printed.
  'Grey Havens Navigator': {
    // "When this creature enters, scry 1."
    abilities: [when({ on: 'etb' }, [], scry(1))],
  },
  // "Tap target creature. Scry 1. Draw a card."
  'Hithlain Knots': { spell: spell([creature], { kind: 'tap', what: t0 }, scry(1), draw(1)) },
  // "Return target nontoken creature to its owner's hand. The Ring tempts you."
  'Soothing of Sméagol': {
    spell: spell(
      [{ what: 'creature', filter: { nontoken: true } }],
      { kind: 'bounce', what: t0 },
      ringTempts,
    ),
  },
  // "Counter target creature spell with power or toughness 2 or less."
  'Stern Scolding': {
    spell: spell([{ what: 'spell', filter: { types: ['Creature'], maxPowerOrToughness: 2 } }], {
      kind: 'counter',
      what: t0,
    }),
  },
  // "Amass Orcs 3, then target player mills X cards, where X is the amassed Army's power."
  'Surrounded by Orcs': {
    spell: spell([{ what: 'player' }], amassOrcs(3), {
      kind: 'mill',
      count: { powerOf: 'chosen' },
      who: t0,
    }),
  },
  // "Put up to one target instant or sorcery card from your graveyard on top of your library. Amass Orcs 2."
  'Treason of Isengard': {
    spell: spell(
      [
        {
          what: 'graveyardCard',
          controller: 'you',
          optional: true,
          filter: { types: ['Instant', 'Sorcery'] },
        },
      ],
      { kind: 'putInLibrary', what: t0, position: 'top' },
      amassOrcs(2),
    ),
  },
};

export const LTR_BLUE_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_BLUE_MAIN_TOKENS: CardDefinition[] = [];
