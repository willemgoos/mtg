import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { PREPARE_SPIKE, PREPARE_SPIKE_BACKS } from './sos/prepare-spike.ts';
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
  ...SOS_WITHERBLOOM,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const SECRETS_OF_STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {
  ...PREPARE_SPIKE_BACKS,
  ...SOS_WITHERBLOOM_BACKS,
};

/** Secrets of Strixhaven tokens (the Pest). */
export const SECRETS_OF_STRIXHAVEN_TOKENS: CardDefinition[] = [...SOS_WITHERBLOOM_TOKENS];
