import type { Ctx, CustomEffect } from './context.ts';

/** Lorwyn Eclipsed (18b), red: one-offs, as custom effects. */

/** "Next end step": the turn number from which a delayed trigger may fire. */
const nextEndStepTurn = (ctx: Ctx): number =>
  ctx.s.turn.number + (ctx.s.turn.step === 'end' || ctx.s.turn.step === 'cleanup' ? 1 : 0);

export const ECL_RED_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Goliath Daydreamer: the instant or sorcery spell that set off the trigger will be exiled with a dream counter on it
   * instead of going to the graveyard as it resolves (the stack handles it when it finishes resolving).
   */
  eclDreamMark(ctx, es) {
    const spell = es.subject && ctx.s.objects[es.subject.id];
    if (spell?.zone === 'stack') spell.dreamExile = true;
  },
  /**
   * Meek Attack, after the creature card was put onto the battlefield ('chosen'): "That creature gains haste. At the beginning
   * of the next end step, sacrifice that creature." Nothing happens if no card was put onto the battlefield.
   */
  eclMeekAttackFinish(ctx, es) {
    const put = es.chosen && ctx.s.objects[es.chosen.id];
    if (!put || put.zone !== 'battlefield' || put.zcc !== es.chosen!.zcc) return;
    put.grantedKeywords = [...(put.grantedKeywords ?? []), 'haste'];
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id: put.id, zcc: put.zcc },
      effects: [{ kind: 'sacrifice', what: 'subject' }],
      fromTurn: nextEndStepTurn(ctx),
    });
  },
};
