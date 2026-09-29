import { creaturesOnBattlefield, toughness } from './characteristics.ts';
import { type Ctx, emit, moveObject } from './context.ts';
import type { ObjectId } from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * Performs state-based actions (rule 704) until none apply. All applicable
 * SBAs are performed simultaneously in each pass.
 */
export function runSBAs(ctx: Ctx): void {
  for (;;) {
    let changed = false;
    for (const p of PLAYERS) {
      const ps = ctx.s.players[p];
      if (!ps.lost && (ps.life <= 0 || ps.drewFromEmptyLibrary)) {
        ps.lost = true;
        changed = true;
      }
    }
    const dying: ObjectId[] = [];
    for (const c of creaturesOnBattlefield(ctx)) {
      const t = toughness(ctx, c.id);
      if (t <= 0 || c.damage >= t || (c.damage > 0 && c.damagedByDeathtouch)) dying.push(c.id);
    }
    for (const id of dying) moveObject(ctx, id, 'graveyard');
    if (dying.length) changed = true;
    if (!changed) return;
  }
}

/** Ends the game if a player has lost. Returns true if the game is over. */
export function checkGameOver(ctx: Ctx): boolean {
  const s = ctx.s;
  if (s.winner) return true;
  const lost = PLAYERS.filter((p) => s.players[p].lost);
  if (lost.length === 0) return false;
  s.winner = lost.length === 2 ? 'draw' : lost[0] === 'p1' ? 'p2' : 'p1';
  s.decision = { kind: 'gameOver' };
  emit(ctx, { type: 'gameOver', winner: s.winner });
  return true;
}
