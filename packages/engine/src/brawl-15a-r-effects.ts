import { characteristics } from './characteristics.ts';
import { type CustomEffect, createObject, emit, moveObject, newTimestamp, obj } from './context.ts';
import { nextInt } from './rng.ts';
import type { AbilityDef } from './types.ts';

/**
 * Strixhaven Brawl (15a, red): one-offs of the Quintorius deck's red cards, as
 * custom effects.
 */

/** Unearth {1}{R}, as Fallaji Antiquarian's duplicate perpetually gains it. */
const PERPETUAL_UNEARTH: AbilityDef = {
  kind: 'activated',
  cost: { mana: { generic: 1, colored: { R: 1 } } },
  fromGraveyard: true,
  sorcerySpeed: true,
  targets: [],
  effects: [{ kind: 'unearth' }],
  label: 'Unearth {1}{R}',
};

export const BRAWL_15A_R_EFFECTS: Record<string, CustomEffect> = {
  /** Enduring Courage: "When it dies, if it was a creature, return it to the battlefield. It's an enchantment." */
  enduringReturn(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'graveyard' || o.lastNotCreature) return;
    moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
    o.notCreature = true;
  },
  /** Fallaji Antiquarian: a duplicate of the target nontoken creature or artifact, conjured into your graveyard, perpetually with unearth {1}{R}. */
  fallajiConjure(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const src = ctx.s.objects[t.object.id];
    if (!src || src.zone !== 'battlefield' || src.zcc !== t.object.zcc || src.isToken) return;
    const dup = createObject(ctx, src.defId, es.controller, 'graveyard');
    ctx.s.players[es.controller].graveyard.push(dup.id);
    dup.perpetualAbilities = [PERPETUAL_UNEARTH];
    emit(ctx, { type: 'objectMoved', id: dup.id, defId: dup.defId, from: null, to: 'graveyard' });
  },
  /** Tersa Lightshatter: exile a card at random from your graveyard; you may play it this turn. */
  exileRandomPlayable(ctx, es) {
    const gy = ctx.s.players[es.controller].graveyard;
    if (gy.length === 0) return;
    const id = gy[nextInt(ctx.s.rng, gy.length)]!;
    moveObject(ctx, id, 'exile');
    obj(ctx, id).playableUntilTurn = ctx.s.turn.number;
  },
  /** Shared Animosity: the attacking creature gets +1/+0 for each other attacker that shares a creature type with it. */
  sharedAnimosity(ctx, es) {
    const me = es.subject && ctx.s.objects[es.subject.id];
    if (!me || me.zone !== 'battlefield' || !ctx.s.combat) return;
    const types = characteristics(ctx, me.id).subtypes;
    const changeling = characteristics(ctx, me.id).keywords.has('changeling');
    let n = 0;
    for (const a of ctx.s.combat.attackers) {
      if (a.id === me.id) continue;
      const c = characteristics(ctx, a.id);
      if (changeling || c.keywords.has('changeling') || c.subtypes.some((s) => types.includes(s)))
        n++;
    }
    if (n === 0) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: me.id, zcc: me.zcc },
      power: n,
      toughness: 0,
      keywords: [],
      expires: 'endOfTurn',
    });
  },
};
