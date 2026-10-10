import { expect } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, settle } from './blb-helpers.ts';

// Tarkir: Dragonstorm (19b): shared helpers of the green tests.

export const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
export const keywords = (g: GameDriver, id: string) => [...chars(g, id).keywords];
export const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
export const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
export const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].exile.map((id) => g.obj(id).defId);
export const bf = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  all(g, defId).filter((id) => g.obj(id).controller === p);
export const counters = (g: GameDriver, id: string): number => {
  const o = g.obj(id);
  return (o.plusOneCounters ?? 0) + Object.values(o.counters ?? {}).reduce((a, b) => a + b, 0);
};

export interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Answers "you may" (default: yes). */
  accept?: boolean;
  /** Cards (by def id) to take in a search, in order; afterwards the search stops (default: the first card). */
  pick?: string[];
}

/** Resolves the stack and any choices with simple defaults. */
export function done(g: GameDriver, opts: Opts = {}): GameDriver {
  const picks = [...(opts.pick ?? [])];
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
    else if (d.kind === 'searchLibrary') {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card) as Extract<
        Action,
        { type: 'chooseCard' }
      >[];
      if (opts.pick) {
        const want = picks.shift();
        const found = want ? cards.find((a) => g.obj(a.card!).defId === want) : undefined;
        g.do(found ?? { type: 'chooseCard', player: d.player, card: null });
      } else g.do(cards[0] ?? { type: 'chooseCard', player: d.player, card: null });
    } else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? true });
    else break;
  }
  return g;
}

/** The castSpell actions available for a card in hand. */
export const casts = (g: GameDriver, defId: string, player: 'p1' | 'p2' = 'p1') => {
  const card = g.id(player, defId, 'hand');
  return g.legal(player).filter((a) => a.type === 'castSpell' && a.card === card) as Extract<
    Action,
    { type: 'castSpell' }
  >[];
};

/** Index of the nth ability of a kind on a card definition. */
export const abilityIndex = (defId: string, kind: string, nth = 0): number => {
  const abilities = cardDb.get(defId)!.abilities;
  let seen = 0;
  for (let i = 0; i < abilities.length; i++)
    if (abilities[i]!.kind === kind && seen++ === nth) return i;
  throw new Error(`No ${kind} #${nth} on ${defId}`);
};

/** Activates an ability: the legal action for this source and ability index (and, if given, these targets). */
export const activate = (g: GameDriver, source: string, index: number, targets: unknown[] = []) => {
  const want = JSON.stringify(targets);
  const act = g
    .legal()
    .find(
      (a) =>
        a.type === 'activateAbility' &&
        a.source === source &&
        a.abilityIndex === index &&
        (targets.length === 0 || JSON.stringify(a.targets) === want),
    );
  if (!act) throw new Error(`No legal activation of ability ${index} of ${source}`);
  return g.do(act);
};

/** Passes priority until it is `step` of the current turn (declaring no attackers or blockers). */
export function toStep(g: GameDriver, step: string): GameDriver {
  for (let i = 0; i < 80; i++) {
    if (g.state.turn.step === step && g.decision.kind === 'priority' && !g.state.stack.length)
      return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g);
  }
  throw new Error(`never reached ${step}`);
}

export const expectPool = (name: string, slugs: string[]) => {
  for (const s of slugs) expect(cardDb.get(s), `${name}: ${s}`).toBeDefined();
};
