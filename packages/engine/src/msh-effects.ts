import { isCreature } from './characteristics.ts';
import {
  addCounters,
  type Ctx,
  type CustomEffect,
  def,
  drawCard,
  moveObject,
  obj,
} from './context.ts';
import { manaValue } from './cost.ts';
import { shuffleLibrary } from './setup.ts';
import type { ObjectId } from './types.ts';

/**
 * Marvel Super Heroes one-offs, as custom effects. They run without asking:
 * where the card offers a choice, the engine makes it (noted on each).
 */

const isCreatureCard = (ctx: Ctx, id: ObjectId) => def(ctx, id).types.includes('Creature');

export const MSH_EFFECTS: Record<string, CustomEffect> = {
  // Marvel Super Heroes Jumpstart (Trained)
  /** She-Hulk, Attorney-at-Law: "double the number of +1/+1 counters on each creature you control". */
  doubleCountersOnYourCreatures(ctx, es) {
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller || !isCreature(ctx, id) || !o.plusOneCounters) continue;
      addCounters(ctx, id, o.plusOneCounters);
    }
  },

  // Marvel Super Heroes Jumpstart (Scarlet)
  /**
   * Hex Magic: exile all the cards from your hand, then draw that many; until
   * the end of your next turn, you may play the exiled cards.
   */
  exileHandDrawPlayable(ctx, es) {
    const hand = [...ctx.s.players[es.controller].hand];
    const ownTurn = ctx.s.turn.activePlayer === es.controller;
    for (const id of hand) {
      moveObject(ctx, id, 'exile');
      obj(ctx, id).playableUntilTurn = ctx.s.turn.number + (ownTurn ? 2 : 1);
    }
    for (let i = 0; i < hand.length; i++) drawCard(ctx, es.controller);
  },

  /** Earth's Mightiest Heroes with teamwork: every creature card among the top N onto the battlefield, the rest into the graveyard. */
  putAllCreaturesFromTop(ctx, es, params) {
    const count = (params as { count: number }).count;
    const lib = ctx.s.players[es.controller].library;
    for (const id of lib.slice(0, count))
      moveObject(
        ctx,
        id,
        isCreatureCard(ctx, id) ? 'battlefield' : 'graveyard',
        isCreatureCard(ctx, id) ? { controller: es.controller } : {},
      );
  },

  /**
   * Vision Quest: an artifact creature card with mana value X or less from your
   * library or graveyard onto the battlefield with X more +1/+1 counters (haste if
   * X is 4 or more). The engine picks the one with the greatest mana value.
   */
  visionQuest(ctx, es) {
    const x = es.x ?? 0;
    const p = ctx.s.players[es.controller];
    const fits = (id: ObjectId) => {
      const d = def(ctx, id);
      return (
        d.types.includes('Artifact') && d.types.includes('Creature') && manaValue(d.manaCost) <= x
      );
    };
    const best = [...p.library, ...p.graveyard]
      .filter(fits)
      .sort((a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost))[0];
    if (!best) return;
    const fromLibrary = p.library.includes(best);
    moveObject(ctx, best, 'battlefield', { controller: es.controller });
    if (x > 0) addCounters(ctx, best, x);
    if (x >= 4)
      obj(ctx, best).grantedKeywords = [...(obj(ctx, best).grantedKeywords ?? []), 'haste'];
    if (fromLibrary) shuffleLibrary(ctx, es.controller);
  },

  /**
   * Worlds Within Worlds: exile all creatures; each player puts every creature
   * card from their hand onto the battlefield (the engine always does); the
   * exiled cards go to their owners' hands. (It goes to the graveyard, not exile.)
   */
  worldsWithinWorlds(ctx) {
    const exiled = ctx.s.battlefield.filter((id) => isCreatureCard(ctx, id));
    for (const id of exiled) moveObject(ctx, id, 'exile');
    for (const player of ['p1', 'p2'] as const)
      for (const id of [...ctx.s.players[player].hand])
        if (isCreatureCard(ctx, id)) moveObject(ctx, id, 'battlefield', { controller: player });
    for (const id of exiled) if (ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
  },
};
