import { expect } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { WOE_RAT } from '../src/woe/black.ts';
import { casts, chars, done } from './ecl-special-helpers.ts';

/** Shared helpers for the Wilds of Eldraine black tests (23b). */

export type Cast = Extract<Action, { type: 'castSpell' }>;
export const ROLE_WICKED = 'woe-wicked-role';
export const NIGHTMARE = 'woe-ashiok-nightmare-token';
export const keywords = (g: GameDriver, id: string) => chars(g, id).keywords;
export const plus = (g: GameDriver, id: string) => g.obj(id).plusOneCounters;
export const hasKw = (g: GameDriver, id: string, ...ks: string[]) =>
  ks.every((k) => keywords(g, id).has(k as never));
export const tokens = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).controller === p && g.obj(id).defId === defId);
export const targeting = (id: string) => (a: Cast) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);
export const targetingPlayer = (p: 'p1' | 'p2') => (a: Cast) =>
  a.targets.some((t) => 'player' in t && t.player === p);
export const pickTarget = (id: string) => (a: Extract<Action, { type: 'chooseTargets' }>) =>
  a.targets.some((t) => 'object' in t && t.object.id === id);

/** Casts the (first matching) way of casting this card from hand, and lets it resolve. */
export function play(
  g: GameDriver,
  defId: string,
  pick: (a: Cast) => boolean = () => true,
  p: 'p1' | 'p2' = 'p1',
): GameDriver {
  const a = casts(g, defId, p).find(pick);
  expect(a, `no cast of ${defId}`).toBeDefined();
  g.do(a!);
  return done(g);
}

/** Picks the targets of a spell with "up to N target ..." (chosen one at a time), then finishes. */
export function pickSpellTargets(g: GameDriver, ids: string[]): void {
  for (let i = 0; i < 6 && g.decision.kind === 'spellTargets'; i++) {
    const picked = g.decision.picked.length;
    const next = ids[picked];
    const acts = g.legal().filter((a) => a.type === 'chooseTargets') as Extract<
      Action,
      { type: 'chooseTargets' }
    >[];
    const act =
      next === undefined
        ? acts.find((a) => a.targets.length === picked)
        : acts.find(
            (a) =>
              a.targets.length === picked + 1 &&
              (a.targets[picked] as { object: { id: string } }).object?.id === next,
          );
    expect(act, `no way to pick ${next}`).toBeDefined();
    g.do(act!);
  }
}

export const food = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => tokens(g, 'food-token', p);
export const rats = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => tokens(g, WOE_RAT, p);
export const roles = (g: GameDriver, host: string) =>
  g.state.battlefield.filter(
    (id) => g.obj(id).attachedTo === host && g.obj(id).defId === ROLE_WICKED,
  );

/** Puts a card that is in a graveyard into its owner's exile instead (the scenario builder has no exile zone). */
export function exileFromGraveyard(g: GameDriver, p: 'p1' | 'p2', defId: string): string {
  const id = g.id(p, defId, 'graveyard');
  const ps = g.state.players[p];
  ps.graveyard = ps.graveyard.filter((x) => x !== id);
  ps.exile.push(id);
  g.obj(id).zone = 'exile';
  return id;
}

/** Takes a permanent off the battlefield into its owner's graveyard behind the engine's back (a target that became illegal). */
export function removeFromBattlefield(g: GameDriver, id: string): void {
  const o = g.obj(id);
  g.state.battlefield = g.state.battlefield.filter((x) => x !== id);
  g.state.players[o.owner].graveyard.push(id);
  o.zone = 'graveyard';
  o.zcc++;
}

/** Answers the mode choice of a "choose one" triggered ability that is going on the stack. */
export function chooseMode(g: GameDriver, mode: number): GameDriver {
  expect(g.decision.kind).toBe('chooseTriggerTargets');
  const act = g
    .legal()
    .find((a) => a.type === 'chooseTargets' && a.mode === mode && a.targets.length === 0);
  expect(act, `no mode ${mode}`).toBeDefined();
  return g.do(act!);
}
