import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { BRAWL_15A_R, BRAWL_15A_R_BACKS, BRAWL_15A_R_TOKENS } from './soc/cards-15a-r.ts';

/**
 * Strixhaven Commander (SOC) card behaviour for the Brawl precons, one file
 * per deck in soc/, merged here. Printed characteristics come from Scryfall;
 * only rules text lives here (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...BRAWL_15A_R,
};

/** Back faces of double-faced Brawl cards: not cards of their own, so not in the pool. */
export const STRIXHAVEN_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...BRAWL_15A_R_BACKS,
};

/** Tokens made by the Brawl decks' cards. */
export const STRIXHAVEN_BRAWL_TOKENS: CardDefinition[] = [...BRAWL_15A_R_TOKENS];
