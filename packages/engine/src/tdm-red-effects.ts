import { cardMatches } from './characteristics.ts';
import { type Ctx, def, obj } from './context.ts';
import type { ObjectId, PlayerId } from './types.ts';

/** Tarkir: Dragonstorm (19b), red: engine helpers for the red cards. */

/**
 * Dracogenesis: `card` is a card of `player` (in their hand, or in exile where they may cast it) that matches the filter of a
 * 'castFreeMatching' static ability they control, so it may be cast without paying its mana cost.
 */
export function freeMatchingCastable(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const c = ctx.s.objects[card];
  if (!c || c.owner !== player) return false;
  if (!(c.zone === 'hand' || (c.zone === 'exile' && c.playableUntilTurn !== undefined))) return false;
  if (def(ctx, card).types.includes('Land')) return false;
  return ctx.s.battlefield.some((id) => {
    if (obj(ctx, id).controller !== player) return false;
    return def(ctx, id).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.effect.kind === 'castFreeMatching' &&
        cardMatches(ctx, card, a.effect.filter, id),
    );
  });
}
