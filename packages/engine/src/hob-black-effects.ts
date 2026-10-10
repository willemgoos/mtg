import { defOf, drawCard, type CustomEffect, moveObject, obj } from './context.ts';
import { PLAYERS } from './types.ts';

/**
 * The Hobbit (20b, black): one-off effects of the black cards, as custom effects. (The triggers, filters, the
 * Food-making state and the pay-life cast are marked `// The Hobbit (20b black)` where they sit.)
 */
export const HOB_BLACK_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Inside Information: "Exile the top X cards of target opponent's library. You may play those cards this turn. If you cast a
   * spell this way, pay life equal to its mana value rather than pay its mana cost." X is the value chosen for {X}; the cards
   * are playable (lands too) by the caster this turn, and a spell is cast with the 'lifeForMana' way (legal.ts, spells.ts).
   */
  hobInsideInformation(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    const library = ctx.s.players[t.player].library;
    const x = es.x ?? (es.source && ctx.s.objects[es.source.id]?.xPaid) ?? 0;
    for (const id of library.slice(0, x)) {
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      if (o.zone !== 'exile') continue;
      o.castableBy = es.controller;
      o.castableUntilTurn = ctx.s.turn.number;
      o.lifeForMana = true;
    }
  },

  /**
   * Supper for Spiders: "Put onto the battlefield under your control all creature cards in your opponents' graveyards that were
   * put there from the battlefield this turn. They are Food artifacts with '{2}, {T}, Sacrifice this artifact: You gain 3 life.'
   * (They lose all other types and subtypes.)" They enter as Foods (not creatures): see `supperFood`.
   */
  hobSupperForSpiders(ctx, es) {
    const turn = ctx.s.turn.number;
    const cards = PLAYERS.filter((p) => p !== es.controller).flatMap((p) =>
      ctx.s.players[p].graveyard.filter((id) => {
        const o = obj(ctx, id);
        return !o.isToken && o.diedTurn === turn && defOf(ctx, o.defId).types.includes('Creature');
      }),
    );
    // Food before it arrives, so nothing sees a creature enter.
    for (const id of cards) {
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
      const o = obj(ctx, id);
      if (o.zone === 'battlefield') o.supperFood = true;
    }
  },

  /** The Master of Lake-town: "draw a card for each graveyard with seven or more cards in it". */
  hobMasterDraw(ctx, es) {
    const n = PLAYERS.filter((p) => ctx.s.players[p].graveyard.length >= 7).length;
    for (let i = 0; i < n; i++) drawCard(ctx, es.controller);
  },
};
