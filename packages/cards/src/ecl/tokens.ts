import type { CardDefinition } from '@mtg/engine';

/**
 * Lorwyn Eclipsed tokens shared by several groups of cards. Tokens used by one
 * card only live in that card's group file. Treasure and "copy" tokens already exist.
 */
export const ECL_KITHKIN = 'ecl-kithkin-token';
export const ECL_ELF = 'ecl-elf-token';
export const ECL_MERFOLK = 'ecl-merfolk-token';
export const ECL_SHAPESHIFTER = 'ecl-shapeshifter-token';
export const ECL_GOBLIN = 'ecl-goblin-token';
export const ECL_FAERIE = 'ecl-faerie-token';
export const ECL_TREEFOLK = 'ecl-treefolk-token';

export const ECL_SHARED_TOKENS: CardDefinition[] = [
  // A 1/1 green and white Kithkin creature token.
  {
    id: ECL_KITHKIN,
    name: 'Kithkin',
    manaCost: { generic: 0, colored: {} },
    colors: ['G', 'W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Kithkin'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 2/2 black and green Elf creature token.
  {
    id: ECL_ELF,
    name: 'Elf',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elf'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 white and blue Merfolk creature token.
  {
    id: ECL_MERFOLK,
    name: 'Merfolk',
    manaCost: { generic: 0, colored: {} },
    colors: ['U', 'W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Merfolk'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 colorless Shapeshifter creature token with changeling.
  {
    id: ECL_SHAPESHIFTER,
    name: 'Shapeshifter',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Shapeshifter'],
    power: 1,
    toughness: 1,
    keywords: ['changeling'],
    abilities: [],
    isToken: true,
  },
  // A 1/1 black and red Goblin creature token.
  {
    id: ECL_GOBLIN,
    name: 'Goblin',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Goblin'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 blue and black Faerie creature token with flying.
  {
    id: ECL_FAERIE,
    name: 'Faerie',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Faerie'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
  // A 3/4 green Treefolk creature token with reach.
  {
    id: ECL_TREEFOLK,
    name: 'Treefolk',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Treefolk'],
    power: 3,
    toughness: 4,
    keywords: ['reach'],
    abilities: [],
    isToken: true,
  },
];
