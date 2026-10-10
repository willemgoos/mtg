import type { CardDefinition } from '@mtg/engine';

/**
 * The Hobbit tokens made by two or more cards (Scryfall's `thob` set, via `all_parts`).
 * Tokens used by one card only (Bird Soldier, Axe, Stone Boulder) live in that card's
 * group file. Not repeated here: Treasure ('treasure-token') and "copy" tokens already
 * exist, and the Enduring Story and On an Adventure cards are not tokens (the Storied
 * story and the Adventure exile marker are engine state, see docs/the-hobbit-plan.md).
 */
export const HOB_GOBLIN_ARMY = 'hob-goblin-army-token';
export const HOB_HUMAN_SOLDIER = 'hob-human-soldier-token';
export const HOB_DWARF = 'hob-dwarf-token';
export const HOB_DRAGON = 'hob-dragon-token';
export const HOB_BEAR = 'hob-bear-token';
export const HOB_ELF = 'hob-elf-token';
export const HOB_WOLF = 'hob-wolf-token';

export const HOB_SHARED_TOKENS: CardDefinition[] = [
  // A 0/0 black Goblin Army creature token (Amass Goblins: +1/+1 counters go on it; 14 cards).
  {
    id: HOB_GOBLIN_ARMY,
    name: 'Goblin Army',
    manaCost: { generic: 0, colored: {} },
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Goblin', 'Army'],
    power: 0,
    toughness: 0,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 white Human Soldier creature token (Recruit; about 50 cards make one).
  {
    id: HOB_HUMAN_SOLDIER,
    name: 'Human Soldier',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Human', 'Soldier'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 2/2 red Dwarf creature token (The Lonely Mountain, An Unexpected Party, Dwarven Shortsword, Fili).
  {
    id: HOB_DWARF,
    name: 'Dwarf',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Dwarf'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 6/6 red Dragon creature token with flying (Utvara Hellkite, Mega Flare, The Misty Mountains Cold).
  {
    id: HOB_DRAGON,
    name: 'Dragon',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Dragon'],
    power: 6,
    toughness: 6,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
  // A 2/2 green Bear creature token.
  {
    id: HOB_BEAR,
    name: 'Bear',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Bear'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 green Elf creature token (Thranduil the Strategist, Down in the Valley, Silvan Rally).
  {
    id: HOB_ELF,
    name: 'Elf',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elf'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 2/2 green Wolf creature token.
  {
    id: HOB_WOLF,
    name: 'Wolf',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Wolf'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
