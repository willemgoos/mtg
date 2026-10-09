import type { AbilityDef, CardDefinition, EffectDef, ManaType } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, t0, yourCreature } from '../blb/helpers.ts';
import { mayRummage } from '../fin/helpers.ts';
import { loyaltyAbility } from '../fra/helpers.ts';
import {
  BLIGHTED,
  entersOrTransforms,
  firstMainTransform,
  mayBlight,
  transformsInto,
} from '../ecl-vocab.ts';
import { ECL_KITHKIN } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): the seven two-faced legends (Brigid, Eirdu, Oko, Sygg, Grub, Ashling, Trystan), whatever their colour.
 * Printed characteristics come from Scryfall; this file has the rules text. Each face has "At the beginning of your first main
 * phase, you may pay {X}. If you do, transform ..." (`firstMainTransform`); a back face is keyed by its own name in
 * ECL_TRANSFORM_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

export const ECL_ELK = 'ecl-oko-elk-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const cost = (c: string) => mana(c);
const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};
const unblockable: AbilityDef = { kind: 'static', effect: { kind: 'cantBeBlocked' } };

/** Ashling, Rimebound: "add two mana of any one color. Spend this mana only to cast spells with mana value 4 or greater." */
const ashlingMana: EffectDef = {
  kind: 'choose',
  options: (['W', 'U', 'B', 'R', 'G'] as ManaType[]).map((c) => ({
    label: COLOR_NAMES[c]!,
    effects: [{ kind: 'addMana', mana: [[c], [c]], onlyFor: 'MV4Plus' }],
  })),
};

/** Mill three cards (Trystan). */
const mill3: EffectDef = { kind: 'mill', count: 3 };

/** Grub, Notorious Auntie's token: "At the beginning of the end step, sacrifice this token." */
const sacrificeAtEnd: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'beginningOfEndStep', whose: 'each' },
  targets: [],
  effects: [{ kind: 'sacrifice', what: 'self' }],
};

/** Sygg: "target creature gains 'Whenever this creature deals combat damage to a player or planeswalker, draw a card' until end of turn." */
const syggGrant: EffectDef = {
  kind: 'grantAbility',
  to: t0,
  ability: {
    kind: 'triggered',
    trigger: { on: 'combatDamageToPlayer', orPlaneswalker: true },
    targets: [],
    effects: [draw(1)],
  },
};

export const ECL_TRANSFORM: Record<string, Behavior> = {
  // Brigid, Clachan's Heart: "Whenever this creature enters or transforms into Brigid, Clachan's Heart, create a 1/1 green and white
  // Kithkin creature token. At the beginning of your first main phase, you may pay {G}. If you do, transform Brigid."
  "Brigid, Clachan's Heart": {
    abilities: [
      entersOrTransforms([{ kind: 'createToken', token: ECL_KITHKIN, count: 1 }]),
      firstMainTransform(cost('{G}')),
    ],
  },
  // Eirdu, Carrier of Dawn: "Flying, lifelink. Creature spells you cast have convoke. At the beginning of your first main phase, you
  // may pay {B}. If you do, transform Eirdu."
  'Eirdu, Carrier of Dawn': {
    abilities: [
      { kind: 'static', effect: { kind: 'creatureSpellsHaveConvoke' } },
      firstMainTransform(cost('{B}')),
    ],
  },
  // Oko, Lorwyn Liege: "At the beginning of your first main phase, you may pay {G}. If you do, transform Oko. +2: Up to one target
  // creature gains all creature types. (This effect doesn't end.) +1: Target creature gets -2/-0 until your next turn."
  'Oko, Lorwyn Liege': {
    abilities: [
      firstMainTransform(cost('{G}')),
      loyaltyAbility(
        2,
        '+2: Up to one target creature gains all creature types',
        [{ kind: 'allCreatureTypes', what: t0, duration: 'permanent' }],
        { targets: [{ what: 'creature', optional: true }] },
      ),
      loyaltyAbility(
        1,
        '+1: Target creature gets -2/-0 until your next turn',
        [{ kind: 'pump', to: t0, power: -2, toughness: 0, untilYourNextTurn: true }],
        { targets: [{ what: 'creature' }] },
      ),
    ],
  },
  // Sygg, Wanderwine Wisdom: "Sygg can't be blocked. Whenever this creature enters or transforms into Sygg, Wanderwine Wisdom, target
  // creature gains 'Whenever this creature deals combat damage to a player or planeswalker, draw a card' until end of turn. At the
  // beginning of your first main phase, you may pay {W}. If you do, transform Sygg."
  'Sygg, Wanderwine Wisdom': {
    abilities: [
      unblockable,
      entersOrTransforms([syggGrant], [{ what: 'creature' }]),
      firstMainTransform(cost('{W}')),
    ],
  },
  // Grub, Storied Matriarch: "Menace. Whenever this creature enters or transforms into Grub, Storied Matriarch, return up to one
  // target Goblin card from your graveyard to your hand. At the beginning of your first main phase, you may pay {R}. If you do,
  // transform Grub."
  'Grub, Storied Matriarch': {
    abilities: [
      entersOrTransforms(
        [{ kind: 'returnToHand', what: t0 }],
        [{ what: 'graveyardCard', controller: 'you', filter: { subtype: 'Goblin' }, optional: true }],
      ),
      firstMainTransform(cost('{R}')),
    ],
  },
  // Ashling, Rekindled: "Whenever this creature enters or transforms into Ashling, Rekindled, you may discard a card. If you do, draw a
  // card. At the beginning of your first main phase, you may pay {U}. If you do, transform Ashling."
  'Ashling, Rekindled': {
    abilities: [entersOrTransforms([mayRummage]), firstMainTransform(cost('{U}'))],
  },
  // Trystan, Callous Cultivator: "Deathtouch. Whenever this creature enters or transforms into Trystan, Callous Cultivator, mill three
  // cards. Then if there is an Elf card in your graveyard, you gain 2 life. At the beginning of your first main phase, you may pay
  // {B}. If you do, transform Trystan."
  'Trystan, Callous Cultivator': {
    abilities: [
      entersOrTransforms([
        mill3,
        {
          kind: 'if',
          condition: { kind: 'graveyardHas', filter: { subtype: 'Elf' } },
          then: [gain(2)],
        },
      ]),
      firstMainTransform(cost('{B}')),
    ],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_TRANSFORM_BACKS: Record<string, Behavior> = {
  // Brigid, Doun's Mind: "{T}: Add X {G} or X {W}, where X is the number of other creatures you control. At the beginning of your first
  // main phase, you may pay {W}. If you do, transform Brigid."
  "Brigid, Doun's Mind": {
    abilities: [
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'G',
        anyOneColor: true,
        oneOf: ['G', 'W'],
        amountOf: { count: 'creaturesYouControl', other: true },
      },
      firstMainTransform(cost('{W}')),
    ],
  },
  // Isilu, Carrier of Twilight: "Flying, lifelink. Each other nontoken creature you control has persist. At the beginning of your
  // first main phase, you may pay {W}. If you do, transform Isilu."
  'Isilu, Carrier of Twilight': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { nontoken: true },
          power: 0,
          toughness: 0,
          keywords: ['persist'],
        },
      },
      firstMainTransform(cost('{W}')),
    ],
  },
  // Oko, Shadowmoor Scion: "At the beginning of your first main phase, you may pay {U}. If you do, transform Oko. -1: Mill three cards.
  // You may put a permanent card from among them into your hand. -3: Create two 3/3 green Elk creature tokens. -6: Choose a creature
  // type. You get an emblem with 'Creatures you control of the chosen type get +3/+3 and have vigilance and hexproof.'"
  'Oko, Shadowmoor Scion': {
    abilities: [
      firstMainTransform(cost('{U}')),
      loyaltyAbility(-1, '−1: Mill three cards. You may put a permanent card from among them into your hand', [
        {
          kind: 'millThenTake',
          count: 3,
          filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] },
        },
      ]),
      loyaltyAbility(-3, '−3: Create two 3/3 green Elk creature tokens', [
        { kind: 'createToken', token: ECL_ELK, count: 2 },
      ]),
      loyaltyAbility(
        -6,
        '−6: Choose a creature type. You get an emblem with "Creatures you control of the chosen type get +3/+3 and have vigilance and hexproof."',
        [{ kind: 'chooseCustom', handler: 'eclOkoEmblem' }],
      ),
    ],
  },
  // Sygg, Wanderbrine Shield: "Sygg can't be blocked. Whenever this creature transforms into Sygg, Wanderbrine Shield, target creature
  // you control gains protection from each color until your next turn. At the beginning of your first main phase, you may pay {U}. If
  // you do, transform Sygg."
  'Sygg, Wanderbrine Shield': {
    abilities: [
      unblockable,
      transformsInto([custom('eclProtectionFromEachColor')], [yourCreature]),
      firstMainTransform(cost('{U}')),
    ],
  },
  // Grub, Notorious Auntie: "Menace. Whenever Grub attacks, you may blight 1. If you do, create a tapped and attacking token that's a
  // copy of the blighted creature, except it has 'At the beginning of the end step, sacrifice this token.' At the beginning of your
  // first main phase, you may pay {B}. If you do, transform Grub."
  'Grub, Notorious Auntie': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          mayBlight(1, [
            {
              kind: 'tokenCopy',
              of: BLIGHTED,
              count: 1,
              attacking: true,
              grantAbilities: [sacrificeAtEnd],
            },
          ]),
        ],
      },
      firstMainTransform(cost('{B}')),
    ],
  },
  // Ashling, Rimebound: "Whenever this creature transforms into Ashling, Rimebound and at the beginning of your first main phase, add
  // two mana of any one color. Spend this mana only to cast spells with mana value 4 or greater. At the beginning of your first main
  // phase, you may pay {R}. If you do, transform Ashling."
  'Ashling, Rimebound': {
    abilities: [
      transformsInto([ashlingMana]),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [ashlingMana],
      },
      firstMainTransform(cost('{R}')),
    ],
  },
  // Trystan, Penitent Culler: "Deathtouch. Whenever this creature transforms into Trystan, Penitent Culler, mill three cards, then
  // you may exile an Elf card from your graveyard. If you do, each opponent loses 2 life. At the beginning of your first main phase,
  // you may pay {G}. If you do, transform Trystan."
  'Trystan, Penitent Culler': {
    abilities: [
      transformsInto([mill3, { kind: 'chooseCustom', handler: 'eclTrystanExileElf' }]),
      firstMainTransform(cost('{G}')),
    ],
  },
};

/** Tokens only this group's cards make. */
export const ECL_TRANSFORM_TOKENS: CardDefinition[] = [
  // A 3/3 green Elk creature token (Oko, Shadowmoor Scion).
  {
    id: ECL_ELK,
    name: 'Elk',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elk'],
    power: 3,
    toughness: 3,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
