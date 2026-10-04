import type { CardDefinition } from '@mtg/engine';

/**
 * Reality Fracture tokens shared by several groups of cards. Tokens used by one
 * card only live in that card's group file.
 */
export const FRA_CADET = 'fra-cadet-token';
export const FRA_HEARTWOOD = 'fra-heartwood-token';
// Reality Fracture (17c): the planeswalker token Empower Jace makes (the engine knows this id).
export const FRA_JACE = 'fra-jace-token';

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
  // Heartwood: red and green artifact token, "{T}: Add {R} or {G}."
  {
    id: FRA_HEARTWOOD,
    name: 'Heartwood',
    manaCost: { generic: 0, colored: {} },
    colors: ['R', 'G'],
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
  // Reality Fracture (17c): the Jace token, a blue Token Planeswalker — Jace with 0 loyalty:
  // "−1: Surveil 1." and "−3: Draw a card." (Empower Jace puts the loyalty counters on it.)
  {
    id: FRA_JACE,
    name: 'Jace',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Planeswalker'],
    supertypes: [],
    subtypes: ['Jace'],
    keywords: [],
    loyalty: 0,
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: -1 },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
        label: '−1: Surveil 1',
      },
      {
        kind: 'activated',
        cost: { loyalty: -3 },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        label: '−3: Draw a card',
      },
    ],
    isToken: true,
  },
];
