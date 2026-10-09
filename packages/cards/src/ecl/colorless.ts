import type { AbilityDef, CardDefinition, EffectDef, ManaType } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, onEnter, t0, when } from '../blb/helpers.ts';
import { equip, tapFor } from '../fin/helpers.ts';
import { VIVID } from '../ecl-vocab.ts';
import { ECL_SHAPESHIFTER } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): colourless cards and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_COLORLESS_BACKS. See docs/lorwyn-eclipsed-plan.md.
 *
 * "As this enters, choose a creature type" is, as for the earlier sets' cards, an enters trigger that sets the type
 * (the engine has no replacement step for it).
 */

/** The types Dawn-Blessed Pennant and Eclipsed Realms offer. */
const TRIBES = [
  'Elemental',
  'Elf',
  'Faerie',
  'Giant',
  'Goblin',
  'Kithkin',
  'Merfolk',
  'Treefolk',
];
const chooseTribe: EffectDef = { kind: 'chooseCreatureType', from: TRIBES };
const chooseAnyType: EffectDef = { kind: 'chooseCreatureType' };
const OF_CHOSEN_TYPE = { chosenTypeOfSource: true } as const;
const chooseCustom = (handler: string): EffectDef => ({ kind: 'chooseCustom', handler });

/** "{T}: Add one mana of any color." as five mana abilities, each restricted the same way. */
const anyColorOnlyFor = (onlyFor: string): AbilityDef[] =>
  (['W', 'U', 'B', 'R', 'G'] as ManaType[]).map((produces) => ({
    kind: 'mana',
    cost: { tapSelf: true },
    produces,
    onlyFor,
  }));
const anyColor = (): AbilityDef[] => tapFor('W', 'U', 'B', 'R', 'G');

export const ECL_COLORLESS: Record<string, Behavior> = {
  // Changeling Wayfinder: "When this creature enters, you may search your library for a basic land card, reveal it, put it into your
  // hand, then shuffle."
  'Changeling Wayfinder': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand', reveal: true }],
      }),
    ],
  },
  // Rooftop Percher: "When this creature enters, exile up to two target cards from graveyards. You gain 3 life."
  'Rooftop Percher': {
    abilities: [
      when(
        { on: 'etb' },
        // Up to two, picked one at a time (not every pair).
        [{ what: 'graveyardCard', anyNumber: true, maxTargets: 2 }],
        { kind: 'custom', handler: 'eclExileTargetCards' },
        gain(3),
      ),
    ],
  },
  // Chronicle of Victory: "As Chronicle of Victory enters, choose a creature type. Creatures you control of the chosen type get +2/+2
  // and have first strike and trample. Whenever you cast a spell of the chosen type, draw a card."
  'Chronicle of Victory': {
    abilities: [
      onEnter(chooseAnyType),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: OF_CHOSEN_TYPE,
          power: 2,
          toughness: 2,
          keywords: ['firstStrike', 'trample'],
        },
      },
      when({ on: 'castSpell', filter: 'any', spell: OF_CHOSEN_TYPE }, [], draw(1)),
    ],
  },
  // Dawn-Blessed Pennant: "As this artifact enters, choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk.
  // Whenever a permanent you control of the chosen type enters, you gain 1 life. {2}, {T}, Sacrifice this artifact: Return target
  // card of the chosen type from your graveyard to your hand."
  'Dawn-Blessed Pennant': {
    abilities: [
      onEnter(chooseTribe),
      when({ on: 'otherPermanentEtb', filter: OF_CHOSEN_TYPE }, [], gain(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: OF_CHOSEN_TYPE }],
        effects: [{ kind: 'returnToHand', what: t0 }],
        label: '{2}, {T}, Sacrifice: Return target card of the chosen type from your graveyard to your hand',
      },
    ],
  },
  // Firdoch Core: "Changeling. {T}: Add one mana of any color. {4}: This artifact becomes a 4/4 artifact creature until end of turn."
  'Firdoch Core': {
    abilities: [
      ...anyColor(),
      {
        kind: 'activated',
        cost: { mana: mana('{4}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [4, 4],
            becomesCreature: true,
          },
        ],
        label: '{4}: Becomes a 4/4 artifact creature until end of turn',
      },
    ],
  },
  // Foraging Wickermaw: "When this creature enters, surveil 1. {1}: Add one mana of any color. This creature becomes that color until
  // end of turn. Activate only once each turn."
  'Foraging Wickermaw': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        oncePerTurn: true,
        targets: [],
        effects: [chooseCustom('eclAddAnyColorBecome')],
        label: '{1}: Add one mana of any color. This creature becomes that color until end of turn',
      },
    ],
  },
  // Gathering Stone: "As this artifact enters, choose a creature type. Spells you cast of the chosen type cost {1} less to cast. When
  // this artifact enters and at the beginning of your upkeep, look at the top card of your library. If it's a card of the chosen type,
  // you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard."
  'Gathering Stone': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: OF_CHOSEN_TYPE, amount: 1 } },
      // The choice and the look are one enters trigger, so the type is set before the look.
      onEnter(chooseAnyType, chooseCustom('eclGatheringStoneLook')),
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], chooseCustom('eclGatheringStoneLook')),
    ],
  },
  // Mirrormind Crown: "As long as this Equipment is attached to a creature, the first time you would create one or more tokens each
  // turn, you may instead create that many tokens that are copies of equipped creature. Equip {2}"
  'Mirrormind Crown': {
    abilities: [{ kind: 'static', effect: { kind: 'firstTokensCopyEquipped' } }, equip('{2}')],
  },
  // Puca's Eye: "When this artifact enters, draw a card, then choose a color. This artifact becomes the chosen color.
  // {3}, {T}: Draw a card. Activate only if there are five colors among permanents you control."
  "Puca's Eye": {
    abilities: [
      onEnter(draw(1), chooseCustom('eclChooseColorBecome')),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        condition: { kind: 'amountAtLeast', amount: VIVID, min: 5 },
        targets: [],
        effects: [draw(1)],
        label: '{3}, {T}: Draw a card (five colors among your permanents)',
      },
    ],
  },
  // Springleaf Drum: "{T}, Tap an untapped creature you control: Add one mana of any color."
  'Springleaf Drum': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, tapCreature: {} },
        targets: [],
        effects: [chooseCustom('eclAddAnyColor')],
        label: '{T}, Tap an untapped creature you control: Add one mana of any color',
      },
    ],
  },
  // Stalactite Dagger: "When this Equipment enters, create a 1/1 colorless Shapeshifter creature token with changeling. Equipped
  // creature gets +1/+1 and is all creature types. Equip {2}"
  'Stalactite Dagger': {
    abilities: [
      onEnter({ kind: 'createToken', token: ECL_SHAPESHIFTER, count: 1 }),
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, allCreatureTypes: true },
      },
      equip('{2}'),
    ],
  },
  // Eclipsed Realms: "As this land enters, choose Elemental, Elf, Faerie, Giant, Goblin, Kithkin, Merfolk, or Treefolk. {T}: Add {C}.
  // {T}: Add one mana of any color. Spend this mana only to cast a spell of the chosen type or activate an ability of a source of
  // the chosen type."
  'Eclipsed Realms': {
    abilities: [
      onEnter(chooseTribe),
      ...tapFor('C'),
      ...anyColorOnlyFor('chosenTypeOrAbility'),
    ],
  },
  // Hallowed Fountain: "({T}: Add {W} or {U}.) As this land enters, you may pay 2 life. If you don't, it enters tapped." (the shock land
  // pattern of the earlier sets: it enters tapped and the choice untaps it)
  'Hallowed Fountain': {
    entersTapped: true,
    abilities: [
      ...tapFor('W', 'U'),
      onEnter({ kind: 'chooseCustom', handler: 'shockLand' }),
    ],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_COLORLESS_TOKENS: CardDefinition[] = [];
