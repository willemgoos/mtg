import type { Behavior } from './build.ts';
import { HEROES_VILLAINS, HEROES_VILLAINS_BACKS } from './msh/heroes-villains.ts';
import { MARVEL_LANDS } from './msh/lands.ts';

export { MARVEL_TOKENS } from './msh/helpers.ts';

/**
 * Marvel Super Heroes (MSH) card behaviour, one file per pair of decks (plus
 * shared shapes in msh/helpers.ts). Printed characteristics come from
 * Scryfall; only rules text lives here.
 */
export const MARVEL_BEHAVIORS: Record<string, Behavior> = {
  ...HEROES_VILLAINS,
  ...MARVEL_LANDS,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const MARVEL_BACK_FACES: Record<string, Behavior> = {
  ...HEROES_VILLAINS_BACKS,
};
