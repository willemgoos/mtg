import { toughness } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, moveObject, obj, sacrifice } from './context.ts';
import { damageSourceFor, dealDamage } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId } from './types.ts';

/**
 * Secrets of Strixhaven (14b, group D: red and Prismari): one-offs, as custom
 * effects, and the choosers behind `chooseCustom`.
 */

/** "Until the end of your next turn" for cards exiled now (the same turn on an opponent's, two turns on yours). */
function untilEndOfYourNextTurn(ctx: Ctx, controller: string): number {
  return ctx.s.turn.number + (ctx.s.turn.activePlayer === controller ? 2 : 1);
}

export const SOS_14B_D_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Archaic's Agony: converge damage to the target creature; exile cards from the top of your library equal to
   * the excess damage; you may play them until the end of your next turn.
   */
  archaicAgony(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    const source = es.source && ctx.s.objects[es.source.id];
    const x = source?.manaColors?.length ?? 0;
    if (x <= 0) return;
    const lethal = Math.max(0, toughness(ctx, o.id) - o.damage);
    const excess = Math.max(0, x - lethal);
    dealDamage(ctx, damageSourceFor(ctx, es.source!.id, es.controller), t, x, false);
    const lib = ctx.s.players[es.controller].library;
    const until = untilEndOfYourNextTurn(ctx, es.controller);
    for (const id of lib.slice(0, excess)) {
      moveObject(ctx, id, 'exile');
      obj(ctx, id).playableUntilTurn = until;
    }
  },
  /** Tablet of Discovery: mill a card; you may play it this turn. */
  tabletMill(ctx, es) {
    const id = ctx.s.players[es.controller].library[0];
    if (id === undefined) return;
    moveObject(ctx, id, 'graveyard');
    const o = ctx.s.objects[id];
    if (o && o.zone === 'graveyard') o.playGraveyardTurn = ctx.s.turn.number;
  },
  /** Heated Argument: exile the chosen card from your graveyard. */
  exileGraveyardById(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'graveyard') moveObject(ctx, id, 'exile');
  },
  /** Mica: sacrifice the chosen artifact. */
  sacrificeById(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'battlefield') sacrifice(ctx, id);
  },
};

const SOS_14B_D_CHOOSERS: Record<string, Chooser> = {
  /** Heated Argument: "You may exile a card from your graveyard. If you do, 2 damage to that creature's controller." */
  heatedArgumentExile(ctx, es) {
    const gy = ctx.s.players[es.controller].graveyard;
    if (gy.length === 0) return null;
    const seen = new Set<string>();
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of gy) {
      const name = def(ctx, id).name;
      if (seen.has(name)) continue;
      seen.add(name);
      options.push({
        label: `Exile ${name}: 2 damage to that creature's controller`,
        effects: [
          { kind: 'custom', handler: 'exileGraveyardById', params: { id } },
          { kind: 'damage', amount: 2, to: { controllerOf: 0 } },
        ],
      });
    }
    options.push({ label: 'Do nothing', effects: [] });
    return { title: 'Heated Argument', options };
  },
  /** Mica, Reader of Ruins: "you may sacrifice an artifact. If you do, copy that spell." */
  micaSacrifice(ctx, es) {
    const artifacts = ctx.s.battlefield.filter(
      (id) => obj(ctx, id).controller === es.controller && def(ctx, id).types.includes('Artifact'),
    );
    if (artifacts.length === 0) return null;
    const options: { label: string; effects: EffectDef[] }[] = artifacts.map((id) => ({
      label: `Sacrifice ${def(ctx, id).name}: copy that spell`,
      effects: [
        { kind: 'custom', handler: 'sacrificeById', params: { id } },
        { kind: 'copySpell', what: 'subject' },
      ],
    }));
    options.push({ label: 'Do nothing', effects: [] });
    return { title: 'Mica, Reader of Ruins', options };
  },
};
// Registered next to the other choosers, so the effects module needs no change.
Object.assign(CHOOSERS, SOS_14B_D_CHOOSERS);
