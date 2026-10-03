import type { Behavior } from '../build.ts';
import { creature, spell, t0 } from '../fin/helpers.ts';
import { inkling, learn } from './silverquill.ts';

/** Strixhaven (13b): the Silverquill deck's Lessons (its sideboard, fetched by Learn). */
export const SILVERQUILL_LESSONS: Record<string, Behavior> = {
  'Inkling Summoning': spell([], inkling()),
  'Rise of Extus': spell(
    [
      creature,
      { what: 'graveyardCard', filter: { types: ['Instant', 'Sorcery'] }, optional: true },
    ],
    { kind: 'exile', what: t0 },
    { kind: 'exileGraveyardCard', what: { target: 1 } },
    learn,
  ),
};
