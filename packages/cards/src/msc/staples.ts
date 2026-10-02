import type { AbilityDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  commanderMana,
  COLORS,
  cycling,
  tapFor,
  tapForEither,
  unlessReveal,
  unlessTwoBasics,
  unlessTwoOrFewerLands,
  unlessYouControlType,
} from './helpers.ts';

/**
 * The mana rocks and lands the four Marvel precons share (9a in
 * docs/marvel-plan.md): commander mana, Talismans and the dual-land cycles.
 */

const pair = (a: ManaType, b: ManaType) => tapForEither(a, b);
const searchBasic: AbilityDef = {
  kind: 'activated',
  cost: { tapSelf: true, sacrificeSelf: true },
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
};

/** Each two-colour cycle, by colour pair. */
const CHECK_LANDS: [ManaType, ManaType, string][] = [
  ['U', 'R', 'Sulfur Falls'],
  ['G', 'W', 'Sunpetal Grove'],
  ['W', 'U', 'Glacial Fortress'],
  ['R', 'W', 'Clifftop Retreat'],
  ['R', 'G', 'Rootbound Crag'],
  ['G', 'U', 'Hinterland Harbor'],
  ['U', 'B', 'Drowned Catacomb'],
  ['B', 'R', 'Dragonskull Summit'],
];
/** Battle lands (with basic land types). */
const BATTLE_LANDS: [ManaType, ManaType, string][] = [
  ['U', 'R', 'Scorched Geyser'],
  ['R', 'W', 'Radiant Summit'],
  ['W', 'U', 'Prairie Stream'],
  ['G', 'W', 'Canopy Vista'],
  ['U', 'B', 'Sunken Hollow'],
  ['G', 'U', 'Sodden Verdure'],
  ['B', 'R', 'Smoldering Marsh'],
  ['R', 'G', 'Cinder Glade'],
];
const SNARLS: [ManaType, ManaType, string][] = [
  ['U', 'R', 'Frostboil Snarl'],
  ['R', 'W', 'Furycalm Snarl'],
  ['G', 'W', 'Fortified Village'],
  ['W', 'U', 'Port Town'],
  ['B', 'R', 'Foreboding Ruins'],
  ['U', 'B', 'Choked Estuary'],
];
/** Cycling lands (with basic land types). */
const CYCLING_LANDS: [ManaType, ManaType, string][] = [
  ['U', 'R', 'Coastal Peak'],
  ['G', 'W', 'Scattered Groves'],
  ['W', 'U', 'Irrigated Farmland'],
  ['R', 'W', 'Glittering Massif'],
  ['U', 'B', 'Fetid Pools'],
  ['B', 'R', 'Canyon Slough'],
];
/** "Enters tapped unless you have two or more opponents": always tapped in Brawl. */
const BOND_LANDS: [ManaType, ManaType, string][] = [
  ['R', 'W', 'Spectator Seating'],
  ['G', 'U', 'Rejuvenating Springs'],
  ['B', 'R', 'Luxury Suite'],
  ['G', 'W', 'Bountiful Promenade'],
];
const TALISMANS: [ManaType, ManaType, string][] = [
  ['W', 'U', 'Talisman of Progress'],
  ['B', 'R', 'Talisman of Indulgence'],
  ['U', 'B', 'Talisman of Dominance'],
  ['U', 'R', 'Talisman of Creativity'],
  ['R', 'W', 'Talisman of Conviction'],
];

/** "As this land enters, choose a creature type. {T}: Add {C}. {T}: Add one mana of any color (creature spells of that type only)." */
const tribalLand: Behavior = {
  abilities: [
    {
      kind: 'triggered',
      trigger: { on: 'etb' },
      targets: [],
      effects: [{ kind: 'chooseCreatureType' }],
    },
    tapFor('C'),
    ...COLORS.map((c) => tapFor(c, { onlyFor: 'chosenType' })),
  ],
};

export const STAPLES: Record<string, Behavior> = {
  // ------------------------------------------------------------ mana rocks
  'Sol Ring': { abilities: [tapFor('C', { amount: 2 })] },
  'Arcane Signet': { abilities: commanderMana() },
  'Fellwar Stone': {
    abilities: COLORS.map((c) => tapFor(c, { colorFrom: 'opponentLands' })),
  },
  'Thought Vessel': {
    abilities: [{ kind: 'static', effect: { kind: 'noMaxHandSize' } }, tapFor('C')],
  },
  ...Object.fromEntries(
    TALISMANS.map(([a, b, name]) => [
      name,
      { abilities: [tapFor('C'), tapFor(a, { pain: true }), tapFor(b, { pain: true })] },
    ]),
  ),
  // ------------------------------------------------------------ commander lands
  'Command Tower': { abilities: commanderMana() },
  'Path of Ancestry': {
    entersTapped: true,
    abilities: commanderMana({ scryIfCommanderType: true }),
  },
  'Exotic Orchard': {
    abilities: COLORS.map((c) => tapFor(c, { colorFrom: 'opponentLands' })),
  },
  'Unclaimed Territory': tribalLand,
  'Secluded Courtyard': tribalLand,
  // ------------------------------------------------------------ fetches
  'Terramorphic Expanse': { abilities: [searchBasic] },
  // ------------------------------------------------------------ duals
  ...Object.fromEntries(
    CHECK_LANDS.map(([a, b, name]) => [
      name,
      { entersTappedIf: unlessYouControlType(a, b), abilities: pair(a, b) },
    ]),
  ),
  ...Object.fromEntries(
    BATTLE_LANDS.map(([a, b, name]) => [
      name,
      { entersTappedIf: unlessTwoBasics, abilities: pair(a, b) },
    ]),
  ),
  ...Object.fromEntries(
    SNARLS.map(([a, b, name]) => [
      name,
      { entersTappedIf: unlessReveal(a, b), abilities: pair(a, b) },
    ]),
  ),
  ...Object.fromEntries(
    CYCLING_LANDS.map(([a, b, name]) => [
      name,
      { entersTapped: true, abilities: [...pair(a, b), cycling('{2}')] },
    ]),
  ),
  ...Object.fromEntries(
    BOND_LANDS.map(([a, b, name]) => [name, { entersTapped: true, abilities: pair(a, b) }]),
  ),
  'Mystic Monastery': { entersTapped: true, abilities: tapForEither('U', 'R', 'W') },
  'Crumbling Necropolis': { entersTapped: true, abilities: tapForEither('U', 'B', 'R') },
  'Razorverge Thicket': { entersTappedIf: unlessTwoOrFewerLands, abilities: pair('G', 'W') },
  'Sungrass Prairie': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: { generic: 1, colored: {} }, tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['G'], ['W']] }],
        label: '{1}, {T}: Add {G}{W}',
      },
    ],
  },
  'Scavenger Grounds': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: {
          mana: { generic: 2, colored: {} },
          tapSelf: true,
          sacrificePermanent: { subtype: 'Desert' },
        },
        targets: [],
        effects: [{ kind: 'exileGraveyard', who: 'eachPlayer' }],
      },
    ],
  },
};
