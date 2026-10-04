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
import { manaSources } from './mana.ts';
import type { Attacker, ObjectId, PlayerId, TargetChoice } from './types.ts';

export function canAttack(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (o.zone !== 'battlefield' || o.tapped || o.controller !== ctx.s.turn.activePlayer)
    return false;
  const c = characteristics(ctx, id);
  // Final Fantasy Commander (12f): Demon Wall attacks as though it lacked defender while it has a counter.
  const defenderOff =
    def(ctx, id).abilities.some(
      (a) => a.kind === 'static' && a.effect.kind === 'attacksWithCounterDespiteDefender',
    ) &&
    (o.plusOneCounters > 0 || Object.values(o.counters ?? {}).some((n) => n > 0));
  // Reality Fracture (17a): Surveillance Phantasm attacks as though it lacked defender once you've scried or surveilled.
  const defenderOffWhile = def(ctx, id).abilities.some(
    (a) =>
      a.kind === 'static' &&
      a.effect.kind === 'canAttackDespiteDefender' &&
      checkCondition(ctx, a.effect.condition, o.controller, o),
  );
  // Strixhaven (13b): Prismari Pledgemage can attack this turn despite defender.
  const ignoreDefender = ctx.s.effects.some(
    (e) => e.ignoreDefender && e.affected.id === id && e.affected.zcc === o.zcc,
  );
  if (
    !c.types.includes('Creature') ||
    (c.keywords.has('defender') && !defenderOff && !defenderOffWhile && !ignoreDefender) ||
    c.cantAttack
  )
    return false;
  if (cantAttackDefender(ctx, id)) return false;
  // Promise of Loyalty: it can't attack the player it made its vow to.
  if (o.vowedTo && o.vowedTo !== o.controller) return false;
  return !o.summoningSick || c.keywords.has('haste');
}

/** Goaded, or "attacks each combat if able" (Galactus while there's no Silver Surfer). */
export function mustAttack(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (ctx.s.effects.some((e) => e.mustAttack && e.affected.id === id && e.affected.zcc === o.zcc))
    return true;
  return def(ctx, id).abilities.some(
    (a) =>
      a.kind === 'static' &&
      a.effect.kind === 'attacksEachCombat' &&
      checkCondition(ctx, a.effect.condition, o.controller, o),
  );
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
  // Storm, Windrider: "Creatures with flying can't block creatures you control."
  if (
    bc.keywords.has('flying') &&
    ctx.s.battlefield.some(
      (id) =>
        obj(ctx, id).controller === obj(ctx, attacker).controller &&
        def(ctx, id).abilities.some(
          (x) => x.kind === 'static' && x.effect.kind === 'flyersCantBlockYours',
        ),
    )
  )
    return false;
  // Reality Fracture (17a): Tetsuko Umezawa, "creatures you control with power or toughness 1 or less can't be blocked".
  for (const src of ctx.s.battlefield) {
    if (obj(ctx, src).controller !== obj(ctx, attacker).controller) continue;
    for (const ab of def(ctx, src).abilities)
      if (
        ab.kind === 'static' &&
        ab.effect.kind === 'grantsCantBeBlocked' &&
        matchesFilter(ctx, attacker, ab.effect.filter, src)
      )
        return false;
  }
  // "Can't be blocked by creatures with power 2 or less" (Rust-Shield Rampager).
  for (const ab of def(ctx, attacker).abilities)
    if (
      ab.kind === 'static' &&
      ab.effect.kind === 'cantBeBlockedBy' &&
      matchesFilter(ctx, blocker, ab.effect.filter, attacker)
    )
      return false;
  // Strixhaven Brawl (15b, g): Mistcutter Hydra can't be blocked by blue creatures.
  if (hasKeyword(ctx, attacker, 'protectionBlue') && def(ctx, blocker).colors.includes('U'))
    return false;
  // Marvel Super Heroes Jumpstart (Great Lakes Avengers): Doorman, until end of turn.
  for (const e of ctx.s.effects)
    if (
      e.cantBeBlockedBy &&
      e.affected.id === attacker &&
      e.affected.zcc === obj(ctx, attacker).zcc &&
      matchesFilter(ctx, blocker, e.cantBeBlockedBy, attacker)
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

/** Final Fantasy (11c): an attacker with The Masamune must be blocked if able. */
export function mustBeBlocked(ctx: Ctx, id: ObjectId): boolean {
  if (!ctx.s.combat?.attackers.some((a) => a.id === id)) return false;
  // Final Fantasy (11c): leftovers. Magitek Scythe: "must be blocked this turn if able".
  const o = obj(ctx, id);
  if (
    ctx.s.effects.some((e) => e.mustBeBlocked && e.affected.id === id && e.affected.zcc === o.zcc)
  )
    return true;
  return ctx.s.battlefield.some(
    (e) =>
      obj(ctx, e).attachedTo === id &&
      def(ctx, e).abilities.some(
        (a) =>
          a.kind === 'static' && a.effect.kind === 'attached' && !!a.effect.mustBeBlockedAttacking,
      ),
  );
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
    // Final Fantasy (11c): leftovers. Relentless X-ATM092: three or more blockers.
    else if (n > 0 && n < minBlockers(ctx, a.id)) out.push(a.id);
  }
  return out;
}

/** Final Fantasy (11c): the fewest creatures that may block it ("except by three or more creatures"). */
export function minBlockers(ctx: Ctx, id: ObjectId): number {
  let n = 1;
  for (const a of def(ctx, id).abilities)
    if (a.kind === 'static' && a.effect.kind === 'minBlockers') n = Math.max(n, a.effect.count);
  return n;
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
  // Fleeting Flight: combat damage to it this turn is prevented.
  const shielded = (id: ObjectId) =>
    !unpreventable &&
    ctx.s.effects.some(
      (e) => e.preventCombatDamage && e.affected.id === id && e.affected.zcc === obj(ctx, id).zcc,
    );
  for (const x of assignments) {
    if (prevented(x.src.id)) continue;
    if ('object' in x.to && (prevented(x.to.object.id) || shielded(x.to.object.id))) continue;
    dealDamage(ctx, x.src, x.to, x.amount, true);
  }
  if (firstStrikeStep) combat.dealtFirstStrikeDamage.push(...dealt);
}

export function defenderOf(ctx: Ctx): PlayerId {
  return other(ctx.s.turn.activePlayer);
}

/** Propaganda: what each attacker costs `player` (0 if nothing taxes them). */
export function attackTax(ctx: Ctx, player: PlayerId): number {
  let tax = 0;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller === player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'attackTax') tax += a.effect.amount;
  }
  return tax;
}

/** How many creatures `player` can attack with, given the attack tax and their mana. */
export function affordableAttackers(ctx: Ctx, player: PlayerId): number {
  const tax = attackTax(ctx, player);
  return tax === 0 ? Infinity : Math.floor(manaSources(ctx, player).length / tax);
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
