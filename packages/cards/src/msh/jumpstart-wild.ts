import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Wild (G). Gert and Old Lace and Accelerated
// Evolution are in four packets, White Tiger also in Tenacious, Ka-Zar in Savage Lands.

export const MSH_JUMPSTART_WILD_TOKENS: CardDefinition[] = [
  {
    id: 'zabu-token',
    name: 'Zabu',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: ['Legendary'],
    subtypes: ['Cat'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
    isToken: true,
  },
];

export const MSH_JUMPSTART_WILD: Record<string, Behavior> = {
  'White Tiger, Amulet Keeper': {
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{3}{G}'), exileSelf: true },
        targets: [],
        // The land choice can be declined ("you may").
        effects: [
          draw(1),
          { kind: 'putFromHandOrGraveyard', filter: { types: ['Land'] }, handOnly: true },
        ],
        label: 'Draw a card, then you may put a land onto the battlefield',
      },
    ],
  },
  // Reach comes from Scryfall.
  'The Fabulous Frog-Man': {},
  // Trample comes from Scryfall.
  'Gert and Old Lace, Runaways': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'if',
            condition: { kind: 'handSize', min: 1 },
            then: [
              { kind: 'discard', count: 1 },
              { kind: 'searchLibrary', filter: 'basicLand', to: 'hand' },
            ],
          },
        ],
      }),
    ],
  },
  // Keywords come from Scryfall; "can't be countered" is read from its oracle text.
  'Hit-Monkey': {},
  'Ka-Zar of the Savage Land': {
    abilities: [
      { kind: 'static', effect: { kind: 'playFromTop', filter: { types: ['Land'] } } },
      onEnter({ kind: 'createToken', token: 'zabu-token', count: 1 }),
    ],
  },
  // Flash comes from Scryfall.
  'Accelerated Evolution': {
    enchant: yourCreature,
    abilities: [
      onEnter({ kind: 'pump', to: 'attached', power: 0, toughness: 0, keywords: ['hexproof'] }),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 2 } },
    ],
  },
};
