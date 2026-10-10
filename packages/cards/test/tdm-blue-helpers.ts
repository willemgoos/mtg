import type { GameDriver } from '@mtg/engine/testing';
import { done } from './ecl-blue-helpers.ts';
import { game } from './blb-helpers.ts';

/** Shared helpers for the Tarkir: Dragonstorm blue tests (19b). */

export type Driver = ReturnType<typeof game>;

/** The +1/+1 counters on a permanent. */
export const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

/** A target choice for this object. */
export const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });

/** Passes priority (taking default choices) until a chooseOption decision is up; returns its labels. */
export function untilOption(g: GameDriver): string[] {
  for (let i = 0; i < 200; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') return d.options.map((o) => o.label);
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error('no option prompt');
}

/** Answers the current chooseOption with the first label matching the pattern. */
export const choose = (g: GameDriver, pattern: RegExp) => {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`not an option decision: ${d.kind}`);
  const index = d.options.findIndex((o) => pattern.test(o.label));
  if (index < 0)
    throw new Error(`no option ${pattern}: ${d.options.map((o) => o.label).join(' | ')}`);
  g.do({ type: 'chooseOption', player: d.player, index });
};
