import type {
  AbilityDef,
  CardDefinition,
  CardFilter,
  EffectDef,
  ManaType,
  SpellDef,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { drain, food, gain, onEnter, t0, when, yourCreature } from '../blb/helpers.ts';
import {
  combos,
  cycling,
  tapFor,
  tapForEither,
  unlessTwoOrFewerLands,
  unlessYouControlType,
} from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b): the multicolour, colourless and land cards of the other seven Brawl decks.
 * Printed characteristics come from Scryfall; only rules text lives here. One-offs are `custom` handlers
 * in packages/engine/src/brawl-15b-multi-effects.ts.
 *
 * Already implemented elsewhere (skipped): Jungle Hollow, Talisman of Conviction, Furycalm Snarl,
 * Wind-Scarred Crag, Clifftop Retreat, Azorius Guildgate, Dragonskull Summit, Foreboding Ruins, Maelstrom Muse.
 */

export const SOC_15B_MULTI_ELEMENTAL = 'soc-15b-multi-elemental';
export const SOC_15B_MULTI_INSECT = 'soc-15b-multi-insect';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
});

/** Lagomos's 2/1 red Elemental with trample and haste; Iridescent Hornbeetle's 1/1 green Insect. */
export const BRAWL_15B_MULTI_TOKENS: CardDefinition[] = [
  token(SOC_15B_MULTI_ELEMENTAL, 'Elemental', ['R'], ['Elemental'], 2, 1, ['trample', 'haste']),
  token(SOC_15B_MULTI_INSECT, 'Insect', ['G'], ['Insect'], 1, 1),
];

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const spell = (targets: SpellDef['targets'], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});

const basicLand: CardFilter = { types: ['Land'], supertypes: ['Basic'] };

// ------------------------------------------------------------ lands
const pair = (a: ManaType, b: ManaType) => tapForEither(a, b);
const surveil1: AbilityDef = when({ on: 'etb' }, [], { kind: 'surveil', amount: 1 });
/** "As this land enters, you may pay 2 life. If you don't, it enters tapped." */
const shockTrigger: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects: [{ kind: 'chooseCustom', handler: 'shockLand' }],
};
const shock = (a: ManaType, b: ManaType): Behavior => ({
  entersTapped: true,
  abilities: [...pair(a, b), shockTrigger],
});
const tapped = (a: ManaType, b: ManaType): Behavior => ({
  entersTapped: true,
  abilities: pair(a, b),
});
/** Triomes: enter tapped, three colours, cycling {3}. */
const triome = (...colors: ManaType[]): Behavior => ({
  entersTapped: true,
  abilities: [...tapForEither(...colors), cycling('{3}')],
});
/** "{T}: Add {C}. {T}: Add {A} or {B}. This land deals 1 damage to you." */
const painland = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [tapFor('C'), tapFor(a, { pain: true }), tapFor(b, { pain: true })],
});

/** The five colour symbols, one of each, for The World Tree's activation. */
const worldTreeCost = mana('{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}');

export const BRAWL_15B_MULTI: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Dina, Essence Brewer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youSacrifice', filter: { types: ['Creature'] } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        oncePerTurn: true,
      },
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}'),
          tapSelf: true,
          sacrificeCreature: true,
          sacrificeFilter: { other: true },
        },
        targets: [yourCreature],
        effects: [
          gain({ sacrificedPower: true }),
          { kind: 'counters', to: t0, amount: { sacrificedPower: true } },
        ],
        label:
          '{2}, {T}, Sacrifice another creature: gain X life and put X +1/+1 counters on target creature',
      },
    ],
  },
  'Gorma, the Gullet': {
    abilities: [
      when({ on: 'permanentYouControlDies', filter: { types: ['Creature'] }, other: true }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
      { kind: 'static', effect: { kind: 'nontokenEnterWithDiedCounters' } },
    ],
  },
  'Siege Rhino': { abilities: [onEnter(...drain(3))] },
  'Lagomos, Hand of Hatred': {
    abilities: [
      when({ on: 'beginningOfCombat', whose: 'yours' }, [], custom('lagomosElemental')),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'creaturesDiedAtLeast', min: 5 },
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: {}, to: 'hand', required: true }],
        label: '{T}: search your library for a card (five or more creatures died this turn)',
      },
    ],
  },
  'Mayhem Devil': {
    abilities: [
      when({ on: 'playerSacrifices' }, [{ what: 'any' }], {
        kind: 'damage',
        amount: 1,
        to: t0,
      }),
    ],
  },
  // The Alchemy rebalance (A-) isn't in bulk data: this is the paper card.
  'Iridescent Hornbeetle': {
    abilities: [
      when({ on: 'beginningOfEndStep', whose: 'yours' }, [], {
        kind: 'createToken',
        token: SOC_15B_MULTI_INSECT,
        count: { count: 'countersPutThisTurn' },
      }),
    ],
  },
  'Ochre Jelly': {
    entersWithXCounters: true,
    abilities: [when({ on: 'dies' }, [], custom('ochreJellyDies'))],
  },
  'Haywire Mite': {
    abilities: [
      when({ on: 'dies' }, [], gain(2)),
      {
        kind: 'activated',
        cost: { mana: mana('{G}'), sacrificeSelf: true },
        targets: [
          {
            what: 'permanent',
            filter: {
              anyOf: [
                { types: ['Artifact'], notTypes: ['Creature'] },
                { types: ['Enchantment'], notTypes: ['Creature'] },
              ],
            },
          },
        ],
        effects: [{ kind: 'exile', what: t0 }],
        label: '{G}, Sacrifice: exile target noncreature artifact or enchantment',
      },
    ],
  },
  // Arena's Aggro Amalgam (Through the Omenpaths) is this card under a flavour name.
  'Voracious Hydra': {
    entersWithXCounters: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Double the number of +1/+1 counters on this creature',
            targets: [],
            effects: [{ kind: 'counters', to: 'self', amount: { countersOn: 'self' } }],
          },
          {
            label: "This creature fights target creature you don't control",
            targets: [{ what: 'creature', controller: 'opponent' }],
            effects: [{ kind: 'fight', a: 'self', b: t0 }],
          },
        ],
      },
    ],
  },
  // ------------------------------------------------------------ spells
  // The front of Revitalizing Repast // Old-Growth Grove.
  'Revitalizing Repast': spell(
    [{ what: 'creature' }],
    {
      kind: 'counters',
      to: t0,
      amount: 1,
    },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['indestructible'] },
  ),
  "Assassin's Trophy": spell(
    [{ what: 'permanent', controller: 'opponent' }],
    { kind: 'destroy', what: t0 },
    { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefield', forControllerOf: 0 },
  ),
  'Casualties of War': {
    modes: combos(
      [
        ['Artifact', 'artifact'],
        ['Creature', 'creature'],
        ['Enchantment', 'enchantment'],
        ['Land', 'land'],
        ['Planeswalker', 'planeswalker'],
      ].map(([type, label]): SpellDef => ({
        label: `Destroy target ${label}`,
        targets: [
          type === 'Creature'
            ? { what: 'creature' }
            : { what: 'permanent', filter: { types: [type as 'Artifact'] } },
        ],
        effects: [{ kind: 'destroy', what: t0 }],
      })),
      [1, 2, 3, 4, 5],
    ),
  },
  'Kin-Tree Severance': spell([{ what: 'permanent', filter: { minManaValue: 3 } }], {
    kind: 'exile',
    what: t0,
  }),
  'Call the Crash': {
    spell: { targets: [], effects: [custom('callTheCrash')] },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}{B}{G}'), suspendSelf: 2 },
        fromHand: true,
        sorcerySpeed: true,
        targets: [],
        effects: [],
        label: 'Suspend 2—{1}{W}{B}{G}',
      },
    ],
  },
  Duneblast: spell([], { kind: 'chooseCustom', handler: 'duneblast' }),
  'Vesuvan Mist': {
    spell: {
      targets: [{ what: 'permanent', filter: { nontoken: true, nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }],
    },
    kicker: {
      cost: mana('{1}{B}'),
      spell: {
        targets: [{ what: 'permanent', filter: { nontoken: true, nonland: true } }],
        effects: [custom('vesuvanConjure'), { kind: 'bounce', what: t0 }],
      },
    },
  },
  // The front of Waterlogged Teachings // Inundated Archive.
  'Waterlogged Teachings': spell([], {
    kind: 'searchLibrary',
    filter: { anyOf: [{ types: ['Instant'] }, { hasKeyword: 'flash' }] },
    to: 'hand',
  }),
  // The front of Discovery // Dispersal.
  Discovery: spell(
    [],
    { kind: 'surveil', amount: 2 },
    { kind: 'draw', who: 'controller', amount: 1 },
  ),
  'Escape to the Wilds': spell(
    [],
    { kind: 'exileTopPlayable', count: 5, until: 'endOfNextTurn' },
    custom('extraLandThisTurn'),
  ),
  'Fractured Identity': spell([{ what: 'permanent', filter: { nonland: true } }], {
    kind: 'custom',
    handler: 'fracturedIdentity',
  }),
  'Time Wipe': spell(
    [],
    {
      kind: 'chooseYourPermanent',
      filter: { types: ['Creature'] },
      then: [{ kind: 'bounce', what: 'chosen' }],
    },
    { kind: 'destroyAll' },
  ),
  'Ruinous Ultimatum': spell([], custom('ruinousUltimatum')),
  // ------------------------------------------------------------ mana rocks
  'Talisman of Resilience': { abilities: painland('B', 'G').abilities },
  'Rakdos Signet': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['B'], ['R']] }],
        label: '{1}, {T}: Add {B}{R}',
      },
    ],
  },
  // ------------------------------------------------------------ lands
  'Blooming Marsh': { entersTappedIf: unlessTwoOrFewerLands, abilities: pair('B', 'G') },
  'Llanowar Wastes': painland('B', 'G'),
  'Overgrown Tomb': shock('B', 'G'),
  'Blood Crypt': shock('B', 'R'),
  'Stomping Ground': shock('R', 'G'),
  'Temple Garden': shock('G', 'W'),
  'Underground Mortuary': { entersTapped: true, abilities: [...pair('B', 'G'), surveil1] },
  'Raucous Theater': { entersTapped: true, abilities: [...pair('B', 'R'), surveil1] },
  'Woodland Cemetery': {
    entersTappedIf: unlessYouControlType('B', 'G'),
    abilities: pair('B', 'G'),
  },
  'Sacred Peaks': tapped('R', 'W'),
  'Ice Tunnel': tapped('U', 'B'),
  'Highland Forest': tapped('R', 'G'),
  'Nomad Outpost': { entersTapped: true, abilities: tapForEither('R', 'W', 'B') },
  'Frontier Bivouac': { entersTapped: true, abilities: tapForEither('G', 'U', 'R') },
  'Indatha Triome': triome('W', 'B', 'G'),
  'Savai Triome': triome('R', 'W', 'B'),
  'Ketria Triome': triome('G', 'U', 'R'),
  "Spara's Headquarters": triome('G', 'W', 'U'),
  "Xander's Lounge": triome('U', 'B', 'R'),
  'Zagoth Triome': triome('B', 'G', 'U'),
  "Ziatora's Proving Ground": triome('B', 'R', 'G'),
  'Shattered Landscape': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: { ...basicLand, subtypes: ['Mountain', 'Plains', 'Swamp'] },
            to: 'battlefieldTapped',
          },
        ],
        label: '{T}, Sacrifice: search for a basic Mountain, Plains, or Swamp',
      },
      cycling('{R}{W}{B}'),
    ],
  },
  'Restless Cottage': {
    entersTapped: true,
    abilities: [
      ...pair('B', 'G'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}{G}') },
        targets: [],
        effects: [custom('restlessCottageAnimate')],
        label: '{2}{B}{G}: becomes a 4/4 Horror creature until end of turn',
      },
      when({ on: 'attacks' }, [{ what: 'graveyardCard', optional: true }], food, {
        kind: 'exileGraveyardCard',
        what: t0,
      }),
    ],
  },
  'The World Tree': {
    entersTapped: true,
    abilities: [
      tapFor('G'),
      {
        kind: 'static',
        effect: {
          kind: 'landsTapForAnyColor',
          condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 6 },
        },
      },
      {
        kind: 'activated',
        cost: { mana: worldTreeCost, tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [custom('worldTreeGods')],
        label: '{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, {T}, Sacrifice: search for any number of God cards',
      },
    ],
  },
};

/** Back faces: Old-Growth Grove, Inundated Archive (the lands) and Dispersal. */
export const BRAWL_15B_MULTI_BACKS: Record<string, Behavior> = {
  'Old-Growth Grove': { entersTapped: true, abilities: pair('B', 'G') },
  'Inundated Archive': { entersTapped: true, abilities: pair('U', 'B') },
  Dispersal: spell([], custom('dispersal'), { kind: 'discard', count: 1, who: 'eachOpponent' }),
};
