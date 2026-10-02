import { type Ctx, def, obj } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/**
 * Sagas (Age of Ultron, Kang Dynasty): a lore counter as the Saga enters and
 * at its controller's precombat main phase; each new count triggers that
 * chapter. After the last chapter has left the stack, the Saga is sacrificed
 * (see sagasToSacrifice).
 */
export function addLore(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  const d = def(ctx, id);
  if (!d.saga) return;
  const lore = (o.counters?.lore ?? 0) + 1;
  o.counters = { ...o.counters, lore };
  d.abilities.forEach((a, i) => {
    if (a.kind === 'triggered' && a.trigger.on === 'chapter' && a.trigger.chapters.includes(lore))
      ctx.s.pendingTriggers.push({
        source: { id: o.id, zcc: o.zcc },
        sourceDefId: o.defId,
        abilityIndex: i,
        controller: o.controller,
      });
  });
}

/** The active player's Sagas get a lore counter at their precombat main phase. */
export function addLoreForTurn(ctx: Ctx, player: PlayerId): void {
  for (const id of [...ctx.s.battlefield])
    if (obj(ctx, id).controller === player && def(ctx, id).saga) addLore(ctx, id);
}

/** Sagas past their last chapter with no chapter ability waiting (rule 714.4). */
export function sagasToSacrifice(ctx: Ctx): ObjectId[] {
  const s = ctx.s;
  return s.battlefield.filter((id) => {
    const final = def(ctx, id).saga;
    if (!final || (obj(ctx, id).counters?.lore ?? 0) < final) return false;
    const waiting =
      s.pendingTriggers.some((t) => t.source.id === id) ||
      s.stack.some((x) => x.kind === 'ability' && x.source.id === id);
    return !waiting;
  });
}
