import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { AVENGERS } from './msc/avengers.ts';
import { STAPLES } from './msc/staples.ts';

/**
 * Marvel Super Heroes Commander (MSC) card behaviour for the four Brawl
 * precons: the shared staples, then one file per deck. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */
export const MARVEL_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...STAPLES,
  ...AVENGERS,
};

/** Tokens the precons make that the other sets don't. */
export const MARVEL_BRAWL_TOKENS: CardDefinition[] = [
  {
    id: 'bird-token',
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
