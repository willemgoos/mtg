import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { done } from './ecl-blue-helpers.ts';
import { game } from './blb-helpers.ts';

/** Shared helpers for The Hobbit blue tests (20b). */

export type Driver = ReturnType<typeof game>;

/** The +1/+1 counters on a permanent. */
export const counters = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;

/** A target choice for this object. */
export const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });

/** The first legal activation of this source (optionally of one ability index / with a matching target). */
export function activateFirst(
  g: GameDriver,
  source: string,
  opts: {
    index?: number;
    pick?: (a: Extract<Action, { type: 'activateAbility' }>) => boolean;
  } = {},
): void {
  const a = g
    .legal()
    .find(
      (x): x is Extract<Action, { type: 'activateAbility' }> =>
        x.type === 'activateAbility' &&
        x.source === source &&
        (opts.index === undefined || x.abilityIndex === opts.index) &&
        (opts.pick?.(x) ?? true),
    );
  if (!a) throw new Error(`no activation for ${source}`);
  g.do(a);
}

/** Passes priority while the stack has something on it (stops at the first decision that isn't a plain priority). */
export function passStack(g: GameDriver): void {
  for (let i = 0; i < 12 && g.state.stack.length > 0; i++) {
    if ((g.decision as { kind: string }).kind !== 'priority') return;
    g.pass();
  }
}

export { done };
