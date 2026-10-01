import { type Action, createEngine, getCharacteristics, type TargetChoice } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';

/** Shared helpers for the Bloomburrow tests. */

export const engine = createEngine(cardDb);
export const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
export const n = (card: string, count: number) => Array<string>(count).fill(card);
export const pt = (g: GameDriver, id: string) => {
  const c = getCharacteristics(g.state, cardDb, id);
  return [c.power, c.toughness];
};
export const cast = (
  g: GameDriver,
  defId: string,
  targets: TargetChoice[] = [],
  extra: Partial<Extract<Action, { type: 'castSpell' }>> = {},
) => {
  const player = g.actor;
  return g.do({ type: 'castSpell', player, card: g.id(player, defId, 'hand'), targets, ...extra });
};
export const all = (g: GameDriver, defId: string) =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId);
export const handSize = (g: GameDriver, p: 'p1' | 'p2') => g.state.players[p].hand.length;

/** Resolves the stack, giving each trigger its first real target (or `pick`'s). */
export function settle(g: GameDriver, pick?: (legal: Action[]) => Action | undefined): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      g.do(
        pick?.(legal) ??
          legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ??
          legal[0]!,
      );
      continue;
    }
    if (d.kind === 'priority' && g.state.stack.length) {
      g.pass();
      continue;
    }
    return g;
  }
  throw new Error('Stack did not settle');
}
