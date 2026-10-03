import { creaturesOnBattlefield, hasSubtype } from './characteristics.ts';
import { addCounters, type CustomEffect, drawCard, def, moveObject, obj } from './context.ts';
import type { Ctx } from './context.ts';
import { canPayFrom, manaSources, payMana, planPayment } from './mana.ts';
import { CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId } from './types.ts';

/** Secrets of Strixhaven (14b, group B, blue): one-offs, as custom effects, and the choosers they use. */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The object a target slot points at, if it is still there. */
function targetObject(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

export const SOS_14B_B_EFFECTS: Record<string, CustomEffect> = {
  // Secrets of Strixhaven (14b): Mana Sculpt. Run before the counter, so the spell's mana is still known.
  manaSculpt(ctx, es) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined) return;
    const spent = obj(ctx, id).manaSpent ?? 0;
    const wizard = ctx.s.battlefield.some(
      (b) => obj(ctx, b).controller === es.controller && hasSubtype(ctx, b, 'Wizard'),
    );
    if (!wizard || spent <= 0) return;
    const ps = ctx.s.players[es.controller];
    ps.pendingMainMana = (ps.pendingMainMana ?? 0) + spent;
  },
  // Secrets of Strixhaven (14b): Mathemagics. Target player draws 2^X cards.
  mathemagics(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    const n = 2 ** Math.min(es.x ?? 0, 12);
    for (let i = 0; i < n; i++) drawCard(ctx, t.player);
  },
  // Secrets of Strixhaven (14b): Wisdom of Ages.
  wisdomOfAges(ctx, es) {
    const ps = ctx.s.players[es.controller];
    for (const id of [...ps.graveyard]) {
      const types = def(ctx, id).types;
      if (types.includes('Instant') || types.includes('Sorcery')) moveObject(ctx, id, 'hand');
    }
    ps.noMaxHandSize = true;
  },
  // Secrets of Strixhaven (14b): Emeritus of Ideation. Exile eight cards from your graveyard (simplified:
  // instants and sorceries are kept for last, then the oldest first).
  exileEightFromGraveyard(ctx, es) {
    const gy = ctx.s.players[es.controller].graveyard;
    const keep = (id: ObjectId) => {
      const t = def(ctx, id).types;
      return t.includes('Instant') || t.includes('Sorcery') ? 1 : 0;
    };
    const pick = [...gy].sort((a, b) => keep(a) - keep(b)).slice(0, 8);
    for (const id of pick) moveObject(ctx, id, 'exile');
  },
  // Secrets of Strixhaven (14b): Tester of the Tangential. Pay {X}, then move X counters onto another creature.
  testerMove(ctx, es, params) {
    const p = params as { n: number; to: ObjectId };
    const src = es.source && ctx.s.objects[es.source.id];
    const to = ctx.s.objects[p.to];
    if (!src || src.zone !== 'battlefield' || !to || to.zone !== 'battlefield') return;
    const cost = { generic: p.n, colored: {} };
    if (!canPayFrom(cost, manaSources(ctx, es.controller))) return;
    payMana(ctx, planPayment(ctx, es.controller, cost, undefined));
    const n = Math.min(p.n, src.plusOneCounters);
    src.plusOneCounters -= n;
    if (n > 0) addCounters(ctx, to.id, n);
  },
  // Secrets of Strixhaven (14b): Brainstorm (one card from your hand onto your library).
  putHandOnTop(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'hand' || o.owner !== es.controller) return;
    moveObject(ctx, id, 'library', { position: 'top' });
  },
  // Secrets of Strixhaven (14b): Run Behind.
  putOnLibrary(ctx, _es, params) {
    const p = params as { id: ObjectId; position: 'top' | 'bottom' };
    const o = ctx.s.objects[p.id];
    if (!o || o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'library', { position: p.position });
  },
};

Object.assign(CHOOSERS, {
  /** Tester of the Tangential: how much to pay (nothing is the first option's alternative). */
  testerX(ctx: Ctx, es: EffectSource) {
    const src = es.source && ctx.s.objects[es.source.id];
    if (!src || src.zone !== 'battlefield' || src.plusOneCounters < 1) return null;
    if (!creaturesOnBattlefield(ctx).some((c) => c.id !== src.id)) return null;
    const sources = manaSources(ctx, es.controller);
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (let x = 1; x <= src.plusOneCounters; x++) {
      if (!canPayFrom({ generic: x, colored: {} }, sources)) break;
      options.push({
        label: `Pay {${x}}: move ${x} +1/+1 counter${x === 1 ? '' : 's'}`,
        effects: [{ kind: 'chooseCustom', handler: 'testerTarget', params: { n: x } }],
      });
    }
    if (options.length === 0) return null;
    options.push({ label: "Don't pay", effects: [] });
    return { title: 'Tester of the Tangential: pay {X}?', options };
  },
  /** Tester of the Tangential: the creature that gets the counters. */
  testerTarget(ctx: Ctx, es: EffectSource, params: Record<string, unknown> | undefined) {
    const n = (params as { n: number }).n;
    const src = es.source?.id;
    const options = creaturesOnBattlefield(ctx)
      .filter((c) => c.id !== src)
      .map((c) => ({
        label: `${def(ctx, c.id).name} (${c.controller === es.controller ? 'yours' : "opponent's"})`,
        effects: [custom('testerMove', { n, to: c.id })],
      }));
    return { title: `Move ${n} +1/+1 counter${n === 1 ? '' : 's'} onto`, options };
  },
  /** Brainstorm: put `n` cards from your hand on top of your library, one at a time. */
  putBackFromHand(ctx: Ctx, es: EffectSource, params: Record<string, unknown> | undefined) {
    const n = (params as { n: number }).n;
    const hand = ctx.s.players[es.controller].hand;
    if (hand.length === 0 || n < 1) return null;
    return {
      title: `Put a card from your hand on top of your library (${n} left)`,
      options: hand.map((id) => ({
        label: def(ctx, id).name,
        effects: [
          custom('putHandOnTop', { id }),
          ...(n > 1
            ? [{ kind: 'chooseCustom', handler: 'putBackFromHand', params: { n: n - 1 } } as EffectDef]
            : []),
        ],
      })),
    };
  },
  /** Run Behind: the creature's owner picks the top or bottom of their library. */
  topOrBottom(ctx: Ctx, es: EffectSource) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined || obj(ctx, id).zone !== 'battlefield') return null;
    return {
      player: obj(ctx, id).owner,
      title: `Put ${def(ctx, id).name} on the top or bottom of your library`,
      options: [
        { label: 'Top of your library', effects: [custom('putOnLibrary', { id, position: 'top' })] },
        {
          label: 'Bottom of your library',
          effects: [custom('putOnLibrary', { id, position: 'bottom' })],
        },
      ],
    };
  },
});
