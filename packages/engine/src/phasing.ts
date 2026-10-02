import { type Ctx, emit, obj, removeFromCombat } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/**
 * Phasing (Vision): a phased-out permanent is treated as though it doesn't
 * exist until its controller's next untap step. It leaves the battlefield list
 * without changing zones, so it keeps its counters, attachments and identity.
 * Whatever is attached to it phases out with it.
 */
export function phaseOut(ctx: Ctx, ids: readonly ObjectId[]): void {
  const s = ctx.s;
  const all = [...ids];
  for (const id of ids)
    for (const other of s.battlefield) if (obj(ctx, other).attachedTo === id) all.push(other);
  for (const id of all) {
    const i = s.battlefield.indexOf(id);
    if (i < 0) continue;
    s.battlefield.splice(i, 1);
    removeFromCombat(ctx, id);
    (s.phasedOut ??= []).push({ id, player: obj(ctx, id).controller });
    emit(ctx, { type: 'phased', id, in: false });
  }
}

/** At `player`'s untap step, their phased-out permanents phase back in. */
export function phaseIn(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  if (!s.phasedOut?.length) return;
  const back = s.phasedOut.filter((p) => p.player === player);
  s.phasedOut = s.phasedOut.filter((p) => p.player !== player);
  for (const { id } of back) {
    if (s.objects[id]?.zone !== 'battlefield') continue;
    s.battlefield.push(id);
    emit(ctx, { type: 'phased', id, in: true });
  }
}
