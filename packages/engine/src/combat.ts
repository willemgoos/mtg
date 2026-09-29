import {
  characteristics,
  creaturesOnBattlefield,
  hasKeyword,
  power,
  toughness,
} from './characteristics.ts';
import { type Ctx, obj, other } from './context.ts';
import { damageSourceFor, dealDamage, type DamageSource } from './effects.ts';
import type { Attacker, ObjectId, PlayerId, TargetChoice } from './types.ts';

export function canAttack(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (o.zone !== 'battlefield' || o.tapped || o.controller !== ctx.s.turn.activePlayer)
    return false;
  const c = characteristics(ctx, id);
  if (!c.types.includes('Creature') || c.keywords.has('defender')) return false;
  return !o.summoningSick || c.keywords.has('haste');
}

export function possibleAttackers(ctx: Ctx): ObjectId[] {
  return creaturesOnBattlefield(ctx, ctx.s.turn.activePlayer)
    .map((c) => c.id)
    .filter((id) => canAttack(ctx, id));
}

export function canBlock(ctx: Ctx, blocker: ObjectId, attacker: ObjectId): boolean {
  const b = obj(ctx, blocker);
  if (b.zone !== 'battlefield' || b.tapped) return false;
  const bc = characteristics(ctx, blocker);
  if (!bc.types.includes('Creature') || bc.cantBlock) return false;
  const a = ctx.s.combat?.attackers.find((x) => x.id === attacker);
  if (!a || b.controller !== a.defender) return false;
  if (
    hasKeyword(ctx, attacker, 'flying') &&
    !bc.keywords.has('flying') &&
    !bc.keywords.has('reach')
  )
    return false;
  return true;
}

export function possibleBlockers(ctx: Ctx, defender: PlayerId): ObjectId[] {
  const attackers = ctx.s.combat?.attackers ?? [];
  return creaturesOnBattlefield(ctx, defender)
    .map((c) => c.id)
    .filter((id) => attackers.some((a) => canBlock(ctx, id, a.id)));
}

/** Block declarations that violate a restriction (menace). Empty if legal. */
export function blockViolations(
  ctx: Ctx,
  declared: readonly { blocker: ObjectId; attacker: ObjectId }[],
): ObjectId[] {
  const out: ObjectId[] = [];
  for (const a of ctx.s.combat?.attackers ?? []) {
    const n = declared.filter((d) => d.attacker === a.id).length;
    if (n === 1 && hasKeyword(ctx, a.id, 'menace')) out.push(a.id);
  }
  return out;
}

function dealsDamageThisStep(ctx: Ctx, id: ObjectId, firstStrikeStep: boolean): boolean {
  const fs = hasKeyword(ctx, id, 'firstStrike');
  const ds = hasKeyword(ctx, id, 'doubleStrike');
  if (firstStrikeStep) return fs || ds;
  return ds || !ctx.s.combat!.dealtFirstStrikeDamage.includes(id);
}

export function anyFirstStrike(ctx: Ctx): boolean {
  const c = ctx.s.combat;
  if (!c) return false;
  const ids = c.attackers.flatMap((a) => [a.id, ...a.blockers]);
  return ids.some(
    (id) => hasKeyword(ctx, id, 'firstStrike') || hasKeyword(ctx, id, 'doubleStrike'),
  );
}

function lethalFor(ctx: Ctx, blocker: ObjectId, deathtouch: boolean): number {
  const remaining = Math.max(0, toughness(ctx, blocker) - obj(ctx, blocker).damage);
  return deathtouch ? Math.min(1, remaining) : remaining;
}

interface Assignment {
  src: DamageSource;
  to: TargetChoice;
  amount: number;
}

/**
 * Default damage assignment for an attacker. Under current rules (no damage
 * assignment order) the attacker may split damage freely; we assign lethal
 * damage to each blocker in declaration order, then the rest to the player if
 * it has trample, otherwise to the last blocker.
 */
function assignAttackerDamage(
  ctx: Ctx,
  a: Attacker,
  amount: number,
  src: DamageSource,
): Assignment[] {
  const player: TargetChoice = { player: a.defender };
  if (!a.blocked) return [{ src, to: player, amount }];
  const trample = hasKeyword(ctx, a.id, 'trample');
  const blockers = a.blockers;
  if (blockers.length === 0) return trample ? [{ src, to: player, amount }] : [];
  const deathtouch = hasKeyword(ctx, a.id, 'deathtouch');
  const out: Assignment[] = [];
  let left = amount;
  for (const b of blockers) {
    const n = Math.min(left, lethalFor(ctx, b, deathtouch));
    if (n > 0) out.push({ src, to: { object: { id: b, zcc: obj(ctx, b).zcc } }, amount: n });
    left -= n;
  }
  if (left > 0) {
    if (trample) out.push({ src, to: player, amount: left });
    else {
      const last = blockers[blockers.length - 1]!;
      const existing = out.find((x) => 'object' in x.to && x.to.object.id === last);
      if (existing) existing.amount += left;
      else out.push({ src, to: { object: { id: last, zcc: obj(ctx, last).zcc } }, amount: left });
    }
  }
  return out;
}

/** Combat damage step: all assignments first, then all damage dealt simultaneously. */
export function dealCombatDamage(ctx: Ctx, firstStrikeStep: boolean): void {
  const combat = ctx.s.combat;
  if (!combat) return;
  const assignments: Assignment[] = [];
  const dealt: ObjectId[] = [];

  for (const a of combat.attackers) {
    if (!dealsDamageThisStep(ctx, a.id, firstStrikeStep)) continue;
    const p = power(ctx, a.id);
    dealt.push(a.id);
    if (p <= 0) continue;
    const src = damageSourceFor(ctx, a.id, obj(ctx, a.id).controller);
    assignments.push(...assignAttackerDamage(ctx, a, p, src));
  }
  for (const a of combat.attackers) {
    for (const b of a.blockers) {
      if (!dealsDamageThisStep(ctx, b, firstStrikeStep)) continue;
      dealt.push(b);
      const p = power(ctx, b);
      if (p <= 0) continue;
      const src = damageSourceFor(ctx, b, obj(ctx, b).controller);
      assignments.push({ src, to: { object: { id: a.id, zcc: obj(ctx, a.id).zcc } }, amount: p });
    }
  }

  for (const x of assignments) dealDamage(ctx, x.src, x.to, x.amount, true);
  if (firstStrikeStep) combat.dealtFirstStrikeDamage.push(...dealt);
}

export function defenderOf(ctx: Ctx): PlayerId {
  return other(ctx.s.turn.activePlayer);
}
