import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { food, pump, t0, when, yourCreature } from '../blb/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { subtypecycling } from '../hob-vocab.ts';
import { legendaryCreature, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): green main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
/** A spell's targets and effects. */
const spell = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });
const legendaryCreaturesYouControl = {
  count: 'permanentsYouControl',
  filter: legendaryCreature,
} as const;

export const LTR_GREEN_MAIN: Record<string, Behavior> = {
  'Bag End Porter': {
    abilities: [
      // "Whenever this creature attacks, it gets +X/+X until end of turn, where X is the number of legendary creatures you control."
      when(
        { on: 'attacks' },
        [],
        pump('self', legendaryCreaturesYouControl, legendaryCreaturesYouControl),
      ),
    ],
  },
  // "Scry 3, then you may reveal the top card of your library. If a creature card is revealed this way, draw a card."
  'Elven Farsight': {
    spell: spell(
      [],
      { kind: 'scry', amount: 3 },
      { kind: 'may', effects: [custom('ltrRevealTopDrawIfCreature')] },
    ),
  },
  // Reach is printed.
  'Generous Ent': {
    abilities: [
      // "When this creature enters, create a Food token."
      when({ on: 'etb' }, [], food),
      // "Forestcycling {1}"
      subtypecycling('Forest', '{1}'),
    ],
  },
  // "I, II, III, IV, V, VI — Note a creature type that hasn't been noted for this Saga. When you next cast a creature spell of that
  // type this turn, that creature enters with an additional +1/+1 counter on it."
  'Long List of the Ents': {
    saga: 6,
    abilities: [
      chapter([1, 2, 3, 4, 5, 6], [], { kind: 'chooseCustom', handler: 'ltrNoteCreatureType' }),
    ],
  },
  // "Search your library for a basic land card, reveal it, put it into your hand, then shuffle. Create a Food token."
  'Many Partings': {
    spell: spell([], { kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }, food),
  },
  'Mushroom Watchdogs': {
    abilities: [
      // "Sacrifice a Food: Put a +1/+1 counter on this creature. It gains vigilance until end of turn. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { sacrificePermanent: { subtype: 'Food' } },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }, pump('self', 0, 0, ['vigilance'])],
      },
    ],
  },
  'Shortcut to Mushrooms': {
    abilities: [
      // "When this enchantment enters, the Ring tempts you."
      when({ on: 'etb' }, [], ringTempts),
      // "At the beginning of your end step, if a permanent you controlled left the battlefield this turn, put a +1/+1 counter on
      // target creature you control."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'revolt' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
};

export const LTR_GREEN_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_GREEN_MAIN_TOKENS: CardDefinition[] = [];
