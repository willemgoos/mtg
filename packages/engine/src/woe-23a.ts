import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import { isCreature } from './characteristics.ts';
import { type Ctx, createObject, def, emit, moveObject, newTimestamp, obj } from './context.ts';
import { type EffectSource, objectsOf, plusFoodTokens } from './effects.ts';
import { attachAura } from './stack.ts';
import { forEachBattlefieldTrigger } from './triggers.ts';
import type {
  CardDefId,
  CardDefinition,
  CardDb,
  EffectDef,
  GameEvent,
  GameObject,
  ObjectId,
  PlayerId,
} from './types.ts';

/**
 * Wilds of Eldraine (23a): Roles, celebration, the Restless lands' animation, "whenever you tap an untapped creature an opponent
 * controls" and cards that have an Adventure. Engine helpers; the card vocabulary is in types.ts (search "Wilds of Eldraine (23a)").
 * Bargain is the kicker (`kicker.as: 'bargain'`) with a sacrifice filter and an optional cost reduction (`kicker.costReduction`).
 */

// ---------------------------------------------------------------------------
// Roles (rule 303.7)
// ---------------------------------------------------------------------------

/** Is this permanent a Role (an Aura with the Role subtype)? */
export function isRole(ctx: Ctx, id: ObjectId): boolean {
  return def(ctx, id).subtypes.includes('Role');
}

/**
 * "Create a <role> Role token attached to <host>" under `controller`: the token enters the battlefield attached to the creature
 * (token doublers make more, which the state-based action then trims to one). Nothing is created if the host isn't a creature on
 * the battlefield any more. Returns the tokens made.
 */
export function createRoleToken(
  ctx: Ctx,
  role: CardDefId,
  controller: PlayerId,
  host: ObjectId,
): ObjectId[] {
  const h = ctx.s.objects[host];
  if (!h || h.zone !== 'battlefield' || !isCreature(ctx, host)) return [];
  const made: ObjectId[] = [];
  const n = tokenMultiplier(ctx, controller);
  for (let i = 0; i < n; i++) {
    const t = createObject(ctx, role, controller, 'battlefield', true);
    t.attachedTo = host;
    ctx.s.battlefield.push(t.id);
    attachAura(ctx, t.id, host);
    emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
    made.push(t.id);
  }
  if (n > 0) plusFoodTokens(ctx, controller); // Tippy-Toe and the like ("whenever you create one or more tokens")
  return made;
}

/** The `createRole` effect: a Role on each creature `to` names. */
export function runCreateRole(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'createRole' }>,
): void {
  for (const host of objectsOf(ctx, es, e.to)) createRoleToken(ctx, e.role, es.controller, host);
}

/**
 * Rule 303.7 (state-based action 704.5y): a permanent with more than one Role controlled by the same player attached keeps only
 * the one with the latest timestamp; the others are put into their owners' graveyards. Returns whether any were.
 */
export function rolesSBA(ctx: Ctx): boolean {
  const newest = new Map<string, ObjectId>();
  const out: ObjectId[] = [];
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.attachedTo === undefined || !isRole(ctx, id)) continue;
    const key = `${o.attachedTo}:${o.controller}`;
    const prev = newest.get(key);
    if (prev === undefined) newest.set(key, id);
    // A later one on the battlefield list with the same timestamp is the newer one.
    else if (obj(ctx, prev).timestamp <= o.timestamp) {
      out.push(prev);
      newest.set(key, id);
    } else out.push(id);
  }
  for (const id of out) moveObject(ctx, id, 'graveyard');
  return out.length > 0;
}

// ---------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------

/** Counts a nonland permanent that entered the battlefield under its controller's control (celebration). */
export function noteNonlandEntered(ctx: Ctx, entered: GameObject): void {
  if (entered.zone !== 'battlefield' || def(ctx, entered.id).types.includes('Land')) return;
  const counts = (ctx.s.turn.nonlandEntered ??= {});
  counts[entered.controller] = (counts[entered.controller] ?? 0) + 1;
}

/** Celebration: two or more nonland permanents entered the battlefield under `player`'s control this turn. */
export function celebrating(ctx: Ctx, player: PlayerId): boolean {
  return (ctx.s.turn.nonlandEntered?.[player] ?? 0) >= 2;
}

// ---------------------------------------------------------------------------
// "Becomes a P/T creature until end of turn. It's still a land."
// ---------------------------------------------------------------------------

/** The `animate` effect (Restless lands, Brave the Wilds, Tough Cookie). */
export function runAnimate(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'animate' }>,
): void {
  for (const id of objectsOf(ctx, es, e.what)) {
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield') continue;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: e.keywords ?? [],
      becomesCreature: true,
      // It keeps its other card types and gains no new ones ("It's still a land").
      creatureOnly: true,
      basePT: [e.power, e.toughness],
      ...(e.subtype ? { creatureSubtype: e.subtype } : {}),
      expires: e.permanent ? 'permanent' : 'endOfTurn',
    });
    if (e.colors) {
      o.colorOverride = {
        colors: [...e.colors],
        ...(e.permanent ? {} : { untilTurn: ctx.s.turn.number }),
      };
      ctx.s.colorChanges = true;
    }
    if (e.abilities?.length && !e.permanent)
      o.tempAbilities = [...(o.tempAbilities ?? []), ...e.abilities];
  }
}

// ---------------------------------------------------------------------------
// "Whenever you tap an untapped creature an opponent controls"
// ---------------------------------------------------------------------------

/** A `tapped` event: the triggers of the player whose spell or ability tapped a creature an opponent controls. */
export function detectTapOpponentCreature(
  ctx: Ctx,
  ev: Extract<GameEvent, { type: 'tapped' }>,
): void {
  const by = ev.by;
  const tapped = ctx.s.objects[ev.id];
  if (!by || !tapped || tapped.zone !== 'battlefield' || tapped.controller === by) return;
  if (!isCreature(ctx, tapped.id)) return;
  forEachBattlefieldTrigger(
    ctx,
    (o, a) => a.trigger.on === 'youTapOpponentCreature' && o.controller === by,
    tapped,
  );
}

// ---------------------------------------------------------------------------
// Cards that have an Adventure
// ---------------------------------------------------------------------------

/** Does this card definition have an Adventure (its back face is an Adventure spell, not an Omen)? */
export function defHasAdventure(db: CardDb, d: CardDefinition): boolean {
  if (!d.adventure || !d.back) return false;
  return !!db.get(d.back)?.subtypes.includes('Adventure');
}

/** `ownsInExile`: `player` owns a card in exile matching the check. */
export function ownsInExile(
  ctx: Ctx,
  player: PlayerId,
  matches: (id: ObjectId) => boolean,
): boolean {
  return ctx.s.players[player].exile.some((id) => matches(id));
}
