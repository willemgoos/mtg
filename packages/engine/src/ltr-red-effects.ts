import { characteristics, isCreature, power } from './characteristics.ts';
import { type Ctx, type CustomEffect, moveObject, newTimestamp, obj } from './context.ts';
import { damageSourceFor, dealDamage, runEffect } from './effects.ts';
import type { GameObject, ObjectId, PlayerId, TargetChoice, TargetSpec } from './types.ts';

/**
 * The Lord of the Rings (21b red): the one-off effects, conditions and target checks of the red packet cards (Fear, Fire, Foes!;
 * Battle-Scarred Goblin; Smite the Deathless; Grishnákh, Brash Instigator; Éomer of the Riddermark; Riders of the Mark). The card
 * vocabulary is in types.ts (search "Lord of the Rings (21b red)").
 */

/** The object a chosen target names, if it is still the same object on the battlefield. */
function battlefieldTarget(ctx: Ctx, t: TargetChoice | null | undefined): GameObject | undefined {
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

export const LTR_RED_EFFECTS: Record<string, CustomEffect> = {
  /** Fear, Fire, Foes!: "Damage can't be prevented this turn." */
  ltrDamageUnpreventable(ctx) {
    ctx.s.turn.ltrDamageUnpreventable = true;
  },

  /**
   * Fear, Fire, Foes!: "... and 1 damage to each other creature with the same controller" as target 0 (the creature that was
   * dealt X damage by the effect before this one).
   */
  ltrDamageSameController(ctx, es, params) {
    const target = battlefieldTarget(ctx, es.targets[0]);
    if (!target) return;
    const from = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
    const amount = Number(params?.amount ?? 1);
    const hit: ObjectId[] = ctx.s.battlefield.filter(
      (id) =>
        id !== target.id && isCreature(ctx, id) && obj(ctx, id).controller === target.controller,
    );
    for (const id of hit)
      dealDamage(ctx, from, { object: { id, zcc: obj(ctx, id).zcc } }, amount, false);
  },

  /** Battle-Scarred Goblin: "it deals 1 damage to each creature blocking it" (the blockers when the ability resolves). */
  ltrDamageBlockers(ctx, es, params) {
    if (!es.source) return;
    const attacker = ctx.s.combat?.attackers.find((a) => a.id === es.source!.id);
    if (!attacker) return;
    const from = damageSourceFor(ctx, es.source.id, es.controller);
    const amount = Number(params?.amount ?? 1);
    for (const id of [...attacker.blockers]) {
      const b = ctx.s.objects[id];
      if (b && b.zone === 'battlefield')
        dealDamage(ctx, from, { object: { id, zcc: b.zcc } }, amount, false);
    }
  },

  /** Smite the Deathless: "That creature loses indestructible until end of turn." (target 0). */
  ltrLoseIndestructible(ctx, es) {
    const o = battlefieldTarget(ctx, es.targets[0]);
    if (!o) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      loseKeywords: ['indestructible'],
      expires: 'endOfTurn',
    });
  },

  /**
   * Riders of the Mark: "return it to its owner's hand. If you do, create a number of 1/1 white Human Soldier creature tokens equal
   * to its toughness" (its toughness as it left the battlefield). `params.token` is the token.
   */
  ltrRidersReturn(ctx, es, params) {
    const o = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!o || !es.source || o.zone !== 'battlefield' || o.zcc !== es.source.zcc) return;
    const count = Math.max(0, characteristics(ctx, o.id).toughness);
    moveObject(ctx, o.id, 'hand');
    runEffect(ctx, es, { kind: 'createToken', token: String(params?.token), count });
  },
};

/** Custom conditions (`{ kind: 'custom', handler }`). */
export const LTR_RED_CONDITIONS: Record<
  string,
  (
    ctx: Ctx,
    controller: PlayerId,
    self: GameObject | undefined,
    subject: GameObject | undefined,
  ) => boolean
> = {
  /** Éomer of the Riddermark: "you control a creature with the greatest power among creatures on the battlefield" (a tie counts). */
  ltrControlsGreatestPower(ctx, controller) {
    const creatures = ctx.s.battlefield.filter((id) => isCreature(ctx, id));
    const greatest = Math.max(...creatures.map((id) => power(ctx, id)));
    return creatures.some(
      (id) => obj(ctx, id).controller === controller && power(ctx, id) === greatest,
    );
  },
};

/**
 * Grishnákh, Brash Instigator: "target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's
 * power" (the filter `maxPowerOfSubject`; the Army is the reflexive trigger's subject, its last known power once it is gone).
 */
export function ltrPowerWithinSubject(
  ctx: Ctx,
  spec: TargetSpec,
  id: ObjectId,
  src: { subjectId?: ObjectId; ltrSubjectId?: ObjectId },
): boolean {
  if (!spec.filter?.maxPowerOfSubject) return true;
  const sid = src.subjectId ?? src.ltrSubjectId;
  const subject = sid ? ctx.s.objects[sid] : undefined;
  if (!subject) return true;
  const limit = subject.zone === 'battlefield' ? power(ctx, subject.id) : (subject.lastPower ?? 0);
  return power(ctx, id) <= limit;
}
