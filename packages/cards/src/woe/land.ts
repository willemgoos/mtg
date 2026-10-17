import type { AbilityDef, CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { gain, mana, onEnter, t0, yourCreature } from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';
import { HAS_ADVENTURE, animateSelf, sphereLand, whenThisAttacks } from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23): land cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_LAND_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

export const WOE_LAND: Record<string, Behavior> = {
  // "When this land enters, scry 1." "{T}: Add {C}." "{1}, {T}: Add one mana of any color."
  'Crystal Grotto': {
    abilities: [
      onEnter({ kind: 'scry', amount: 1 }),
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      // A mana ability whose cost is mana itself: it resolves at once.
      {
        kind: 'activated',
        manaAbility: true,
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']] }],
      },
    ],
  },
  // "This land enters tapped. As this land enters, choose a color. {T}: Add one mana of the chosen color. {3}, {T}, Sacrifice this
  // land: Return target card that has an Adventure from your graveyard to your hand."
  'Edgewall Inn': {
    entersTapped: true,
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: HAS_ADVENTURE }],
        effects: [{ kind: 'returnToHand', what: t0 }],
        label:
          '{3}, {T}, Sacrifice this land: Return target card that has an Adventure from your graveyard to your hand',
      },
    ],
  },
  // "This land enters tapped. {T}: Add {R} or {W}. {1}{R}{W}: This land becomes a 2/2 red and white Ox creature until end of turn.
  // It's still a land. Whenever this land attacks, put a +1/+1 counter on target creature you control."
  'Restless Bivouac': {
    entersTapped: true,
    abilities: [
      ...tapFor('R', 'W'),
      animateSelf(mana('{1}{R}{W}'), {
        power: 2,
        toughness: 2,
        colors: ['R', 'W'],
        subtype: 'Ox',
      }),
      whenThisAttacks([{ kind: 'counters', to: t0, amount: 1 }], [yourCreature]),
    ],
  },
  // "This land enters tapped. {T}: Add {W} or {B}. {2}{W}{B}: This land becomes a 1/4 white and black Nightmare creature until end
  // of turn. It's still a land. Whenever this land attacks, defending player loses 2 life and you gain 2 life."
  'Restless Fortress': {
    entersTapped: true,
    abilities: [
      ...tapFor('W', 'B'),
      animateSelf(mana('{2}{W}{B}'), {
        power: 1,
        toughness: 4,
        colors: ['W', 'B'],
        subtype: 'Nightmare',
      }),
      whenThisAttacks([{ kind: 'loseLife', who: 'eachOpponent', amount: 2 }, gain(2)]),
    ],
  },
  // "This land enters tapped. {T}: Add {U} or {R}. {U}{R}: Until end of turn, this land becomes a 2/1 blue and red Elemental creature
  // with 'During your turn, this creature has first strike.' It's still a land. Whenever this land attacks, scry 1."
  'Restless Spire': {
    entersTapped: true,
    abilities: [
      ...tapFor('U', 'R'),
      animateSelf(mana('{U}{R}'), {
        power: 2,
        toughness: 1,
        colors: ['U', 'R'],
        subtype: 'Elemental',
        abilities: [
          {
            kind: 'static',
            effect: {
              kind: 'while',
              condition: { kind: 'yourTurn' },
              power: 0,
              toughness: 0,
              keywords: ['firstStrike'],
            },
          },
        ],
      }),
      whenThisAttacks([{ kind: 'scry', amount: 1 }]),
    ],
  },
  // "This land enters tapped. {T}: Add {G} or {U}. {3}{G}{U}: Until end of turn, this land becomes a 5/5 green and blue Plant creature
  // with trample. It's still a land. Whenever this land attacks, up to one other target creature has base power and toughness 3/3
  // until end of turn."
  'Restless Vinestalk': {
    entersTapped: true,
    abilities: [
      ...tapFor('G', 'U'),
      animateSelf(mana('{3}{G}{U}'), {
        power: 5,
        toughness: 5,
        colors: ['G', 'U'],
        subtype: 'Plant',
        keywords: ['trample'],
      }),
      whenThisAttacks(
        [{ kind: 'pump', to: t0, power: 3, toughness: 3, setBase: true }],
        [{ what: 'creature', filter: { other: true }, optional: true }],
      ),
    ],
  },
  'The Autonomous Furnace': sphereLand('R'),
  'The Dross Pits': sphereLand('B'),
  'The Fair Basilica': sphereLand('W'),
  'The Hunter Maze': sphereLand('G'),
  'The Surgical Bay': sphereLand('U'),
};

/** Back faces: keyed by their own names. */
export const WOE_LAND_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const WOE_LAND_TOKENS: CardDefinition[] = [];
