import { expect } from 'vitest';
import { getCharacteristics, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, settle } from './blb-helpers.ts';

// Shared helpers for the Lorwyn Eclipsed red tests.

export const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
export const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
export const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
export const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
export const minus = (g: GameDriver, id: string) => g.obj(id).counters?.['-1/-1'] ?? 0;
export const tokens = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) => g.obj(id).defId === defId && g.obj(id).controller === p && g.obj(id).isToken,
  );

export interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  accept?: boolean;
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
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

export const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Parameters<typeof cast>[2] = [],
  extra: object = {},
) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex,
    targets,
    ...extra,
  } as never);

/** The legal activations of a source's ability. */
export const activations = (g: GameDriver, source: string, abilityIndex?: number) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'activateAbility' }> =>
        a.type === 'activateAbility' &&
        a.source === source &&
        (abilityIndex === undefined || a.abilityIndex === abilityIndex),
    );

/** Passes priority until it is `step` of `who`'s turn (after the turn we're in). */
export function passTo(g: GameDriver, step: string, who: 'p1' | 'p2' = 'p1'): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 200; i++) {
    const t = g.state.turn;
    if (t.number > start && t.step === step && t.activePlayer === who) return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority to the end step of this turn. */
export function toEndStep(g: GameDriver): void {
  for (let i = 0; i < 40 && g.state.turn.step !== 'end'; i++) {
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  expect(g.state.turn.step).toBe('end');
}

/** The legal casts of a card in hand. */
export const casts = (g: GameDriver, defId: string): Extract<Action, { type: 'castSpell' }>[] =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && a.card === g.id(g.actor, defId, 'hand'),
    );

/** The legal casts of a card in hand aimed at this object. */
export const castsAt = (g: GameDriver, defId: string, target: string) =>
  casts(g, defId).filter((a) => a.targets.some((x) => 'object' in x && x.object.id === target));
