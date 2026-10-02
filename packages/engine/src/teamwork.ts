import { power } from './characteristics.ts';
import { type Ctx, def, emit, obj, tap } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/**
 * Teamwork N (Marvel Super Heroes): as an optional additional cost, tap any
 * number of untapped creatures you control with total power N or more. Modelled
 * as a kicker whose cost is the tapping.
 */

/** Untapped creatures `player` controls that could be tapped for teamwork. */
function untappedCreatures(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    return o.controller === player && !o.tapped && def(ctx, id).types.includes('Creature');
  });
}

/** Whether `ids` is a legal teamwork payment: distinct untapped creatures of yours, power N or more. */
export function teamworkValid(
  ctx: Ctx,
  player: PlayerId,
  n: number,
  ids: readonly ObjectId[],
): boolean {
  const able = new Set(untappedCreatures(ctx, player));
  if (new Set(ids).size !== ids.length || !ids.every((id) => able.has(id))) return false;
  return ids.reduce((sum, id) => sum + Math.max(0, power(ctx, id)), 0) >= n;
}

/**
 * The creatures the engine taps when no choice was given (bots, free casts):
 * ones that want tapping first (Agent Maria Hill), then summoning-sick ones,
 * then the rest; the biggest first so as few as possible are tapped. Null if
 * the total power isn't enough.
 */
export function defaultTeamwork(
  ctx: Ctx,
  player: PlayerId,
  n: number,
  avoid: readonly ObjectId[] = [],
): ObjectId[] | null {
  const rank = (id: ObjectId) =>
    def(ctx, id).abilities.some(
      (a) => a.kind === 'triggered' && a.trigger.on === 'tappedForTeamwork',
    )
      ? 0
      : obj(ctx, id).summoningSick
        ? 1
        : 2;
  const pool = untappedCreatures(ctx, player)
    .filter((id) => !avoid.includes(id) && power(ctx, id) > 0)
    .sort((a, b) => rank(a) - rank(b) || power(ctx, b) - power(ctx, a));
  const out: ObjectId[] = [];
  let sum = 0;
  for (const id of pool) {
    if (sum >= n) break;
    out.push(id);
    sum += power(ctx, id);
  }
  return sum >= n ? out : null;
}

/** Taps the creatures (each one "becomes tapped to pay a teamwork cost"). */
export function payTeamwork(ctx: Ctx, ids: readonly ObjectId[]): void {
  for (const id of ids) {
    tap(ctx, id);
    emit(ctx, { type: 'tappedForTeamwork', id });
  }
}
