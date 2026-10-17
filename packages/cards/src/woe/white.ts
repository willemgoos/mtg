import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { onEnter, pump, t0, when, yourCreature, draw, gain, creature } from '../blb/helpers.ts';
import { chapter, mode, spell } from '../fin/helpers.ts';
import {
  bargain,
  celebrationAtCombat,
  celebrationBoost,
  createRole,
  enchantedCreaturesYouControlGet,
  ifBargained,
  whenEnchantmentYouControlEnters,
  whenEnchantmentYouControlToGraveyard,
  whenYouTapOpponentCreature,
  tapAndStun,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23): white cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_WHITE_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const KNIGHT = 'woe-w-knight-token';
const HUMAN = 'woe-w-human-token';
const BIRD = 'woe-w-bird-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });
const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
const counterOnSelf: EffectDef = { kind: 'counters', to: 'self', amount: 1 };
/** "Another target creature you control". */
const otherYourCreature: TargetSpec = {
  what: 'creature',
  controller: 'you',
  filter: { other: true },
};

export const WOE_WHITE: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Archon of the Wild Rose': {
    abilities: [
      // "Other creatures you control that are enchanted by Auras you control have base power and toughness 4/4 and have flying."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { enchantedByYourAura: true },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
          basePT: [4, 4],
        },
      },
    ],
  },
  'Armory Mice': {
    // "Celebration — This creature gets +0/+2 as long as two or more nonland permanents entered the battlefield under your control
    // this turn."
    abilities: [celebrationBoost(0, 2)],
  },
  // A 3/3 with no abilities; Betroth the Beast is its Adventure.
  'Besotted Knight': {},
  'Charmed Clothier': {
    abilities: [
      // "When this creature enters, create a Royal Role token attached to another target creature you control."
      when({ on: 'etb' }, [otherYourCreature], createRole('Royal')),
    ],
  },
  'Cursed Courtier': {
    // "When this creature enters, create a Cursed Role token attached to it."
    abilities: [onEnter(createRole('Cursed', 'self'))],
  },
  'Dutiful Griffin': {
    abilities: [
      // "{2}{W}, Sacrifice two enchantments: Return this card from your graveyard to your hand."
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}{W}'),
          sacrificePermanents: { count: 2, filter: { types: ['Enchantment'] } },
        },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Frostbridge Guard': {
    abilities: [
      // "{2}{W}, {T}: Tap target creature."
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}'), tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
  'Gallant Pie-Wielder': {
    // "First strike". "Celebration — This creature has double strike as long as two or more nonland permanents entered the battlefield
    // under your control this turn."
    abilities: [celebrationBoost(0, 0, ['doubleStrike'])],
  },
  'Heartflame Duelist': {
    abilities: [
      // "Instant and sorcery spells you control have lifelink."
      { kind: 'static', effect: { kind: 'instantsSorceriesLifelink' } },
    ],
  },
  'Knight of Doves': {
    abilities: [
      // "Whenever an enchantment you control is put into a graveyard from the battlefield, create a 1/1 white Bird creature token with
      // flying."
      whenEnchantmentYouControlToGraveyard([token(BIRD)]),
    ],
  },
  'Pests of Honor': {
    // "Celebration — At the beginning of combat on your turn, if two or more nonland permanents entered the battlefield under your
    // control this turn, put a +1/+1 counter on this creature."
    abilities: [celebrationAtCombat([counterOnSelf])],
  },
  'Protective Parents': {
    abilities: [
      // "When this creature dies, create a Young Hero Role token attached to up to one target creature you control."
      when({ on: 'dies' }, [{ ...yourCreature, optional: true }], createRole('Young Hero')),
    ],
  },
  'Rimefur Reindeer': {
    abilities: [
      // "Whenever an enchantment you control enters, tap target creature an opponent controls."
      whenEnchantmentYouControlEnters(
        [{ kind: 'tap', what: t0 }],
        [{ what: 'creature', controller: 'opponent' }],
      ),
    ],
  },
  'Savior of the Sleeping': {
    // "Vigilance"
    abilities: [
      // "Whenever an enchantment you control is put into a graveyard from the battlefield, put a +1/+1 counter on this creature."
      whenEnchantmentYouControlToGraveyard([counterOnSelf]),
    ],
  },
  'Stockpiling Celebrant': {
    abilities: [
      // "When this creature enters, you may return another target nonland permanent you control to its owner's hand. If you do,
      // scry 2."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'you', filter: { nonland: true, other: true } }],
        // The target is the only thing it needs: once it is legal, returning it can't fail, so "if you do" is the choice itself.
        { kind: 'may', effects: [{ kind: 'bounce', what: t0 }, scry(2)] },
      ),
    ],
  },
  'Tuinvale Guide': {
    // "Flying". "Celebration — This creature gets +1/+0 and has lifelink as long as two or more nonland permanents entered the
    // battlefield under your control this turn."
    abilities: [celebrationBoost(1, 0, ['lifelink'])],
  },
  'Unassuming Sage': {
    abilities: [
      // "When this creature enters, you may pay {2}. If you do, create a Sorcerer Role token attached to it."
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        cost: mana('{2}'),
        effects: [createRole('Sorcerer', 'self')],
      },
    ],
  },
  'Werefox Bodyguard': {
    // "Flash"
    abilities: [
      // "When this creature enters, exile up to one other target non-Fox creature until this creature leaves the battlefield."
      when(
        { on: 'etb' },
        [{ what: 'creature', optional: true, filter: { other: true, notSubtype: 'Fox' } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      // "{1}{W}, Sacrifice this creature: You gain 2 life."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), sacrificeSelf: true },
        targets: [],
        effects: [gain(2)],
      },
    ],
  },
  'Woodland Acolyte': {
    // "When this creature enters, draw a card."
    abilities: [onEnter(draw(1))],
  },

  // ------------------------------------------------------------ noncreature
  'A Tale for the Ages': {
    // "Enchanted creatures you control get +2/+2."
    abilities: [enchantedCreaturesYouControlGet(2, 2)],
  },
  "Archon's Glory": {
    // "Bargain"
    ...bargain(),
    // "Target creature gets +2/+2 until end of turn. If this spell was bargained, that creature also gains flying and lifelink until
    // end of turn."
    ...spell(
      [creature],
      pump(t0, 2, 2),
      ifBargained([pump(t0, 0, 0, ['flying', 'lifelink'])]),
    ),
  },
  'Break the Spell': spell(
    [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
    // "Destroy target enchantment. If a permanent you controlled or a token was destroyed this way, draw a card."
    custom('woeBreakTheSpell'),
  ),
  'Cooped Up': {
    enchant: creature,
    abilities: [
      // "Enchanted creature can't attack or block."
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, cantAttackOrBlock: true },
      },
      // "{2}{W}: Exile enchanted creature."
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'exile', what: 'attached' }],
      },
    ],
  },
  'Eerie Interference': spell(
    [],
    // "Prevent all damage that would be dealt to you and creatures you control this turn by creatures."
    custom('woeEerieInterference'),
  ),
  'Expel the Interlopers': spell(
    [],
    // "Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number."
    { kind: 'chooseCustom', handler: 'woeChooseNumber', params: { max: 10 } },
  ),
  'Glass Casket': {
    abilities: [
      // "When this artifact enters, exile target creature an opponent controls with mana value 3 or less until this artifact leaves
      // the battlefield."
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent', filter: { maxManaValue: 3 } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },
  'Hopeful Vigil': {
    abilities: [
      // "When this enchantment enters, create a 2/2 white Knight creature token with vigilance."
      onEnter(token(KNIGHT)),
      // "When this enchantment is put into a graveyard from the battlefield, scry 2."
      when({ on: 'selfToGraveyard' }, [], scry(2)),
      // "{2}{W}: Sacrifice this enchantment."
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
      },
    ],
  },
  "Kellan's Lightblades": {
    // "Bargain"
    ...bargain(),
    // "Kellan's Lightblades deals 3 damage to target attacking or blocking creature. If this spell was bargained, destroy that
    // creature instead."
    ...spell(
      [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      ifBargained(
        [{ kind: 'destroy', what: t0 }],
        [{ kind: 'damage', amount: 3, to: t0 }],
      ),
    ),
  },
  'Moment of Valor': {
    modes: [
      // "Untap target creature. It gets +1/+0 and gains indestructible until end of turn."
      mode(
        'Untap target creature. It gets +1/+0 and gains indestructible until end of turn',
        [creature],
        { kind: 'untap', what: t0 },
        pump(t0, 1, 0, ['indestructible']),
      ),
      // "Destroy target creature with power 4 or greater."
      mode(
        'Destroy target creature with power 4 or greater',
        [{ what: 'creature', filter: { minPower: 4 } }],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },
  'Plunge into Winter': spell(
    // "Tap up to one target creature. Scry 1, then draw a card."
    [{ ...creature, optional: true }],
    { kind: 'tap', what: t0 },
    scry(1),
    draw(1),
  ),
  'Return Triumphant': spell(
    // "Return target creature card with mana value 3 or less from your graveyard to the battlefield. Create a Young Hero Role token
    // attached to it."
    [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'], maxManaValue: 3 } }],
    { kind: 'returnToBattlefield', what: t0 },
    createRole('Young Hero', 'chosen'),
  ),
  'Solitary Sanctuary': {
    abilities: [
      // "When this enchantment enters, tap target creature an opponent controls and put a stun counter on it."
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent' }],
        ...tapAndStun(t0, 1),
      ),
      // "Whenever you tap an untapped creature an opponent controls, put a +1/+1 counter on target creature you control."
      whenYouTapOpponentCreature([{ kind: 'counters', to: t0, amount: 1 }], {
        targets: [yourCreature],
      }),
    ],
  },
  'Stroke of Midnight': spell(
    // "Destroy target nonland permanent. Its controller creates a 1/1 white Human creature token."
    [{ what: 'permanent', filter: { nonland: true } }],
    custom('woeStrokeOfMidnight', { token: HUMAN }),
  ),
  'The Princess Takes Flight': {
    saga: 3,
    abilities: [
      // "I — Exile up to one target creature."
      chapter([1], [{ ...creature, optional: true }], custom('woePrincessExile')),
      // "II — Target creature you control gets +2/+2 and gains flying until end of turn."
      chapter([2], [yourCreature], pump(t0, 2, 2, ['flying'])),
      // "III — Return the exiled card to the battlefield under its owner's control."
      chapter([3], [], custom('woePrincessReturn')),
    ],
  },
  'Virtue of Loyalty': {
    abilities: [
      // "At the beginning of your end step, put a +1/+1 counter on each creature you control. Untap those creatures."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [
          { kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 },
          { kind: 'untap', what: { each: 'creature', controller: 'you' } },
        ],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_WHITE_BACKS: Record<string, Behavior> = {
  // "Create a Royal Role token attached to target creature you control."
  'Betroth the Beast': spell([yourCreature], createRole('Royal')),
  // "Heartflame Slash deals 3 damage to any target."
  'Heartflame Slash': spell([{ what: 'any' }], { kind: 'damage', amount: 3, to: t0 }),
  // "Create a 2/2 white Knight creature token with vigilance."
  'Ardenvale Fealty': spell([], token(KNIGHT)),
  // "Put target permanent card from your graveyard on top of your library."
  'Mend the Wilds': spell(
    [
      {
        what: 'graveyardCard',
        controller: 'you',
        filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] },
      },
    ],
    { kind: 'putInLibrary', what: t0, position: 'top' },
  ),
};

/** Tokens only this group's cards make. */
const whiteToken = (
  id: string,
  name: string,
  power: number,
  toughness: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: ['W'],
  types: ['Creature'],
  supertypes: [],
  subtypes: [name],
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

export const WOE_WHITE_TOKENS: CardDefinition[] = [
  // A 2/2 white Knight creature token with vigilance (Hopeful Vigil, Ardenvale Fealty).
  whiteToken(KNIGHT, 'Knight', 2, 2, ['vigilance']),
  // A 1/1 white Human creature token (Stroke of Midnight).
  whiteToken(HUMAN, 'Human', 1, 1),
  // A 1/1 white Bird creature token with flying (Knight of Doves).
  whiteToken(BIRD, 'Bird', 1, 1, ['flying']),
];
