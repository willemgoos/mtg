import { combineSpells } from '@mtg/engine';
import type { Amount, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  atYourCombat,
  creature,
  draw,
  gain,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
  yourCreaturesOf,
} from '../blb/helpers.ts';
import { equip, mode } from '../fin/helpers.ts';
import { loyaltyAbility } from '../fra/helpers.ts';
import {
  entersWithMinusCounters,
  hasMinusCounter,
  optionalBlight,
  returnBeheldWhenLeaves,
  VIVID,
  withBlight,
  withRemovedCounters,
} from '../ecl-vocab.ts';
import { ECL_KITHKIN, ECL_SHAPESHIFTER } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): white. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_WHITE_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

const kithkin = (count: Amount = 1): EffectDef => ({ kind: 'createToken', token: ECL_KITHKIN, count });
const shapeshifter: EffectDef = { kind: 'createToken', token: ECL_SHAPESHIFTER, count: 1 };
const surveil1: EffectDef = { kind: 'surveil', amount: 1 };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
/** "Remove a -1/-1 counter from this creature." */
const removeMinusCounter: EffectDef = { kind: 'removeCounters', from: 'self', name: '-1/-1' };
/** "Target tapped creature". */
const tappedCreature: TargetSpec = { what: 'creature', filter: { tapped: true } };
/** "Another target Merfolk you control". */
const otherMerfolk: TargetSpec = {
  what: 'creature',
  controller: 'you',
  filter: { subtype: 'Merfolk', other: true },
};
/** "{cost}: Creatures you control get +1/+1 until end of turn." */
const teamPump = (power: number, toughness: number): EffectDef =>
  pump({ each: 'creature', controller: 'you' }, power, toughness);

export const ECL_WHITE: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Adept Watershaper': {
    abilities: [
      // "Other tapped creatures you control have indestructible."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { tapped: true },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      },
    ],
  },
  'Burdened Stoneback': {
    // "This creature enters with two -1/-1 counters on it."
    ...entersWithMinusCounters(2),
    abilities: [
      // "{1}{W}, Remove a counter from this creature: Target creature gains indestructible until end of turn. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{1}{W}') }),
        sorcerySpeed: true,
        targets: [creature],
        effects: [pump(t0, 0, 0, ['indestructible'])],
      },
    ],
  },
  'Champion of the Clachan': {
    // "As an additional cost to cast this spell, behold a Kithkin and exile it."
    beholdExile: { subtype: 'Kithkin' },
    abilities: [
      // "Other Kithkin you control get +1/+1."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Kithkin' },
          power: 1,
          toughness: 1,
        },
      },
      // "When this creature leaves the battlefield, return the exiled card to its owner's hand."
      returnBeheldWhenLeaves,
    ],
  },
  'Curious Colossus': {
    abilities: [
      // "When this creature enters, each creature target opponent controls loses all abilities, becomes a Coward in
      // addition to its other types, and has base power and toughness 1/1."
      when({ on: 'etb' }, [{ what: 'player', controller: 'opponent' }], custom('eclCuriousColossus')),
    ],
  },
  'Encumbered Reejerey': {
    ...entersWithMinusCounters(3),
    abilities: [
      // "Whenever this creature becomes tapped while it has a -1/-1 counter on it, remove a -1/-1 counter from it."
      {
        kind: 'triggered',
        trigger: { on: 'becomesTapped' },
        condition: hasMinusCounter,
        targets: [],
        effects: [removeMinusCounter],
      },
    ],
  },
  'Flock Impostor': {
    abilities: [
      // "When this creature enters, return up to one other target creature you control to its owner's hand."
      when(
        { on: 'etb' },
        [{ ...yourCreature, filter: { other: true }, optional: true }],
        { kind: 'bounce', what: t0 },
      ),
    ],
  },
  'Gallant Fowlknight': {
    abilities: [
      // "When this creature enters, creatures you control get +1/+0 until end of turn. Kithkin creatures you control also
      // gain first strike until end of turn."
      onEnter(
        teamPump(1, 0),
        pump(yourCreaturesOf('Kithkin'), 0, 0, ['firstStrike']),
      ),
    ],
  },
  'Goldmeadow Nomad': {
    abilities: [
      // "{W}, Exile this card from your graveyard: Create a 1/1 green and white Kithkin creature token. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { mana: mana('{W}'), exileSelf: true },
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [kithkin()],
      },
    ],
  },
  'Kinsbaile Aspirant': {
    // "As an additional cost to cast this spell, behold a Kithkin or pay {2}."
    beholdOrPay: { filter: { subtype: 'Kithkin' }, pay: mana('{2}') },
    abilities: [
      // "Whenever another creature you control enters, this creature gets +1/+1 until end of turn."
      when({ on: 'otherCreatureEtb', controller: 'you' }, [], pump('self', 1, 1)),
    ],
  },
  'Kinscaer Sentry': {
    abilities: [
      // "Whenever this creature attacks, you may put a creature card with mana value X or less from your hand onto the
      // battlefield tapped and attacking, where X is the number of attacking creatures you control."
      when({ on: 'attacks' }, [], {
        kind: 'putFromHandOrGraveyard',
        filter: { types: ['Creature'] },
        handOnly: true,
        tapped: true,
        attackingIf: { types: ['Creature'] },
        maxManaValueAmount: { count: 'creaturesYouControl', attacking: true },
      }),
    ],
  },
  Kithkeeper: {
    abilities: [
      // "Vivid — When this creature enters, create X 1/1 green and white Kithkin creature tokens, where X is the number of
      // colors among permanents you control."
      onEnter(kithkin(VIVID)),
      // "Tap three untapped creatures you control: This creature gets +3/+0 and gains flying until end of turn."
      {
        kind: 'activated',
        cost: { tapCreatures: 3 },
        targets: [],
        effects: [pump('self', 3, 0, ['flying'])],
      },
    ],
  },
  'Meanders Guide': {
    abilities: [
      // "Whenever this creature attacks, you may tap another untapped Merfolk you control. When you do, return target
      // creature card with mana value 3 or less from your graveyard to the battlefield."
      when({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: { subtype: 'Merfolk', tapped: false },
            then: [{ kind: 'tap', what: 'chosen' }, { kind: 'reflexiveTrigger', ability: 1 }],
          },
        ],
      }),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Moonlit Lamenter': {
    ...entersWithMinusCounters(1),
    abilities: [
      // "{1}{W}, Remove a counter from this creature: Draw a card. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{1}{W}') }),
        sorcerySpeed: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Reluctant Dounguard': {
    ...entersWithMinusCounters(2),
    abilities: [
      // "Whenever another creature you control enters while this creature has a -1/-1 counter on it, remove a -1/-1
      // counter from this creature."
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        condition: hasMinusCounter,
        targets: [],
        effects: [removeMinusCounter],
      },
    ],
  },
  'Rhys, the Evermore': {
    abilities: [
      // "When Rhys enters, another target creature you control gains persist until end of turn."
      when(
        { on: 'etb' },
        [{ ...yourCreature, filter: { other: true } }],
        pump(t0, 0, 0, ['persist']),
      ),
      // "{W}, {T}: Remove any number of counters from target creature you control. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { mana: mana('{W}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'removeAnyNumberOfCounters', from: t0 }],
      },
    ],
  },
  'Shore Lurker': {
    // "When this creature enters, surveil 1."
    abilities: [onEnter(surveil1)],
  },
  'Slumbering Walker': {
    ...entersWithMinusCounters(2),
    abilities: [
      // "At the beginning of your end step, you may remove a counter from this creature. When you do, return target
      // creature card with power 2 or less from your graveyard to the battlefield."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: {
          kind: 'any',
          of: [hasMinusCounter, { kind: 'sourceCounters', min: 1 }],
        },
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [
              { kind: 'removeCounters', from: 'self' },
              { kind: 'reflexiveTrigger', ability: 1 },
            ],
          },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxPower: 2 },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Sun-Dappled Celebrant': { convoke: true },
  'Thoughtweft Imbuer': {
    abilities: [
      // "Whenever a creature you control attacks alone, it gets +X/+X until end of turn, where X is the number of Kithkin
      // you control."
      when(
        { on: 'creatureYouControlAttacks', alone: true },
        [],
        pump('subject', { count: 'creaturesYouControl', subtype: 'Kithkin' }, {
          count: 'creaturesYouControl',
          subtype: 'Kithkin',
        }),
      ),
    ],
  },
  'Timid Shieldbearer': {
    abilities: [
      // "{4}{W}: Creatures you control get +1/+1 until end of turn."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}') },
        targets: [],
        effects: [teamPump(1, 1)],
      },
    ],
  },
  'Tributary Vaulter': {
    abilities: [
      // "Whenever this creature becomes tapped, another target Merfolk you control gets +2/+0 until end of turn."
      when({ on: 'becomesTapped' }, [otherMerfolk], pump(t0, 2, 0)),
    ],
  },
  'Wanderbrine Preacher': {
    // "Whenever this creature becomes tapped, you gain 2 life."
    abilities: [when({ on: 'becomesTapped' }, [], gain(2))],
  },
  'Wanderbrine Trapper': {
    abilities: [
      // "{1}, {T}, Tap another untapped creature you control: Tap target creature an opponent controls."
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, tapCreature: { other: true } },
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },

  // ------------------------------------------------------------ artifacts and enchantments
  'Bark of Doran': {
    abilities: [
      // "Equipped creature gets +0/+1. As long as equipped creature's toughness is greater than its power, it assigns
      // combat damage equal to its toughness rather than its power."
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 1, toughnessAssignsDamage: true },
      },
      equip('{1}'),
    ],
  },
  'Clachan Festival': {
    abilities: [
      // "When this enchantment enters, create two 1/1 green and white Kithkin creature tokens."
      onEnter(kithkin(2)),
      // "{4}{W}: Create a 1/1 green and white Kithkin creature token."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}') },
        targets: [],
        effects: [kithkin()],
      },
    ],
  },
  "Evershrike's Gift": {
    enchant: creature,
    abilities: [
      // "Enchanted creature gets +1/+0 and has flying."
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['flying'] },
      },
      // "{1}{W}, Blight 2: Return this card from your graveyard to your hand. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: withBlight(2, { mana: mana('{1}{W}') }),
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  Kinbinding: {
    abilities: [
      // "Creatures you control get +X/+X, where X is the number of creatures that entered the battlefield under your
      // control this turn."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: { count: 'creaturesEnteredThisTurn' },
          toughness: { count: 'creaturesEnteredThisTurn' },
        },
      },
      // "At the beginning of combat on your turn, create a 1/1 green and white Kithkin creature token."
      atYourCombat([], kithkin()),
    ],
  },
  'Liminal Hold': {
    abilities: [
      // "When this enchantment enters, exile up to one target nonland permanent an opponent controls until this
      // enchantment leaves the battlefield. You gain 2 life."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true }, optional: true }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
        gain(2),
      ),
    ],
  },
  'Spiral into Solitude': {
    enchant: creature,
    abilities: [
      // "Enchanted creature can't attack or block."
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, cantAttackOrBlock: true },
      },
      // "{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature."
      {
        kind: 'activated',
        cost: withBlight(1, { mana: mana('{1}{W}'), sacrificeSelf: true }),
        targets: [],
        effects: [custom('eclExileEnchantedCreature')],
      },
    ],
  },

  // ------------------------------------------------------------ planeswalker
  'Ajani, Outland Chaperone': {
    abilities: [
      // "+1: Create a 1/1 green and white Kithkin creature token."
      loyaltyAbility(1, '+1: Create a 1/1 green and white Kithkin creature token', [kithkin()]),
      // "−2: Ajani deals 4 damage to target tapped creature."
      loyaltyAbility(
        -2,
        '−2: Ajani deals 4 damage to target tapped creature',
        [{ kind: 'damage', amount: 4, to: t0 }],
        { targets: [tappedCreature] },
      ),
      // "−8: Look at the top X cards of your library, where X is your life total. You may put any number of nonland
      // permanent cards with mana value 3 or less from among them onto the battlefield. Then shuffle."
      loyaltyAbility(
        -8,
        '−8: Look at the top X cards of your library, where X is your life total. You may put any number of nonland permanent cards with mana value 3 or less from among them onto the battlefield. Then shuffle',
        [{ kind: 'chooseCustom', handler: 'eclAjani' }, custom('eclShuffleLibrary')],
      ),
    ],
  },

  // ------------------------------------------------------------ instants and sorceries
  'Appeal to Eirdu': {
    convoke: true,
    // "One or two target creatures each get +2/+1 until end of turn."
    spell: {
      targets: [creature, { ...creature, optional: true }],
      effects: [pump(t0, 2, 1), pump({ target: 1 }, 2, 1)],
    },
  },
  'Crib Swap': {
    // "Exile target creature. Its controller creates a 1/1 colorless Shapeshifter creature token with changeling."
    spell: {
      targets: [creature],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'createToken', token: ECL_SHAPESHIFTER, count: 1, forControllerOf: 0 },
      ],
    },
  },
  'Keep Out': {
    modes: [
      // "Keep Out deals 4 damage to target tapped creature."
      mode('Keep Out deals 4 damage to target tapped creature', [tappedCreature], {
        kind: 'damage',
        amount: 4,
        to: t0,
      }),
      // "Destroy target enchantment."
      mode(
        'Destroy target enchantment',
        [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },
  "Morningtide's Light": {
    // "Exile Morningtide's Light."
    afterResolving: 'exile',
    spell: {
      // "Exile any number of target creatures."
      targets: [{ what: 'creature', anyNumber: true }],
      effects: [
        // "At the beginning of the next end step, return those cards to the battlefield tapped under their owners' control."
        { kind: 'exileUntilEndStep', what: { targetsFrom: 0 }, together: true, allTapped: true },
        // "Until your next turn, prevent all damage that would be dealt to you."
        { kind: 'preventDamageToYouUntilYourNextTurn' },
      ],
    },
  },
  Personify: {
    // "Exile target creature you control, then return that card to the battlefield under its owner's control. Create a
    // 1/1 colorless Shapeshifter creature token with changeling."
    spell: {
      targets: [yourCreature],
      effects: [{ kind: 'blink', what: t0 }, shapeshifter],
    },
  },
  'Protective Response': {
    convoke: true,
    // "Destroy target attacking or blocking creature."
    spell: {
      targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  'Pyrrhic Strike': {
    // "As an additional cost to cast this spell, you may blight 2. Choose one. If this spell's additional cost was paid,
    // choose both instead."
    ...optionalBlight(
      2,
      combineSpells([
        pyrrhicArtifactOrEnchantment(),
        pyrrhicBigCreature(),
      ]),
    ),
    modes: [pyrrhicArtifactOrEnchantment(), pyrrhicBigCreature()],
  },
  "Riverguard's Reflexes": {
    // "Target creature gets +2/+2 and gains first strike until end of turn. Untap it."
    spell: {
      targets: [creature],
      effects: [pump(t0, 2, 2, ['firstStrike']), { kind: 'untap', what: t0 }],
    },
  },
  Winnowing: {
    convoke: true,
    // "For each player, you choose a creature that player controls. Then each player sacrifices all other creatures they
    // control that don't share a creature type with the chosen creature they control."
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'eclWinnowing' }] },
  },
};

function pyrrhicArtifactOrEnchantment() {
  return mode(
    'Destroy target artifact or enchantment',
    [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
    { kind: 'destroy', what: t0 },
  );
}
function pyrrhicBigCreature() {
  return mode(
    'Destroy target creature with mana value 3 or greater',
    [{ what: 'creature', filter: { minManaValue: 3 } }],
    { kind: 'destroy', what: t0 },
  );
}

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_WHITE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_WHITE_TOKENS: CardDefinition[] = [];
