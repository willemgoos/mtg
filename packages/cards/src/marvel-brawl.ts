import type { CardDefinition, Color, Keyword } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { AVENGERS } from './msc/avengers.ts';
import { WAKANDA } from './msc/wakanda.ts';
import { STAPLES } from './msc/staples.ts';

/**
 * Marvel Super Heroes Commander (MSC) card behaviour for the four Brawl
 * precons: the shared staples, then one file per deck. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */
export const MARVEL_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...STAPLES,
  ...AVENGERS,
  ...WAKANDA,
};

const creatureToken = (
  id: string,
  name: string,
  color: Color,
  subtypes: string[],
  power: number,
  toughness: number,
  keywords: Keyword[] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

/** Tokens the precons make that the other sets don't. */
export const MARVEL_BRAWL_TOKENS: CardDefinition[] = [
  creatureToken('bird-token', 'Bird', 'W', ['Bird'], 1, 1, ['flying']),
  creatureToken('goat-token', 'Goat', 'W', ['Goat'], 0, 1),
  creatureToken('elephant-token', 'Elephant', 'G', ['Elephant'], 3, 3),
  creatureToken('beast-3-token', 'Beast', 'G', ['Beast'], 3, 3),
  creatureToken('rhino-token', 'Rhino', 'G', ['Rhino'], 4, 4, ['trample']),
  creatureToken('angel-4-4-token', 'Angel', 'W', ['Angel'], 4, 4, ['flying', 'vigilance']),
  {
    // "An artifact with indestructible and '{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.'"
    id: 'vibranium-token',
    name: 'Vibranium',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: [],
    keywords: ['indestructible'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'C', onlyFor: 'Artifact' }],
    isToken: true,
  },
];
