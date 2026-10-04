import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { CARDS_15A_W, CARDS_15A_W_BACK_FACES, CARDS_15A_W_TOKENS } from './soc/cards-15a-w.ts';
import { BRAWL_15A_R, BRAWL_15A_R_BACKS, BRAWL_15A_R_TOKENS } from './soc/cards-15a-r.ts';
import { BRAWL_15B_G, BRAWL_15B_G_BACKS, BRAWL_15B_G_TOKENS } from './soc/cards-15b-g.ts';
import { QUINTORIUS_RW } from './soc/cards-15a-rw.ts';

/**
 * Strixhaven Commander (SOC) card behaviour for the Brawl precons, one file
 * per deck in soc/, merged here. Printed characteristics come from Scryfall;
 * only rules text lives here (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...CARDS_15A_W,
  ...BRAWL_15A_R,
  ...QUINTORIUS_RW,
  ...BRAWL_15B_G,
};

/** Back faces of double-faced Brawl cards: not cards of their own, so not in the pool. */
export const STRIXHAVEN_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...CARDS_15A_W_BACK_FACES,
  ...BRAWL_15A_R_BACKS,
  ...BRAWL_15B_G_BACKS,
};

/** Tokens made by the Brawl decks' cards. */
export const STRIXHAVEN_BRAWL_TOKENS: CardDefinition[] = [
  ...CARDS_15A_W_TOKENS,
  ...BRAWL_15A_R_TOKENS,
  ...BRAWL_15B_G_TOKENS,
];
