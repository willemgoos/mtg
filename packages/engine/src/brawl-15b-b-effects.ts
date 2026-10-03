import { creaturesOnBattlefield, toughness } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  drawCard,
  emit,
  moveObject,
  newTimestamp,
  obj,
  sacrifice,
} from './context.ts';
import { manaValue } from './cost.ts';
import { BRAWL_15A_W_EFFECTS } from './brawl-15a-w-effects.ts';
import type { AbilityDef, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven Brawl (15b, black): one-off effects of the black cards, as custom
 * effects, plus a small helper the engine core calls.
 */

/** Nowhere to Run: an opponent of `owner` controls it, so `owner`'s creatures have no hexproof and their ward doesn't trigger. */
export function ignoresHexproofAndWard(ctx: Ctx, owner: PlayerId): boolean {
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller === owner) continue;
    if (
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'ignoreHexproofWard',
      )
    )
      return true;
  }
  return false;
}

/** {B} symbols in a mana cost (hybrid symbols with {B} count too). */
function blackPips(ctx: Ctx, id: ObjectId): number {
  const c = def(ctx, id).manaCost;
  return (c.colored.B ?? 0) + (c.hybrid ?? []).filter((h) => h.includes('B')).length;
}

/** A +1/+1 that a card in a graveyard keeps for good ("perpetually"). */
const PERPETUAL_PLUS_ONE: AbilityDef = {
  kind: 'static',
  effect: { kind: 'boost', power: 1, toughness: 1 },
};

export const BRAWL_15B_B_EFFECTS: Record<string, CustomEffect> = {
  /** Hateful Eidolon: draw a card for each Aura you controlled that was attached to the creature that died. */
  eidolonDraw(ctx, es) {
    const dead = es.subject;
    if (!dead) return;
    let n = 0;
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (
        o.controller === es.controller &&
        o.attachedTo === dead.id &&
        def(ctx, id).subtypes.includes('Aura')
      )
        n++;
    }
    const card = ctx.s.objects[dead.id];
    for (const pid of ['p1', 'p2'] as const)
      for (const gid of ctx.s.players[pid].graveyard) {
        const g = ctx.s.objects[gid]!;
        const was = g.lastAttachedTo;
        // It must have left with the creature (not an Aura destroyed earlier).
        if (!was || was.id !== dead.id || !def(ctx, gid).subtypes.includes('Aura')) continue;
        // `dead` is the creature as it died: the card may have moved on already (Minion's Return).
        if (was.zcc !== dead.zcc - 1) continue;
        if (card && card.zcc === dead.zcc && g.timestamp < card.timestamp) continue;
        if (g.owner === es.controller) n++;
      }
    for (let i = 0; i < n; i++) drawCard(ctx, es.controller);
  },

  /** Minion's Return, Kaya's Ghostform: the enchanted creature card returns under your control. */
  returnEnchanted(ctx, es) {
    const aura = es.source && ctx.s.objects[es.source.id];
    const was = aura?.lastAttachedTo;
    const card = was && ctx.s.objects[was.id];
    if (!card || card.zone !== 'graveyard' || card.zcc !== was.zcc + 1) return;
    moveObject(ctx, card.id, 'battlefield', { controller: es.controller });
  },

  /** Abhorrent Overlord: a number of 1/1 black Harpy tokens with flying equal to your devotion to black. */
  harpies(ctx, es) {
    let n = 0;
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === es.controller) n += blackPips(ctx, id);
    for (let i = 0; i < n; i++) {
      const t = createObject(ctx, 'soc-15b-b-harpy-token', es.controller, 'battlefield', true);
      ctx.s.battlefield.push(t.id);
      emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
    }
  },

  /** Terrors of the Track, double team: when it attacks, if it isn't a token, conjure a duplicate into your hand; the duplicate has lost double team. */
  doubleTeam(ctx, es) {
    const src = es.source && ctx.s.objects[es.source.id];
    if (!src || src.isToken || src.noDoubleTeam) return;
    const dup = createObject(ctx, src.defId, es.controller, 'hand');
    dup.noDoubleTeam = true;
    ctx.s.players[es.controller].hand.push(dup.id);
    emit(ctx, { type: 'objectMoved', id: dup.id, defId: dup.defId, from: null, to: 'hand' });
  },

  /** Blighted Nightmare: creature cards in your graveyard perpetually get +1/+1. */
  perpetualBoost(ctx, es) {
    for (const id of ctx.s.players[es.controller].graveyard)
      if (def(ctx, id).types.includes('Creature'))
        (obj(ctx, id).perpetualAbilities ??= []).push(PERPETUAL_PLUS_ONE);
  },

  /**
   * Blighted Nightmare's ability: X is the target's mana value; blight X puts X -1/-1 counters on
   * the creature you control with the greatest toughness (X can't exceed it); then it returns.
   */
  blightReturn(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const card = ctx.s.objects[t.object.id];
    if (!card || card.zone !== 'graveyard' || card.zcc !== t.object.zcc) return;
    const x = manaValue(def(ctx, card.id).manaCost);
    const mine = creaturesOnBattlefield(ctx, es.controller);
    const best = mine
      .map((c) => ({ c, t: ctx.s.objects[c.id]!, tough: toughness(ctx, c.id) }))
      .sort((a, b) => b.tough - a.tough)[0];
    if (!best || x > best.tough) return;
    if (x > 0)
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: best.c.id, zcc: best.c.zcc },
        power: -x,
        toughness: -x,
        keywords: [],
        expires: 'permanent',
      });
    moveObject(ctx, card.id, 'battlefield', { controller: es.controller });
  },

  /** Spectacle of Destruction: remove a wreck counter, then seek a nonland card. */
  spectacleUpkeep(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'battlefield' || (o.counters?.wreck ?? 0) < 1) return;
    o.counters!.wreck!--;
    BRAWL_15A_W_EFFECTS.seekNonland!(ctx, es, undefined);
  },

  /** Liliana, Dreadhorde General: each opponent keeps one permanent of each type and sacrifices the rest (their best of each type). */
  lilianaUltimate(ctx, es) {
    for (const p of ['p1', 'p2'] as const) {
      if (p === es.controller) continue;
      const theirs = ctx.s.battlefield.filter((id) => obj(ctx, id).controller === p);
      const byValue = [...theirs].sort(
        (a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost),
      );
      const keep = new Set<ObjectId>();
      for (const type of ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] as const) {
        const pick = byValue.find((id) => !keep.has(id) && def(ctx, id).types.includes(type));
        if (pick) keep.add(pick);
      }
      for (const id of theirs) if (!keep.has(id)) sacrifice(ctx, id);
    }
  },

  /** Witch's Cottage: put the target creature card from your graveyard on top of your library. */
  cottageTopdeck(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const card = ctx.s.objects[t.object.id];
    if (!card || card.zone !== 'graveyard' || card.zcc !== t.object.zcc) return;
    moveObject(ctx, card.id, 'library', { position: 'top' });
  },
};
