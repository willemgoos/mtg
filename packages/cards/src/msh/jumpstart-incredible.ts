import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, onEnter, powerUp, t0, t1, t2, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Incredible packet (docs/marvel-jumpstart.md):
// the cards it was missing. Brawn is shared with the Geniuses packet.

const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

export const MSH_JUMPSTART_INCREDIBLE_TOKENS: CardDefinition[] = [
  {
    id: 'citizen-gw-token',
    name: 'Citizen',
    manaCost: { generic: 0, colored: {} },
    colors: ['G', 'W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Citizen'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

/** "Target creature you control deals damage equal to its power to another target creature." */
const thunderclap: EffectDef = { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 };

export const MSH_JUMPSTART_INCREDIBLE: Record<string, Behavior> = {
  'Brawn, Amadeus Cho': {
    abilities: [
      onEnter(draw(1)),
      powerUp('{4}{G/U}', { kind: 'counters', to: 'self', amount: { count: 'cardsInHand' } }),
    ],
  },
  // Trample comes from Scryfall.
  'Hulk, Strongest There Is': {
    entersWithCounters: 1,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'custom',
            handler: 'doubleCountersOnYourCreatures',
            params: { subtype: 'Gamma' },
          },
        ],
      },
    ],
  },
  // Behold is a free kicker, offered when there's a Gamma creature to behold.
  "Hulk's Thunderclap": {
    spell: { targets: [yourCreature, { what: 'creature' }], effects: [thunderclap] },
    kicker: {
      cost: { generic: 0, colored: {} },
      behold: { types: ['Creature'], subtype: 'Gamma' },
      spell: {
        targets: [
          yourCreature,
          { what: 'creature' },
          {
            what: 'permanent',
            filter: { types: ['Artifact', 'Enchantment'], notTypes: ['Creature'] },
          },
        ],
        effects: [thunderclap, { kind: 'destroy', what: t2 }],
      },
    },
  },
  'Origin of the Hulk': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'createToken', token: 'citizen-gw-token', count: 1 }),
      chapter([2], [yourCreature], { kind: 'counters', to: t0, amount: 2 }),
      chapter([3], [yourCreature], {
        kind: 'pump',
        to: t0,
        power: 3,
        toughness: 3,
        keywords: ['trample'],
      }),
    ],
  },
  'Super Strength': {
    enchant: { what: 'creature' },
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 4, toughness: 4, keywords: ['trample', 'wardOne'] },
      },
    ],
  },
};
