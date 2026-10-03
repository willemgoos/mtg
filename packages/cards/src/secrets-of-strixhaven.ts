import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { SOS_BLUE_B, SOS_BLUE_B_BACKS, SOS_BLUE_B_TOKENS } from './sos/cards-b.ts';
import { PREPARE_SPIKE, PREPARE_SPIKE_BACKS } from './sos/prepare-spike.ts';
import { SOS_A, SOS_A_BACKS, SOS_A_TOKENS } from './sos/cards-a.ts';
import { SHARED_14A } from './sos/shared-14a.ts';
import {
  SILVERQUILL_SOS,
  SILVERQUILL_SOS_BACKS,
  SILVERQUILL_SOS_TOKENS,
} from './sos/silverquill.ts';
import {
  SOS_WITHERBLOOM,
  SOS_WITHERBLOOM_BACKS,
  SOS_WITHERBLOOM_TOKENS,
} from './sos/witherbloom.ts';

/**
 * Secrets of Strixhaven (SOS) card behaviour, one file per group of decks in
 * sos/, merged here. Printed characteristics come from Scryfall; only rules
 * text lives here (docs/strixhaven-plan.md).
 */
export const SECRETS_OF_STRIXHAVEN_BEHAVIORS: Record<string, Behavior> = {
  ...PREPARE_SPIKE,
  ...SHARED_14A,
  ...SILVERQUILL_SOS,
  ...SOS_WITHERBLOOM,
  // 14b, group A (white, Silverquill, Lorehold).
  ...SOS_A,
  ...SOS_BLUE_B,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const SECRETS_OF_STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {
  ...PREPARE_SPIKE_BACKS,
  ...SILVERQUILL_SOS_BACKS,
  ...SOS_WITHERBLOOM_BACKS,
  ...SOS_A_BACKS,
  ...SOS_BLUE_B_BACKS,
};

/** Secrets of Strixhaven tokens (Inkling, Pest). */
export const SECRETS_OF_STRIXHAVEN_TOKENS: CardDefinition[] = [
  ...SILVERQUILL_SOS_TOKENS,
  ...SOS_WITHERBLOOM_TOKENS,
  ...SOS_A_TOKENS,
  ...SOS_BLUE_B_TOKENS,
];
