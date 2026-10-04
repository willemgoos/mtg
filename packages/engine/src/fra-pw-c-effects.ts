import { type CustomEffect, moveObject, other } from './context.ts';

/**
 * Reality Fracture (17c): the planeswalker rares and mythics. One-off effects (called as `{ kind: 'custom', handler }`).
 */
export const FRA_PW_C_EFFECTS: Record<string, CustomEffect> = {
  /** Jace, Reality Sculptor: "Exile all but the bottom card of each opponent's library." */
  exileAllButBottomOfOpponentLibrary(ctx, es) {
    const library = ctx.s.players[other(es.controller)].library;
    // The top of the library is first: the bottom card is the last one.
    for (const id of library.slice(0, -1)) moveObject(ctx, id, 'exile');
  },
  /** Theorist's Proxy: "The next spell you cast this turn can't be countered." */
  nextSpellUncounterable(ctx, es) {
    const list = (ctx.s.turn.nextSpellUncounterable ??= []);
    if (!list.includes(es.controller)) list.push(es.controller);
  },
};
