import type { CardDefinition } from '@mtg/engine';

/**
 * Reality Fracture tokens shared by several groups of cards. Tokens used by one
 * card only live in that card's group file.
 */
export const FRA_CADET = 'fra-cadet-token';
export const FRA_HEARTWOOD = 'fra-heartwood-token';

export const FRA_SHARED_TOKENS: CardDefinition[] = [
  // "A 2/2 colorless Wizard Soldier creature token named Cadet."
  {
    id: FRA_CADET,
    name: 'Cadet',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Wizard', 'Soldier'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // Heartwood: artifact token, "{T}: Add {R} or {G}."
  {
    id: FRA_HEARTWOOD,
    name: 'Heartwood',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Heartwood'],
    keywords: [],
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
    ],
    isToken: true,
  },
];
