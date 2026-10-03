import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { LOREHOLD, LOREHOLD_TOKENS } from './stx/lorehold.ts';
import { WITHERBLOOM, WITHERBLOOM_TOKENS } from './stx/witherbloom.ts';
import { QUANDRIX, QUANDRIX_TOKENS } from './stx/quandrix.ts';
import { SILVERQUILL, SILVERQUILL_TOKENS } from './stx/silverquill.ts';
import { SILVERQUILL_LESSONS } from './stx/lessons-silverquill.ts';
import { PRISMARI } from './stx/prismari.ts';
import { PRISMARI_LESSONS } from './stx/lessons-prismari.ts';
import { AZORIUS, AZORIUS_TOKENS } from './stx/azorius.ts';
import { LESSONS_AZORIUS } from './stx/lessons-azorius.ts';

/**
 * Strixhaven (STX) card behaviour, one file per group of decks in stx/,
 * merged here. Printed characteristics come from Scryfall; only rules text
 * lives here. Filled in from the first Strixhaven deck phase on
 * (docs/strixhaven-plan.md).
 */
export const STRIXHAVEN_BEHAVIORS: Record<string, Behavior> = {
  ...LOREHOLD,
  ...QUANDRIX,
  ...SILVERQUILL,
  ...SILVERQUILL_LESSONS,
  ...WITHERBLOOM,
  ...PRISMARI,
  ...PRISMARI_LESSONS,
  ...AZORIUS,
  ...LESSONS_AZORIUS,
};

/** Strixhaven tokens (the Lorehold Spirit, the Quandrix Fractal). */
export const STRIXHAVEN_TOKENS: CardDefinition[] = [
  ...LOREHOLD_TOKENS,
  ...QUANDRIX_TOKENS,
  ...SILVERQUILL_TOKENS,
  ...WITHERBLOOM_TOKENS,
  ...AZORIUS_TOKENS,
];

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const STRIXHAVEN_BACK_FACES: Record<string, Behavior> = {};
