import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { CARDS_15A_W, CARDS_15A_W_BACK_FACES, CARDS_15A_W_TOKENS } from './soc/cards-15a-w.ts';
import { BRAWL_15A_R, BRAWL_15A_R_BACKS, BRAWL_15A_R_TOKENS } from './soc/cards-15a-r.ts';
import { BRAWL_15B_G, BRAWL_15B_G_BACKS, BRAWL_15B_G_TOKENS } from './soc/cards-15b-g.ts';
import { BRAWL_15B_R, BRAWL_15B_R_BACKS, BRAWL_15B_R_TOKENS } from './soc/cards-15b-r.ts';
import { QUINTORIUS_RW } from './soc/cards-15a-rw.ts';
import { BRAWL_15B_B, BRAWL_15B_B_BACKS, BRAWL_15B_B_TOKENS } from './soc/cards-15b-b.ts';
import {
  BRAWL_15B_MULTI,
  BRAWL_15B_MULTI_BACKS,
  BRAWL_15B_MULTI_TOKENS,
} from './soc/cards-15b-multi.ts';
import { BRAWL_15B_W, BRAWL_15B_W_BACKS, BRAWL_15B_W_TOKENS } from './soc/cards-15b-w.ts';
import { BRAWL_15B_U, BRAWL_15B_U_BACKS, BRAWL_15B_U_TOKENS } from './soc/cards-15b-u.ts';
import {
  BRAWL_15B_PAIR,
  BRAWL_15B_PAIR_BACKS,
  BRAWL_15B_PAIR_TOKENS,
} from './soc/cards-15b-pair.ts';

/**
 * Strixhaven Commander (SOC) card behaviour for the Brawl precons, one file
 * per deck in soc/, merged here. Printed characteristics come from Scryfall;
 * only rules text lives here (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...CARDS_15A_W,
  ...BRAWL_15A_R,
  ...QUINTORIUS_RW,
  ...BRAWL_15B_B,
  ...BRAWL_15B_MULTI,
  ...BRAWL_15B_W,
  // Strixhaven Brawl (15b): blue.
  ...BRAWL_15B_U,
  ...BRAWL_15B_G,
  ...BRAWL_15B_R,
  ...BRAWL_15B_PAIR,
};

/** Back faces of double-faced Brawl cards: not cards of their own, so not in the pool. */
export const STRIXHAVEN_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...CARDS_15A_W_BACK_FACES,
  ...BRAWL_15A_R_BACKS,
  ...BRAWL_15B_B_BACKS,
  ...BRAWL_15B_MULTI_BACKS,
  ...BRAWL_15B_W_BACKS,
  ...BRAWL_15B_U_BACKS,
  ...BRAWL_15B_G_BACKS,
  ...BRAWL_15B_R_BACKS,
  ...BRAWL_15B_PAIR_BACKS,
};

/** Tokens made by the Brawl decks' cards. */
export const STRIXHAVEN_BRAWL_TOKENS: CardDefinition[] = [
  ...CARDS_15A_W_TOKENS,
  ...BRAWL_15A_R_TOKENS,
  ...BRAWL_15B_B_TOKENS,
  ...BRAWL_15B_MULTI_TOKENS,
  ...BRAWL_15B_W_TOKENS,
  ...BRAWL_15B_U_TOKENS,
  ...BRAWL_15B_G_TOKENS,
  ...BRAWL_15B_R_TOKENS,
  ...BRAWL_15B_PAIR_TOKENS,
];
