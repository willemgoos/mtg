import { type Ctx, type CustomEffect, addCounters, moveObject, obj, other } from './context.ts';
import { nextInt } from './rng.ts';

/** Strixhaven (13c, group D): one-off effects, as custom effects. */

export const RARES_D_EFFECTS: Record<string, CustomEffect> = {
  /** Fervent Mastery: discard N cards at random. */
  discardAtRandom(ctx: Ctx, es, params) {
    const n = (params as { count: number }).count;
    const hand = ctx.s.players[es.controller].hand;
    for (let i = 0; i < n && hand.length > 0; i++) {
      const id = hand[nextInt(ctx.s.rng, hand.length)]!;
      moveObject(ctx, id, 'graveyard');
    }
  },
  /** Dragon's Approach: exile this spell and four other cards with its name from your graveyard. */
  dragonsApproachExile(ctx: Ctx, es) {
    const self = es.source?.id;
    if (!self) return;
    const defId = obj(ctx, self).defId;
    const gy = ctx.s.players[es.controller].graveyard.filter(
      (id) => id !== self && obj(ctx, id).defId === defId,
    );
    if (gy.length < 4) return;
    for (const id of gy.slice(0, 4)) moveObject(ctx, id, 'exile');
    moveObject(ctx, self, 'exile');
  },
  /**
   * Strixhaven Stadium: a creature you control dealt combat damage to an opponent. Put a point
   * counter on it; with ten or more, remove them all and that player loses the game.
   */
  stadiumPoint(ctx: Ctx, es) {
    const id = es.source?.id;
    const o = id && ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield') return;
    addCounters(ctx, o.id, 1, 'point');
    if ((o.counters?.point ?? 0) >= 10) {
      o.counters!.point = 0;
      ctx.s.players[other(es.controller)].lost = true;
    }
  },
  /** Strixhaven Stadium: a creature dealt combat damage to you; remove a point counter. */
  stadiumRemove(ctx: Ctx, es) {
    const id = es.source?.id;
    const o = id && ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || !o.counters?.point) return;
    o.counters.point--;
  },
};
