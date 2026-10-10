import { hasSubtype } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, moveObject, obj } from './context.ts';
import { runEffect } from './effects.ts';
import type { EffectSource, ObjectId } from './types.ts';

/**
 * The Hobbit (20b, colorless): the one-offs of the artifacts and lands. The Black Arrow and Gleam of Death are custom effects; the
 * rest of the group uses the ordinary vocabulary (plus the small hooks marked "The Hobbit (20b colorless)" in the shared files).
 */

/** The battlefield object the target slot `n` names, if it is still the same object. */
function targetOnBattlefield(ctx: Ctx, es: EffectSource, n: number): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : undefined;
}

export const HOB_COLORLESS_EFFECTS: Record<string, CustomEffect> = {
  /**
   * The Black Arrow: "It deals 1 damage to any target. If a Dragon is dealt damage this way, destroy it." The damage must actually
   * be dealt (prevented damage or protection means no destruction).
   */
  hobBlackArrow(ctx, es) {
    const id = targetOnBattlefield(ctx, es, 0);
    const before = id ? obj(ctx, id).damage : 0;
    runEffect(ctx, es, { kind: 'damage', amount: 1, to: { target: 0 } });
    if (!id) return;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || o.damage <= before) return;
    if (!def(ctx, id).types.includes('Creature') || !hasSubtype(ctx, id, 'Dragon')) return;
    runEffect(ctx, es, { kind: 'destroy', what: { target: 0 } });
  },

  /** Gleam of Death: "Mill six cards, then put all instant and sorcery cards from among them into your hand." */
  hobGleamOfDeath(ctx, es) {
    const library = ctx.s.players[es.controller].library;
    const milled = library.slice(0, 6);
    for (const id of milled) moveObject(ctx, id, 'graveyard');
    for (const id of milled) {
      const o = ctx.s.objects[id];
      if (!o || o.zone !== 'graveyard') continue;
      const types = def(ctx, id).types;
      if (types.includes('Instant') || types.includes('Sorcery')) moveObject(ctx, id, 'hand');
    }
  },
};
