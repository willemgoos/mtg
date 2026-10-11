import { getCharacteristics } from '@mtg/engine';
import { cardDb } from '../src/index.ts';
import { done } from './hob-white-helpers.ts';
import type { Game } from './ltr-white-helpers.ts';

/** Helpers for the Lord of the Rings 21d white and blue rare tests. */

export const chars = (g: Game, id: string) => getCharacteristics(g.state, cardDb, id);
export const life = (g: Game, p: 'p1' | 'p2') => g.state.players[p].life;
export const handOf = (g: Game, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].hand.map((id) => g.obj(id).defId);
export const graveyardOf = (g: Game, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);
export const objRef = (g: Game, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });

/** Answers a scry by keeping every card on top. */
export function keepScry(g: Game): void {
  const d = g.decision;
  if (d.kind !== 'scry') throw new Error(`Expected a scry, got ${d.kind}`);
  g.do({ type: 'scry', player: d.player, top: [...d.cards], bottom: [] });
}

/** Passes while there is something on the stack and priority comes back. */
export function settleStack(g: Game): void {
  for (let i = 0; i < 20 && g.decision.kind === 'priority' && g.state.stack.length; i++) g.pass();
}

/** Answers a library search with the first of these cards that can be found (otherwise the first card). */
export function pickCard(g: Game, ...defIds: string[]): void {
  const legal = g.legal();
  for (const defId of defIds) {
    const a = legal.find((x) => x.type === 'chooseCard' && x.card && g.obj(x.card).defId === defId);
    if (a) return void g.do(a);
  }
  g.do(legal.find((x) => x.type === 'chooseCard')!);
}

/** Passes (taking default choices) until it is `player`'s first main phase on a later turn. */
export function toTurnOf(g: Game, player: 'p1' | 'p2', search: string[] = []): void {
  const start = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    if (
      g.state.turn.number > start &&
      g.state.turn.activePlayer === player &&
      g.state.turn.step === 'main1' &&
      g.decision.kind === 'priority' &&
      !g.state.stack.length
    )
      return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (d.kind === 'searchLibrary') pickCard(g, ...search);
    else if (d.kind === 'chooseTriggerTargets') {
      // As many targets as possible.
      const picks = g.legal().filter((a) => a.type === 'chooseTargets');
      picks.sort((a, b) => (b as { targets: unknown[] }).targets.length - (a as { targets: unknown[] }).targets.length);
      g.do(picks[0]!);
    } else done(g);
  }
  throw new Error('never reached the turn');
}

/** Passes until this step of the current turn (priority, empty stack). */
export function toStepNow(g: Game, step: string): void {
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
