import { type Ctx, type CustomEffect, def, newTimestamp, obj, moveObject } from './context.ts';
import { checkCondition } from './triggers.ts';
import type { EffectDef, GameObject, ObjectId, PlayerId } from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * The Hobbit (20b, white): one-off effects as custom effects, and the Kíli the Resourceful equip hook.
 * See docs/the-hobbit-plan.md.
 */

/** The 4/4 white Bird Soldier token with flying that The Eagles Are Coming! makes (hob/white.ts). */
export const HOB_BIRD_SOLDIER = 'hob-bird-soldier-token';

/** Is this an equip ability (an Equipment's only effect is attaching it)? */
function isEquipAbility(
  ctx: Ctx,
  source: ObjectId,
  a: { effects: EffectDef[]; cost: { mana?: unknown } },
): boolean {
  return (
    !!a.cost.mana &&
    def(ctx, source).subtypes.includes('Equipment') &&
    a.effects.length === 1 &&
    a.effects[0]!.kind === 'attach'
  );
}

/**
 * Kíli the Resourceful: "As long as you have an enduring story, you may pay {0} rather than pay the equip cost of the first
 * equip ability you activate each turn." Paying {0} is never worse, so the first equip activation just costs {0}.
 */
export function firstEquipFree(
  ctx: Ctx,
  o: Pick<GameObject, 'id' | 'controller'>,
  a: { effects: EffectDef[]; cost: { mana?: unknown } },
): boolean {
  if (!isEquipAbility(ctx, o.id, a)) return false;
  if (ctx.s.turn.equipActivated?.[o.controller] === ctx.s.turn.number) return false;
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === o.controller &&
      def(ctx, id).abilities.some(
        (s) =>
          s.kind === 'static' &&
          s.effect.kind === 'firstEquipFree' &&
          checkCondition(ctx, s.effect.condition, o.controller, obj(ctx, id)),
      ),
  );
}

/** Remember that `player` activated an equip ability this turn (the next one is no longer the first). */
export function noteEquipActivation(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  a: { effects: EffectDef[]; cost: { mana?: unknown } },
): void {
  if (!isEquipAbility(ctx, source, a)) return;
  (ctx.s.turn.equipActivated ??= {})[player] = ctx.s.turn.number;
}

export const HOB_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * The Eagles Are Coming!, after the creatures are returned: "At the beginning of the next upkeep, create a 4/4 white Bird
   * Soldier creature token with flying for each creature returned to your hand this way."
   */
  hobEaglesBirds(ctx, es) {
    const n = es.affectedThisWay ?? 0;
    if (n <= 0) return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: es.source ?? { id: '', zcc: 0 },
      effects: [{ kind: 'createToken', token: HOB_BIRD_SOLDIER, count: n }],
      fromTurn: ctx.s.turn.number + 1,
      at: 'upkeep',
    });
  },

  /** Bilbo's Gambit, gift promised: "players can't cast spells this turn." */
  hobPlayersCantCast(ctx) {
    ctx.s.turn.spellLock = [...PLAYERS];
  },

  /**
   * Stone by Sunlight: "Until end of turn, target creature becomes an artifact in addition to its other types and gains
   * indestructible."
   */
  hobStoneBySunlight(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: ['indestructible'],
      becomesArtifact: true,
      expires: 'endOfTurn',
    });
  },

  /**
   * Roads Go Ever, Ever On, chapters II and III: "Put a card exiled with this Saga into its owner's hand." The cards are basic
   * Plains cards, so which one is taken makes no difference: the oldest one still in exile.
   */
  hobRoadsToHand(ctx, es) {
    const saga = es.source && ctx.s.objects[es.source.id];
    if (!saga) return;
    const card = (saga.exiledWith ?? []).find((id) => ctx.s.objects[id]?.zone === 'exile');
    if (!card) return;
    saga.exiledWith = saga.exiledWith!.filter((id) => id !== card);
    moveObject(ctx, card, 'hand');
  },
};
