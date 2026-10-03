import { type CustomEffect, def, drawCard, moveObject, newTimestamp } from './context.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId } from './types.ts';

/**
 * Strixhaven Brawl (15a, red-white): one-offs for the Quintorius deck, as custom
 * effects, and the choosers behind `chooseCustom`.
 */

export const BRAWL_15A_RW_EFFECTS: Record<string, CustomEffect> = {
  /** Quintorius, History Chaser +1: discard the chosen card, draw two cards, then mill a card. */
  quintoriusDiscard(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'hand') return;
    moveObject(ctx, id, 'graveyard');
    const p = ctx.s.players[es.controller];
    drawCard(ctx, es.controller);
    drawCard(ctx, es.controller);
    const top = p.library[0];
    if (top !== undefined) moveObject(ctx, top, 'graveyard');
  },
  /**
   * Excava, the Risen Past: return the target card to the battlefield with a finality counter; it's a 1/1
   * Spirit creature with flying in addition to its other types.
   */
  excavaReturn(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
    (o.counters ??= {}).finality = 1;
    o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Spirit'];
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: ['flying'],
      becomesCreature: true,
      basePT: [1, 1],
      expires: 'permanent',
    });
  },
};

const BRAWL_15A_RW_CHOOSERS: Record<string, Chooser> = {
  /** Quintorius, History Chaser +1: "you may discard a card. If you do, draw two cards, then mill a card." */
  quintoriusDiscard(ctx, es) {
    const hand = ctx.s.players[es.controller].hand;
    if (hand.length === 0) return null;
    const options: { label: string; effects: EffectDef[] }[] = hand.map((id) => ({
      label: `Discard ${def(ctx, id).name}`,
      effects: [{ kind: 'custom', handler: 'quintoriusDiscard', params: { id } }],
    }));
    options.push({ label: "Don't discard", effects: [] });
    return { title: 'Quintorius, History Chaser: discard a card to draw two', options };
  },
  /** Sacred Foundry: "you may pay 2 life. If you don't, it enters tapped." (the land enters tapped; paying untaps it) */
  shockLand(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield' || !self.tapped) return null;
    return {
      title: `${def(ctx, self.id).name}: pay 2 life to have it enter untapped?`,
      options: [
        {
          label: 'Pay 2 life',
          effects: [
            { kind: 'loseLife', who: 'controller', amount: 2 },
            { kind: 'untap', what: 'self' },
          ],
        },
        { label: 'Enter tapped', effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15A_RW_CHOOSERS);
