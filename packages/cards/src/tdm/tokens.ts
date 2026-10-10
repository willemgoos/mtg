import type { CardDefinition } from '@mtg/engine';
import { prowess } from '../blb/helpers.ts';

/**
 * Tarkir: Dragonstorm tokens made by two or more cards (found via Scryfall's
 * `all_parts`). Tokens used by one card only live in that card's group file.
 * Not repeated here, because they already exist: Treasure, "copy" tokens, the
 * red 1/1 Goblin ('goblin-token') and the white 1/1 Soldier ('soldier-token').
 */
export const TDM_WARRIOR = 'tdm-warrior-token';
export const TDM_SPIRIT = 'tdm-spirit-token';
export const TDM_SOLDIER = 'tdm-soldier-token';
export const TDM_MONK = 'tdm-monk-token';
export const TDM_ZOMBIE_DRUID = 'tdm-zombie-druid-token';
export const TDM_ELEPHANT = 'tdm-elephant-token';
export const TDM_BIRD = 'tdm-bird-token';

export const TDM_SHARED_TOKENS: CardDefinition[] = [
  // A 1/1 red Warrior creature token (mobilize; Dragonback Lancer, Zurgo, ... 16 cards).
  {
    id: TDM_WARRIOR,
    name: 'Warrior',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Warrior'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // An X/X white Spirit creature token (endure N: N/N). Scryfall shows */*; the size is set when the token is created.
  {
    id: TDM_SPIRIT,
    name: 'Spirit',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Spirit'],
    power: 0,
    toughness: 0,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 2/2 white Soldier creature token (Riling Dawnbreaker, Teeming Dragonstorm).
  {
    id: TDM_SOLDIER,
    name: 'Soldier',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Soldier'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 white Monk creature token with prowess.
  {
    id: TDM_MONK,
    name: 'Monk',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Monk'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [prowess],
    isToken: true,
  },
  // A 2/2 black Zombie Druid creature token.
  {
    id: TDM_ZOMBIE_DRUID,
    name: 'Zombie Druid',
    manaCost: { generic: 0, colored: {} },
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Zombie', 'Druid'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 5/5 green Elephant creature token.
  {
    id: TDM_ELEPHANT,
    name: 'Elephant',
    manaCost: { generic: 0, colored: {} },
    colors: ['G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elephant'],
    power: 5,
    toughness: 5,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 white Bird creature token with flying.
  {
    id: TDM_BIRD,
    name: 'Bird',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Bird'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
