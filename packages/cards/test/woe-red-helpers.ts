import { expect } from 'vitest';
import { type Action, getCharacteristics, type TargetChoice } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';

// Shared helpers for the Wilds of Eldraine red tests.

export type Cast = Extract<Action, { type: 'castSpell' }>;
export type Activate = Extract<Action, { type: 'activateAbility' }>;

export const ids = (g: GameDriver, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);
export const handOf = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
export const gyOf = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
export const exileOf = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
export const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
export const has = (g: GameDriver, id: string, k: string) =>
  [...chars(g, id).keywords].includes(k as never);
export const rats = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => ids(g, 'woe-rat-token', p);
/** The Roles (and other permanents) attached to a creature. */
export const rolesOn = (g: GameDriver, creature: string) =>
  g.state.battlefield
    .filter((id) => g.obj(id).attachedTo === creature)
    .map((id) => g.obj(id).defId);
/** A chooseTargets action that names this object among its targets. */
export const naming = (target: string, mode?: number) => (legal: Action[]) =>
  legal.find(
    (a) =>
      a.type === 'chooseTargets' &&
      (mode === undefined || a.mode === mode) &&
      a.targets.some((t) => 'object' in t && t.object.id === target),
  );

/** Resolves the stack and the choices on the way (the first legal answer unless told otherwise). */
export function resolve(
  g: GameDriver,
  opts: {
    pick?: (legal: Action[]) => Action | undefined;
    accept?: boolean;
    option?: number | RegExp;
  } = {},
): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      g.do(
        opts.pick?.(legal) ??
          legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
          legal[0]!,
      );
    } else if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'scry') g.do(g.legal()[0]!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card))
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? false });
    else break;
  }
  return g;
}

/** Passes priority until the beginning of combat (its triggers are on the stack or waiting for targets). */
export function toCombat(g: GameDriver): void {
  for (let i = 0; i < 20 && g.state.turn.step !== 'beginCombat'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else resolve(g);
  }
  expect(g.state.turn.step).toBe('beginCombat');
}

/** Passes priority until the active player must declare attackers. */
export function toAttackers(g: GameDriver): void {
  for (let i = 0; i < 30 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else resolve(g);
  }
  expect(g.decision.kind).toBe('declareAttackers');
}

/** Attacks with these creatures and gets to the next decision after the attackers are declared. */
export function attackAnd(g: GameDriver, ...attackers: string[]): void {
  toAttackers(g);
  g.attack(...attackers);
  for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else resolve(g);
  }
}

/** Plays on until this turn number begins (declaring no attackers and no blockers). */
export function toTurn(g: GameDriver, turn: number): void {
  for (let i = 0; i < 80 && g.state.turn.number < turn; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else if (g.decision.kind === 'declareAttackers')
      g.do({ type: 'confirmAttackers', player: g.actor });
    else if (g.decision.kind === 'declareBlockers')
      g.do({ type: 'confirmBlockers', player: g.actor });
    else resolve(g);
  }
  expect(g.state.turn.number).toBeGreaterThanOrEqual(turn);
}

/** Plays on to the first main phase of this turn number, with its triggers resolved. */
export function toMain1(g: GameDriver, turn: number): void {
  toTurn(g, turn);
  for (let i = 0; i < 40; i++) {
    if (g.state.turn.step === 'main1' && !g.state.stack.length && g.decision.kind === 'priority')
      break;
    if (g.decision.kind === 'priority') g.pass();
    else resolve(g);
  }
  expect(g.state.turn.step).toBe('main1');
}

export const castAdventure = (g: GameDriver, def: string, targets: TargetChoice[] = []) => {
  const card = g.id(g.actor, def, 'hand');
  const a = g
    .legal()
    .find((x): x is Cast => x.type === 'castSpell' && x.card === card && x.back === true);
  expect(a).toBeDefined();
  return g.do({ ...a!, targets });
};
export const castCreatureFromExile = (g: GameDriver, def: string) => {
  const card = g.id(g.actor, def, 'exile');
  const a = g.legal().find((x): x is Cast => x.type === 'castSpell' && x.card === card && !x.back);
  expect(a).toBeDefined();
  return g.do(a!);
};
export const activations = (g: GameDriver, source: string) =>
  g.legal().filter((a): a is Activate => a.type === 'activateAbility' && a.source === source);
