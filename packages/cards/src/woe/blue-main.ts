import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, t0, theirCreature, when } from '../blb/helpers.ts';
import { spell } from '../fin/helpers.ts';
import { bargain, createRole, whenEntersIfBargained } from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23d): blue (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_BLUE_MAIN_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

export const WOE_BLUE_MAIN: Record<string, Behavior> = {
  // Flying, ward {2}. "When this creature enters, scry 2."
  'Archive Dragon': { abilities: [onEnter({ kind: 'scry', amount: 2 })] },

  // "You may cast this spell as though it had flash if you pay {2} more to cast it." "For each creature your opponents control,
  // create a Cursed Role token attached to that creature."
  'Asinine Antics': {
    kicker: { cost: { generic: 2, colored: {} }, flash: true },
    ...spell([], createRole('Cursed', { each: 'creature', controller: 'opponent' })),
  },

  // Bargain. "When this creature enters, if it was bargained, create a Cursed Role token attached to target creature an opponent
  // controls."
  'Diminisher Witch': {
    ...bargain(),
    abilities: [whenEntersIfBargained([createRole('Cursed')], [theirCreature])],
  },

  // "When this enchantment enters, exile up to X target creatures. For each of those cards, its owner may play it for as long as it
  // remains exiled." "Whenever one or more nontoken creatures enter, if one or more of them entered from exile or was cast from
  // exile, you draw a card. This ability triggers only once each turn."
  'Extraordinary Journey': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', anyNumber: true, maxAmount: { x: true } }],
        effects: [custom('woeMainJourneyExile')],
      },
      {
        kind: 'triggered',
        trigger: { on: 'woeNontokenCreaturesEnterFromExile' },
        oncePerTurn: true,
        batch: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },

  // "{1}: This creature gets +1/-1 until end of turn." "When this creature dies, scry 2."
  'Merfolk Coralsmith': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: -1 }],
      },
      when({ on: 'dies' }, [], { kind: 'scry', amount: 2 }),
    ],
  },

  // Flying, vigilance, ward {1}. (The Adventure is Swift Spiral.)
  'Twining Twins': {},

  // "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional
  // time." (The Adventure is Vantress Visions.)
  'Virtue of Knowledge': {
    abilities: [{ kind: 'static', effect: { kind: 'woeEntersTriggerTwice' } }],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_BLUE_MAIN_BACKS: Record<string, Behavior> = {
  // Instant — Adventure {1}{W}: "Exile target nontoken creature. Return it to the battlefield under its owner's control at the
  // beginning of the next end step."
  'Swift Spiral': spell([{ what: 'creature', filter: { nontoken: true } }], {
    kind: 'exileUntilEndStep',
    what: t0,
  }),

  // Instant — Adventure {1}{U}: "Copy target activated or triggered ability you control. You may choose new targets for the copy."
  'Vantress Visions': spell(
    [{ what: 'spell', controller: 'you', abilitiesOnly: true }],
    { kind: 'custom', handler: 'copyTargetStackAbility' },
    { kind: 'chooseNewTargets' },
  ),

  // Sorcery — Adventure {1}{U}: "Target player mills four cards."
  "Can't Wake Up": spell([{ what: 'player' }], { kind: 'mill', count: 4, who: t0 }),
};

/** Tokens only this group's cards make. */
export const WOE_BLUE_MAIN_TOKENS: CardDefinition[] = [];
