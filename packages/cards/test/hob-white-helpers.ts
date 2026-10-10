import { type Action, getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { all, settle } from './blb-helpers.ts';

/** Helpers for the Hobbit white tests. */

export const keywords = (g: GameDriver, id: string) => [
  ...getCharacteristics(g.state, cardDb, id).keywords,
];
export const types = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id).types;
export const names = (
  g: GameDriver,
  p: 'p1' | 'p2',
  zone: 'hand' | 'graveyard' | 'exile' | 'library',
) => g.state.players[p][zone].map((id) => g.obj(id).defId);
export const on = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  all(g, defId).filter((id) => !p || g.obj(id).controller === p);

/** Resolves the stack and any choices with simple defaults (first option / first card / yes). */
export function done(
  g: GameDriver,
  opts: { option?: number | RegExp; card?: string } = {},
): GameDriver {
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
    } else if (d.kind === 'discard') {
      const picks = g.legal().filter((a) => a.type === 'discard');
      g.do(
        (opts.card
          ? picks.find((a) => a.type === 'discard' && g.obj(a.card).defId === opts.card)
          : undefined) ?? picks[0]!,
      );
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card)) {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
      g.do(
        (opts.card
          ? cards.find((a) => a.type === 'chooseCard' && g.obj(a.card!).defId === opts.card)
          : undefined) ?? cards[0]!,
      );
    } else if (g.legal().some((a) => a.type === 'chooseCard'))
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: true });
    else break;
  }
  return g;
}

/** The legal actions for casting `defId` from the hand. */
export const casts = (g: GameDriver, defId: string): Action[] =>
  g
    .legal()
    .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === defId && a.player === g.actor);

export const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: object[] = [],
) => g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets } as never);

export const obj = (g: GameDriver, id: string) => g.ref(id);

/** Passes (resolving triggers and choices) until the step, for the player's turn if given. */
export function toStep(g: GameDriver, step: string, player?: 'p1' | 'p2'): GameDriver {
  for (let i = 0; i < 200; i++) {
    const d = g.decision;
    if (
      g.state.turn.step === step &&
      d.kind === 'priority' &&
      (!player || g.state.turn.activePlayer === player)
    )
      return g;
    if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else if (g.legal().length) done(g);
    else throw new Error(`Stuck at ${d.kind}`);
  }
  throw new Error(`Never reached ${step}`);
}
