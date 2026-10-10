import { type Ctx, type CustomEffect, addCounters, moveObject, obj } from './context.ts';
import type { EffectSource, ObjectId } from './types.ts';

/** Tarkir: Dragonstorm (19b, white): one-off effects as custom effects. */

/** The targets of the effect that are still in the graveyard they were chosen in. */
function targetCardsInGraveyard(ctx: Ctx, es: EffectSource): ObjectId[] {
  const out: ObjectId[] = [];
  for (const t of es.targets) {
    if (!t || !('object' in t)) continue;
    const o = ctx.s.objects[t.object.id];
    if (o && o.zone === 'graveyard' && o.zcc === t.object.zcc) out.push(o.id);
  }
  return out;
}

export const TDM_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Smile at Death: "return up to two target creature cards with power 2 or less from your graveyard to the battlefield. Put a
   * +1/+1 counter on each of those creatures."
   */
  tdmSmileAtDeath(ctx, es) {
    const back: ObjectId[] = [];
    for (const id of targetCardsInGraveyard(ctx, es)) {
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
      if (obj(ctx, id).zone === 'battlefield') back.push(id);
    }
    for (const id of back) addCounters(ctx, id, 1);
  },
};
