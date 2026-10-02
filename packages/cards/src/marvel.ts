import type { Behavior } from './build.ts';
import { HEROES_VILLAINS, HEROES_VILLAINS_BACKS } from './msh/heroes-villains.ts';
import { AGENTS_HYDRA } from './msh/agents-hydra.ts';
import { GAMMA_WAKANDA } from './msh/gamma-wakanda.ts';
import { GROWTH_GRAVEYARD } from './msh/growth-graveyard.ts';
import { TECH_SKIES } from './msh/tech-skies.ts';
import { MARVEL_LANDS } from './msh/lands.ts';
import { MSH_MYTHIC_BACKS, MSH_MYTHICS } from './msh/mythics.ts';
import { MSH_OTHERS } from './msh/others.ts';
import { MSH_RARES } from './msh/rares.ts';
import { MSH_SAGAS } from './msh/sagas.ts';

export { MARVEL_TOKENS } from './msh/helpers.ts';

/**
 * Marvel Super Heroes (MSH) card behaviour, one file per pair of decks (plus
 * shared shapes in msh/helpers.ts). Printed characteristics come from
 * Scryfall; only rules text lives here.
 */
export const MARVEL_BEHAVIORS: Record<string, Behavior> = {
  ...HEROES_VILLAINS,
  ...GAMMA_WAKANDA,
  ...AGENTS_HYDRA,
  ...TECH_SKIES,
  ...GROWTH_GRAVEYARD,
  ...MSH_OTHERS,
  ...MSH_RARES,
  ...MSH_MYTHICS,
  ...MSH_SAGAS,
  ...MARVEL_LANDS,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const MARVEL_BACK_FACES: Record<string, Behavior> = {
  ...HEROES_VILLAINS_BACKS,
  ...MSH_MYTHIC_BACKS,
};
