import { isCreature, power } from './characteristics.ts';
import {
  addCounters,
  createObject,
  type Ctx,
  type CustomEffect,
  def,
  drawCard,
  emit,
  moveObject,
  obj,
} from './context.ts';
import { nextInt } from './rng.ts';
import type { PlayerId } from './types.ts';

/**
 * Final Fantasy (FIN) one-offs, as custom effects. They run without asking:
 * where the card offers a choice, the engine makes it (noted on each).
 */

const PERMANENT_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];

/** Creates a token on the battlefield (no replacement effects apply). */
function makeToken(ctx: Ctx, token: string, controller: PlayerId): void {
  const t = createObject(ctx, token, controller, 'battlefield', true);
  ctx.s.battlefield.push(t.id);
  emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
}

export const FIN_EFFECTS: Record<string, CustomEffect> = {
  /** Summon: Alexander I, II: "Prevent all damage that would be dealt to creatures you control this turn." */
  shieldCreaturesThisTurn(ctx, es) {
    // A new array: game states share it when cloned.
    const list = ctx.s.turn.creaturesShielded ?? [];
    if (!list.includes(es.controller)) ctx.s.turn.creaturesShielded = [...list, es.controller];
  },

  /** Summon: Esper Maduin I: reveal the top card; a permanent card goes to your hand. */
  revealTopPermanentToHand(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    emit(ctx, { type: 'revealed', player: es.controller, id: top });
    if (def(ctx, top).types.some((t) => PERMANENT_TYPES.includes(t))) moveObject(ctx, top, 'hand');
  },

  /**
   * Esper Origins cast from a graveyard: "exile it, then put it onto the
   * battlefield transformed under its owner's control with a finality counter".
   */
  enterTransformedWithFinality(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'stack' || o.zcc !== es.source!.zcc) return;
    moveObject(ctx, o.id, 'exile');
    moveObject(ctx, o.id, 'battlefield', { controller: o.owner, transformed: true });
    addCounters(ctx, o.id, 1, 'finality');
  },

  /** Summon: Fenrir II: the creature spell that triggered this enters with an additional +1/+1 counter. */
  bonusCounterOnSubject(ctx, es) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (o && o.zone === 'stack' && o.zcc === es.subject!.zcc)
      o.bonusCounters = (o.bonusCounters ?? 0) + 1;
  },

  /** Summon: Fenrir III: "Draw a card if you control the creature with the greatest power or tied for it." */
  drawIfGreatestPower(ctx, es) {
    let mine = -Infinity;
    let best = -Infinity;
    for (const id of ctx.s.battlefield) {
      if (!isCreature(ctx, id)) continue;
      const p = power(ctx, id);
      best = Math.max(best, p);
      if (obj(ctx, id).controller === es.controller) mine = Math.max(mine, p);
    }
    if (mine !== -Infinity && mine >= best) drawCard(ctx, es.controller);
  },

  /** The Gold Saucer: flip a coin; if you win the flip, create a Treasure token. */
  flipCoinForTreasure(ctx, es) {
    if (nextInt(ctx.s.rng, 2) === 0) makeToken(ctx, 'treasure-token', es.controller);
  },

  /** Overture: "Target opponent mills half their library, rounded down." */
  millHalf(ctx, es) {
    const t = es.targets[0];
    const player = t && 'player' in t ? t.player : null;
    if (!player) return;
    const lib = ctx.s.players[player].library;
    for (const id of lib.slice(0, Math.floor(lib.length / 2))) moveObject(ctx, id, 'graveyard');
  },
};
