import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { t0, when } from '../blb/helpers.ts';
import { spell } from '../fin/helpers.ts';
import { instantSorceryOrAdventureCardsInGraveyard } from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23d): red (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_RED_MAIN_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };

export const WOE_RED_MAIN: Record<string, Behavior> = {
  // Flying, trample. "Whenever this creature attacks, create a Treasure token." (The Adventure is Expensive Taste.)
  'Decadent Dragon': { abilities: [when({ on: 'attacks' }, [], treasure)] },

  // "Flick a Coin deals 1 damage to any target. You create a Treasure token. Draw a card."
  'Flick a Coin': spell(
    [{ what: 'any' }],
    { kind: 'damage', amount: 1, to: t0 },
    treasure,
    { kind: 'draw', who: 'controller', amount: 1 },
  ),

  // "This spell costs {X} less to cast, where X is the number of cards in your graveyard that are instant cards, sorcery cards,
  // and/or have an Adventure." (The Adventure is Stoke Genius.)
  'Hearth Elemental': { costReduction: instantSorceryOrAdventureCardsInGraveyard },

  // Menace. "Whenever this creature deals combat damage to a player, put a skewer counter on this creature. Then you may sacrifice
  // it. If you do, exile the top X cards of your library, where X is the number of skewer counters on this creature. You may play
  // those cards this turn."
  'Rotisserie Elemental': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'namedCounters', name: 'skewer', amount: 1, to: 'self' },
        {
          kind: 'may',
          effects: [
            { kind: 'sacrifice', what: 'self' },
            {
              kind: 'exileTopPlayable',
              count: { namedCountersOnSource: 'skewer' },
              until: 'endOfTurn',
            },
          ],
        },
      ),
    ],
  },

  // Defender. "{T}: This creature deals 1 damage to each opponent." "Whenever you cast an instant or sorcery spell, untap this
  // creature."
  'Unruly Catapult': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent', from: 'self' }],
      },
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], { kind: 'untap', what: 'self' }),
    ],
  },

  // "Whenever a source you control deals noncombat damage to an opponent, you may exile that many cards from the top of your
  // library. You may play those cards this turn." (The Adventure is Embereth Blaze.)
  'Virtue of Courage': {
    abilities: [
      when({ on: 'yourNoncombatDamageToOpponent' }, [], {
        kind: 'may',
        effects: [{ kind: 'exileTopPlayable', count: { event: 'amount' }, until: 'endOfTurn' }],
      }),
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_RED_MAIN_BACKS: Record<string, Behavior> = {
  // Instant — Adventure {2}{B}: "Exile the top two cards of target opponent's library face down. You may look at and play those
  // cards for as long as they remain exiled."
  'Expensive Taste': spell([{ what: 'player', controller: 'opponent' }], {
    kind: 'custom',
    handler: 'woeMainExpensiveTaste',
  }),

  // Sorcery — Adventure {1}{R}: "Discard your hand, then draw two cards."
  'Stoke Genius': spell([], { kind: 'discardHand' }, { kind: 'draw', who: 'controller', amount: 2 }),

  // Instant — Adventure {1}{R}: "Embereth Blaze deals 2 damage to any target."
  'Embereth Blaze': spell([{ what: 'any' }], { kind: 'damage', amount: 2, to: t0 }),
};

/** Tokens only this group's cards make. */
export const WOE_RED_MAIN_TOKENS: CardDefinition[] = [];
