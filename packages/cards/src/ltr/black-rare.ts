import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, t0, when } from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';
import {
  amassOrcs,
  legendaryCreature,
  ringBearerPower,
  ringTempts,
  whenRingBearerChosen,
} from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): black rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_BLACK_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** "Deals 1 damage to any target" (Orcish Bowmasters), then "amass Orcs 1". */
const bowmastersShot: TargetSpec = { what: 'any' };
const bowmastersEffects: EffectDef[] = [{ kind: 'damage', amount: 1, to: t0 }, amassOrcs(1)];

export const LTR_BLACK_RARE: Record<string, Behavior> = {
  // "At the beginning of your upkeep, the Ring tempts you." "Whenever you choose a creature as your Ring-bearer, you may pay 2 life.
  // If you do, draw a card." (Paying life needs a life total of at least 2.)
  'Call of the Ring': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], ringTempts),
      whenRingBearerChosen([
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { count: 'lifeTotal' }, min: 2 },
          then: [
            {
              kind: 'may',
              effects: [{ kind: 'loseLife', who: 'controller', amount: 2 }, draw(1)],
            },
          ],
        },
      ]),
    ],
  },

  // "(You may cast a legendary instant only if you control a legendary creature or planeswalker.)" "Destroy target creature. If its
  // controller has more than four cards in hand, they exile cards from their hand equal to the difference."
  "Isildur's Fateful Strike": {
    castOnlyIf: {
      kind: 'any',
      of: [
        { kind: 'controlsCreature', filter: legendaryCreature },
        {
          kind: 'controlsPermanents',
          filter: { types: ['Planeswalker'], supertypes: ['Legendary'] },
          min: 1,
        },
      ],
    },
    spell: { targets: [creature], effects: [custom('ltrIsildurStrike')] },
  },

  // "Flash" "Menace" "When Lobelia enters, exile target creature card from an opponent's graveyard that was put there from the
  // battlefield this turn, then create X Treasure tokens, where X is the exiled card's power."
  'Lobelia Sackville-Baggins': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'opponent',
            filter: { types: ['Creature'], diedThisTurn: true },
          },
        ],
        custom('ltrLobelia'),
      ),
    ],
  },

  // "I — The Ring tempts you, then each player mills cards equal to your Ring-bearer's power. II — Destroy all nonlegendary
  // creatures. III — Each opponent loses 1 life for each creature card in that player's graveyard."
  'One Ring to Rule Them All': {
    saga: 3,
    abilities: [
      chapter([1], [], ringTempts, { kind: 'mill', who: 'eachPlayer', count: ringBearerPower }),
      chapter([2], [], { kind: 'destroyAll', filter: { nonlegendary: true } }),
      chapter([3], [], custom('ltrOneRingLoss')),
    ],
  },

  // "Flash" "When this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw
  // steps, this creature deals 1 damage to any target. Then amass Orcs 1."
  'Orcish Bowmasters': {
    abilities: [
      when({ on: 'etb' }, [bowmastersShot], ...bowmastersEffects),
      when({ on: 'ltrOpponentExtraDraw' }, [bowmastersShot], ...bowmastersEffects),
    ],
  },

  // "Menace" "Whenever Sauron attacks, exile target creature card from your graveyard. Create a tapped and attacking token that's a
  // copy of that card, except it's a 3/3 black Wraith with menace. At the beginning of the next end step, exile that token unless
  // Sauron is your Ring-bearer."
  'Sauron, the Necromancer': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
        custom('ltrSauronStart'),
      ),
    ],
  },

  // "Exile all creature cards from target player's graveyard. You may cast spells from among those cards for as long as they remain
  // exiled, and mana of any type can be spent to cast them."
  'Shadow of the Enemy': spell([{ what: 'player' }], custom('ltrShadowOfTheEnemy')),

  // "Flying" "Whenever one or more creatures deal combat damage to you, each opponent sacrifices a creature of their choice that dealt
  // combat damage to you this turn. The Ring tempts you." "Discard a card: Witch-king of Angmar gains indestructible until end of
  // turn. Tap him."
  'Witch-king of Angmar': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToYou' },
        targets: [],
        batch: true,
        effects: [custom('ltrWitchKingSacrifice'), ringTempts],
      },
      {
        kind: 'activated',
        cost: { discard: true },
        targets: [],
        effects: [
          { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['indestructible'] },
          { kind: 'tap', what: 'self' },
        ],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_BLACK_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_BLACK_RARE_TOKENS: CardDefinition[] = [];
