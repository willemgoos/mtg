import { type Action, createEngine, getCharacteristics } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';

/** Shared helpers for the Lorwyn Eclipsed (18b) colorless, transform and Incarnation tests. */

export const engine = createEngine(cardDb);
export const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
export const n = (card: string, count: number) => Array<string>(count).fill(card);
export const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
export const pt = (g: GameDriver, id: string) => {
  const c = chars(g, id);
  return [c.power, c.toughness];
};
export const names = (g: GameDriver, ids: string[]) => ids.map((id) => g.obj(id).defId);
export const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => names(g, g.state.players[p].hand);
export const gy = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => names(g, g.state.players[p].graveyard);
export const exile = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => names(g, g.state.players[p].exile);
export const board = (g: GameDriver, defId: string, p?: 'p1' | 'p2') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && (!p || g.obj(id).controller === p));

/** The cast actions for a card in hand. */
export const casts = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.legal(p).filter((a) => a.type === 'castSpell' && a.card === g.id(p, defId, 'hand')) as Extract<
    Action,
    { type: 'castSpell' }
  >[];

export interface Opts {
  /** Answers a chooseOption: an index, or a label pattern (default: the first). */
  option?: number | RegExp;
  /** Answers "you may" prompts (default: yes). */
  accept?: boolean;
  /** Picks a trigger target: a player or an object (default: the first legal choice). */
  target?: (a: Extract<Action, { type: 'chooseTargets' }>) => boolean;
  /** Picks a card for a chooseCard: a predicate on the object id (default: the first). */
  card?: (id: string) => boolean;
}

/** Resolves the stack and any choices with simple defaults. */
export function done(g: GameDriver, opts: Opts = {}): GameDriver {
  for (let i = 0; i < 120; i++) {
    const d = g.decision;
    if (d.kind === 'gameOver') break;
    if (d.kind === 'chooseOption') {
      const index =
        opts.option instanceof RegExp
          ? Math.max(
              0,
              d.options.findIndex((o) => (opts.option as RegExp).test(o.label)),
            )
          : (opts.option ?? 0);
      g.do({ type: 'chooseOption', player: d.player, index });
    } else if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      const picks = legal.filter((a) => a.type === 'chooseTargets') as Extract<
        Action,
        { type: 'chooseTargets' }
      >[];
      g.do(
        (opts.target ? picks.find(opts.target) : undefined) ??
          picks.find((a) => a.targets.length > 0) ??
          legal[0]!,
      );
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'priority') break;
    else if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry')!);
    else if (d.kind === 'discard') g.do(g.legal().find((a) => a.type === 'discard')!);
    else if (g.legal().some((a) => a.type === 'chooseEffect'))
      g.do({ type: 'chooseEffect', player: g.actor, accept: opts.accept ?? true });
    else if (g.legal().some((a) => a.type === 'chooseCard' && a.card)) {
      const cards = g.legal().filter((a) => a.type === 'chooseCard' && a.card) as Extract<
        Action,
        { type: 'chooseCard' }
      >[];
      g.do((opts.card ? cards.find((a) => opts.card!(a.card!)) : undefined) ?? cards[0]!);
    } else break;
  }
  return g;
}

export const activate = (
  g: GameDriver,
  source: string,
  abilityIndex: number,
  targets: Extract<Action, { type: 'castSpell' }>['targets'] = [],
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

/** The activate actions for an ability. */
export const abilityActions = (g: GameDriver, source: string, abilityIndex: number) =>
  g
    .legal()
    .filter(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === abilityIndex,
    );

/** Passes priority until it is `step` of `player`'s turn (on this turn if not past it, else a later one). */
export function passTo(g: GameDriver, step: string, player: 'p1' | 'p2' = 'p1', opts: Opts = {}) {
  for (let i = 0; i < 300; i++) {
    const t = g.state.turn;
    if (t.step === step && t.activePlayer === player && g.decision.kind === 'priority') return;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else done(g, opts);
  }
  throw new Error(`never reached ${step}`);
}

/** Passes priority while the stack is not empty, stopping at the first decision that isn't priority (a choice, a target). */
export function stop(g: GameDriver): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else break;
  }
  return g;
}

/** Answers the current chooseOption with the option whose label matches. */
export function choose(g: GameDriver, label: RegExp): GameDriver {
  const d = g.decision;
  if (d.kind !== 'chooseOption') throw new Error(`Expected a chooseOption, got ${d.kind}`);
  const index = d.options.findIndex((o) => label.test(o.label));
  if (index < 0) throw new Error(`No option ${label}: ${d.options.map((o) => o.label).join(', ')}`);
  return g.do({ type: 'chooseOption', player: d.player, index });
}

/** The labels of the current chooseOption. */
export function labels(g: GameDriver): string[] {
  const d = g.decision;
  return d.kind === 'chooseOption' ? d.options.map((o) => o.label) : [];
}
