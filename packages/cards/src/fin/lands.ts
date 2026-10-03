import type { AbilityDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { cycling, gain, HERO, mana, onEnter, spell, t0, t1, tapFor } from './helpers.ts';

/**
 * Final Fantasy (FIN) Town lands: the twelve commons and three uncommons, and
 * the five rare Towns with an Adventure (the Adventure is the card's back face:
 * cast from hand, it then goes on an adventure in exile, from where its owner
 * may play the land).
 */

/** The ten common Town taplands: enter tapped, tap for either colour. */
const TAPLANDS: [string, ManaType, ManaType][] = [
  ['Sharlayan, Nation of Scholars', 'W', 'U'],
  ['Treno, Dark City', 'U', 'B'],
  ['Vector, Imperial Capital', 'B', 'R'],
  ['Gongaga, Reactor Town', 'R', 'G'],
  ['Windurst, Federation Center', 'G', 'W'],
  ['Insomnia, Crown City', 'W', 'B'],
  ['Baron, Airship Kingdom', 'U', 'R'],
  ['Gohn, Town of Ruin', 'B', 'G'],
  ['Rabanastre, Royal City', 'R', 'W'],
  ['Guadosalam, Farplane Gateway', 'G', 'U'],
];

const colorless: AbilityDef = { kind: 'mana', cost: { tapSelf: true }, produces: 'C' };
const permanentCard = {
  types: ['Artifact' as const, 'Creature' as const, 'Enchantment' as const, 'Land' as const],
};

export const FIN_TOWNS: Record<string, Behavior> = {
  ...Object.fromEntries(
    TAPLANDS.map(([name, a, b]) => [name, { entersTapped: true, abilities: tapFor(a, b) }]),
  ),
  "Adventurer's Inn": { abilities: [onEnter(gain(2)), colorless] },
  'Crossroads Village': {
    entersTapped: true,
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
    ],
  },
  // "{1}, {T}: Add one mana of any color" is an activated ability here (it uses the stack).
  'Capital City': {
    abilities: [
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']] }],
        label: '{1}, {T}: Add one mana of any color',
      },
      cycling('{2}'),
    ],
  },
  // The returned card is targeted as the ability is activated (before the mill).
  'Eden, Seat of the Sanctum': {
    abilities: [
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true },
        targets: [
          { what: 'graveyardCard', controller: 'you', filter: permanentCard, optional: true },
        ],
        effects: [
          { kind: 'mill', count: 2 },
          {
            kind: 'may',
            effects: [
              { kind: 'sacrifice', what: 'self' },
              { kind: 'returnToHand', what: t0 },
            ],
          },
        ],
      },
    ],
  },
  'The Gold Saucer': {
    abilities: [
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'custom', handler: 'flipCoinForTreasure' }],
        label: 'Flip a coin',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, sacrificeArtifacts: 2 },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },

  // Adventure lands (rare): the land, then its Adventure (the back face) below.
  'Ishgard, the Holy See': { entersTapped: true, abilities: tapFor('W') },
  'Jidoor, Aristocratic Capital': { entersTapped: true, abilities: tapFor('U') },
  'Lindblum, Industrial Regency': { entersTapped: true, abilities: tapFor('R') },
  'Midgar, City of Mako': { entersTapped: true, abilities: tapFor('B') },
  'Zanarkand, Ancient Metropolis': { entersTapped: true, abilities: tapFor('G') },
};

/** The Adventures: back faces of the adventure lands (not cards of their own). */
export const FIN_ADVENTURES: Record<string, Behavior> = {
  'Faith & Grief': spell(
    [
      {
        what: 'graveyardCard',
        controller: 'you',
        filter: { types: ['Artifact', 'Enchantment'] },
        optional: true,
      },
      {
        what: 'graveyardCard',
        controller: 'you',
        filter: { types: ['Artifact', 'Enchantment'] },
        optional: true,
      },
    ],
    { kind: 'returnToHand', what: t0 },
    { kind: 'returnToHand', what: t1 },
  ),
  Overture: spell([{ what: 'player', controller: 'opponent' }], {
    kind: 'custom',
    handler: 'millHalf',
  }),
  'Mage Siege': spell([], { kind: 'createToken', token: 'fin-wizard-token', count: 1 }),
  'Reactor Raid': spell([], {
    kind: 'may',
    effects: [
      {
        kind: 'sacrificeSeveral',
        count: 1,
        filter: { types: ['Artifact', 'Creature'] },
        then: [{ kind: 'draw', who: 'controller', amount: 2 }],
      },
    ],
  }),
  'Lasting Fayth': spell([], {
    kind: 'createToken',
    token: HERO,
    count: 1,
    counters: { count: 'landsYouControl' },
  }),
};
