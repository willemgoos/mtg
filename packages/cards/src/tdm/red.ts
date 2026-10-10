import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { onEnter, prowess, t0, when } from '../blb/helpers.ts';
import { parseManaCost as mana } from '../build.ts';
import { combos, equip } from '../msc/helpers.ts';
import {
  devoteeMana,
  DRAGON,
  flurry,
  harmonize,
  mayBeholdDragon,
  mayBeholdDragonThen,
  mobilize,
  returnWhenDragonEnters,
} from '../tdm-vocab.ts';
import { TDM_MONK, TDM_WARRIOR } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): red cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_RED_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const creature: TargetSpec = { what: 'creature' };
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };

/** "Exile the top N cards of your library. Until the end of your next turn, you may play those cards." */
const exileTopPlayable = (count: number): EffectDef => ({
  kind: 'exileTopPlayable',
  count,
  until: 'endOfNextTurn',
});

/** "Discard a card. If you do, draw a card." */
const rummage: EffectDef = {
  kind: 'discard',
  count: 1,
  then: [{ kind: 'draw', who: 'controller', amount: 1 }],
};

/** "{cost}: This creature gets +N/+0 until end of turn." */
const firebreathing = (cost: string, power: number): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  targets: [],
  effects: [{ kind: 'pump', to: 'self', power, toughness: 0 }],
});

export const TDM_RED: Record<string, Behavior> = {
  // "When this enchantment enters, exile cards from the top of your library until you exile a nonland card. You may cast it
  // without paying its mana cost if that spell's mana value is 8 or less. If you don't, put that card into your hand."
  // "When a Dragon you control enters, return this enchantment to its owner's hand."
  'Breaching Dragonstorm': {
    abilities: [
      onEnter({
        kind: 'revealUntilCastable',
        max: 8,
        orHand: true,
        firstNonland: true,
      }),
      returnWhenDragonEnters,
    ],
  },

  // "Channeled Dragonfire deals 2 damage to any target." Harmonize {5}{R}{R}.
  'Channeled Dragonfire': {
    ...harmonize(mana('{5}{R}{R}')),
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 2, to: t0 }],
    },
  },

  // "Equipped creature gets +1/+1 and has trample and haste."
  // "Flurry — Whenever you cast your second spell each turn, create a 1/1 white Monk creature token with prowess. You may
  // attach this Equipment to it."
  'Cori-Steel Cutter': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['trample', 'haste'] },
      },
      flurry([
        { kind: 'createToken', token: TDM_MONK, count: 1 },
        { kind: 'may', effects: [{ kind: 'attach', to: 'chosen' }] },
      ]),
      equip('{1}{R}'),
    ],
  },

  // "Haste". "Flurry — Whenever you cast your second spell each turn, this creature deals 1 damage to each opponent."
  'Devoted Duelist': {
    abilities: [flurry([{ kind: 'damage', amount: 1, to: 'eachOpponent' }])],
  },

  // "You may cast Dragon spells without paying their mana costs."
  Dracogenesis: {
    abilities: [{ kind: 'static', effect: { kind: 'castFreeMatching', filter: DRAGON } }],
  },

  // "When this creature enters, exile the top card of your library. Until the end of your next turn, you may play that card."
  // "Flurry — Whenever you cast your second spell each turn, this creature gains double strike until end of turn."
  'Equilibrium Adept': {
    abilities: [
      onEnter(exileTopPlayable(1)),
      flurry([{ kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['doubleStrike'] }]),
    ],
  },

  // "Flash". "Enchant creature". "When this Aura enters, enchanted creature gains first strike until end of turn."
  // "Enchanted creature gets +2/+0."
  'Fire-Rim Form': {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'pump', to: 'attached', power: 0, toughness: 0, keywords: ['firstStrike'] }),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 0 } },
    ],
  },

  // "Haste". "At the beginning of your end step, return this creature to its owner's hand."
  // "{2}{R}: This creature gets +2/+0 until end of turn."
  'Fleeting Effigy': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
      },
      firebreathing('{2}{R}', 2),
    ],
  },

  // "When this creature enters, if you cast it, add {W}{U}{B}{R}{G}."
  'Iridescent Tiger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W'], ['U'], ['B'], ['R'], ['G']] }],
      },
    ],
  },

  // "Flurry — Whenever you cast your second spell each turn, this creature gets +1/+1 until end of turn."
  // "{1}: Add {U}, {R}, or {W}. Activate only once each turn."
  'Jeskai Devotee': {
    abilities: [
      flurry([{ kind: 'pump', to: 'self', power: 1, toughness: 1 }]),
      devoteeMana(['U', 'R', 'W']),
    ],
  },

  // "Flying". "When this creature enters, destroy target nonbasic land an opponent controls. Its controller searches their
  // library for a basic land card, puts it onto the battlefield tapped with a stun counter on it, then shuffles."
  'Magmatic Hellkite': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Land'], nonbasic: true },
          },
        ],
        effects: [
          { kind: 'destroy', what: t0 },
          {
            kind: 'searchLibrary',
            filter: 'basicLand',
            to: 'battlefieldTapped',
            forControllerOf: 0,
            counter: 'stun',
            shuffle: true,
          },
        ],
      },
    ],
  },

  // "Prowess". "When this creature enters, create a Treasure token."
  'Meticulous Artisan': { abilities: [prowess, onEnter(treasure)] },

  // "You may cast this spell as though it had flash if you behold a Dragon as an additional cost to cast it."
  // "Molten Exhale deals 4 damage to target creature or planeswalker."
  'Molten Exhale': {
    ...mayBeholdDragon(true),
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [{ kind: 'damage', amount: 4, to: t0 }],
    },
  },

  // "Narset's Rebuke deals 5 damage to target creature. Add {U}{R}{W}. If that creature would die this turn, exile it instead."
  "Narset's Rebuke": {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'addMana', mana: [['U'], ['R'], ['W']] },
      ],
    },
  },

  // "Choose one or both — • Overwhelming Surge deals 3 damage to target creature. • Destroy target noncreature artifact."
  'Overwhelming Surge': {
    modes: combos(
      [
        {
          label: 'Overwhelming Surge deals 3 damage to target creature',
          targets: [creature],
          effects: [{ kind: 'damage', amount: 3, to: t0 }],
        },
        {
          label: 'Destroy target noncreature artifact',
          targets: [{ what: 'permanent', filter: { types: ['Artifact'], notTypes: ['Creature'] } }],
          effects: [{ kind: 'destroy', what: t0 }],
        },
      ],
      [1, 2],
    ),
  },

  // "Whenever this creature becomes tapped, you may discard a card. If you do, draw a card."
  'Rescue Leopard': {
    abilities: [when({ on: 'becomesTapped' }, [], { kind: 'may', effects: [rummage] })],
  },

  // "At the beginning of each combat, if you've cast two or more spells this turn, this enchantment becomes a 3/3 Monk creature
  // with haste in addition to its other types until end of turn."
  // "{1}{R}, Discard your hand, Sacrifice this enchantment: Draw two cards."
  'Reverberating Summons': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'each' },
        condition: { kind: 'spellsCastThisTurn', min: 2 },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [3, 3],
            becomesCreature: true,
            creatureOnly: true,
            creatureSubtype: 'Monk',
            keywords: ['haste'],
          },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), discardHand: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 2 }],
      },
    ],
  },

  // "Flying". "Whenever you cast a noncreature spell or a Dragon spell, this creature gets +2/+0 until end of turn."
  'Runescale Stormbrood': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'castSpell',
          filter: 'any',
          spell: { anyOf: [{ notTypes: ['Creature'] }, DRAGON] },
        },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 0 }],
      },
    ],
  },

  // "When Sarkhan enters, you may behold a Dragon. If you do, create a Treasure token."
  // "Whenever a Dragon you control enters, put a +1/+1 counter on Sarkhan. Until end of turn, Sarkhan becomes a Dragon in
  // addition to his other types and gains flying."
  'Sarkhan, Dragon Ascendant': {
    abilities: [
      onEnter(mayBeholdDragonThen([treasure])),
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: DRAGON },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        {
          kind: 'pump',
          to: 'self',
          power: 0,
          toughness: 0,
          keywords: ['flying'],
          creatureSubtype: 'Dragon',
        },
      ),
    ],
  },

  // "Choose one — • Exile the top two cards of your library. Until the end of your next turn, you may play those cards.
  // • Up to two target creatures each get +2/+1 until end of turn."
  'Seize Opportunity': {
    modes: [
      { label: 'Exile the top two cards of your library', targets: [], effects: [exileTopPlayable(2)] },
      {
        label: 'Up to two target creatures each get +2/+1 until end of turn',
        targets: [{ what: 'creature', anyNumber: true, maxTargets: 2 }],
        effects: [{ kind: 'pump', to: { targetsFrom: 0 }, power: 2, toughness: 1 }],
      },
    ],
  },

  // "Menace". Mobilize 1.
  'Shock Brigade': { abilities: [mobilize(1)] },

  // "Reach". "Whenever another creature you control enters, this creature deals 1 damage to target opponent."
  'Shocking Sharpshooter': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you' },
        [{ what: 'player', controller: 'opponent' }],
        { kind: 'damage', amount: 1, to: t0 },
      ),
    ],
  },

  // Mobilize 1. "{1}{R}, Sacrifice this creature: It deals damage equal to the number of creatures you control to target creature."
  'Stadium Headliner': {
    abilities: [
      mobilize(1),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), sacrificeSelf: true },
        targets: [creature],
        effects: [
          {
            kind: 'damage',
            amount: { count: 'creaturesYouControl' },
            to: t0,
          },
        ],
      },
    ],
  },

  // "Flying". "Other Dragons you control get +1/+1." Storm.
  'Stormscale Scion': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: DRAGON,
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSelf', storm: true },
        targets: [],
        effects: [{ kind: 'copySpell', what: 'subject', count: { event: 'amount' } }],
      },
    ],
  },

  // "Flying, haste". "{1}{R}: This creature gets +1/+0 until end of turn."
  'Stormshriek Feral': { abilities: [firebreathing('{1}{R}', 1)] },

  // "Reach". "When this creature enters, target creature can't block this turn."
  'Summit Intimidator': {
    abilities: [
      when({ on: 'etb' }, [creature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        cantBlock: true,
      }),
    ],
  },

  // "{T}: Add {R}." "{2}{R}, {T}, Sacrifice this creature: It deals 6 damage to target creature with flying."
  'Sunset Strikemaster': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'damage', amount: 6, to: t0 }],
      },
    ],
  },

  // "Twin Bolt deals 2 damage divided as you choose among one or two targets."
  'Twin Bolt': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'divide',
          amount: 2,
          maxTargets: 2,
          spec: { what: 'any' },
          give: 'damage',
          atLeastOne: true,
        },
      ],
    },
  },

  // "When this creature enters, create a 1/1 red Goblin creature token."
  // "{1}, {T}: Target creature you control with power 2 or less can't be blocked this turn."
  'Underfoot Underdogs': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'goblin-token', count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { maxPower: 2 } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },

  // "When this creature enters, it deals 5 damage to target creature an opponent controls that was dealt damage this turn."
  'Unsparing Boltcaster': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent', filter: { damaged: true } }],
        { kind: 'damage', amount: 5, to: t0 },
      ),
    ],
  },

  // "Creatures you control get +1/+0." "Whenever you attack, create a 1/1 red Warrior creature token that's tapped and
  // attacking. Sacrifice it at the beginning of the next end step."
  'War Effort': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 1, toughness: 0 },
      },
      when({ on: 'youAttack' }, [], {
        kind: 'createToken',
        token: TDM_WARRIOR,
        count: 1,
        tapped: true,
        attacking: true,
        sacrificeAt: 'nextEndStep',
      }),
    ],
  },

  // "Target creature gets +3/+0 and gains haste until end of turn." Harmonize {4}{R}.
  'Wild Ride': {
    ...harmonize(mana('{4}{R}')),
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 3, toughness: 0, keywords: ['haste'] }],
    },
  },

  // Mobilize 1. "Zurgo's Vanguard's power is equal to the number of creatures you control."
  "Zurgo's Vanguard": {
    powerEquals: { count: 'creaturesYouControl' },
    abilities: [mobilize(1)],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_RED_BACKS: Record<string, Behavior> = {
  // "Counter target spell with mana value 2 or less. (Then shuffle this card into its owner's library.)"
  'Chilling Screech': {
    spell: {
      targets: [{ what: 'spell', filter: { maxManaValue: 2 } }],
      effects: [{ kind: 'counter', what: t0 }],
    },
  },
  // "Discard a card. If you do, draw two cards. (Then shuffle this card into its owner's library.)"
  'Flush Out': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'discard',
          count: 1,
          then: [{ kind: 'draw', who: 'controller', amount: 2 }],
        },
      ],
    },
  },
};

/** Tokens only this group's cards make. */
export const TDM_RED_TOKENS: CardDefinition[] = [];
