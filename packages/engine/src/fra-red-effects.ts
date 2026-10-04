import type { CustomEffect } from './context.ts';

/** Reality Fracture (17a), red: one-offs, as custom effects. */

export const FRA_RED_EFFECTS: Record<string, CustomEffect> = {
  /** Pyre Rhymer, Molten Tide: until end of turn, whenever you tap a Mountain for mana, add an additional {R}. */
  moltenTide(ctx, es) {
    ctx.s.turn.moltenTide = [...(ctx.s.turn.moltenTide ?? []), es.controller];
  },
};
