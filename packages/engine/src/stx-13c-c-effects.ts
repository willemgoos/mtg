import {
  createObject,
  type Ctx,
  type CustomEffect,
  def,
  drawCard,
  emit,
  moveObject,
  obj,
  other,
} from './context.ts';
import { damageSourceFor, dealDamage, plusFoodTokens } from './effects.ts';
import type { PlayerId } from './types.ts';

/** Strixhaven (13c): one-offs of the Quandrix and Prismari cards, as custom effects. */

/** Creates a token on the battlefield (no replacement effects apply but Tippy-Toe's Food). */
function makeToken(ctx: Ctx, token: string, controller: PlayerId): void {
  const t = createObject(ctx, token, controller, 'battlefield', true);
  ctx.s.battlefield.push(t.id);
  emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
  plusFoodTokens(ctx, controller);
}

export const STX_13C_C_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Kianne, Dean of Substance: exile the top card of your library. A land goes
   * into your hand; any other card gets a study counter.
   */
  kianneStudy(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return;
    if (def(ctx, top).types.includes('Land')) {
      moveObject(ctx, top, 'hand');
      return;
    }
    moveObject(ctx, top, 'exile');
    obj(ctx, top).counters = { ...obj(ctx, top).counters, study: 1 };
  },

  /**
   * Culmination of Studies: exile the top X cards. A Treasure for each land,
   * a card for each blue card, 1 damage to each opponent for each red card.
   */
  culminationOfStudies(ctx, es) {
    const x = es.x ?? (es.source && ctx.s.objects[es.source.id]?.xPaid) ?? 0;
    const top = ctx.s.players[es.controller].library.slice(0, x);
    let lands = 0;
    let blue = 0;
    let red = 0;
    for (const id of top) {
      const d = def(ctx, id);
      if (d.types.includes('Land')) lands++;
      if (d.colors.includes('U')) blue++;
      if (d.colors.includes('R')) red++;
      moveObject(ctx, id, 'exile');
    }
    for (let i = 0; i < lands; i++) makeToken(ctx, 'treasure-token', es.controller);
    for (let i = 0; i < blue; i++) drawCard(ctx, es.controller);
    if (red > 0) {
      const src = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
      dealDamage(ctx, src, { player: other(es.controller) }, red, false);
    }
  },

  /** Imbraham, Dean of Theory: exile the top X cards of your library with a study counter on each. */
  studyExile(ctx, es) {
    const x = es.x ?? 0;
    for (const id of ctx.s.players[es.controller].library.slice(0, x)) {
      moveObject(ctx, id, 'exile');
      obj(ctx, id).counters = { ...obj(ctx, id).counters, study: 1 };
    }
  },

  /**
   * Nassari, Dean of Expression: exile the top card of each opponent's library;
   * this turn you may cast it, spending mana as though it were any colour.
   */
  nassariExile(ctx, es) {
    const top = ctx.s.players[other(es.controller)].library[0];
    if (top === undefined) return;
    moveObject(ctx, top, 'exile');
    const o = obj(ctx, top);
    o.castableBy = es.controller;
    o.castableUntilTurn = ctx.s.turn.number;
    o.anyMana = true;
  },
};
