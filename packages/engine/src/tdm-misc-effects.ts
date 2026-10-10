import { cardMatches } from './characteristics.ts';
import { type Ctx, type CustomEffect, addCounters, def, obj } from './context.ts';
import type { CardDb, CardDefId, GameObject, ObjectId, PlayerId, StaticDef } from './types.ts';

/**
 * Tarkir: Dragonstorm (19b, misc): the one-offs of the two-colour and colourless cards (Dragonstorm Globe, Windcrag Siege, Stalwart
 * Successor, Host of the Hereafter, Dragonfire Blade, Ugin). Engine helpers; the card vocabulary is in types.ts (search
 * "Tarkir: Dragonstorm (19b, misc)").
 */

// ---------------------------------------------------------------------------
// Which permanents have a static ability of a kind (cached per database: these checks run for every entering permanent)
// ---------------------------------------------------------------------------

const staticDefsCache = new WeakMap<CardDb, Map<string, ReadonlySet<CardDefId>>>();

function defsWithStatic(db: CardDb, kind: StaticDef['kind']): ReadonlySet<CardDefId> {
  let byKind = staticDefsCache.get(db);
  if (!byKind) staticDefsCache.set(db, (byKind = new Map()));
  let ids = byKind.get(kind);
  if (!ids) {
    ids = new Set(
      [...db.values()]
        .filter((d) => d.abilities.some((a) => a.kind === 'static' && a.effect.kind === kind))
        .map((d) => d.id),
    );
    byKind.set(kind, ids);
  }
  return ids;
}

/** The statics of this kind on permanents `player` controls (one entry for each static ability). */
function staticsOf<K extends StaticDef['kind']>(
  ctx: Ctx,
  player: PlayerId,
  kind: K,
): { id: ObjectId; effect: Extract<StaticDef, { kind: K }> }[] {
  const ids = defsWithStatic(ctx.db, kind);
  if (ids.size === 0) return [];
  const out: { id: ObjectId; effect: Extract<StaticDef, { kind: K }> }[] = [];
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== player || !ids.has(o.defId)) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === kind)
        out.push({ id, effect: a.effect as Extract<StaticDef, { kind: K }> });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dragonstorm Globe: "Each Dragon you control enters with an additional +1/+1 counter on it."
// ---------------------------------------------------------------------------

/** How many additional +1/+1 counters the permanent `id`, just put onto the battlefield, enters with. */
export function extraEntryCounters(ctx: Ctx, id: ObjectId): number {
  const o = ctx.s.objects[id];
  if (!o) return 0;
  let n = 0;
  for (const s of staticsOf(ctx, o.controller, 'entersWithExtraCounter'))
    if (cardMatches(ctx, id, s.effect.filter, s.id)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Windcrag Siege (Mardu): attack triggers trigger an additional time
// ---------------------------------------------------------------------------

/**
 * Called after the events of a declaration of attackers were scanned: the triggered abilities that attack caused (queued from
 * `from` on) of a permanent whose controller has a Windcrag Siege of the Mardu choice trigger an additional time for each.
 * Emblems (Dalkovan Encampment's) are not permanents, so they don't.
 */
export function doubleAttackTriggers(ctx: Ctx, from: number): void {
  const queued = ctx.s.pendingTriggers.slice(from);
  if (queued.length === 0) return;
  for (const player of ['p1', 'p2'] as const) {
    const extra = staticsOf(ctx, player, 'attackTriggersTwice').length;
    if (extra === 0) continue;
    const mine = queued.filter(
      (t) =>
        t.controller === player && !t.emblem && ctx.s.objects[t.source.id]?.zone === 'battlefield',
    );
    for (let k = 0; k < extra; k++) for (const t of mine) ctx.s.pendingTriggers.push({ ...t });
  }
}

// ---------------------------------------------------------------------------
// Stalwart Successor, Hollowmurk Siege: counters of any kind put on a creature
// ---------------------------------------------------------------------------

/** Notes that counters (of any kind) were put on a creature, for "the first time counters have been put on it this turn". */
export function noteCreatureCounters(ctx: Ctx, o: GameObject): void {
  const prev = o.anyCountersTimes;
  o.anyCountersTimes =
    prev && prev.turn === ctx.s.turn.number
      ? { turn: prev.turn, times: prev.times + 1 }
      : { turn: ctx.s.turn.number, times: 1 };
}

/** Condition handlers (`{ kind: 'custom', handler }`), checked by triggers.ts. */
export const TDM_MISC_CONDITIONS: Record<
  string,
  (
    ctx: Ctx,
    controller: PlayerId,
    self: GameObject | undefined,
    subject: GameObject | undefined,
  ) => boolean
> = {
  /** Stalwart Successor: it's the first time counters have been put on the creature that caused the trigger this turn. */
  subjectFirstAnyCounters: (ctx, _p, _self, subject) =>
    subject?.anyCountersTimes?.turn === ctx.s.turn.number && subject.anyCountersTimes.times === 1,
};

// ---------------------------------------------------------------------------
// Host of the Hereafter: "put its counters on up to one target creature you control"
// ---------------------------------------------------------------------------

export const TDM_MISC_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Host of the Hereafter: the creature that died (the subject) had counters on it; put counters of each of those kinds, as many of
   * each, on the target creature.
   */
  tdmMoveCountersFromSubject(ctx, es) {
    const subj = es.subject && ctx.s.objects[es.subject.id];
    const t = es.targets[0];
    if (!subj || !t || !('object' in t)) return;
    const target = ctx.s.objects[t.object.id];
    if (!target || target.zone !== 'battlefield' || target.zcc !== t.object.zcc) return;
    const plain = subj.zone === 'battlefield' ? subj.plusOneCounters : (subj.lastCounters ?? 0);
    const named = (subj.zone === 'battlefield' ? subj.counters : subj.lastNamedCounters) ?? {};
    if (plain > 0) addCounters(ctx, target.id, plain);
    for (const [name, n] of Object.entries(named)) if (n > 0) addCounters(ctx, target.id, n, name);
  },
};

/** Is the source monocolored (exactly one colour)? Used by hexproof from monocolored. */
export function isMonocolored(ctx: Ctx, sourceId: ObjectId): boolean {
  return def(ctx, sourceId).colors.length === 1;
}
