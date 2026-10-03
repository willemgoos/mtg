import { hasKeyword } from './characteristics.ts';
import {
  type CustomEffect,
  type Ctx,
  def,
  moveObject,
  newTimestamp,
  obj,
  other,
  sacrifice,
} from './context.ts';
import { manaValue } from './cost.ts';
import { changeLife, useShield } from './effects.ts';
import { nextInt } from './rng.ts';
import type { Chooser } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId, PlayerId } from './types.ts';

/**
 * Secrets of Strixhaven (14b, group C): one-offs of the black, Witherbloom and
 * colourless cards, as custom effects, and the choosers behind `chooseCustom`.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const next = (handler: string, params: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  params,
});

/** Petrified Hamlet: does a Hamlet on the battlefield name this object's card? */
function namedByHamlet(ctx: Ctx, id: ObjectId): boolean {
  const defId = obj(ctx, id).defId;
  return ctx.s.battlefield.some((h) => {
    const o = obj(ctx, h);
    return (
      o.chosenName !== undefined &&
      o.chosenName === defId &&
      def(ctx, h).name === 'Petrified Hamlet'
    );
  });
}

/** Petrified Hamlet: activated abilities (that aren't mana abilities) of a source with the chosen name can't be activated. */
export const nameLocked = namedByHamlet;
/** Petrified Hamlet: lands with the chosen name have "{T}: Add {C}". */
export const hamletColorless = namedByHamlet;

const label = (ctx: Ctx, id: ObjectId): string => def(ctx, id).name;

export const SOS_14B_C_EFFECTS: Record<string, CustomEffect> = {
  /** Reanimate (Grave Researcher): the target creature card from a graveyard enters under your control; you lose life equal to its mana value. */
  reanimateLoseLife(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
    const mv = manaValue(def(ctx, o.id).manaCost);
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
    changeLife(ctx, es.controller, -mv);
  },
  /** Pox Plague: each player loses half their life, rounded down. */
  poxLife(ctx) {
    for (const p of ['p1', 'p2'] as const)
      changeLife(ctx, p, -Math.floor(ctx.s.players[p].life / 2));
  },
  poxDiscard(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'hand') moveObject(ctx, id, 'graveyard');
  },
  poxSacrifice(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'battlefield') sacrifice(ctx, id);
  },
  /** Vicious Rivalry: destroy all artifacts and creatures with mana value X or less. */
  viciousRivalry(ctx, es) {
    const x = es.x ?? 0;
    for (const id of [...ctx.s.battlefield]) {
      const d = def(ctx, id);
      if (!d.types.includes('Artifact') && !d.types.includes('Creature')) continue;
      if (manaValue(d.manaCost) > x || hasKeyword(ctx, id, 'indestructible')) continue;
      if (useShield(ctx, id)) continue;
      moveObject(ctx, id, 'graveyard');
    }
  },
  /** Mind Roots: one discarded card. */
  mindRootsDiscard(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'hand') moveObject(ctx, id, 'graveyard');
  },
  /** Mind Roots: the chosen land card enters tapped under your control. */
  mindRootsTake(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'graveyard') return;
    moveObject(ctx, id, 'battlefield', { controller: es.controller });
    obj(ctx, id).tapped = true;
  },
  /** Ral Zarek, Guest Lecturer -7: flip five coins; the opponent skips that many turns. */
  ralUltimate(ctx, es) {
    let heads = 0;
    for (let i = 0; i < 5; i++) if (nextInt(ctx.s.rng, 2) === 1) heads++;
    const opp = ctx.s.players[other(es.controller)];
    opp.skipTurns = (opp.skipTurns ?? 0) + heads;
  },
  /** Great Hall of the Biblioplex: it becomes a 2/4 Wizard creature (and is still a land). */
  animateGreatHall(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'battlefield') return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      becomesCreature: true,
      basePT: [2, 4],
      expires: 'permanent',
    });
    o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Wizard'];
  },
};

export const SOS_14B_C_CHOOSERS: Record<string, Chooser> = {
  /** Pox Plague: each player discards half their hand, then sacrifices half their permanents, one choice at a time. */
  poxPlague(ctx, es, params) {
    const p = (params ?? {}) as { phase?: 'discard' | 'sacrifice'; idx?: number; left?: number };
    let phase = p.phase ?? 'discard';
    let idx = p.idx ?? 0;
    let left = p.left;
    const order: PlayerId[] = [es.controller, other(es.controller)];
    for (;;) {
      if (idx > 1) {
        if (phase === 'sacrifice') return null;
        phase = 'sacrifice';
        idx = 0;
        left = undefined;
        continue;
      }
      const who = order[idx]!;
      const pool =
        phase === 'discard'
          ? ctx.s.players[who].hand
          : ctx.s.battlefield.filter((id) => obj(ctx, id).controller === who);
      left ??= Math.floor(pool.length / 2);
      if (left <= 0 || pool.length === 0) {
        idx++;
        left = undefined;
        continue;
      }
      return {
        player: who,
        title:
          phase === 'discard'
            ? `Pox Plague: discard a card (${left} left)`
            : `Pox Plague: sacrifice a permanent (${left} left)`,
        options: pool.map((id) => ({
          label: `${phase === 'discard' ? 'Discard' : 'Sacrifice'} ${label(ctx, id)}`,
          effects: [
            custom(phase === 'discard' ? 'poxDiscard' : 'poxSacrifice', { id }),
            next('poxPlague', { phase, idx, left: left! - 1 }),
          ],
        })),
      };
    }
  },
  /** Mind Roots: the target player discards two cards, then you may take a land among them. */
  mindRoots(ctx, es, params) {
    const p = (params ?? {}) as { left?: number; discarded?: ObjectId[] };
    const t = es.targets[0];
    if (!t || !('player' in t)) return null;
    const hand = ctx.s.players[t.player].hand;
    const discarded = p.discarded ?? [];
    const left = p.left ?? Math.min(2, hand.length);
    if (left > 0 && hand.length > 0)
      return {
        player: t.player,
        title: `Mind Roots: discard a card (${left} left)`,
        options: hand.map((id) => ({
          label: `Discard ${label(ctx, id)}`,
          effects: [
            custom('mindRootsDiscard', { id }),
            next('mindRoots', { left: left - 1, discarded: [...discarded, id] }),
          ],
        })),
      };
    const lands = discarded.filter(
      (id) => ctx.s.objects[id]?.zone === 'graveyard' && def(ctx, id).types.includes('Land'),
    );
    if (lands.length === 0) return null;
    return {
      title: 'Mind Roots: put a land card discarded this way onto the battlefield tapped',
      options: [
        ...lands.map((id) => ({
          label: `Put ${label(ctx, id)} onto the battlefield tapped`,
          effects: [custom('mindRootsTake', { id })],
        })),
        { label: "Don't put a land onto the battlefield", effects: [] },
      ],
    };
  },
  /** Petrified Hamlet: choose a land card name (lands on the battlefield first). */
  landName(ctx, es) {
    const seen = new Set(ctx.s.battlefield.map((id) => obj(ctx, id).defId));
    const lands = [...ctx.db.values()].filter(
      (d) => d.types.includes('Land') && !d.isToken && !d.noManaCost,
    );
    lands.sort(
      (a, b) => Number(seen.has(b.id)) - Number(seen.has(a.id)) || a.name.localeCompare(b.name),
    );
    void es;
    return {
      title: 'Choose a land card name',
      options: lands.map((d) => ({
        label: d.name,
        effects: [custom('setChosenName', { defId: d.id })],
      })),
    };
  },
};
