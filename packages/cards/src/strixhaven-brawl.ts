import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { CARDS_15A_W, CARDS_15A_W_BACK_FACES, CARDS_15A_W_TOKENS } from './soc/cards-15a-w.ts';

/**
 * Strixhaven Commander (SOC) card behaviour for the Brawl precons, one file
 * per deck in soc/, merged here. Printed characteristics come from Scryfall;
 * only rules text lives here (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...CARDS_15A_W,
};

/** Back faces of double-faced cards (merged into `BEHAVIORS`, not the pool). */
export const STRIXHAVEN_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...CARDS_15A_W_BACK_FACES,
};

export const STRIXHAVEN_BRAWL_TOKENS: CardDefinition[] = [...CARDS_15A_W_TOKENS];
