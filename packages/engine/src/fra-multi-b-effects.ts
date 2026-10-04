import { type CustomEffect, def, moveObject } from './context.ts';
import { manaValue } from './cost.ts';

/** Reality Fracture (17a, multi-b): one-off effects as custom effects. */
export const FRA_MULTI_B_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Vindictive Triumph: exile the target creature or planeswalker. If its mana value was 3 or less, return it
   * to the battlefield tapped under your control, and exile it at the beginning of the next end step.
   * (A token that is exiled ceases to exist, so it can't return.)
   */
  vindictiveTriumph(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    const value = manaValue(def(ctx, o.id).manaCost);
    const token = o.isToken;
    moveObject(ctx, o.id, 'exile');
    if (token || value > 3 || ctx.s.objects[o.id]?.zone !== 'exile') return;
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
    const back = ctx.s.objects[o.id];
    if (!back || back.zone !== 'battlefield') return;
    back.tapped = true;
    const step = ctx.s.turn.step;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id: back.id, zcc: back.zcc },
      effects: [{ kind: 'exile', what: 'subject' }],
      fromTurn: ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0),
    });
  },
};
