import type { CardDefinition } from '@mtg/engine';

/**
 * The Lord of the Rings tokens made by two or more cards (Scryfall's `tltr` set, via
 * `all_parts` of the 204 packet cards). Tokens used by one card only (Tentacle, Halfling,
 * Ballistic Boulder, Smaug) live in that card's group file. Not repeated here: Food
 * ('food-token', 16 cards), Treasure ('treasure-token', 9 cards) and the 1/1 white Human
 * Soldier (8 cards; identical to 'hob-human-soldier-token', reuse that id); "copy" tokens
 * (Sauron the Necromancer, Shelob) are made by the engine; The Ring emblem is engine state
 * (docs/lord-of-the-rings-plan.md, Phase 21a).
 */
export const LTR_ORC_ARMY = 'ltr-orc-army-token';
export const LTR_SPIRIT = 'ltr-spirit-token';

export const LTR_SHARED_TOKENS: CardDefinition[] = [
  // A 0/0 black Orc Army creature token (Amass Orcs: +1/+1 counters go on it; 20 cards).
  {
    id: LTR_ORC_ARMY,
    name: 'Orc Army',
    manaCost: { generic: 0, colored: {} },
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Orc', 'Army'],
    power: 0,
    toughness: 0,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  // A 1/1 white Spirit creature token with flying (Andúril, Flame of the West; King of the Oathbreakers).
  {
    id: LTR_SPIRIT,
    name: 'Spirit',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Spirit'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
