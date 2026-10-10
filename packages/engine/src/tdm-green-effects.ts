import { type Ctx, type CustomEffect, addCounters, def, emit, moveObject, obj } from './context.ts';
import { millCount } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId } from './types.ts';

/**
 * Tarkir: Dragonstorm (19b, green): the one-off effects of Ainok Wayfarer ("mill three cards. You may put a land card from among
 * them into your hand. If you don't, put a +1/+1 counter on this creature"), as custom effects and the choosers behind
 * `chooseCustom`; and Rite of Renewal's "Target player shuffles up to four target cards from their graveyard into their library".
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const choose = (handler: string, params: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  params,
});

/** Ainok Wayfarer, "if you don't": a +1/+1 counter on the creature (if it is still there). */
function ainokCounter(ctx: Ctx, es: EffectSource): void {
  const src = es.source && ctx.s.objects[es.source.id];
  if (src && src.zone === 'battlefield' && src.zcc === es.source!.zcc) addCounters(ctx, src.id, 1);
}

export const TDM_GREEN_EFFECTS: Record<string, CustomEffect> = {
  /** Ainok Wayfarer: mill three; with a land among them the controller picks one (or declines), else the counter. */
  tdmAinokMill(ctx, es) {
    const lib = ctx.s.players[es.controller].library;
    const milled = lib.slice(0, millCount(ctx, es.controller, 3));
    for (const id of milled) moveObject(ctx, id, 'graveyard');
    const lands = milled.filter(
      (id) => ctx.s.objects[id]?.zone === 'graveyard' && def(ctx, id).types.includes('Land'),
    );
    if (lands.length === 0) ainokCounter(ctx, es);
    else (ctx.deferred ??= []).push(choose('tdmAinokPick', { lands }));
  },

  /** Ainok Wayfarer, the land taken into the hand. */
  tdmAinokTake(ctx, _es, params) {
    const { card } = params as { card: ObjectId };
    if (ctx.s.objects[card]?.zone === 'graveyard') moveObject(ctx, card, 'hand');
  },

  /**
   * Rite of Renewal: the player chosen as target `player` shuffles the target cards after it (the ones picked one at a time) from
   * their graveyard into their library. Nothing happens if the player is no longer a legal target.
   */
  tdmRiteShuffle(ctx, es, params) {
    const at = (params as { player: number }).player;
    const who = es.targets[at];
    if (!who || !('player' in who)) return;
    const player = who.player;
    for (const t of es.targets.slice(at + 1)) {
      if (!t || !('object' in t)) continue;
      const o = ctx.s.objects[t.object.id];
      if (o && o.zcc === t.object.zcc && o.zone === 'graveyard' && ctx.s.players[player].graveyard.includes(o.id))
        moveObject(ctx, o.id, 'library');
    }
    shuffleInPlace(ctx.s.rng, ctx.s.players[player].library);
    emit(ctx, { type: 'shuffled', player });
  },

  /** Ainok Wayfarer, "if you don't". */
  tdmAinokCounter(ctx, es) {
    ainokCounter(ctx, es);
  },
};

const TDM_GREEN_CHOOSERS: Record<string, Chooser> = {
  /** Ainok Wayfarer: which land card (one of each name is enough) to put into the hand, or none. */
  tdmAinokPick(ctx, _es, params) {
    const { lands } = params as { lands: ObjectId[] };
    const here = lands.filter((id) => ctx.s.objects[id]?.zone === 'graveyard');
    const seen = new Set<string>();
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of here) {
      const defId = obj(ctx, id).defId;
      if (seen.has(defId)) continue;
      seen.add(defId);
      options.push({
        label: `Put ${def(ctx, id).name} into your hand`,
        effects: [custom('tdmAinokTake', { card: id })],
      });
    }
    options.push({
      label: "Don't put a land into your hand (put a +1/+1 counter on this creature)",
      effects: [custom('tdmAinokCounter')],
    });
    return { title: 'Ainok Wayfarer: put a land card from among the milled cards into your hand?', options };
  },
};
Object.assign(CHOOSERS, TDM_GREEN_CHOOSERS);
