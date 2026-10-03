import type { CustomEffect } from './context.ts';

/** Secrets of Strixhaven (14a): one-offs, as custom effects. */

export const SOS_14A_EFFECTS: Record<string, CustomEffect> = {
  /** Paradigm: the free copy wasn't cast (declined or no legal cast): it ceases to exist. */
  paradigmCleanup(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || !o.spellCopyCard || o.zone !== 'exile') return;
    const list = ctx.s.players[o.owner].exile;
    const i = list.indexOf(o.id);
    if (i >= 0) list.splice(i, 1);
    delete ctx.s.objects[o.id];
  },
};
