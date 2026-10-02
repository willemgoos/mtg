import { type Ctx, emit, moveObject, obj } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/**
 * The monarch (Wakanda Forever): one player at most. The monarch draws a card
 * at the beginning of their end step, and a player whose creature deals combat
 * damage to the monarch becomes the monarch.
 */
export function setMonarch(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  if (s.monarch === player) return;
  s.monarch = player;
  emit(ctx, { type: 'monarchChanged', player });
  // Palace Jailer: "until an opponent becomes the monarch".
  const freed: ObjectId[] = [];
  for (const id in s.objects) {
    const o = s.objects[id]!;
    if (o.zone === 'exile' && o.jailedBy && o.jailedBy !== player) freed.push(id);
  }
  for (const id of freed) {
    delete obj(ctx, id).jailedBy;
    moveObject(ctx, id, 'battlefield');
  }
}
