import { type Ctx, def, emit, moveObject, obj, sacrifice } from './context.ts';
import type { Decision, ObjectId, PlayerId } from './types.ts';

/**
 * Forage (Bloomburrow): exile three cards from your graveyard or sacrifice a
 * Food. Paid as a cost (Feed the Cycle, Camellia) or on resolution ("you may
 * forage").
 */

/** Foods `player` controls. */
export function foodsOf(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && def(ctx, id).subtypes.includes('Food'),
  );
}

/** Every way `player` can forage right now: one of their Foods, or their graveyard. */
export function forageChoices(ctx: Ctx, player: PlayerId): (ObjectId | 'graveyard')[] {
  const graveyard = ctx.s.players[player].graveyard.length >= 3;
  return [...foodsOf(ctx, player), ...(graveyard ? (['graveyard'] as const) : [])];
}

type ForageExile = Extract<Decision, { kind: 'forageExile' }>;

/**
 * Pays a forage. With more than three cards in the graveyard the player picks
 * which three: the 'forageExile' decision is set (carrying `after`) and this
 * returns true.
 */
export function payForage(
  ctx: Ctx,
  player: PlayerId,
  choice: ObjectId | 'graveyard',
  after: Omit<ForageExile, 'kind' | 'player' | 'count'>,
): boolean {
  emit(ctx, { type: 'foraged', player });
  if (choice !== 'graveyard') {
    sacrifice(ctx, choice);
    return false;
  }
  const graveyard = ctx.s.players[player].graveyard;
  if (graveyard.length <= 3) {
    for (const id of [...graveyard]) moveObject(ctx, id, 'exile');
    return false;
  }
  ctx.s.decision = { kind: 'forageExile', player, count: 3, ...after };
  return true;
}
