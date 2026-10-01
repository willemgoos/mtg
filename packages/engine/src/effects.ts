import {
  characteristics,
  cardMatches,
  countOf,
  creaturesOnBattlefield,
  hasKeyword,
  lifeGainPrevented,
  matchesFilter,
  power,
} from './characteristics.ts';
import {
  type Ctx,
  createObject,
  def,
  defOf,
  drawCard,
  emit,
  moveObject,
  newTimestamp,
  obj,
  onBattlefield,
  other,
  sacrifice,
  tap,
  untap,
} from './context.ts';
import { foodsOf } from './forage.ts';
import { manaValue } from './mana.ts';
import { shuffleInPlace } from './rng.ts';
import { checkCondition } from './triggers.ts';
import type {
  Amount,
  EffectSource,
  PausedResolution,
  EffectDef,
  Keyword,
  ObjectId,
  PlayerId,
  Ref,
  TargetChoice,
} from './types.ts';

export type { EffectSource } from './types.ts';

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
  if (delta < 0) (ctx.s.turn.lifeLost ??= { p1: 0, p2: 0 })[player]++;
  emit(ctx, { type: 'lifeChanged', player, delta, life: p.life });
}

export function gainLife(ctx: Ctx, player: PlayerId, amount: number): void {
  if (amount <= 0 || lifeGainPrevented(ctx)) return;
  // Angel of Vitality: "you gain that much life plus 1 instead".
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'extraLifeGain') amount += a.effect.amount;
  }
  ctx.s.turn.lifeGains[player]++;
  changeLife(ctx, player, amount);
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
  if (typeof ref === 'object' && 'controllerOf' in ref) {
    const t = es.targets[ref.controllerOf];
    const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    return o ? [{ player: o.controller }] : [];
  }
  if (ref === 'eachOpponent') return [{ player: other(es.controller) }];
  if (ref === 'eachPlayer') return [{ player: 'p1' }, { player: 'p2' }];
  if (ref === 'attached') {
    const host = es.source && ctx.s.objects[es.source.id]?.attachedTo;
    const o = host && ctx.s.objects[host];
    return o && o.zone === 'battlefield' ? [{ object: { id: o.id, zcc: o.zcc } }] : [];
  }
  if (ref === 'subject') {
    const o = es.subject && onBattlefield(ctx, es.subject);
    return o ? [{ object: { id: o.id, zcc: o.zcc } }] : [];
  }
  const sourceId = es.source?.id;
  return (
    ref.each === 'permanent'
      ? ctx.s.battlefield.map((id) => obj(ctx, id))
      : creaturesOnBattlefield(ctx)
  )
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
  if ('multiply' in amount) return amount.multiply * resolveAmount(ctx, es, amount.amount);
  if ('powerOf' in amount) {
    const ids = objectsOf(ctx, es, amount.powerOf);
    if (ids[0]) return Math.max(0, power(ctx, ids[0]));
    if (amount.powerOf === 'self') {
      const last = es.lkiPower ?? (es.source && ctx.s.objects[es.source.id]?.lastPower);
      return Math.max(0, last ?? 0);
    }
    return 0;
  }
  if ('event' in amount) return es.amount ?? 0;
  if ('countersOn' in amount) {
    const id = objectsOf(ctx, es, amount.countersOn)[0];
    if (id) return obj(ctx, id).plusOneCounters;
    if (amount.countersOn === 'self' && es.source)
      return ctx.s.objects[es.source.id]?.lastCounters ?? 0;
    return 0;
  }
  return countOf(
    ctx,
    es.controller,
    amount,
    false,
    es.source ? onBattlefield(ctx, es.source)?.id : undefined,
  );
}

// ---------------------------------------------------------------------------
// Effect interpreter
// ---------------------------------------------------------------------------

/**
 * Runs effects in order. Returns true if resolution paused to ask a player
 * something (the decision holds the rest); the caller must not finish
 * resolving the item then.
 */
export function runEffects(
  ctx: Ctx,
  es: EffectSource,
  effects: readonly EffectDef[],
  item: PausedResolution['item'],
): boolean {
  const list = effects.slice();
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (e.kind === 'if') {
      // Replace it with the chosen branch (which may itself pause).
      const self = es.source ? ctx.s.objects[es.source.id] : undefined;
      const branch = checkCondition(ctx, e.condition, es.controller, self, es.targets)
        ? e.then
        : (e.else ?? []);
      list.splice(i, 1, ...branch);
      i--;
      continue;
    }
    if (
      e.kind === 'scry' ||
      e.kind === 'may' ||
      e.kind === 'surveil' ||
      e.kind === 'searchLibrary' ||
      e.kind === 'lookForCreature' ||
      e.kind === 'discard' ||
      e.kind === 'returnFromGraveyard' ||
      e.kind === 'piles' ||
      e.kind === 'opponentSacrifices' ||
      e.kind === 'punisher' ||
      e.kind === 'exileTopChooseOne' ||
      e.kind === 'forage' ||
      e.kind === 'destroyAll' ||
      e.kind === 'lookAndTake'
    ) {
      const lib = ctx.s.players[es.controller].library;
      const { controller, source, sourceDefId, targets, lkiPower, subject, amount } = es;
      const resume: PausedResolution = {
        controller,
        source,
        sourceDefId,
        targets,
        ...(lkiPower !== undefined ? { lkiPower } : {}),
        ...(subject ? { subject } : {}),
        ...(amount !== undefined ? { amount } : {}),
        effects: list.slice(i + 1),
        item,
      };
      const thenPriority = ctx.s.turn.activePlayer;
      if (e.kind === 'may') {
        ctx.s.decision = {
          kind: 'optionalEffect',
          player: controller,
          effects: e.effects,
          ...(e.cost ? { cost: e.cost } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'scry' || e.kind === 'surveil') {
        const cards = lib.slice(0, e.amount);
        if (cards.length === 0) continue;
        ctx.s.decision = {
          kind: 'scry',
          player: controller,
          ...(e.kind === 'surveil' ? { surveil: true } : {}),
          cards,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'punisher') {
        const opp = other(controller);
        const options = [
          ...ctx.s.battlefield.filter(
            (id) => obj(ctx, id).controller === opp && !def(ctx, id).types.includes('Land'),
          ),
          ...ctx.s.players[opp].hand,
        ];
        ctx.s.decision = {
          kind: 'punisher',
          player: opp,
          options,
          life: e.life,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'exileTopChooseOne') {
        const options = lib.slice(0, e.count);
        if (options.length === 0) continue;
        for (const id of options) moveObject(ctx, id, 'exile');
        ctx.s.decision = { kind: 'pickExiled', player: controller, options, resume, thenPriority };
      } else if (e.kind === 'destroyAll') {
        const died: ObjectId[] = [];
        for (const c of creaturesOnBattlefield(ctx)) {
          if (!matchesFilter(ctx, c.id, e.filter) || hasKeyword(ctx, c.id, 'indestructible'))
            continue;
          moveObject(ctx, c.id, 'graveyard');
          died.push(c.id);
        }
        // "Return a creature card put into your graveyard this way."
        const options = died.filter((id) => {
          const o = ctx.s.objects[id];
          return o?.zone === 'graveyard' && o.owner === controller;
        });
        if (!e.returnOne || options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: 'battlefield',
          shuffle: false,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'lookAndTake') {
        const looked = lib.slice(0, e.count);
        if (looked.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options: looked.filter((id) => cardMatches(ctx, id, e.filter)),
          looked,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'forage') {
        const foods = foodsOf(ctx, controller);
        const graveyard = ctx.s.players[controller].graveyard.length >= 3;
        // Can't forage: "if you do" doesn't happen.
        if (!foods.length && !graveyard) continue;
        ctx.s.decision = {
          kind: 'forage',
          player: controller,
          foods,
          graveyard,
          optional: !!e.optional,
          then: e.then,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'opponentSacrifices') {
        const opp = other(controller);
        let options = creaturesOnBattlefield(ctx, opp).map((c) => c.id);
        // "The creature with the greatest power": they choose among those tied.
        if (e.greatestPower) {
          const most = Math.max(...options.map((id) => power(ctx, id)));
          options = options.filter((id) => power(ctx, id) === most);
        }
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'sacrifice',
          player: opp,
          options,
          ...(e.gainToughness ? { gainLifeFor: controller } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'discard') {
        const who = e.who === 'eachOpponent' ? other(controller) : controller;
        const count = Math.min(e.count, ctx.s.players[who].hand.length);
        if (count === 0) continue;
        ctx.s.decision = { kind: 'discard', player: who, count, resume, thenPriority };
      } else if (e.kind === 'returnFromGraveyard') {
        const options = ctx.s.players[controller].graveyard.filter((id) =>
          e.types.some((t) => def(ctx, id).types.includes(t)),
        );
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          shuffle: false,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'piles') {
        const cards = lib.slice(0, e.count);
        if (cards.length === 0) continue;
        ctx.s.decision = { kind: 'splitPiles', player: controller, cards, resume, thenPriority };
      } else if (e.kind === 'lookForCreature') {
        const looked = lib.slice(0, e.count);
        if (looked.length === 0) continue;
        const lands = ctx.s.battlefield.filter(
          (id) => obj(ctx, id).controller === controller && def(ctx, id).types.includes('Land'),
        ).length;
        const options = looked.filter((id) => {
          const d = def(ctx, id);
          return d.types.includes('Creature') && manaValue(d.manaCost) <= lands;
        });
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          to: 'battlefield',
          looked,
          resume,
          thenPriority,
        };
      } else {
        const options = lib.filter((id) => {
          if (typeof e.filter === 'object') return cardMatches(ctx, id, e.filter);
          const d = defOf(ctx, obj(ctx, id).defId);
          const basic = d.supertypes.includes('Basic') && d.types.includes('Land');
          return basic || (e.filter === 'basicLandOrGate' && d.subtypes.includes('Gate'));
        });
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          ...(e.required ? { required: true } : {}),
          ...(e.to !== 'hand' ? { to: e.to } : {}),
          ...(e.shuffle === false ? { shuffle: false } : {}),
          resume,
          thenPriority,
        };
      }
      return true;
    }
    runEffect(ctx, es, e);
  }
  return false;
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
    case 'pump': {
      // Amounts are locked in on resolution (e.g. "gets +X/+X where X is its power").
      const p = resolveAmount(ctx, es, e.power);
      const t = resolveAmount(ctx, es, e.toughness);
      for (const id of objectsOf(ctx, es, e.to)) {
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: p,
          toughness: t,
          keywords: e.keywords ?? [],
          ...(e.cantBlock ? { cantBlock: true } : {}),
          ...(e.exileIfDies ? { exileIfDies: true } : {}),
          ...(e.cantBeBlocked ? { cantBeBlocked: true } : {}),
          ...(e.returnWhenDies ? { returnWhenDies: e.returnWhenDies } : {}),
          expires: 'endOfTurn',
        });
      }
      return;
    }
    case 'revealUntilCreature': {
      const lib = ctx.s.players[es.controller].library;
      const i = lib.findIndex((id) => defOf(ctx, obj(ctx, id).defId).types.includes('Creature'));
      const revealed = lib.slice(0, i < 0 ? lib.length : i);
      if (i >= 0) {
        const found = lib[i]!;
        moveObject(ctx, found, 'hand');
        emit(ctx, { type: 'revealed', player: es.controller, id: found });
      }
      lib.splice(0, revealed.length);
      shuffleInPlace(ctx.s.rng, revealed);
      lib.push(...revealed);
      return;
    }
    case 'untap':
      for (const id of objectsOf(ctx, es, e.what)) untap(ctx, id);
      return;
    case 'extraCombat':
      ctx.s.turn.extraCombats++;
      return;
    case 'attach': {
      const self = es.source && onBattlefield(ctx, es.source);
      const to = objectsOf(ctx, es, e.to)[0];
      if (self && to) self.attachedTo = to;
      return;
    }
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
      for (const id of objectsOf(ctx, es, e.what))
        if (!hasKeyword(ctx, id, 'indestructible')) moveObject(ctx, id, 'graveyard');
      return;
    case 'sacrifice':
      for (const id of objectsOf(ctx, es, e.what)) sacrifice(ctx, id);
      return;
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
      const owner = e.forOpponent ? other(es.controller) : es.controller;
      for (let i = 0; i < n; i++) {
        const t = createObject(ctx, e.token, owner, 'battlefield', true);
        if (defOf(ctx, e.token).entersTapped || e.tapped) t.tapped = true;
        if (e.attacking && ctx.s.combat) {
          // "Tapped and attacking": attacking the same player, never declared (no attack triggers).
          t.tapped = true;
          ctx.s.combat.attackers.push({
            id: t.id,
            defender: other(owner),
            blocked: false,
            blockers: [],
          });
        }
        if (e.hasteThisTurn)
          ctx.s.effects.push({
            timestamp: newTimestamp(ctx),
            affected: { id: t.id, zcc: t.zcc },
            power: 0,
            toughness: 0,
            keywords: ['haste'],
            expires: 'endOfTurn',
          });
        ctx.s.battlefield.push(t.id);
        emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
      }
      return;
    }
    case 'scry':
    case 'surveil':
    case 'searchLibrary':
    case 'lookForCreature':
    case 'discard':
    case 'piles':
    case 'opponentSacrifices':
      return; // handled by runEffects: they pause resolution
    case 'returnFromGraveyard':
      return; // handled by runEffects
    case 'returnLandsFromGraveyard':
      for (const id of [...ctx.s.players[es.controller].graveyard]) {
        if (!def(ctx, id).types.includes('Land')) continue;
        moveObject(ctx, id, 'battlefield', { controller: es.controller });
        obj(ctx, id).tapped = true;
      }
      return;
    case 'mill': {
      const lib = ctx.s.players[es.controller].library;
      for (const id of lib.slice(0, e.count)) moveObject(ctx, id, 'graveyard');
      return;
    }
    case 'counter': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const i = ctx.s.stack.findIndex((x) => x.kind === 'spell' && x.id === t.object.id);
      const item = ctx.s.stack[i];
      if (!item || item.kind !== 'spell') return;
      const controller = item.controller;
      const protectedByStatic =
        (def(ctx, item.id).types.includes('Instant') ||
          def(ctx, item.id).types.includes('Sorcery')) &&
        ctx.s.battlefield.some(
          (id) =>
            obj(ctx, id).controller === controller &&
            def(ctx, id).abilities.some(
              (a) => a.kind === 'static' && a.effect.kind === 'instantsAndSorceriesUncounterable',
            ),
        );
      if (!def(ctx, item.id).uncounterable && !protectedByStatic) {
        ctx.s.stack.splice(i, 1);
        emit(ctx, { type: 'countered', id: item.id });
        moveObject(ctx, item.id, item.flashback ? 'exile' : 'graveyard');
      }
      if (e.controllerTokens)
        runEffect(ctx, { ...es, controller }, { kind: 'createToken', ...e.controllerTokens });
      return;
    }
    case 'bouncePlayerPermanents':
      for (const player of playersOf(ctx, es, e.who))
        for (const id of [...ctx.s.battlefield])
          if (
            obj(ctx, id).controller === player &&
            (!e.nonland || !def(ctx, id).types.includes('Land'))
          )
            moveObject(ctx, id, 'hand');
      return;
    case 'reanimateAll':
      for (const p of Object.keys(ctx.s.players) as PlayerId[])
        for (const id of [...ctx.s.players[p].graveyard])
          if (def(ctx, id).types.includes('Creature'))
            moveObject(ctx, id, 'battlefield', { controller: es.controller });
      return;
    case 'tokenCopyOf': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const card = ctx.s.objects[t.object.id];
      if (!card || card.zone !== 'graveyard' || card.zcc !== t.object.zcc) return;
      moveObject(ctx, card.id, 'exile');
      const token = createObject(ctx, card.defId, es.controller, 'battlefield', true);
      token.addedSubtypes = [e.addSubtype];
      ctx.s.battlefield.push(token.id);
      emit(ctx, {
        type: 'objectMoved',
        id: token.id,
        defId: token.defId,
        from: null,
        to: 'battlefield',
      });
      if (e.exileOtherTokensWithSubtype)
        for (const id of [...ctx.s.battlefield]) {
          const o = obj(ctx, id);
          if (id === token.id || !o.isToken || o.controller !== es.controller) continue;
          if (characteristics(ctx, id).subtypes.includes(e.addSubtype))
            moveObject(ctx, id, 'exile');
        }
      return;
    }
    case 'namedCounters': {
      const n = resolveAmount(ctx, es, e.amount);
      const self = es.source && onBattlefield(ctx, es.source);
      const ids = e.to ? objectsOf(ctx, es, e.to) : self ? [self.id] : [];
      for (const id of ids) {
        const c = (obj(ctx, id).counters ??= {});
        c[e.name] = (c[e.name] ?? 0) + n;
      }
      return;
    }
    case 'bounce':
      for (const id of objectsOf(ctx, es, e.what)) moveObject(ctx, id, 'hand');
      return;
    case 'returnToHand': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      const o = t && 'object' in t && ctx.s.objects[t.object.id];
      if (o && o.zone === 'graveyard' && t && 'object' in t && o.zcc === t.object.zcc)
        moveObject(ctx, o.id, 'hand');
      return;
    }
    case 'exileGraveyard':
      for (const p of playersOf(ctx, es, e.who))
        for (const id of [...ctx.s.players[p].graveyard]) moveObject(ctx, id, 'exile');
      return;
    case 'tap':
      for (const id of objectsOf(ctx, es, e.what)) tap(ctx, id);
      return;
    case 'exileUntilSourceLeaves': {
      // If the source already left, nothing is exiled (rule 610.3c).
      const self = es.source && onBattlefield(ctx, es.source);
      if (!self) return;
      for (const id of objectsOf(ctx, es, e.what)) {
        const token = obj(ctx, id).isToken;
        moveObject(ctx, id, 'exile');
        if (!token) (self.exiledUntilLeaves ??= []).push(id);
      }
      return;
    }
    case 'returnToBattlefield': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const o = ctx.s.objects[t.object.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
      moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
      if (e.counter) (o.counters ??= {})[e.counter] = 1;
      return;
    }
    case 'exileTopPlayable': {
      const lib = ctx.s.players[es.controller].library;
      const ownTurn = ctx.s.turn.activePlayer === es.controller;
      const until =
        e.until === 'endOfTurn' ? ctx.s.turn.number : ctx.s.turn.number + (ownTurn ? 2 : 1);
      for (const id of lib.slice(0, resolveAmount(ctx, es, e.count))) {
        moveObject(ctx, id, 'exile');
        obj(ctx, id).playableUntilTurn = until;
      }
      return;
    }
    case 'destroyAll':
    case 'lookAndTake':
      return; // handled by runEffects
    case 'returnSource': {
      // Only the same card, still in the graveyard it went to.
      const o = es.source && ctx.s.objects[es.source.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== es.source!.zcc) return;
      if (e.to === 'hand') return moveObject(ctx, o.id, 'hand');
      moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
      if (e.tapped) o.tapped = true;
      if (e.counters) o.plusOneCounters += e.counters;
      if (e.addSubtype) o.addedSubtypes = [...(o.addedSubtypes ?? []), e.addSubtype];
      return;
    }
    case 'exile':
      for (const id of objectsOf(ctx, es, e.what)) moveObject(ctx, id, 'exile');
      return;
    case 'exileGraveyardCard': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const o = ctx.s.objects[t.object.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
      const wasCreature = def(ctx, o.id).types.includes('Creature');
      moveObject(ctx, o.id, 'exile');
      if (wasCreature && e.ifCreature) for (const x of e.ifCreature) runEffect(ctx, es, x);
      return;
    }
    case 'offspringCopy': {
      // A 1/1 token copy, even if the creature has already left the battlefield.
      const t = createObject(ctx, es.sourceDefId, es.controller, 'battlefield', true);
      t.copyPT = { power: 1, toughness: 1 };
      ctx.s.battlefield.push(t.id);
      emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
      return;
    }
    case 'noteResolution': {
      const o = es.source && ctx.s.objects[es.source.id];
      if (!o) return;
      const turn = ctx.s.turn.number;
      o.resolutions =
        o.resolutions?.turn === turn
          ? { turn, count: o.resolutions.count + 1 }
          : { turn, count: 1 };
      return;
    }
    case 'if':
    case 'may':
    case 'punisher':
    case 'exileTopChooseOne':
    case 'forage':
      return; // handled by runEffects
    case 'custom': {
      const fn = ctx.customEffects[e.handler];
      if (!fn) throw new Error(`No custom effect handler "${e.handler}"`);
      fn(ctx, es, e.params);
      return;
    }
  }
}
