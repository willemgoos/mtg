import type { AbilityDef, CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, mana, onEnter, pump, t0, when } from '../blb/helpers.ts';

/**
 * Wilds of Eldraine (23): colorless cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_COLORLESS_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const ANY_COLOR = [['W', 'U', 'B', 'R', 'G']] as const;

/** "{2}, {T}, Sacrifice this <permanent>: You gain 3 life." */
const sacrificeToGain3 = (label: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
  targets: [],
  effects: [gain(3)],
  label,
});

/** A mana ability whose cost is mana itself: it resolves at once, the mana of one colour (chosen as it is spent) waits in the pool. */
const anyColorManaAbility = (
  cost: Parameters<typeof mana>[0],
  tapSelf: boolean,
  oncePerTurn = false,
): AbilityDef => ({
  kind: 'activated',
  manaAbility: true,
  ...(oncePerTurn ? { oncePerTurn: true } : {}),
  cost: { mana: mana(cost), ...(tapSelf ? { tapSelf: true } : {}) },
  targets: [],
  effects: [{ kind: 'addMana', mana: ANY_COLOR.map((c) => [...c]) }],
});

export const WOE_COLORLESS: Record<string, Behavior> = {
  // "You may spend mana as though it were mana of any color to activate abilities of creatures you control." "Creatures you control
  // with +1/+1 counters on them have all activated abilities of all creature cards exiled with Agatha's Soul Cauldron." "{T}: Exile
  // target card from a graveyard. When a creature card is exiled this way, put a +1/+1 counter on target creature you control."
  "Agatha's Soul Cauldron": {
    abilities: [
      { kind: 'static', effect: { kind: 'anyColorForCreatureAbilities' } },
      { kind: 'static', effect: { kind: 'cauldronAbilities' } },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'graveyardCard' }],
        effects: [custom('woeCauldronExile')],
      },
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  // "When this artifact enters, scry 2." "{2}, {T}, Sacrifice this artifact: You gain 3 life and draw a card."
  'Candy Trail': {
    abilities: [
      onEnter({ kind: 'scry', amount: 2 }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain(3), draw(1)],
        label: '{2}, {T}, Sacrifice this artifact: You gain 3 life and draw a card',
      },
    ],
  },
  // "{2}, {T}: Draw a card, then discard a card. Create a Treasure token."
  "Collector's Vault": {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [
          draw(1),
          { kind: 'discard', count: 1 },
          { kind: 'createToken', token: 'treasure-token', count: 1 },
        ],
      },
    ],
  },
  // "When Eriette's Tempting Apple enters, gain control of target creature until end of turn. Untap that creature. It gains haste until
  // end of turn." "{2}, {T}, Sacrifice Eriette's Tempting Apple: You gain 3 life." "{2}, {T}, Sacrifice Eriette's Tempting Apple:
  // Target opponent loses 3 life."
  "Eriette's Tempting Apple": {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature' }],
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        pump(t0, 0, 0, ['haste']),
      ),
      sacrificeToGain3("{2}, {T}, Sacrifice Eriette's Tempting Apple: You gain 3 life"),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'loseLife', who: t0, amount: 3 }],
        label: "{2}, {T}, Sacrifice Eriette's Tempting Apple: Target opponent loses 3 life",
      },
    ],
  },
  // "Haste. {1}: This creature can't be blocked this turn except by creatures with haste. {2}, {T}, Sacrifice this creature: You gain
  // 3 life."
  Gingerbrute: {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        targets: [],
        effects: [
          { kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlockedExcept: 'haste' },
        ],
      },
      sacrificeToGain3('{2}, {T}, Sacrifice this creature: You gain 3 life'),
    ],
  },
  // "{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn." "{3}, Sacrifice Hylda's Crown of
  // Winter: Draw a card for each tapped creature your opponents control."
  "Hylda's Crown of Winter": {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        costReduction: { if: { kind: 'yourTurn' }, then: 1 },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'tap', what: t0 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'draw',
            who: 'controller',
            amount: {
              count: 'permanentsOpponentsControl',
              filter: { types: ['Creature'], tapped: true },
            },
          },
        ],
      },
    ],
  },
  // "When this artifact enters, draw a card." "{1}, {T}: Add one mana of any color."
  'Prophetic Prism': {
    abilities: [onEnter(draw(1)), anyColorManaAbility('{1}', true)],
  },
  // "Reach. {1}: Add one mana of any color. Activate only once each turn."
  'Scarecrow Guide': { abilities: [anyColorManaAbility('{1}', false, true)] },
  // "Syr Ginger has trample, hexproof, and haste as long as an opponent controls a planeswalker." "Whenever another artifact you
  // control is put into a graveyard from the battlefield, put a +1/+1 counter on Syr Ginger and scry 1." "{2}, {T}, Sacrifice Syr
  // Ginger: You gain life equal to its power."
  'Syr Ginger, the Meal Ender': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'permanentsOpponentsControl', filter: { types: ['Planeswalker'] } },
            min: 1,
          },
          power: 0,
          toughness: 0,
          keywords: ['trample', 'hexproof', 'haste'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'permanentYouControlDies', filter: { types: ['Artifact'] }, other: true },
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 1 },
          { kind: 'scry', amount: 1 },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain({ powerOf: 'self' })],
        label: '{2}, {T}, Sacrifice Syr Ginger: You gain life equal to its power',
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_COLORLESS_TOKENS: CardDefinition[] = [];
