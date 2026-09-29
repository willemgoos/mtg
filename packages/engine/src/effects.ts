import {
  creaturesOnBattlefield,
  hasKeyword,
  lifeGainPrevented,
  matchesFilter,
  power,
} from './characteristics.ts';
import {
  type Ctx,
  createObject,
  defOf,
  drawCard,
  emit,
  moveObject,
  newTimestamp,
  obj,
  onBattlefield,
  other,
} from './context.ts';
import type {
  Amount,
  CardDefId,
  EffectDef,
  Keyword,
  ObjectId,
  ObjectRef,
  PlayerId,
  Ref,
  TargetChoice,
} from './types.ts';

/** What an effect needs to know about the spell or ability producing it. */
export interface EffectSource {
  controller: PlayerId;
  /** The card/permanent the effect comes from. */
  source: ObjectRef | null;
  sourceDefId: CardDefId;
  /** Chosen targets; null where the target became illegal. */
  targets: (TargetChoice | null)[];
  lkiPower?: number;
}

// ---------------------------------------------------------------------------
// Damage and life
// ---------------------------------------------------------------------------

export interface DamageSource {
  id: ObjectId;
  controller: PlayerId;
  keywords: ReadonlySet<Keyword> | readonly Keyword[];
}

function has(src: DamageSource, k: Keyword): boolean {
  return Array.isArray(src.keywords)
    ? src.keywords.includes(k)
    : (src.keywords as ReadonlySet<Keyword>).has(k);
}

export function dealDamage(
  ctx: Ctx,
  src: DamageSource,
  to: TargetChoice,
  amount: number,
  combat: boolean,
): void {
  if (amount <= 0) return;
  if ('player' in to) {
    emit(ctx, { type: 'damageDealt', source: src.id, to, amount, combat });
    changeLife(ctx, to.player, -amount);
  } else {
    const o = onBattlefield(ctx, to.object);
    if (!o) return;
    o.damage += amount;
    if (has(src, 'deathtouch')) o.damagedByDeathtouch = true;
    emit(ctx, { type: 'damageDealt', source: src.id, to, amount, combat });
  }
  if (has(src, 'lifelink')) gainLife(ctx, src.controller, amount);
}

export function changeLife(ctx: Ctx, player: PlayerId, delta: number): void {
  if (delta === 0) return;
  const p = ctx.s.players[player];
  p.life += delta;
  emit(ctx, { type: 'lifeChanged', player, delta, life: p.life });
}

export function gainLife(ctx: Ctx, player: PlayerId, amount: number): void {
  if (amount > 0 && !lifeGainPrevented(ctx)) changeLife(ctx, player, amount);
}

/** Damage source info for a permanent (live) or, failing that, the card definition. */
export function damageSourceFor(ctx: Ctx, id: ObjectId, controller: PlayerId): DamageSource {
  const o = ctx.s.objects[id];
  if (o && o.zone === 'battlefield') {
    const keywords = new Set<Keyword>();
    for (const k of ['deathtouch', 'lifelink'] as const)
      if (hasKeyword(ctx, id, k)) keywords.add(k);
    return { id, controller: o.controller, keywords };
  }
  const defId = o?.defId;
  return { id, controller, keywords: defId ? defOf(ctx, defId).keywords : [] };
}

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

function sourceOnBattlefield(ctx: Ctx, es: EffectSource): ObjectId | null {
  return es.source ? (onBattlefield(ctx, es.source)?.id ?? null) : null;
}

/** Resolves a ref to players and/or permanents, in that order. */
export function resolveRef(ctx: Ctx, es: EffectSource, ref: Ref): TargetChoice[] {
  if (typeof ref === 'object' && 'target' in ref) {
    const t = es.targets[ref.target];
    if (!t) return [];
    if ('object' in t) return onBattlefield(ctx, t.object) ? [t] : [];
    return [t];
  }
  if (ref === 'self') {
    const id = sourceOnBattlefield(ctx, es);
    return id ? [{ object: { id, zcc: obj(ctx, id).zcc } }] : [];
  }
  if (ref === 'controller') return [{ player: es.controller }];
  if (ref === 'eachOpponent') return [{ player: other(es.controller) }];
  const sourceId = es.source?.id;
  return creaturesOnBattlefield(ctx)
    .filter((c) => {
      if (ref.controller === 'you' && c.controller !== es.controller) return false;
      if (ref.controller === 'opponent' && c.controller === es.controller) return false;
      return matchesFilter(ctx, c.id, ref.filter, sourceId);
    })
    .map((c) => ({ object: { id: c.id, zcc: c.zcc } }));
}

function objectsOf(ctx: Ctx, es: EffectSource, ref: Ref): ObjectId[] {
  return resolveRef(ctx, es, ref).flatMap((t) => ('object' in t ? [t.object.id] : []));
}

function playersOf(ctx: Ctx, es: EffectSource, ref: Ref): PlayerId[] {
  return resolveRef(ctx, es, ref).flatMap((t) => ('player' in t ? [t.player] : []));
}

export function resolveAmount(ctx: Ctx, es: EffectSource, amount: Amount): number {
  if (typeof amount === 'number') return amount;
  if ('powerOf' in amount) {
    const ids = objectsOf(ctx, es, amount.powerOf);
    if (ids[0]) return Math.max(0, power(ctx, ids[0]));
    if (amount.powerOf === 'self' && es.lkiPower !== undefined) return Math.max(0, es.lkiPower);
    return 0;
  }
  if (amount.count === 'creaturesYouControl')
    return creaturesOnBattlefield(ctx, es.controller).length;
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    return o.controller === es.controller && defOf(ctx, o.defId).types.includes('Land');
  }).length;
}

// ---------------------------------------------------------------------------
// Effect interpreter
// ---------------------------------------------------------------------------

export function runEffects(ctx: Ctx, es: EffectSource, effects: readonly EffectDef[]): void {
  for (const e of effects) runEffect(ctx, es, e);
}

function runEffect(ctx: Ctx, es: EffectSource, e: EffectDef): void {
  switch (e.kind) {
    case 'damage': {
      const amount = resolveAmount(ctx, es, e.amount);
      let src: DamageSource;
      if (e.from) {
        const fromId = objectsOf(ctx, es, e.from)[0];
        if (!fromId) return; // the creature meant to deal the damage is gone
        src = damageSourceFor(ctx, fromId, es.controller);
      } else {
        const id = es.source?.id ?? 'unknown';
        src = damageSourceFor(ctx, id, es.controller);
      }
      for (const t of resolveRef(ctx, es, e.to)) dealDamage(ctx, src, t, amount, false);
      return;
    }
    case 'pump':
      for (const id of objectsOf(ctx, es, e.to)) {
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: e.power,
          toughness: e.toughness,
          keywords: e.keywords ?? [],
          expires: 'endOfTurn',
        });
      }
      return;
    case 'counters': {
      const n = resolveAmount(ctx, es, e.amount);
      for (const id of objectsOf(ctx, es, e.to)) obj(ctx, id).plusOneCounters += n;
      return;
    }
    case 'fight': {
      const a = objectsOf(ctx, es, e.a)[0];
      const b = objectsOf(ctx, es, e.b)[0];
      if (!a || !b) return; // rule 701.12b
      const pa = power(ctx, a);
      const pb = power(ctx, b);
      const sa = damageSourceFor(ctx, a, es.controller);
      const sb = damageSourceFor(ctx, b, obj(ctx, b).controller);
      dealDamage(ctx, sa, { object: { id: b, zcc: obj(ctx, b).zcc } }, pa, false);
      dealDamage(ctx, sb, { object: { id: a, zcc: obj(ctx, a).zcc } }, pb, false);
      return;
    }
    case 'destroy':
    case 'sacrifice': {
      for (const id of objectsOf(ctx, es, e.what)) moveObject(ctx, id, 'graveyard');
      return;
    }
    case 'gainLife': {
      const n = resolveAmount(ctx, es, e.amount);
      for (const p of playersOf(ctx, es, e.who)) gainLife(ctx, p, n);
      return;
    }
    case 'loseLife': {
      const n = resolveAmount(ctx, es, e.amount);
      for (const p of playersOf(ctx, es, e.who)) changeLife(ctx, p, -n);
      return;
    }
    case 'draw': {
      const n = resolveAmount(ctx, es, e.amount);
      for (const p of playersOf(ctx, es, e.who)) for (let i = 0; i < n; i++) drawCard(ctx, p);
      return;
    }
    case 'createToken': {
      const n = resolveAmount(ctx, es, e.count);
      for (let i = 0; i < n; i++) {
        const t = createObject(ctx, e.token, es.controller, 'battlefield', true);
        ctx.s.battlefield.push(t.id);
        emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
      }
      return;
    }
    case 'custom': {
      const fn = ctx.customEffects[e.handler];
      if (!fn) throw new Error(`No custom effect handler "${e.handler}"`);
      fn(ctx, es, e.params);
      return;
    }
  }
}
