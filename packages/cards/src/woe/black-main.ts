import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { combos } from '../msc/helpers.ts';
import { spell } from '../fin/helpers.ts';
import {
  bargain,
  createRole,
  ifBargained,
  whenEnchantmentYouControlToGraveyard,
} from '../woe-vocab.ts';
import { WOE_RAT } from './black.ts';

/**
 * Wilds of Eldraine (23d): black (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_BLACK_MAIN_BACKS. Engine pieces that only these cards need are in engine/src/woe-main-effects.ts.
 * See docs/wilds-of-eldraine-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const chooseCustom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  ...(params ? { params } : {}),
});
const rat: EffectDef = { kind: 'createToken', token: WOE_RAT, count: 1 };
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };

export const WOE_BLACK_MAIN: Record<string, Behavior> = {
  // Bargain. "Search your library for a card, exile it face down, then shuffle. If this spell was bargained, you may cast the exiled
  // card without paying its mana cost if that spell's mana value is 4 or less. Put the exiled card into your hand if it wasn't cast
  // this way."
  'Beseech the Mirror': {
    ...bargain(),
    ...spell(
      [],
      { kind: 'searchLibrary', filter: {}, to: 'hideaway', required: true, rememberFound: true },
      custom('woeMainFaceDownFound'),
      ifBargained([chooseCustom('woeMainBeseech')], [custom('woeMainFoundToHand')]),
    ),
  },

  // "Cruel Somnophage's power and toughness are each equal to the number of creature cards in all graveyards." (The Adventure is
  // Can't Wake Up.)
  'Cruel Somnophage': { ptEquals: { woeCreatureCardsInAllGraveyards: true } },

  // Menace, trample. "At the beginning of your upkeep, you may sacrifice an artifact, enchantment, or token. If you don't, tap this
  // creature."
  'Devouring Sugarmaw': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [chooseCustom('woeMainSugarmaw')],
      },
    ],
  },

  // "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. If you don't control a
  // Faerie, exile a card from your hand."
  'Ego Drain': spell(
    [opponent],
    { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' },
    {
      kind: 'if',
      condition: {
        kind: 'not',
        condition: { kind: 'controlsPermanents', filter: { subtype: 'Faerie' }, min: 1 },
      },
      then: [{ kind: 'discard', count: 1, who: 'controller', exile: true }],
    },
  ),

  // "When this creature dies, put it on the bottom of its owner's library." (The Adventure is Deathly Ride.)
  'Fell Horseman': {
    abilities: [
      when({ on: 'dies' }, [], custom('woeMainBottomSelf')),
    ],
  },

  // "Sacrifice any number of artifacts, enchantments, and/or tokens. Return that many creature cards from your graveyard to the
  // battlefield."
  "Lich-Knights' Conquest": spell([], chooseCustom('woeMainLich')),

  // "Choose one or more — • Each player discards two cards. • Each player loses 4 life. • Each player sacrifices two creatures of
  // their choice."
  "Rankle's Prank": {
    modes: combos(
      [
        {
          label: 'Each player discards two cards',
          targets: [],
          effects: [
            { kind: 'discard', count: 2, who: 'controller' },
            { kind: 'discard', count: 2, who: 'eachOpponent' },
          ],
        },
        {
          label: 'Each player loses 4 life',
          targets: [],
          effects: [{ kind: 'loseLife', who: 'eachPlayer', amount: 4 }],
        },
        {
          label: 'Each player sacrifices two creatures of their choice',
          targets: [],
          effects: [
            { kind: 'opponentSacrifices', you: true },
            { kind: 'opponentSacrifices', you: true },
            { kind: 'opponentSacrifices' },
            { kind: 'opponentSacrifices' },
          ],
        },
      ],
      [1, 2, 3],
    ),
  },

  // "Destroy target creature or enchantment. Create a Wicked Role token attached to up to one target creature you control."
  'Shatter the Oath': spell(
    [
      {
        what: 'permanent',
        filter: { anyOf: [{ types: ['Creature'] }, { types: ['Enchantment'] }] },
      },
      { ...yourCreature, optional: true },
    ],
    { kind: 'destroy', what: t0 },
    createRole('Wicked', t1),
  ),

  // Flying. "When this creature enters, you may exile one or more creature cards from your graveyard. When you do, each other
  // creature gets -X/-X until end of turn, where X is the number of cards exiled this way."
  'Specter of Mortality': {
    abilities: [when({ on: 'etb' }, [], chooseCustom('woeMainSpecter'))],
  },

  // "When this creature enters, create a Cursed Role token attached to target creature you control."
  'Spiteful Hexmage': {
    abilities: [when({ on: 'etb' }, [yourCreature], createRole('Cursed'))],
  },

  // "This creature can't block." "When this creature dies, create X 1/1 black Rat creature tokens with 'This token can't block,'
  // where X is the amount of damage dealt to it this turn."
  'Tangled Colony': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBlock' } },
      when({ on: 'dies' }, [], {
        kind: 'createToken',
        token: WOE_RAT,
        count: { woeDamageOnSelf: true },
      }),
    ],
  },

  // "This spell costs {2} less to cast if your life total is 5 or less." "Exile target creature or planeswalker. Search its
  // controller's graveyard, hand, and library for any number of cards with the same name as that permanent and exile them. That
  // player shuffles, then draws a card for each card exiled from their hand this way."
  'The End': {
    costReductionIf: {
      condition: {
        kind: 'not',
        condition: { kind: 'amountAtLeast', amount: { count: 'lifeTotal' }, min: 6 },
      },
      amount: 2,
    },
    ...spell(
      [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      chooseCustom('woeMainTheEnd'),
    ),
  },

  // "Whenever an enchantment you control is put into a graveyard from the battlefield, create a 1/1 black Rat creature token with
  // 'This token can't block.'" "{1}{B}: This creature gains deathtouch until end of turn."
  'Warehouse Tabby': {
    abilities: [
      whenEnchantmentYouControlToGraveyard([rat]),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [],
        effects: [pump('self', 0, 0, ['deathtouch'])],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_BLACK_MAIN_BACKS: Record<string, Behavior> = {
  // Sorcery — Adventure {1}{B}: "Return target creature card from your graveyard to your hand."
  'Deathly Ride': spell([{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }], {
    kind: 'returnToHand',
    what: t0,
  }),
};

/** Tokens only this group's cards make. */
export const WOE_BLACK_MAIN_TOKENS: CardDefinition[] = [];
