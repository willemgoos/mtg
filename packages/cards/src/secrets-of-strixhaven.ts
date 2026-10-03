import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { PREPARE_SPIKE, PREPARE_SPIKE_BACKS } from './sos/prepare-spike.ts';
import { SHARED_14A } from './sos/shared-14a.ts';
import {
  SILVERQUILL_SOS,
  SILVERQUILL_SOS_BACKS,
  SILVERQUILL_SOS_TOKENS,
} from './sos/silverquill.ts';

/**
 * Secrets of Strixhaven (SOS) card behaviour, one file per group of decks in
 * sos/, merged here. Printed characteristics come from Scryfall; only rules
 * text lives here (docs/strixhaven-plan.md).
 */
export const SECRETS_OF_STRIXHAVEN_BEHAVIORS: Record<string, Behavior> = {
  ...PREPARE_SPIKE,
  ...SHARED_14A,
  ...SILVERQUILL_SOS,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const SECRETS_OF_STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {
  ...PREPARE_SPIKE_BACKS,
  ...SILVERQUILL_SOS_BACKS,
};

/** Secrets of Strixhaven tokens (the 1/1 Inkling). */
export const SECRETS_OF_STRIXHAVEN_TOKENS: CardDefinition[] = [...SILVERQUILL_SOS_TOKENS];
