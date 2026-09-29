import { type Ctx, def, defOf, obj } from './context.ts';
import type {
  CardDb,
  CardDefinition,
  CardDefId,
  CardFilter,
  CardType,
  GameObject,
  Keyword,
  ObjectId,
  PlayerId,
} from './types.ts';

export interface Characteristics {
  power: number;
  toughness: number;
  /** Shared between calls: never mutate. */
  keywords: ReadonlySet<Keyword>;
  types: readonly CardType[];
  subtypes: readonly string[];
  cantBlock: boolean;
}

/**
 * Current characteristics of a permanent: printed values + counters +
 * until-end-of-turn effects + static abilities of permanents (a small layer-7
 * subset; every effect in our pool is additive, so order doesn't matter).
 */
export function characteristics(ctx: Ctx, id: ObjectId): Characteristics {
  const o = obj(ctx, id);
  const d = def(ctx, id);
  let power = (d.power ?? 0) + o.plusOneCounters;
  let toughness = (d.toughness ?? 0) + o.plusOneCounters;
  // Copy-on-write: most creatures have no granted keywords, so share the printed set.
  let keywords = printedKeywords(d);
  let granted: Set<Keyword> | null = null;
  let cantBlock = false;

  if (o.zone === 'battlefield') {
    for (const e of ctx.s.effects) {
      if (e.affected.id !== id || e.affected.zcc !== o.zcc) continue;
      power += e.power;
      toughness += e.toughness;
      if (e.keywords.length) {
        granted ??= new Set(keywords);
        for (const k of e.keywords) granted.add(k);
      }
    }
    const withStatics = staticDefs(ctx.db);
    for (const srcId of ctx.s.battlefield) {
      const src = obj(ctx, srcId);
      if (!withStatics.has(src.defId)) continue;
      for (const a of defOf(ctx, src.defId).abilities) {
        if (a.kind !== 'static') continue;
        const st = a.effect;
        if (st.kind === 'cantBlock' && srcId === id) cantBlock = true;
        if (st.kind !== 'anthem') continue;
        if (src.controller !== o.controller || !d.types.includes('Creature')) continue;
        if (st.affects === 'otherCreaturesYouControl' && srcId === id) continue;
        if (st.filter?.subtype && !d.subtypes.includes(st.filter.subtype)) continue;
        power += st.power;
        toughness += st.toughness;
        if (st.keywords?.length) {
          granted ??= new Set(keywords);
          for (const k of st.keywords) granted.add(k);
        }
      }
    }
  }
  if (granted) keywords = granted;
  return { power, toughness, keywords, types: d.types, subtypes: d.subtypes, cantBlock };
}

const printedCache = new WeakMap<CardDefinition, ReadonlySet<Keyword>>();

function printedKeywords(d: CardDefinition): ReadonlySet<Keyword> {
  let set = printedCache.get(d);
  if (!set) {
    set = new Set(d.keywords);
    printedCache.set(d, set);
  }
  return set;
}

export function power(ctx: Ctx, id: ObjectId): number {
  return characteristics(ctx, id).power;
}

export function toughness(ctx: Ctx, id: ObjectId): number {
  return characteristics(ctx, id).toughness;
}

export function hasKeyword(ctx: Ctx, id: ObjectId, k: Keyword): boolean {
  return characteristics(ctx, id).keywords.has(k);
}

export function isType(ctx: Ctx, id: ObjectId, t: CardType): boolean {
  return def(ctx, id).types.includes(t);
}

export function isCreature(ctx: Ctx, id: ObjectId): boolean {
  return isType(ctx, id, 'Creature');
}

export function creaturesOnBattlefield(ctx: Ctx, controller?: PlayerId): GameObject[] {
  const out: GameObject[] = [];
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (isCreature(ctx, id) && (!controller || o.controller === controller)) out.push(o);
  }
  return out;
}

export function isAttacking(ctx: Ctx, id: ObjectId): boolean {
  return !!ctx.s.combat?.attackers.some((a) => a.id === id);
}

/** Can this permanent's {T} abilities be activated (rule 302.6)? */
export function canTapForAbility(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (o.tapped) return false;
  return !isCreature(ctx, id) || !o.summoningSick || hasKeyword(ctx, id, 'haste');
}

export function matchesFilter(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter | undefined,
  sourceId?: ObjectId,
): boolean {
  if (!filter) return true;
  const c = characteristics(ctx, id);
  if (filter.maxPower !== undefined && c.power > filter.maxPower) return false;
  if (filter.minPower !== undefined && c.power < filter.minPower) return false;
  if (filter.hasKeyword && !c.keywords.has(filter.hasKeyword)) return false;
  if (filter.lacksKeyword && c.keywords.has(filter.lacksKeyword)) return false;
  if (filter.tapped !== undefined && obj(ctx, id).tapped !== filter.tapped) return false;
  if (filter.attacking !== undefined && isAttacking(ctx, id) !== filter.attacking) return false;
  if (filter.subtype && !c.subtypes.includes(filter.subtype)) return false;
  if (filter.other && id === sourceId) return false;
  return true;
}

/** Is life gain prevented for this player (e.g. Giant Cindermaw)? */
export function lifeGainPrevented(ctx: Ctx): boolean {
  const withStatics = staticDefs(ctx.db);
  return ctx.s.battlefield.some((id) => {
    const defId = obj(ctx, id).defId;
    return (
      withStatics.has(defId) &&
      defOf(ctx, defId).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'noLifeGain')
    );
  });
}

const staticDefsCache = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** Card definitions with at least one static ability (computed once per database). */
function staticDefs(db: CardDb): ReadonlySet<CardDefId> {
  let set = staticDefsCache.get(db);
  if (!set) {
    set = new Set(
      [...db.values()].filter((d) => d.abilities.some((a) => a.kind === 'static')).map((d) => d.id),
    );
    staticDefsCache.set(db, set);
  }
  return set;
}
