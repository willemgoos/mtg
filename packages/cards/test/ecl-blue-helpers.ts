import { expect } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { hasSubtype } from '../../engine/src/characteristics.ts';
import { makeCtx } from '../../engine/src/context.ts';
import { cardDb } from '../src/index.ts';
import { cast, game, settle } from './blb-helpers.ts';

/** Shared helpers for the Lorwyn Eclipsed blue tests (18b). */

export const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
export const keywords = (g: GameDriver, id: string) => chars(g, id).keywords;
export const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
export const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
export const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
export const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
export const stun = (g: GameDriver, id: string) => g.obj(id).counters?.stun ?? 0;
export const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;
export const onStack = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
export const tappedLands = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) =>
      g.obj(id).controller === p &&
      g.obj(id).tapped &&
      /^(island|plains|forest|swamp|mountain)$/.test(g.obj(id).defId),
  ).length;

export interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
  pick?: (legal: Action[]) => Action | undefined;
}

/** Resolves the stack and any choices with simple defaults. */
export function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g, opts.pick);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'scry'))
      g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({
        type: 'chooseEffect',
        player: g.actor,
        accept: !!opts.accept && g.legal().some((a) => a.type === 'chooseEffect' && a.accept),
      });
    else break;
  }
  return g;
}

/** Activates an ability (the engine's own action, with the right extra fields). */
export const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
) => {
  const want = JSON.stringify(targets);
  const action = g
    .legal()
    .find(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === source &&
        a.abilityIndex === abilityIndex &&
        JSON.stringify(a.targets) === want,
    );
  if (!action) throw new Error(`no legal activation of ability ${abilityIndex}`);
  return g.do(action);
};

/** Picks the trigger-target action that targets this object. */
export const targeting = (id: string) => (legal: Action[]) =>
  legal.find(
    (a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === id),
  );

/** Passes priority (taking default choices) until `step` of the current turn. */
export function toStep(g: GameDriver, step: string): void {
  for (let i = 0; i < 80; i++) {
    if (g.decision.kind === 'gameOver') return;
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** p1's declare attackers decision with these creatures (untapped, able to attack). */
export const combat = (p1: string[], p2: string[] = [], lib?: string[]) => {
  const g = game({
    p1: { battlefield: p1, ...(lib ? { library: lib } : {}) },
    p2: { battlefield: p2 },
  });
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareAttackers');
  return g;
};

/** Does this permanent have this creature type (changelings and gained types count)? */
export const hasType = (g: GameDriver, id: string, subtype: string) =>
  hasSubtype(makeCtx(g.state, cardDb), id, subtype);

/** Passes priority (taking default choices) until the next turn's first main phase. */
export function nextTurn(g: GameDriver): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 120; i++) {
    if (
      g.state.turn.number > start &&
      g.state.turn.step === 'main1' &&
      g.decision.kind === 'priority'
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error('never reached the next turn');
}

/** Passes priority until p1's declare attackers decision. */
export function toAttackers(g: GameDriver): GameDriver {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  expect(g.decision.kind).toBe('declareAttackers');
  return g;
}
