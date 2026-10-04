import { creaturesOnBattlefield } from './characteristics.ts';
import { type Ctx, def, obj } from './context.ts';
import { manaValue } from './cost.ts';
import type { ObjectId, PlayerId, StaticDef } from './types.ts';

/** Reality Fracture (17a), green: small helpers the engine core calls. */

/** `player` controls a permanent with this static ability. */
function controlsStatic(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind),
  );
}

/** Marwyn, the Preserver: `player`'s lands have hexproof. */
export function landsHaveHexproof(ctx: Ctx, player: PlayerId): boolean {
  return controlsStatic(ctx, player, 'landsHexproof');
}

/**
 * Omnipresence: `card` is a nonland card in `player`'s hand whose mana value is at most the number
 * of creatures they control, and they control Omnipresence, so it may be cast without paying its
 * mana cost.
 */
export function omnipresenceCastable(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const c = ctx.s.objects[card];
  if (!c || c.zone !== 'hand' || c.owner !== player) return false;
  const d = def(ctx, card);
  if (d.types.includes('Land') || !controlsStatic(ctx, player, 'freeCastByCreatureCount'))
    return false;
  return manaValue(d.manaCost) <= creaturesOnBattlefield(ctx, player).length;
}
