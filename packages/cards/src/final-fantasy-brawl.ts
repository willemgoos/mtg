import type { CardDefinition, Color, Keyword } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { FIN_SHARED, FIN_SHARED_BACK_FACES } from './fic/fin-shared.ts';
import { FIC_SHARED, FIC_SHARED_BACK_FACES } from './fic/shared.ts';
import { TERRA } from './fic/terra.ts';

/**
 * Final Fantasy Commander (FIC) card behaviour for the Arena Store Brawl decks
 * (phase 12 in docs/final-fantasy-plan.md): shared lands, the FIN booster
 * cards they use, then one file per deck. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */
export const FINAL_FANTASY_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...FIC_SHARED,
  ...FIN_SHARED,
  ...TERRA,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...FIC_SHARED_BACK_FACES,
  ...FIN_SHARED_BACK_FACES,
};

const creatureToken = (
  id: string,
  name: string,
  colors: Color[],
  subtypes: string[],
  power: number,
  toughness: number,
  keywords: Keyword[] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

/** Tokens the FIC decks make that the other sets don't. */
export const FINAL_FANTASY_BRAWL_TOKENS: CardDefinition[] = [
  creatureToken('human-soldier-token', 'Human Soldier', ['W'], ['Human', 'Soldier'], 1, 1),
  // FIN's Hero: a 1/1 colourless Hero (phase 11 may share it).
  creatureToken('hero-1-1-token', 'Hero', [], ['Hero'], 1, 1),
  creatureToken('knight-2-2-token', 'Knight', ['W'], ['Knight'], 2, 2),
  {
    ...creatureToken('darkstar-token', 'Darkstar', ['W', 'B'], ['Dog'], 2, 2),
    supertypes: ['Legendary'],
  },
];
