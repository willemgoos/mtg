import { type CardDb, createRng, getCharacteristics, nextInt, type RngState } from '@mtg/engine';
import { createHeuristicBot } from './heuristic.ts';
import type { Bot } from './view.ts';

export interface EasyOptions {
  seed: number;
  /** Chance to hold back a spell it could cast on its own turn. */
  holdChance?: number;
  /** Chance to skip attacking in a combat. */
  skipAttackChance?: number;
  /** Chance to skip blocking when the attack isn't lethal. */
  skipBlockChance?: number;
  /** Chance to forget its land drop for a turn. */
  skipLandChance?: number;
  /** Whether it may act at instant speed (counters, tricks on your turn). */
  respond?: boolean;
}

/**
 * Six steps from a very forgiving opponent up to one just below the heuristic
 * bot, for the expedition's floors. Level 4 is roughly the Novice.
 */
export const EASY_LEVELS: readonly Omit<EasyOptions, 'seed'>[] = [
  { holdChance: 0.5, skipAttackChance: 0.6, skipBlockChance: 0.8, skipLandChance: 0.25 },
  { holdChance: 0.4, skipAttackChance: 0.5, skipBlockChance: 0.7, skipLandChance: 0.15 },
  { holdChance: 0.3, skipAttackChance: 0.4, skipBlockChance: 0.55, skipLandChance: 0.08 },
  { holdChance: 0.2, skipAttackChance: 0.3, skipBlockChance: 0.4 },
  { holdChance: 0.12, skipAttackChance: 0.2, skipBlockChance: 0.25, respond: true },
  { holdChance: 0.06, skipAttackChance: 0.1, skipBlockChance: 0.12, respond: true },
];

/**
 * A beginner opponent: the heuristic bot with deliberate mistakes. Unless
 * `respond` is set it never acts at instant speed (no counters or combat
 * tricks on your turn); it sometimes holds spells, skips attacks, forgets a
 * land and doesn't block, but still blocks when an attack would kill it.
 */
export function createEasyBot(db: CardDb, opts: EasyOptions): Bot {
  const inner = createHeuristicBot(db, 'easy');
  const rng: RngState = createRng(opts.seed);
  const roll = (p: number) => nextInt(rng, 1000) < p * 1000;
  const hold = opts.holdChance ?? 0.25;
  const skipAttack = opts.skipAttackChance ?? 0.35;
  const skipBlock = opts.skipBlockChance ?? 0.5;
  const skipLand = opts.skipLandChance ?? 0;
  // One decision per combat, so it doesn't half-declare attacks.
  const combatChoice = new Map<string, boolean>();
  const decideOnce = (key: string, p: number) => {
    if (!combatChoice.has(key)) combatChoice.set(key, roll(p));
    return combatChoice.get(key)!;
  };

  return {
    name: 'easy',
    chooseAction(view, me) {
      const d = view.decision;
      const pass = { type: 'passPriority', player: me } as const;
      const combatKey = `${view.turn.number}:${view.turn.attackers.length}`;

      if (d.kind === 'priority') {
        const mine = view.turn.activePlayer === me;
        // No instant-speed interaction on the opponent's turn or in response to spells.
        if (!opts.respond && (!mine || view.stack.length > 0)) return pass;
        const a = inner.chooseAction(view, me);
        if (a.type === 'castSpell' && mine && roll(hold)) return pass;
        if (a.type === 'playLand' && decideOnce(`land:${view.turn.number}`, skipLand)) return pass;
        return a;
      }
      if (d.kind === 'declareAttackers' && d.declared.length === 0) {
        if (decideOnce(`atk:${combatKey}`, skipAttack))
          return { type: 'confirmAttackers', player: me };
      }
      if (d.kind === 'declareBlockers' && d.declared.length === 0) {
        const incoming = (view.combat?.attackers ?? []).reduce(
          (n, a) => n + Math.max(0, getCharacteristics(view, db, a.id).power),
          0,
        );
        const lethal = incoming >= view.players[me].life;
        if (!lethal && decideOnce(`blk:${combatKey}`, skipBlock))
          return { type: 'confirmBlockers', player: me };
      }
      return inner.chooseAction(view, me);
    },
  };
}
