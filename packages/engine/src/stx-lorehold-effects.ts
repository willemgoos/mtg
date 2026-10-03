import { toughness } from './characteristics.ts';
import { type Ctx, type CustomEffect, obj } from './context.ts';
import { damageSourceFor, dealDamage } from './effects.ts';

/** Strixhaven (13a): Lorehold one-offs, as custom effects. */

export const LOREHOLD_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Pigment Storm: 5 damage to target creature; the excess (beyond lethal,
   * counting damage already marked) is dealt to that creature's controller instead.
   */
  pigmentStorm(ctx: Ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const id = t.object.id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    const src = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
    const lethal = Math.max(0, toughness(ctx, id) - obj(ctx, id).damage);
    const excess = Math.max(0, 5 - lethal);
    const controller = o.controller;
    dealDamage(ctx, src, t, 5 - excess, false);
    if (excess > 0) dealDamage(ctx, src, { player: controller }, excess, false);
  },
};
