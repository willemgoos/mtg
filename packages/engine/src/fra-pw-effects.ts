import { type Ctx, type CustomEffect, addCounters, def, obj } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/**
 * Reality Fracture (17c): the planeswalker core. The Jace token, Empower Jace (the `empowerJace` effect, run by `runEffects`
 * and `runEffect` in effects.ts) and the custom effect that puts its counters on the Jace token its controller chose.
 */

/** The card id of the Jace planeswalker token (defined in packages/cards/src/fra/tokens.ts). */
export const JACE_TOKEN = 'fra-jace-token';

/** The Jace planeswalker tokens `player` controls (a nontoken Jace never counts for Empower Jace, rule from the rulings). */
export function jaceTokens(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    if (o.controller !== player || !o.isToken) return false;
    const d = def(ctx, id);
    return d.types.includes('Planeswalker') && d.subtypes.includes('Jace');
  });
}

/** Does this permanent have a static ability of this kind (printed, or granted by `planeswalkersHave`)? */
export function permanentHasStatic(ctx: Ctx, id: ObjectId, kind: string): boolean {
  return def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind);
}

export const FRA_PW_EFFECTS: Record<string, CustomEffect> = {
  /** Empower Jace: the loyalty counters go on the Jace token its controller chose (`es.chosen`). */
  putLoyaltyOnChosen(ctx, es, params) {
    const o = es.chosen && ctx.s.objects[es.chosen.id];
    const n = (params as { amount: number }).amount;
    if (!o || o.zone !== 'battlefield' || o.zcc !== es.chosen!.zcc || n <= 0) return;
    addCounters(ctx, o.id, n, 'loyalty');
  },
};
