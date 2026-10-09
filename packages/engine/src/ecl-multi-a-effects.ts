import { NON_CREATURE_SUBTYPES, cardMatches, hasSubtype } from './characteristics.ts';
import {
  type CustomEffect,
  def,
  moveObject,
  newTimestamp,
  obj,
  onBattlefield,
  other,
} from './context.ts';
import { manaValue } from './cost.ts';
import { millCount } from './effects.ts';
import type { ObjectId } from './types.ts';

/**
 * Lorwyn Eclipsed (18b, multi-a): one-off effects of the W/U, U/B, B/R, R/G and G/W cards, as custom effects.
 */

export const ECL_MULTI_A_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Figure of Fable: "If this creature is <requires>, it becomes a <subtypes> with base power and toughness P/T"
   * (permanently), and, for the last level, "and protection from each of your opponents". `requires` is left out for the
   * first level, which has no condition.
   */
  figureOfFable(ctx, es, params) {
    const p = params as {
      requires?: string;
      subtypes: string[];
      power: number;
      toughness: number;
      protection?: boolean;
    };
    const self = es.source && onBattlefield(ctx, es.source);
    if (!self) return;
    if (p.requires && !hasSubtype(ctx, self.id, p.requires)) return;
    self.addedSubtypes = (self.addedSubtypes ?? []).filter((t) => NON_CREATURE_SUBTYPES.has(t));
    self.creatureTypes = [...p.subtypes];
    self.creatureTypesTimestamp = newTimestamp(ctx);
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: self.id, zcc: self.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      basePT: [p.power, p.toughness],
      ...(p.protection ? { protectionFromOthersThan: es.controller } : {}),
      expires: 'permanent',
    });
  },

  /**
   * Dream Harvest: each opponent exiles cards from the top of their library until they have exiled cards with total mana
   * value 5 or greater; until end of turn the controller may cast those cards without paying their mana costs (a land can't
   * be cast, so it stays exiled and unplayable).
   */
  dreamHarvest(ctx, es) {
    const opponent = other(es.controller);
    const lib = ctx.s.players[opponent].library;
    let total = 0;
    while (total < 5 && lib.length > 0) {
      const id = lib[0]!;
      moveObject(ctx, id, 'exile');
      total += manaValue(def(ctx, id).manaCost);
      if (def(ctx, id).types.includes('Land')) continue;
      const o = obj(ctx, id);
      o.playFreeBy = es.controller;
      o.playFreeUntilTurn = ctx.s.turn.number;
    }
  },

  /** Grub's Command: the target player mills five cards, then puts each Goblin card milled this way into their hand. */
  millGoblinsToHand(ctx, es, params) {
    const t = es.targets[(params as { targetIndex?: number } | undefined)?.targetIndex ?? 0];
    if (!t || !('player' in t)) return;
    const player = t.player;
    const milled: ObjectId[] = [];
    for (const id of ctx.s.players[player].library.slice(0, millCount(ctx, player, 5))) {
      moveObject(ctx, id, 'graveyard');
      milled.push(id);
    }
    for (const id of milled) {
      const o = ctx.s.objects[id];
      if (o && o.zone === 'graveyard' && cardMatches(ctx, id, { subtype: 'Goblin' }))
        moveObject(ctx, id, 'hand');
    }
  },
};
