import { canTapForAbility, isCreature } from './characteristics.ts';
import { type Ctx, def, obj } from './context.ts';
import type { ManaCost, ManaType, ObjectId, PlayerId } from './types.ts';

export interface ManaSource {
  id: ObjectId;
  produces: ManaType;
  isCreature: boolean;
}

export function manaValue(cost: ManaCost): number {
  let n = cost.generic;
  for (const v of Object.values(cost.colored)) n += v ?? 0;
  return n;
}

/** Untapped permanents with a usable mana ability. Lands sort before creatures. */
export function manaSources(ctx: Ctx, player: PlayerId, exclude?: ObjectId): ManaSource[] {
  const out: ManaSource[] = [];
  for (const id of ctx.s.battlefield) {
    if (id === exclude || obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'mana' || !a.cost.tapSelf || !canTapForAbility(ctx, id)) continue;
      out.push({ id, produces: a.produces, isCreature: isCreature(ctx, id) });
      break;
    }
  }
  return out.sort((a, b) => Number(a.isCreature) - Number(b.isCreature));
}

/**
 * Picks sources to tap for a cost. Every source makes exactly one mana of one
 * type, so paying colored pips first and then generic from what's left is
 * optimal. Returns null if the cost can't be paid.
 */
export function findPayment(cost: ManaCost, sources: readonly ManaSource[]): ObjectId[] | null {
  const used = new Set<ObjectId>();
  for (const [type, n] of Object.entries(cost.colored) as [ManaType, number][]) {
    let need = n;
    for (const s of sources) {
      if (need === 0) break;
      if (!used.has(s.id) && s.produces === type) {
        used.add(s.id);
        need--;
      }
    }
    if (need > 0) return null;
  }
  let generic = cost.generic;
  for (const s of sources) {
    if (generic === 0) break;
    if (!used.has(s.id)) {
      used.add(s.id);
      generic--;
    }
  }
  return generic > 0 ? null : [...used];
}

export function canPay(ctx: Ctx, player: PlayerId, cost: ManaCost | undefined, exclude?: ObjectId) {
  if (!cost || manaValue(cost) === 0) return true;
  return findPayment(cost, manaSources(ctx, player, exclude)) !== null;
}

/**
 * Chooses (or validates `payWith`) and returns the sources to tap.
 * Throws if the cost can't be paid.
 */
export function planPayment(
  ctx: Ctx,
  player: PlayerId,
  cost: ManaCost | undefined,
  payWith: readonly ObjectId[] | undefined,
  exclude?: ObjectId,
): ObjectId[] {
  if (!cost || manaValue(cost) === 0) return [];
  let sources = manaSources(ctx, player, exclude);
  if (payWith) sources = sources.filter((s) => payWith.includes(s.id));
  const plan = findPayment(cost, sources);
  if (!plan) throw new Error('Cannot pay mana cost');
  return plan;
}
