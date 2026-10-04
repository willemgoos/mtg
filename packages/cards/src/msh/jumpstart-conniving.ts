import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { connive, creature, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Conniving packet (docs/marvel-jumpstart.md): the cards it
// was missing. Mob Lookout is shared with Blink.

const villainCard = { subtype: 'Villain' };

export const MSH_JUMPSTART_CONNIVING_TOKENS: CardDefinition[] = [
  {
    id: 'illusion-villain-token',
    name: 'Illusion Villain',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Illusion', 'Villain'],
    power: 3,
    toughness: 3,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

export const MSH_JUMPSTART_CONNIVING: Record<string, Behavior> = {
  'Mob Lookout': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [{ kind: 'connive', what: t0 }],
      },
    ],
  },
  // Flying comes from Scryfall.
  'Flying Octobot': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: villainCard },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Graviton, Fundamental Force': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Target creature gains flying until end of turn',
            targets: [creature],
            effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['flying'] }],
          },
          {
            label: 'Tap target creature',
            targets: [creature],
            effects: [{ kind: 'tap', what: t0 }],
          },
        ],
      },
    ],
  },
  // Flash comes from Scryfall.
  "Doc Ock's Henchmen": {
    abilities: [{ kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: [connive] }],
  },
  'Doc Ock, Sinister Scientist': {
    abilities: [
      // "Base power and toughness 8/8": +4/+3 on the printed 4/5.
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'graveyardCount', min: 8 },
          power: 4,
          toughness: 3,
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsAnother', subtype: 'Villain' },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },
  "Mysterio's Mirage": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'amountAtLeast', amount: { count: 'cardsDiscardedThisTurn' }, min: 1 },
        targets: [],
        effects: [{ kind: 'createToken', token: 'illusion-villain-token', count: 1 }],
      },
    ],
  },
};
