import { cardMatches, isCreature } from './characteristics.ts';
import { type Ctx, def, defOf, newId, obj, onBattlefield } from './context.ts';
import { useExiledCast } from './ecl-multi-b-effects.ts';
import type { ObjectId, PlayerId, StackItem } from './types.ts';

// Marvel Super Heroes Jumpstart (Analyzed): engine pieces for its cards.

/**
 * Vision, Spectral Synthezoid: "Once during each of your turns, you may cast a noncreature or
 * Robot spell from your hand without paying its mana cost." The first of `player`'s permanents
 * that would let them cast `card` this way now (each permanent allows it once a turn).
 */
export function freeCastSource(ctx: Ctx, player: PlayerId, card: ObjectId): ObjectId | undefined {
  if (ctx.s.turn.activePlayer !== player) return undefined;
  const c = ctx.s.objects[card];
  if (!c || c.zone !== 'hand' || c.owner !== player) return undefined;
  return ctx.s.battlefield.find((id) => {
    const o = obj(ctx, id);
    if (o.controller !== player) return false;
    if (o.freeCastUsed?.turn === ctx.s.turn.number && o.freeCastUsed.zcc === o.zcc) return false;
    return def(ctx, id).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.effect.kind === 'freeCastOncePerYourTurn' &&
        cardMatches(ctx, card, a.effect.filter, id),
    );
  });
}

/** A spell was cast through `freeCastSource`: that permanent's once this turn is used. */
export function useFreeCast(ctx: Ctx, player: PlayerId, card: ObjectId): void {
  // Lorwyn Eclipsed (18b, multi-b): Maralen, Fae Ascendant (a card exiled with it this turn).
  if (useExiledCast(ctx, player, card)) return;
  const id = freeCastSource(ctx, player, card);
  if (!id) return;
  const o = obj(ctx, id);
  o.freeCastUsed = { turn: ctx.s.turn.number, zcc: o.zcc };
}

/**
 * Victor Mancha, Runaway: exiled cards `player` may play for as long as they control the
 * permanent that exiled them.
 */
export function playableWhileControlling(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.players[player].exile.filter((id) => {
    const w = ctx.s.objects[id]?.playableWhileControlling;
    if (!w || w.player !== player) return false;
    return onBattlefield(ctx, w.source)?.controller === player;
  });
}

/**
 * Echo, Perceptive Prodigy: an ability on the stack comes "from a creature source" if its source
 * is a creature, or was one as it last existed (an emblem's ability has no creature source).
 */
export function fromCreatureSource(
  ctx: Ctx,
  item: Extract<StackItem, { kind: 'ability' }>,
): boolean {
  if (item.emblem) return false;
  const o = ctx.s.objects[item.source.id];
  if (o && o.zcc === item.source.zcc && o.zone === 'battlefield') return isCreature(ctx, o.id);
  return defOf(ctx, item.sourceDefId).types.includes('Creature');
}

/** Copies the ability on the stack with this id (same controller, targets, X and so on); the copy's id. */
export function copyStackAbility(ctx: Ctx, id: ObjectId): ObjectId | undefined {
  const item = ctx.s.stack.find((x) => x.kind === 'ability' && x.id === id);
  if (!item) return undefined;
  const copy = { ...item, id: newId(ctx) };
  ctx.s.stack.push(copy);
  return copy.id;
}
