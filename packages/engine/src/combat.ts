import {
  characteristics,
  creaturesOnBattlefield,
  hasKeyword,
  matchesFilter,
  power,
  toughness,
} from './characteristics.ts';
import { type Ctx, def, obj, other } from './context.ts';
import { damageSourceFor, dealDamage, type DamageSource } from './effects.ts';
import { checkCondition } from './triggers.ts';
import type { Attacker, ObjectId, PlayerId, TargetChoice } from './types.ts';

export function canAttack(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (o.zone !== 'battlefield' || o.tapped || o.controller !== ctx.s.turn.activePlayer)
    return false;
  const c = characteristics(ctx, id);
  if (!c.types.includes('Creature') || c.keywords.has('defender') || c.cantAttack) return false;
  if (cantAttackDefender(ctx, id)) return false;
  return !o.summoningSick || c.keywords.has('haste');
}

/** Queen Mother Ramonda: "creatures with power 2 or less can't attack you" while you're the monarch. */
function cantAttackDefender(ctx: Ctx, id: ObjectId): boolean {
  const defender = obj(ctx, id).controller === 'p1' ? 'p2' : 'p1';
  for (const src of ctx.s.battlefield) {
    const so = obj(ctx, src);
    if (so.controller !== defender) continue;
    for (const a of def(ctx, src).abilities)
      if (
        a.kind === 'static' &&
        a.effect.kind === 'cantAttackYou' &&
        checkCondition(ctx, a.effect.condition, defender, so) &&
        matchesFilter(ctx, id, a.effect.filter, src)
      )
        return true;
  }
  return false;
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
  if (characteristics(ctx, attacker).cantBeBlocked) return false;
  // "Can't be blocked by creatures with power 2 or less" (Rust-Shield Rampager).
  for (const ab of def(ctx, attacker).abilities)
    if (
      ab.kind === 'static' &&
      ab.effect.kind === 'cantBeBlockedBy' &&
      matchesFilter(ctx, blocker, ab.effect.filter, attacker)
    )
      return false;
  // Speed: "can't be blocked this turn except by creatures with haste".
  for (const e of ctx.s.effects)
    if (
      e.cantBeBlockedExcept &&
      e.affected.id === attacker &&
      !bc.keywords.has(e.cantBeBlockedExcept)
    )
      return false;
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
 * Default damage assignment for an attacker, made in the attacker's interest.
 * Under current rules (no damage assignment order) the attacker may split
 * damage freely: we kill the most powerful blockers we can afford first. Only
 * if every blocker gets lethal damage can the rest trample over to the player.
 */
function assignAttackerDamage(
  ctx: Ctx,
  a: Attacker,
  amount: number,
  src: DamageSource,
): Assignment[] {
  // Attacking a planeswalker: its damage goes there (if it's still around).
  const walker = a.planeswalker !== undefined ? ctx.s.objects[a.planeswalker] : undefined;
  if (a.planeswalker !== undefined && walker?.zone !== 'battlefield') return [];
  const player: TargetChoice = walker
    ? { object: { id: walker.id, zcc: walker.zcc } }
    : { player: a.defender };
  if (!a.blocked) return [{ src, to: player, amount }];
  const trample = hasKeyword(ctx, a.id, 'trample');
  if (a.blockers.length === 0) return trample ? [{ src, to: player, amount }] : [];
  const deathtouch = hasKeyword(ctx, a.id, 'deathtouch');
  const blockers = a.blockers
    .map((id) => ({ id, power: power(ctx, id), lethal: lethalFor(ctx, id, deathtouch) }))
    .sort((x, y) => y.power - x.power || x.lethal - y.lethal);

  const assigned = new Map<ObjectId, number>();
  let left = amount;
  for (const b of blockers) {
    if (b.lethal <= left) {
      assigned.set(b.id, b.lethal);
      left -= b.lethal;
    }
  }
  if (left > 0) {
    const allLethal = assigned.size === blockers.length;
    if (trample && allLethal) {
      const out = toAssignments(ctx, src, assigned);
      out.push({ src, to: player, amount: left });
      return out;
    }
    // Pile the rest onto the most powerful blocker we couldn't kill (or the first).
    const target = blockers.find((b) => !assigned.has(b.id)) ?? blockers[0]!;
    assigned.set(target.id, (assigned.get(target.id) ?? 0) + left);
  }
  return toAssignments(ctx, src, assigned);
}

function toAssignments(ctx: Ctx, src: DamageSource, m: Map<ObjectId, number>): Assignment[] {
  return [...m]
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ src, to: { object: { id, zcc: obj(ctx, id).zcc } }, amount: n }));
}

/** Combat damage step: all assignments first, then all damage dealt simultaneously. */
export function dealCombatDamage(ctx: Ctx, firstStrikeStep: boolean): void {
  const combat = ctx.s.combat;
  if (!combat) return;
  const assignments: Assignment[] = [];
  const dealt: ObjectId[] = [];

  for (const a of combat.attackers) {
    if (!dealsDamageThisStep(ctx, a.id, firstStrikeStep)) continue;
    const p = combatPower(ctx, a.id);
    dealt.push(a.id);
    if (p <= 0) continue;
    const src = damageSourceFor(ctx, a.id, obj(ctx, a.id).controller);
    assignments.push(...assignAttackerDamage(ctx, a, p, src));
  }
  for (const a of combat.attackers) {
    for (const b of a.blockers) {
      if (!dealsDamageThisStep(ctx, b, firstStrikeStep)) continue;
      dealt.push(b);
      const p = combatPower(ctx, b);
      if (p <= 0) continue;
      const src = damageSourceFor(ctx, b, obj(ctx, b).controller);
      assignments.push({ src, to: { object: { id: a.id, zcc: obj(ctx, a.id).zcc } }, amount: p });
    }
  }

  // Fog Bank: combat damage to or from it is prevented.
  const unpreventable = ctx.s.battlefield.some((id) =>
    def(ctx, id).abilities.some(
      (a) => a.kind === 'static' && a.effect.kind === 'damageCantBePrevented',
    ),
  );
  const prevented = (id: ObjectId) =>
    !unpreventable &&
    def(ctx, id).abilities.some(
      (a) => a.kind === 'static' && a.effect.kind === 'preventCombatDamage',
    );
  for (const x of assignments) {
    if (prevented(x.src.id)) continue;
    if ('object' in x.to && prevented(x.to.object.id)) continue;
    dealDamage(ctx, x.src, x.to, x.amount, true);
  }
  if (firstStrikeStep) combat.dealtFirstStrikeDamage.push(...dealt);
}

export function defenderOf(ctx: Ctx): PlayerId {
  return other(ctx.s.turn.activePlayer);
}

/**
 * The combat damage a creature assigns: its power, or (The Kingpin of Crime)
 * its toughness when that's greater and its controller paid for it this turn.
 */
function combatPower(ctx: Ctx, id: ObjectId): number {
  const p = power(ctx, id);
  if (!ctx.s.turn.toughnessDamage?.includes(obj(ctx, id).controller)) return p;
  return Math.max(p, characteristics(ctx, id).toughness);
}
