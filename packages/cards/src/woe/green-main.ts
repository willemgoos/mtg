import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { food, onEnter, pump, t0, when } from '../blb/helpers.ts';
import { spell } from '../fin/helpers.ts';
import { ownsAdventureInExile } from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23d): green (rest of the main set) cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_GREEN_MAIN_BACKS. Engine pieces that only these cards need are in engine/src/woe-main-effects.ts.
 * See docs/wilds-of-eldraine-plan.md.
 */

/** "Mill three cards, then return a land card from your graveyard to the battlefield tapped." */
const tortoiseEffects: EffectDef[] = [
  { kind: 'mill', count: 3 },
  { kind: 'putFromHandOrGraveyard', filter: { types: ['Land'] }, graveyardOnly: true, tapped: true, required: true },
];

export const WOE_GREEN_MAIN: Record<string, Behavior> = {
  // "Whenever this creature enters or attacks, mill three cards, then return a land card from your graveyard to the battlefield
  // tapped." "Activated abilities of lands you control cost {1} less to activate." "Land creatures you control get +1/+1."
  'Blossoming Tortoise': {
    abilities: [
      when({ on: 'etb' }, [], ...tortoiseEffects),
      when({ on: 'attacks' }, [], ...tortoiseEffects),
      { kind: 'static', effect: { kind: 'woeLandAbilitiesCostLess', amount: 1 } },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { types: ['Land'] },
          anyPermanent: true,
          power: 1,
          toughness: 1,
        },
      },
    ],
  },

  // "When this creature enters, create a Food token." (The Adventure is Puny Snack.)
  'Gingerbread Hunter': { abilities: [onEnter(food)] },

  // Vigilance. "This creature has haste as long as you own a card in exile that has an Adventure."
  'Howling Galefang': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: ownsAdventureInExile,
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
    ],
  },

  // Trample. "When this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn." (The
  // Adventure is Dread Whispers.)
  'Mosswood Dreadknight': {
    abilities: [
      when({ on: 'dies' }, [], { kind: 'custom', handler: 'woeMainDreadknightPermit' }),
    ],
  },

  // "Whenever you cast a spell that's white, blue, black, or red, put a +1/+1 counter on this creature." (The Adventure is Seek the
  // Beast.)
  'Questing Druid': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'any', spell: { colors: ['W', 'U', 'B', 'R'] } },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },

  // "Destroy up to one target artifact, enchantment, or creature with flying. Create a Food token."
  'Spider Food': spell(
    [
      {
        what: 'permanent',
        optional: true,
        filter: {
          anyOf: [
            { types: ['Artifact'] },
            { types: ['Enchantment'] },
            { types: ['Creature'], hasKeyword: 'flying' },
          ],
        },
      },
    ],
    { kind: 'destroy', what: t0 },
    food,
  ),

  // "If you tap a basic land for mana, it produces three times as much of that mana instead." (The Adventure is Garenbrig Growth.)
  'Virtue of Strength': {
    abilities: [{ kind: 'static', effect: { kind: 'woeTripleBasicMana' } }],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_GREEN_MAIN_BACKS: Record<string, Behavior> = {
  // Instant — Adventure {2}{B}: "Target creature gets -2/-2 until end of turn."
  'Puny Snack': spell([{ what: 'creature' }], pump(t0, -2, -2)),

  // Sorcery — Adventure {1}{B}: "You draw a card and you lose 1 life."
  'Dread Whispers': spell(
    [],
    { kind: 'draw', who: 'controller', amount: 1 },
    { kind: 'loseLife', who: 'controller', amount: 1 },
  ),

  // Sorcery — Adventure {G}: "Return target creature or land card from your graveyard to your hand."
  'Garenbrig Growth': spell(
    [
      {
        what: 'graveyardCard',
        controller: 'you',
        filter: { anyOf: [{ types: ['Creature'] }, { types: ['Land'] }] },
      },
    ],
    { kind: 'returnToHand', what: t0 },
  ),

  // Instant — Adventure {1}{R}: "Exile the top two cards of your library. Until your next end step, you may play those cards."
  'Seek the Beast': spell([], { kind: 'exileTopPlayable', count: 2, until: 'yourNextEndStep' }),
};

/** Tokens only this group's cards make. */
export const WOE_GREEN_MAIN_TOKENS: CardDefinition[] = [];
