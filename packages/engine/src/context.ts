import { characteristics } from './characteristics.ts';
import type { EffectSource } from './effects.ts';
import type {
  CardDb,
  CardDefinition,
  GameEvent,
  GameObject,
  GameState,
  ObjectId,
  ObjectRef,
  PlayerId,
  ZoneName,
} from './types.ts';

export type CustomEffect = (
  ctx: Ctx,
  source: EffectSource,
  params: Record<string, unknown> | undefined,
) => void;

/**
 * Everything engine internals need. `s` is an Immer draft during applyAction
 * (mutate freely) and the plain state for read-only queries.
 */
export interface Ctx {
  s: GameState;
  db: CardDb;
  events: GameEvent[];
  /** Index into `events` up to which triggers have been collected. */
  triggerCursor: number;
  customEffects: Readonly<Record<string, CustomEffect>>;
}

export function makeCtx(
  s: GameState,
  db: CardDb,
  customEffects: Readonly<Record<string, CustomEffect>> = {},
): Ctx {
  return { s, db, events: [], triggerCursor: 0, customEffects };
}

export function other(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export function obj(ctx: Ctx, id: ObjectId): GameObject {
  const o = ctx.s.objects[id];
  if (!o) throw new Error(`Unknown object ${id}`);
  return o;
}

export function defOf(ctx: Ctx, defId: string): CardDefinition {
  const d = ctx.db.get(defId);
  if (!d) throw new Error(`Unknown card definition ${defId}`);
  return d;
}

export function def(ctx: Ctx, id: ObjectId): CardDefinition {
  return defOf(ctx, obj(ctx, id).defId);
}

export function refOf(o: GameObject): ObjectRef {
  return { id: o.id, zcc: o.zcc };
}

/** The object behind a ref, if it hasn't changed zones since the ref was taken. */
export function deref(ctx: Ctx, ref: ObjectRef): GameObject | undefined {
  const o = ctx.s.objects[ref.id];
  return o && o.zcc === ref.zcc ? o : undefined;
}

export function onBattlefield(ctx: Ctx, ref: ObjectRef): GameObject | undefined {
  const o = deref(ctx, ref);
  return o && o.zone === 'battlefield' ? o : undefined;
}

export function emit(ctx: Ctx, ev: GameEvent): void {
  ctx.events.push(ev);
}

export function newId(ctx: Ctx): ObjectId {
  return `o${ctx.s.nextObjectId++}`;
}

export function newTimestamp(ctx: Ctx): number {
  return ctx.s.nextTimestamp++;
}

export function createObject(
  ctx: Ctx,
  defId: string,
  owner: PlayerId,
  zone: ZoneName,
  isToken = false,
): GameObject {
  const o: GameObject = {
    id: newId(ctx),
    defId,
    owner,
    controller: owner,
    zone,
    zcc: 0,
    timestamp: newTimestamp(ctx),
    tapped: false,
    summoningSick: true,
    damage: 0,
    damagedByDeathtouch: false,
    plusOneCounters: 0,
    isToken,
  };
  ctx.s.objects[o.id] = o;
  return o;
}

function zoneList(ctx: Ctx, o: GameObject, zone: ZoneName): ObjectId[] | null {
  switch (zone) {
    case 'battlefield':
      return ctx.s.battlefield;
    case 'stack':
      return null; // the stack holds StackItems, managed by stack.ts
    default:
      return ctx.s.players[o.owner][zone];
  }
}

export interface MoveOptions {
  /** Library position; default top. */
  position?: 'top' | 'bottom';
  controller?: PlayerId;
}

/**
 * Moves an object between zones. The object keeps its id but becomes a new
 * object for rules purposes: zcc is bumped and per-zone status is reset.
 */
export function moveObject(ctx: Ctx, id: ObjectId, to: ZoneName, opts: MoveOptions = {}): void {
  const o = obj(ctx, id);
  const from = o.zone;
  // "If it would die this turn, exile it instead."
  if (
    from === 'battlefield' &&
    to === 'graveyard' &&
    (o.counters?.finality ||
      ctx.s.effects.some((e) => e.exileIfDies && e.affected.id === id && e.affected.zcc === o.zcc))
  )
    to = 'exile';
  // Equipment and Auras attached to it are dealt with by state-based actions.
  const returning = from === 'battlefield' ? o.exiledUntilLeaves : undefined;
  if (from === 'battlefield') {
    const c = characteristics(ctx, id);
    o.lastPower = c.power;
    o.lastCounters = o.plusOneCounters;
    if (to === 'graveyard' && c.types.includes('Creature')) ctx.s.turn.creaturesDied++;
    if (o.addedSubtypes) o.lastAddedSubtypes = o.addedSubtypes;
    else delete o.lastAddedSubtypes;
    delete o.addedSubtypes;
    const host = o.attachedTo !== undefined ? ctx.s.objects[o.attachedTo] : undefined;
    if (host)
      o.lastAttachedTo = {
        id: host.id,
        zcc: host.zone === 'battlefield' ? host.zcc : host.zcc - 1,
      };
    else delete o.lastAttachedTo;
  }
  delete o.attachedTo;
  delete o.usedAbilities;
  delete o.exiledUntilLeaves;
  delete o.kicked;
  delete o.counters;
  delete o.targetedByControllerTurn;
  delete o.resolutions;
  const src = zoneList(ctx, o, from);
  if (src) {
    const i = src.indexOf(id);
    if (i >= 0) src.splice(i, 1);
  }
  if (from === 'battlefield') removeFromCombat(ctx, id);

  o.zone = to;
  o.zcc++;
  o.zoneTurn = ctx.s.turn.number;
  o.timestamp = newTimestamp(ctx);
  o.tapped = false;
  o.damage = 0;
  o.damagedByDeathtouch = false;
  o.plusOneCounters = 0;
  o.summoningSick = true;
  o.controller = to === 'battlefield' || to === 'stack' ? (opts.controller ?? o.owner) : o.owner;
  if (to === 'battlefield' && defOf(ctx, o.defId).entersTapped) o.tapped = true;

  // Tokens cease to exist once they leave the battlefield (rule 111.7).
  const ceases = o.isToken && to !== 'battlefield';
  const dst = ceases ? null : zoneList(ctx, o, to);
  if (dst) {
    if (to === 'library' && opts.position !== 'bottom') dst.unshift(id);
    else dst.push(id);
  }
  emit(ctx, { type: 'objectMoved', id, defId: o.defId, from, to });

  if (ceases) delete ctx.s.objects[id];
  // "Until this leaves the battlefield": the exiled cards come back.
  for (const back of returning ?? [])
    if (ctx.s.objects[back]?.zone === 'exile') moveObject(ctx, back, 'battlefield');
}

/** Sacrifices a permanent: its controller puts it into its owner's graveyard. */
export function sacrifice(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  emit(ctx, { type: 'sacrificed', id, defId: o.defId, player: o.controller });
  moveObject(ctx, id, 'graveyard');
}

function removeFromCombat(ctx: Ctx, id: ObjectId): void {
  const c = ctx.s.combat;
  if (!c) return;
  c.attackers = c.attackers.filter((a) => a.id !== id);
  for (const a of c.attackers) a.blockers = a.blockers.filter((b) => b !== id);
}

export function drawCard(ctx: Ctx, player: PlayerId): void {
  const p = ctx.s.players[player];
  const top = p.library[0];
  if (top === undefined) {
    p.drewFromEmptyLibrary = true;
    return;
  }
  moveObject(ctx, top, 'hand');
  const nth = ++ctx.s.turn.cardsDrawn[player];
  emit(ctx, { type: 'cardDrawn', player, id: top, nth });
}

export function tap(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (o.tapped) return;
  o.tapped = true;
  emit(ctx, { type: 'tapped', id });
}

export function untap(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (!o.tapped) return;
  o.tapped = false;
  emit(ctx, { type: 'untapped', id });
}
