import {
  type Ctx,
  type CustomEffect,
  addCounters,
  createObject,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
  sacrifice,
} from './context.ts';
import { manaValue } from './cost.ts';
import { nextInt } from './rng.ts';
import type { EffectSource } from './effects.ts';
import type { ObjectId, PlayerId, StaticDef } from './types.ts';

/**
 * Strixhaven Brawl (15a, white and colourless): one-off effects of the Quintorius
 * deck's cards, as custom effects, plus small helpers the engine core calls.
 */

export const SKYCLAVE_ILLUSION = 'soc-illusion-token';

/** `player` controls a permanent with this static ability. */
function controlsStatic(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): number {
  let n = 0;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    if (def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind)) n++;
  }
  return n;
}

/** Anointed Procession: how many times over `player`'s tokens are made (1, 2, 4, ...). */
export function tokenMultiplier(ctx: Ctx, player: PlayerId): number {
  return 2 ** controlsStatic(ctx, player, 'doubleTokens');
}

/** Deification: `player` controls it, so their planeswalkers have hexproof. */
export function planeswalkersHexproof(ctx: Ctx, player: PlayerId): boolean {
  return controlsStatic(ctx, player, 'planeswalkerProtection') > 0;
}

/** Deification: damage can't take the last loyalty counter from `player`'s planeswalker while they control a creature. */
export function planeswalkersSurvive(ctx: Ctx, player: PlayerId): boolean {
  return (
    planeswalkersHexproof(ctx, player) &&
    ctx.s.battlefield.some(
      (id) => obj(ctx, id).controller === player && def(ctx, id).types.includes('Creature'),
    )
  );
}

function target(ctx: Ctx, es: EffectSource, n: number, zone: string): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === zone && o.zcc === t.object.zcc ? o.id : undefined;
}

export const BRAWL_15A_W_EFFECTS: Record<string, CustomEffect> = {
  /** Patchplate Resolute: a one-time boon, the next creature spell you cast enters with an extra +1/+1 counter. */
  patchplateBoon(ctx, es) {
    const ps = ctx.s.players[es.controller];
    ps.creatureBoons = (ps.creatureBoons ?? 0) + 1;
  },

  /** Gate to the Citadel: "Seek a nonland card": a random nonland card from your library to your hand. */
  seekNonland(ctx, es) {
    const lib = ctx.s.players[es.controller].library;
    const options = lib.filter((id) => !def(ctx, id).types.includes('Land'));
    if (options.length === 0) return;
    const card = options[nextInt(ctx.s.rng, options.length)]!;
    moveObject(ctx, card, 'hand');
  },

  /** Ghost Vacuum: exile the target card from a graveyard, remembering it. */
  ghostVacuumExile(ctx, es) {
    const id = target(ctx, es, 0, 'graveyard');
    if (!id) return;
    const self = es.source && ctx.s.objects[es.source.id];
    moveObject(ctx, id, 'exile');
    if (self && self.zone === 'battlefield') self.exiledWith = [...(self.exiledWith ?? []), id];
  },

  /**
   * Ghost Vacuum: sacrifice it, then each creature card exiled with it enters under
   * your control with a flying counter, as a 1/1 Spirit in addition to its other types.
   * (Simplification: the sacrifice happens as the ability resolves, not as a cost.)
   */
  ghostVacuumRelease(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield') return;
    const cards = (self.exiledWith ?? []).filter(
      (id) => ctx.s.objects[id]?.zone === 'exile' && def(ctx, id).types.includes('Creature'),
    );
    sacrifice(ctx, self.id);
    for (const id of cards) {
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
      const o = obj(ctx, id);
      (o.counters ??= {}).flying = 1;
      o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Spirit'];
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        basePT: [1, 1],
        expires: 'permanent',
      });
    }
  },

  /** Skyclave Apparition: exile the target permanent, remembering its owner and mana value. */
  skyclaveExile(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self) return;
    delete self.linkedExile;
    const id = target(ctx, es, 0, 'battlefield');
    if (!id) return;
    const o = obj(ctx, id);
    self.linkedExile = { owner: o.owner, mv: manaValue(def(ctx, id).manaCost) };
    moveObject(ctx, id, 'exile');
  },

  /** Skyclave Apparition: the exiled card's owner creates an X/X blue Illusion token (X = its mana value). */
  skyclaveToken(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    const link = self?.linkedExile;
    if (!self || !link) return;
    delete self.linkedExile;
    if (link.mv <= 0) return;
    const t = createObject(ctx, SKYCLAVE_ILLUSION, link.owner, 'battlefield', true);
    ctx.s.battlefield.push(t.id);
    addCounters(ctx, t.id, link.mv);
    emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
  },
};
