import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { onEnter, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import {
  entersWithMinusCounters,
  mayBlight,
  optionalBlight,
  returnBeheldWhenLeaves,
  VIVID,
} from '../ecl-vocab.ts';
import { ECL_GOBLIN } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): red. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_RED_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

const creature: TargetSpec = { what: 'creature' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const goblins = (count: number): EffectDef => ({ kind: 'createToken', token: ECL_GOBLIN, count });
const elemental = { subtype: 'Elemental' } as const;

/** "Basic landcycling {cost}". */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

/** "Exile the top card of your library. Until the end of your next turn, you may play that card." */
const exileTopPlayable = (count: number): EffectDef => ({
  kind: 'exileTopPlayable',
  count,
  until: 'endOfNextTurn',
});

/** Kindle the Inner Flame: "At the beginning of the end step, sacrifice this token." */
const endStepSacrifice: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'beginningOfEndStep', whose: 'each' },
  targets: [],
  effects: [{ kind: 'sacrifice', what: 'self' }],
};

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });

export const ECL_RED: Record<string, Behavior> = {
  'Boldwyr Aggressor': {
    abilities: [
      // "Other Giants you control have double strike."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Giant' },
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike'],
        },
      },
    ],
  },
  'Boneclub Berserker': {
    abilities: [
      // "This creature gets +2/+0 for each other Goblin you control."
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: {
            multiply: 2,
            amount: { count: 'creaturesYouControl', subtype: 'Goblin', other: true },
          },
          toughness: 0,
        },
      },
    ],
  },
  'Boulder Dash': {
    spell: {
      targets: [{ what: 'any' }, { what: 'any' }],
      // "...deals 2 damage to any target and 1 damage to any other target."
      effects: [
        { kind: 'damage', amount: 2, to: t0 },
        { kind: 'damage', amount: 1, to: t1 },
      ],
    },
  },
  'Brambleback Brute': {
    ...entersWithMinusCounters(2),
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), removeAnyCounters: 1 },
        sorcerySpeed: true,
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBlock: true }],
      },
    ],
  },
  'Burning Curiosity': {
    ...optionalBlight(1),
    spell: {
      targets: [],
      // "Exile the top two cards of your library. If this spell's additional cost was paid, exile the top three cards
      // instead. Until the end of your next turn, you may play those cards."
      effects: [
        {
          kind: 'exileTopPlayable',
          count: { if: { kind: 'wasKicked' }, then: 3, else: 2 },
          until: 'endOfNextTurn',
        },
      ],
    },
  },
  'Champion of the Path': {
    beholdExile: elemental,
    abilities: [
      // "Whenever another Elemental you control enters, it deals damage equal to its power to each opponent."
      when({ on: 'otherCreatureEtb', controller: 'you', filter: elemental }, [], {
        kind: 'damage',
        amount: { powerOf: 'subject' },
        to: 'eachOpponent',
        from: 'subject',
      }),
      returnBeheldWhenLeaves,
    ],
  },
  'Cinder Strike': {
    ...optionalBlight(1),
    spell: {
      targets: [creature],
      // "...deals 2 damage to target creature. It deals 4 damage to that creature instead if this spell's additional cost was paid."
      effects: [
        {
          kind: 'if',
          condition: { kind: 'wasKicked' },
          then: [{ kind: 'damage', amount: 4, to: t0 }],
          else: [{ kind: 'damage', amount: 2, to: t0 }],
        },
      ],
    },
  },
  'Collective Inferno': {
    convoke: true,
    abilities: [
      // "As this enchantment enters, choose a creature type."
      onEnter({ kind: 'chooseCreatureType' }),
      // "Double all damage that sources you control of the chosen type would deal."
      { kind: 'static', effect: { kind: 'doubleDamage', source: { chosenTypeOfSource: true } } },
    ],
  },
  'Elder Auntie': { abilities: [onEnter(goblins(1))] },
  'End-Blaze Epiphany': {
    spell: {
      targets: [creature],
      effects: [
        // "When that creature dies this turn, exile a number of cards from the top of your library equal to its power, then
        // choose a card exiled this way. Until the end of your next turn, you may play that card."
        {
          kind: 'whenDiesThisTurn',
          what: t0,
          effects: [{ kind: 'exileTopChooseOne', count: { powerOf: 'self' } }],
        },
        { kind: 'damage', amount: { x: true }, to: t0 },
      ],
    },
  },
  'Enraged Flamecaster': {
    abilities: [
      // "Whenever you cast a spell with mana value 4 or greater, this creature deals 2 damage to each opponent."
      when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 4 } }, [], {
        kind: 'damage',
        amount: 2,
        to: 'eachOpponent',
        from: 'self',
      }),
    ],
  },
  'Explosive Prodigy': {
    abilities: [
      // "Vivid — When this creature enters, it deals X damage to target creature an opponent controls, where X is the
      // number of colors among permanents you control."
      when({ on: 'etb' }, [theirCreature], {
        kind: 'damage',
        amount: VIVID,
        to: t0,
        from: 'self',
      }),
    ],
  },
  'Feed the Flames': {
    spell: {
      targets: [creature],
      // "...deals 5 damage to target creature. If that creature would die this turn, exile it instead."
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 5, to: t0 },
      ],
    },
  },
  'Flame-Chain Mauler': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0, keywords: ['menace'] }],
      },
    ],
  },
  Flamebraider: {
    // "{T}: Add two mana in any combination of colors. Spend this mana only to cast Elemental spells or activate abilities
    // of Elemental sources." Every unit can be any of the five colors, chosen as it is spent.
    abilities: (['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true },
      produces,
      amount: 2,
      onlyFor: 'Elemental',
      orAbilitiesOfSources: true,
    })),
  },
  'Flamekin Gildweaver': { abilities: [onEnter(treasure)] },
  Giantfall: {
    modes: [
      {
        label:
          'Target creature you control deals damage equal to its power to target creature an opponent controls',
        targets: [yourCreature, theirCreature],
        effects: [{ kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 }],
      },
      {
        label: 'Destroy target artifact',
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  Goatnap: {
    spell: {
      targets: [creature],
      effects: [
        // "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. If that
        // creature is a Goat, it also gets +3/+0 until end of turn."
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['haste'] },
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { subtype: 'Goat' } },
          then: [{ kind: 'pump', to: t0, power: 3, toughness: 0 }],
        },
      ],
    },
  },
  'Goliath Daydreamer': {
    abilities: [
      // "Whenever you cast an instant or sorcery spell from your hand, exile that card with a dream counter on it instead
      // of putting it into your graveyard as it resolves."
      when(
        { on: 'castSpell', filter: 'instantOrSorcery', fromHand: true },
        [],
        custom('eclDreamMark'),
      ),
      // "Whenever this creature attacks, you may cast a spell from among cards you own in exile with dream counters on
      // them without paying its mana cost."
      when({ on: 'attacks' }, [], {
        kind: 'castFree',
        what: 'self',
        from: 'exileWithCounter',
        counter: 'dream',
      }),
    ],
  },
  'Gristle Glutton': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, blight: 1 },
        targets: [],
        // "Discard a card. If you do, draw a card."
        effects: [
          { kind: 'discard', count: 1, then: [{ kind: 'draw', who: 'controller', amount: 1 }] },
        ],
      },
    ],
  },
  'Hexing Squelcher': {
    abilities: [
      // "Spells you control can't be countered."
      { kind: 'static', effect: { kind: 'spellsYouControlUncounterable' } },
      // "Other creatures you control have "Ward—Pay 2 life.""
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['wardPayTwoLife'],
        },
      },
    ],
  },
  'Impolite Entrance': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['trample', 'haste'] },
        { kind: 'draw', who: 'controller', amount: 1 },
      ],
    },
  },
  'Kindle the Inner Flame': {
    flashback: mana('{1}{R}'),
    flashbackBehold: { filter: elemental, count: 3 },
    spell: {
      targets: [yourCreature],
      // "Create a token that's a copy of target creature you control, except it has haste and "At the beginning of the end
      // step, sacrifice this token.""
      effects: [{ kind: 'tokenCopy', of: t0, haste: true, grantAbilities: [endStepSacrifice] }],
    },
  },
  'Kulrath Zealot': {
    abilities: [onEnter(exileTopPlayable(1)), basicLandcycling('{1}{R}')],
  },
  'Lasting Tarfire': {
    abilities: [
      // "At the beginning of each end step, if you put a counter on a creature this turn, this enchantment deals 2 damage
      // to each opponent."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'putCounterOnCreatureThisTurn' },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent', from: 'self' }],
      },
    ],
  },
  Lavaleaper: {
    abilities: [
      // "All creatures have haste."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesOpponentsControl',
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      // "Whenever a player taps a basic land for mana, that player adds one mana of any type that land produced."
      { kind: 'static', effect: { kind: 'basicLandsAddExtraMana' } },
    ],
  },
  'Meek Attack': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        // "You may put a creature card with total power and toughness 5 or less from your hand onto the battlefield. That
        // creature gains haste. At the beginning of the next end step, sacrifice that creature."
        effects: [
          {
            kind: 'putFromHandOrGraveyard',
            filter: { types: ['Creature'], maxPowerPlusToughness: 5 },
            handOnly: true,
          },
          custom('eclMeekAttackFinish'),
        ],
      },
    ],
  },
  'Reckless Ransacking': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 3, toughness: 2 }, treasure],
    },
  },
  'Scuzzback Scrounger': {
    abilities: [
      // "At the beginning of your first main phase, you may blight 1. If you do, create a Treasure token."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [mayBlight(1, [treasure])],
      },
    ],
  },
  'Sizzling Changeling': {
    abilities: [
      // "When this creature dies, exile the top card of your library. Until the end of your next turn, you may play that card."
      when({ on: 'dies' }, [], exileTopPlayable(1)),
    ],
  },
  'Soul Immolation': {
    blightX: true,
    spell: {
      targets: [],
      // "...deals X damage to each opponent and each creature they control."
      effects: [
        { kind: 'damage', amount: { x: true }, to: 'eachOpponent' },
        { kind: 'damage', amount: { x: true }, to: { each: 'creature', controller: 'opponent' } },
      ],
    },
  },
  'Soulbright Seeker': {
    beholdOrPay: { filter: elemental, pay: mana('{2}') },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{R}') },
        targets: [yourCreature],
        // "Target creature you control gains trample until end of turn. If this is the third time this ability has resolved
        // this turn, add {R}{R}{R}{R}."
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['trample'] },
          { kind: 'noteResolution' },
          {
            kind: 'if',
            condition: { kind: 'resolvedThisTurn', n: 3 },
            then: [{ kind: 'addMana', mana: [['R'], ['R'], ['R'], ['R']] }],
          },
        ],
      },
    ],
  },
  'Sourbread Auntie': { abilities: [onEnter(mayBlight(2, [goblins(2)]))] },
  'Spinerock Tyrant': {
    abilities: [
      // "Whenever you cast an instant or sorcery spell with a single target, you may copy it. If you do, those spells gain
      // wither. You may choose new targets for the copy."
      when({ on: 'castSpell', filter: 'instantOrSorceryOneTarget' }, [], {
        kind: 'may',
        effects: [{ kind: 'copySpell', what: 'subject', withWither: true, newTargets: true }],
      }),
    ],
  },
  Squawkroaster: { powerEquals: VIVID },
  'Sting-Slinger': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), tapSelf: true, blight: 1 },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent', from: 'self' }],
      },
    ],
  },
  Tweeze: {
    spell: {
      targets: [{ what: 'any' }],
      // "...deals 3 damage to any target. You may discard a card. If you do, draw a card."
      effects: [
        { kind: 'damage', amount: 3, to: t0 },
        // At most one card: discarding it draws one.
        { kind: 'discardAnyThenDraw', who: 'controller', max: 1 },
      ],
    },
  },
  'Warren Torchmaster': {
    abilities: [
      // "At the beginning of combat on your turn, you may blight 1. When you do, target creature gains haste until end of turn."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [mayBlight(1, [{ kind: 'reflexiveTrigger', ability: 1 }])],
      },
      when({ on: 'reflexive' }, [creature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        keywords: ['haste'],
      }),
    ],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_RED_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_RED_TOKENS: CardDefinition[] = [];
