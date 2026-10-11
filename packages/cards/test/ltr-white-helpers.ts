import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { settle } from './blb-helpers.ts';
import { on } from './hob-white-helpers.ts';

/** Helpers for the Lord of the Rings 21b white and colorless tests. */

export type Game = GameDriver;

export const tokensOf = (g: Game, defId: string, p: 'p1' | 'p2' = 'p1') => on(g, defId, p);
export const subtypes = (g: Game, id: string) => getCharacteristics(g.state, cardDb, id).subtypes;
export const ringOf = (g: Game, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring;

/** Passes (answering triggers) until the declare attackers decision, then attacks with these creatures. */
export function attack(g: Game, attackers: string[]): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'chooseTriggerTargets') settle(g);
    else g.pass();
  }
  for (const attacker of attackers)
    g.do({
      type: 'addAttacker',
      player: g.actor,
      attacker,
      defender: g.actor === 'p1' ? 'p2' : 'p1',
    });
  g.do({ type: 'confirmAttackers', player: g.actor });
}

/** Activates the ability (the first legal way: with these target objects, if given). */
export function use(g: Game, source: string, abilityIndex: number, targets: string[] = []): void {
  const a = g.legal().find(
    (x) =>
      x.type === 'activateAbility' &&
      x.source === source &&
      x.abilityIndex === abilityIndex &&
      targets.every((t, i) => {
        const c = x.targets[i];
        return !!c && 'object' in c && c.object.id === t;
      }),
  );
  if (!a) throw new Error(`No legal activation of ability ${abilityIndex}`);
  g.do(a);
}

/** Can the ability be activated now? */
export const canUse = (g: Game, source: string, abilityIndex: number): boolean =>
  g
    .legal()
    .some(
      (x) => x.type === 'activateAbility' && x.source === source && x.abilityIndex === abilityIndex,
    );

/** Passes until the defending player declares blockers. */
export function toBlockers(g: Game): void {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
}

/** Resolves the stack; each trigger gets the target object `pick` if it can (otherwise its first target). */
export function settleOn(g: Game, pick: string): void {
  settle(g, (legal) =>
    legal.find(
      (a) =>
        a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === pick),
    ),
  );
}

/** Passes and settles (choosing `pick` for trigger targets) until nothing is left to do or choose. */
export function resolveAll(g: Game, pick?: string): void {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') {
      if (pick) settleOn(g, pick);
      else settle(g);
    } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else return;
  }
  throw new Error('Did not settle');
}
