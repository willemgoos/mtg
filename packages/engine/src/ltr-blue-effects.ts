import { hasSubtype } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  moveObject,
  obj,
  removeFromCombat,
  tap,
  untap,
} from './context.ts';
import { removeCounterKinds } from './ecl-18a.ts';
import { runEffect } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { checkCondition, queue } from './triggers.ts';
import type { EffectDef, EffectSource, GameEvent, ObjectId } from './types.ts';

/**
 * The Lord of the Rings (21b, blue): one-off effects as custom effects, the expander that builds Minas Tirith Garrison's prompt, the
 * "whenever you scry" trigger from the graveyard (Council's Deliberation) and Bewitching Leechcraft's untap replacement.
 * See "Phase 21b: blue" in docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Custom effects that turn into other effects when they come up (a prompt built from the state the earlier effects left). */
type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

export const LTR_BLUE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Bill Ferny, Bree Swindler, second mode: "Target opponent gains control of target Horse you control. If they do, remove Bill
   * Ferny from combat and create three Treasure tokens." Targets: 0 the opponent, 1 the Horse.
   */
  ltrBillFerny(ctx, es) {
    const p = es.targets[0];
    const h = es.targets[1];
    if (!p || !('player' in p) || !h || !('object' in h)) return;
    const horse = ctx.s.objects[h.object.id];
    if (
      !horse ||
      horse.zone !== 'battlefield' ||
      horse.zcc !== h.object.zcc ||
      horse.controller !== es.controller ||
      p.player === es.controller
    )
      return;
    // They gain control of it for good (it is summoning sick for them; a creature that changes controllers leaves combat).
    horse.controller = p.player;
    horse.summoningSick = true;
    removeFromCombat(ctx, horse.id);
    const bill = es.source && ctx.s.objects[es.source.id];
    if (bill && bill.zone === 'battlefield' && bill.zcc === es.source!.zcc)
      removeFromCombat(ctx, bill.id);
    runEffect(ctx, es, { kind: 'createToken', token: 'treasure-token', count: 3 });
  },

  /**
   * The Bath Song, chapter III: "Shuffle any number of target cards from your graveyard into your library." One shuffle at the end
   * (also with no targets).
   */
  ltrBathSongShuffle(ctx, es) {
    for (const t of es.targets) {
      if (!t || !('object' in t)) continue;
      const o = ctx.s.objects[t.object.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) continue;
      moveObject(ctx, o.id, 'library', { position: 'top' });
    }
    shuffleInPlace(ctx.s.rng, ctx.s.players[es.controller].library);
  },

  /**
   * Council's Deliberation: "you may exile this card from your graveyard. If you do, draw a card." Exiles the source if it is still
   * in the graveyard it was in; `exiledThisWay` says whether it did (an `if` on it follows).
   */
  ltrExileSelfFromGraveyard(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'graveyard' || o.zcc !== es.source!.zcc) {
      es.exiledThisWay = 0;
      return;
    }
    moveObject(ctx, o.id, 'exile');
    es.exiledThisWay = 1;
  },

  /** Minas Tirith Garrison: tap this Human (one of the ones chosen); it need not be untapped by a cost, summoning sickness is no matter. */
  ltrTapOne(ctx, _es, params) {
    const id = params?.id as ObjectId | undefined;
    if (!id) return;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || o.tapped) return;
    tap(ctx, id);
  },
};

export const LTR_BLUE_EXPANDERS: Record<string, Expander> = {
  /**
   * Minas Tirith Garrison: "you may tap any number of untapped Humans you control. Draw a card for each Human tapped this way."
   * One Human at a time (or Done); the next prompt comes up after each tap, so a long list is never built. `tapped` counts the ones
   * tapped so far; the cards are drawn when you are done (or no untapped Human is left).
   */
  ltrGarrisonTap(ctx, es, params) {
    const tapped = (params?.tapped as number | undefined) ?? 0;
    const drawNow: EffectDef[] =
      tapped > 0 ? [{ kind: 'draw', who: 'controller', amount: tapped }] : [];
    const humans = ctx.s.battlefield.filter((id) => {
      const o = obj(ctx, id);
      return (
        o.controller === es.controller &&
        !o.tapped &&
        o.zone === 'battlefield' &&
        hasSubtype(ctx, id, 'Human')
      );
    });
    if (humans.length === 0) return drawNow;
    const total = new Map<string, number>();
    for (const id of humans) total.set(def(ctx, id).name, (total.get(def(ctx, id).name) ?? 0) + 1);
    const seen = new Map<string, number>();
    return [
      {
        kind: 'choose',
        title: tapped > 0 ? `Tap another Human (${tapped} tapped so far)` : 'Tap Humans to draw cards',
        options: [
          { label: 'Done', effects: drawNow },
          ...humans.map((id) => {
            const name = def(ctx, id).name;
            const k = (seen.get(name) ?? 0) + 1;
            seen.set(name, k);
            return {
              label: (total.get(name) ?? 1) > 1 ? `${name} (${k})` : name,
              effects: [
                custom('ltrTapOne', { id }),
                custom('ltrGarrisonTap', { tapped: tapped + 1 }),
              ],
            };
          }),
        ],
      },
    ];
  },
};

/**
 * Council's Deliberation: "Whenever you scry, ..." from the graveyard. `scried` is the event; the amount is the number of cards
 * looked at, as for a battlefield trigger.
 */
export function ltrBlueScriedFromGraveyard(
  ctx: Ctx,
  ev: Extract<GameEvent, { type: 'scried' }>,
): void {
  if (ev.surveil) return;
  for (const id of ctx.s.players[ev.player].graveyard) {
    const card = ctx.s.objects[id]!;
    def(ctx, id).abilities.forEach((a, i) => {
      if (a.kind !== 'triggered' || !a.fromGraveyard || a.trigger.on !== 'youScry') return;
      if (checkCondition(ctx, a.condition, ev.player, card))
        queue(ctx, card, i, ev.player, undefined, ev.top + ev.bottom);
    });
  }
}

/**
 * Bewitching Leechcraft, in the untap step: the creature "would untap". With a +1/+1 counter, one is removed and it untaps;
 * without, it stays tapped. An untapped creature is not untapped (nothing to replace). Returns true if the creature has the ability
 * (the untap step then leaves the rest to this function).
 */
export function untapWithCounter(ctx: Ctx, id: ObjectId): boolean {
  const has = def(ctx, id).abilities.some(
    (a) => a.kind === 'static' && a.effect.kind === 'untapRemovesCounter',
  );
  if (!has) return false;
  const o = obj(ctx, id);
  if (o.tapped && o.plusOneCounters > 0) {
    removeCounterKinds(ctx, id, ['+1/+1']);
    untap(ctx, id);
  }
  return true;
}
