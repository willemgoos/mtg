import { characteristics, matchesFilter } from './characteristics.ts';
import { type Ctx, def } from './context.ts';
import type { ObjectId } from './types.ts';

/**
 * Wilds of Eldraine (23b blue): engine helpers for Elusive Otter ("creatures with power less than this creature's power can't
 * block it") and the Faerie token ("this token can block only creatures with flying"). The other hooks (Talion's Messenger's
 * discard, Farsight Ritual's look at the top cards) are marked `Wilds of Eldraine (23b blue)` where they sit.
 */

/** Is this creature's power less than the power of `sourceId`? (`powerLessThanSource` in a card filter.) */
export function powerLessThan(ctx: Ctx, id: ObjectId, sourceId: ObjectId | undefined): boolean {
  if (sourceId === undefined) return false;
  return characteristics(ctx, id).power < characteristics(ctx, sourceId).power;
}

/** May this blocker block this attacker, given a "can block only creatures matching ..." static it has? */
export function canBlockOnlyAllows(ctx: Ctx, blocker: ObjectId, attacker: ObjectId): boolean {
  for (const ab of def(ctx, blocker).abilities)
    if (
      ab.kind === 'static' &&
      ab.effect.kind === 'canBlockOnly' &&
      !matchesFilter(ctx, attacker, ab.effect.filter, blocker)
    )
      return false;
  return true;
}
