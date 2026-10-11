import type { CardDefinition, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { draw, t0, when } from '../blb/helpers.ts';
import { tapFor } from '../msc/helpers.ts';

/**
 * The Lord of the Rings (22): colorless main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const COLORS: ManaType[] = ['W', 'U', 'B', 'R', 'G'];
const anyColor: ManaType[] = ['W', 'U', 'B', 'R', 'G'];

export const LTR_COLORLESS_MAIN: Record<string, Behavior> = {
  // Defender is printed.
  'Shire Scarecrow': {
    abilities: [
      // "{1}: Add one mana of any color. Activate only once each turn."
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'addMana', mana: [anyColor], count: 1 }],
        label: '{1}: Add one mana of any color',
      },
    ],
  },
  'Stone of Erech': {
    abilities: [
      // "If a creature an opponent controls would die, exile it instead."
      { kind: 'static', effect: { kind: 'exileOpponentCreaturesInstead' } },
      // "{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card."
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'exileGraveyard', who: t0 }, draw(1)],
      },
    ],
  },
  "Wizard's Rockets": {
    // "This artifact enters tapped."
    entersTapped: true,
    abilities: [
      // "{X}, {T}, Sacrifice this artifact: Add X mana in any combination of colors."
      {
        kind: 'activated',
        cost: { mana: mana('{X}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [anyColor], count: { x: true } }],
        label: 'Add X mana in any combination of colors',
      },
      // "When this artifact is put into a graveyard from the battlefield, draw a card."
      when({ on: 'selfToGraveyard' }, [], draw(1)),
    ],
  },
  'Great Hall of the Citadel': {
    abilities: [
      // "{T}: Add {C}."
      tapFor('C'),
      // "{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast legendary spells." (An activated
      // ability, as Vivi Ornitier's: mana abilities with a mana cost aren't used to pay.)
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [anyColor, anyColor], onlyFor: 'Legendary' }],
        label: 'Add two mana in any combination of colors (only for legendary spells)',
      },
    ],
  },
  'The Grey Havens': {
    abilities: [
      // "When The Grey Havens enters, scry 1."
      when({ on: 'etb' }, [], { kind: 'scry', amount: 1 }),
      // "{T}: Add {C}."
      tapFor('C'),
      // "{T}: Add one mana of any color among legendary creature cards in your graveyard."
      ...COLORS.map((c) => tapFor(c, { colorFrom: 'legendaryCreatureCardsInGraveyard' })),
    ],
  },
  'Shire Terrace': {
    abilities: [
      // "{T}: Add {C}."
      tapFor('C'),
      // "{1}, {T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then
      // shuffle."
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      },
    ],
  },
};

export const LTR_COLORLESS_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_COLORLESS_MAIN_TOKENS: CardDefinition[] = [];
