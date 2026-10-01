import {
  characteristics,
  cardMatches,
  hasSubtype,
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
  addCounters,
  sacrifice,
  tap,
  untap,
} from './context.ts';
import { foodsOf } from './forage.ts';
import { canPayFrom, manaSources, manaValue } from './mana.ts';
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
  amount += damageBonus(ctx, src, to, combat);
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

/** Extra damage from "deals that much damage plus N instead" effects. */
function damageBonus(ctx: Ctx, src: DamageSource, to: TargetChoice, combat: boolean): number {
  let n = 0;
  const source = ctx.s.objects[src.id];
  const toOpponent =
    'player' in to
      ? to.player !== src.controller
      : ctx.s.objects[to.object.id]?.controller !== src.controller;
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== src.controller) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'damageBonus') continue;
      const b = a.effect;
      if (b.noncombat && combat) continue;
      if (b.toOpponents && !toOpponent) continue;
      if (b.source && !(source?.zone === 'battlefield' && matchesFilter(ctx, src.id, b.source)))
        continue;
      if (b.condition && !checkCondition(ctx, b.condition, o.controller, o)) continue;
      n += b.amount;
    }
  }
  return n;
}

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const;

/** Creature types among cards `player` owns (choices for "choose a creature type"). */
function creatureTypesOf(ctx: Ctx, player: PlayerId): string[] {
  const types = new Set<string>();
  for (const o of Object.values(ctx.s.objects)) {
    if (o.owner !== player) continue;
    const d = defOf(ctx, o.defId);
    if (d.types.includes('Creature')) for (const t of d.subtypes) types.add(t);
  }
  return [...types].sort();
}

function controlsSubtype(ctx: Ctx, player: PlayerId, subtype: string): boolean {
  return ctx.s.battlefield.some(
    (id) => obj(ctx, id).controller === player && hasSubtype(ctx, id, subtype),
  );
}

/** The spell with this id on the stack. */
export function findSpell(ctx: Ctx, id: ObjectId) {
  const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === id);
  return item?.kind === 'spell' ? item : undefined;
}

/** Counters a spell (unless it can't be countered). */
export function counterSpell(ctx: Ctx, id: ObjectId): void {
  const i = ctx.s.stack.findIndex((x) => x.kind === 'spell' && x.id === id);
  const item = ctx.s.stack[i];
  if (!item || item.kind !== 'spell') return;
  const controller = item.controller;
  const protectedByStatic =
    (def(ctx, item.id).types.includes('Instant') || def(ctx, item.id).types.includes('Sorcery')) &&
    ctx.s.battlefield.some(
      (b) =>
        obj(ctx, b).controller === controller &&
        def(ctx, b).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'instantsAndSorceriesUncounterable',
        ),
    );
  if (def(ctx, item.id).uncounterable || protectedByStatic) return;
  ctx.s.stack.splice(i, 1);
  emit(ctx, { type: 'countered', id: item.id });
  moveObject(ctx, item.id, item.flashback ? 'exile' : 'graveyard');
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
  if (ref === 'chosen') {
    const o = es.chosen && onBattlefield(ctx, es.chosen);
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
  if ('sacrificedPower' in amount) return Math.max(0, es.lkiPower ?? 0);
  if ('x' in amount) return (es.x ?? 0) * (amount.times ?? 1) + (amount.plus ?? 0);
  if ('namedCountersOnSource' in amount) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o) return 0;
    const counters = o.zone === 'battlefield' ? o.counters : o.lastNamedCounters;
    return counters?.[amount.namedCountersOnSource] ?? 0;
  }
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
      e.kind === 'lookAndTake' ||
      e.kind === 'chooseFromOpponentHand' ||
      e.kind === 'choose' ||
      e.kind === 'chooseYourPermanent' ||
      e.kind === 'counterUnlessPays' ||
      e.kind === 'putFromHandOrGraveyard' ||
      e.kind === 'chooseColor' ||
      e.kind === 'chooseCreatureType' ||
      e.kind === 'millThenTake' ||
      e.kind === 'lookTakeRestGraveyard'
    ) {
      const lib = ctx.s.players[es.controller].library;
      const { controller, source, sourceDefId, targets, lkiPower, subject, amount, chosen, x } = es;
      const resume: PausedResolution = {
        controller,
        source,
        sourceDefId,
        targets,
        ...(lkiPower !== undefined ? { lkiPower } : {}),
        ...(subject ? { subject } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(chosen ? { chosen } : {}),
        ...(x !== undefined ? { x } : {}),
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
        ctx.s.decision = {
          kind: 'pickExiled',
          player: controller,
          options,
          ...(e.until ? { thisTurn: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseColor') {
        ctx.s.decision = {
          kind: 'chooseOption',
          player: controller,
          options: (['W', 'U', 'B', 'R', 'G'] as const).map((color) => ({
            label: COLOR_NAMES[color],
            effects: [{ kind: 'custom', handler: 'setChosen', params: { color } }],
          })),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseCreatureType') {
        const types = creatureTypesOf(ctx, controller);
        ctx.s.decision = {
          kind: 'chooseOption',
          player: controller,
          options: types.map((type) => ({
            label: type,
            effects: [{ kind: 'custom', handler: 'setChosen', params: { type } }],
          })),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'millThenTake') {
        const milled = lib.slice(0, e.count);
        for (const id of milled) moveObject(ctx, id, 'graveyard');
        const options = milled.filter((id) => cardMatches(ctx, id, e.filter));
        if (options.length === 0) {
          if (e.squirrelFood && controlsSubtype(ctx, controller, 'Squirrel'))
            runEffect(ctx, es, { kind: 'createToken', token: 'food-token', count: 1 });
          continue;
        }
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          shuffle: false,
          ...(e.squirrelFood ? { squirrelFood: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'lookTakeRestGraveyard') {
        const options = lib.slice(0, resolveAmount(ctx, es, e.count));
        const count = Math.min(resolveAmount(ctx, es, e.take), options.length);
        if (options.length === 0) continue;
        if (count === 0) {
          for (const id of options) moveObject(ctx, id, 'graveyard');
          continue;
        }
        ctx.s.decision = {
          kind: 'pickCards',
          player: controller,
          options,
          count,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'putFromHandOrGraveyard') {
        const ps = ctx.s.players[controller];
        const options = [...ps.hand, ...ps.graveyard].filter((id) =>
          cardMatches(ctx, id, e.filter),
        );
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: 'battlefield',
          shuffle: false,
          ...(e.counter ? { counter: e.counter } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseYourPermanent') {
        const sourceId = es.source?.id;
        const options = ctx.s.battlefield.filter(
          (id) =>
            id !== sourceId &&
            obj(ctx, id).controller === controller &&
            matchesFilter(ctx, id, e.filter, sourceId),
        );
        if (options.length === 0) {
          list.splice(i + 1, 0, ...(e.otherwise ?? []));
          continue;
        }
        ctx.s.decision = {
          kind: 'chooseObject',
          player: controller,
          options,
          then: e.then,
          otherwise: e.otherwise ?? [],
          resume,
          thenPriority,
        };
      } else if (e.kind === 'counterUnlessPays') {
        // A spell target: resolveRef only finds permanents.
        const t =
          typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
        const item = t && 'object' in t ? findSpell(ctx, t.object.id) : undefined;
        if (!item) continue;
        // Can't pay: countered straight away.
        if (!canPayFrom(e.cost, manaSources(ctx, item.controller))) {
          counterSpell(ctx, item.id);
          continue;
        }
        ctx.s.decision = {
          kind: 'payOrCounter',
          player: item.controller,
          spell: item.id,
          cost: e.cost,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseFromOpponentHand') {
        const from = other(controller);
        const options = ctx.s.players[from].hand.filter(
          (id) => !e.filter || cardMatches(ctx, id, e.filter),
        );
        ctx.s.decision = {
          kind: 'chooseFromHand',
          player: controller,
          from,
          options,
          then: e.then,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'choose') {
        const t = e.ownerOf !== undefined ? es.targets[e.ownerOf] : undefined;
        const owner = t && 'object' in t ? ctx.s.objects[t.object.id]?.owner : undefined;
        if (e.ownerOf !== undefined && !owner) continue;
        ctx.s.decision = {
          kind: 'chooseOption',
          player: e.opponent ? other(controller) : (owner ?? controller),
          options: e.options,
          resume,
          thenPriority,
        };
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
          ...(e.battlefieldOnYourTurn ? { battlefieldOnYourTurn: true } : {}),
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
        let options = e.filter
          ? ctx.s.battlefield.filter(
              (id) => obj(ctx, id).controller === opp && matchesFilter(ctx, id, e.filter),
            )
          : creaturesOnBattlefield(ctx, opp).map((c) => c.id);
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
          ...(e.exile ? { exile: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'discard') {
        const who = e.who === 'eachOpponent' ? other(controller) : controller;
        const able = ctx.s.players[who].hand.filter(
          (id) => !e.filter || cardMatches(ctx, id, e.filter),
        );
        const count = Math.min(e.count, able.length);
        if (count === 0) continue;
        ctx.s.decision = {
          kind: 'discard',
          player: who,
          count,
          ...(e.filter ? { filter: e.filter } : {}),
          ...(e.exile ? { exile: true } : {}),
          resume,
          thenPriority,
        };
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
          ...(e.untapIfLands ? { untapIfLands: e.untapIfLands } : {}),
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
      const what = e.what
        ? objectsOf(ctx, es, e.what)[0]
        : es.source && onBattlefield(ctx, es.source)?.id;
      const to = objectsOf(ctx, es, e.to)[0];
      if (what && to) obj(ctx, what).attachedTo = to;
      return;
    }
    case 'counters': {
      const n = resolveAmount(ctx, es, e.amount);
      for (const id of objectsOf(ctx, es, e.to)) addCounters(ctx, id, n);
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
        if (e.counters) addCounters(ctx, t.id, e.counters);
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
      const players = e.who ? playersOf(ctx, es, e.who) : [es.controller];
      for (const p of players)
        for (const id of ctx.s.players[p].library.slice(0, e.count))
          moveObject(ctx, id, 'graveyard');
      return;
    }
    case 'counter': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const item = findSpell(ctx, t.object.id);
      if (!item) return;
      const controller = item.controller;
      counterSpell(ctx, item.id);
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
      for (const id of ids) addCounters(ctx, id, n, e.name);
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
      // "That creature" for the effects after it (Coiling Rebirth).
      es.chosen = { id: o.id, zcc: o.zcc };
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
    case 'chooseFromOpponentHand':
    case 'choose':
    case 'chooseYourPermanent':
    case 'counterUnlessPays':
    case 'putFromHandOrGraveyard':
      return; // handled by runEffects
    case 'chooseColor':
    case 'chooseCreatureType':
    case 'millThenTake':
    case 'lookTakeRestGraveyard':
      return; // handled by runEffects
    case 'giftGiven':
      emit(ctx, { type: 'giftGiven', player: es.controller });
      return;
    case 'tokenCopy': {
      const n = e.count !== undefined ? resolveAmount(ctx, es, e.count) : 1;
      for (const id of objectsOf(ctx, es, e.of)) {
        const o = obj(ctx, id);
        const d = def(ctx, id);
        if (e.nonlegendary && d.supertypes.includes('Legendary')) continue;
        for (let i = 0; i < n; i++) {
          const t = createObject(ctx, o.defId, es.controller, 'battlefield', true);
          const pt = e.pt ?? (o.copyPT ? [o.copyPT.power, o.copyPT.toughness] : undefined);
          if (pt) t.copyPT = { power: pt[0], toughness: pt[1] };
          ctx.s.battlefield.push(t.id);
          emit(ctx, {
            type: 'objectMoved',
            id: t.id,
            defId: t.defId,
            from: null,
            to: 'battlefield',
          });
          if (e.exileAtEndStep) {
            const step = ctx.s.turn.step;
            (ctx.s.delayed ??= []).push({
              controller: es.controller,
              sourceDefId: es.sourceDefId,
              subject: { id: t.id, zcc: t.zcc },
              effects: [{ kind: 'exile', what: 'subject' }],
              fromTurn: ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0),
            });
          }
        }
      }
      return;
    }
    case 'revealTopToHandLoseLife': {
      const top = ctx.s.players[es.controller].library[0];
      if (!top) return;
      moveObject(ctx, top, 'hand');
      emit(ctx, { type: 'revealed', player: es.controller, id: top });
      changeLife(ctx, es.controller, -manaValue(def(ctx, top).manaCost));
      return;
    }
    case 'topCardLandOrHand': {
      // "You may put it onto the battlefield": we always do (a simplification).
      const top = ctx.s.players[es.controller].library[0];
      if (!top) return;
      if (def(ctx, top).types.includes('Land')) {
        moveObject(ctx, top, 'battlefield', { controller: es.controller });
        obj(ctx, top).tapped = true;
      } else moveObject(ctx, top, 'hand');
      return;
    }
    case 'damageEachPlayerByNonbasics': {
      const src = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
      for (const p of ['p1', 'p2'] as const) {
        const n = ctx.s.battlefield.filter((id) => {
          const d = def(ctx, id);
          return (
            obj(ctx, id).controller === p &&
            d.types.includes('Land') &&
            !d.supertypes.includes('Basic')
          );
        }).length;
        dealDamage(ctx, src, { player: p }, n, false);
      }
      return;
    }
    case 'playerHexproof':
      (ctx.s.turn.hexproofPlayers ??= []).push(es.controller);
      return;
    case 'becomeCreature':
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          becomesCreature: true,
          expires: 'endOfTurn',
        });
      return;
    case 'levelUp': {
      const self = es.source && onBattlefield(ctx, es.source);
      if (!self) return;
      self.level = (self.level ?? 1) + 1;
      emit(ctx, { type: 'levelChanged', id: self.id, level: self.level });
      return;
    }
    case 'addMana': {
      const pool = (ctx.s.players[es.controller].pool ??= []);
      const n = e.count !== undefined ? resolveAmount(ctx, es, e.count) : 1;
      for (let i = 0; i < n; i++)
        for (const produces of e.mana)
          pool.push({ produces, ...(e.untilEndOfTurn ? { untilEndOfTurn: true } : {}) });
      return;
    }
    case 'discardHand':
      for (const id of [...ctx.s.players[es.controller].hand]) moveObject(ctx, id, 'graveyard');
      return;
    case 'exileUntilEndStep': {
      const step = ctx.s.turn.step;
      const fromTurn = ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0);
      for (const id of objectsOf(ctx, es, e.what)) {
        const token = obj(ctx, id).isToken;
        moveObject(ctx, id, 'exile');
        if (token) continue;
        (ctx.s.delayed ??= []).push({
          controller: es.controller,
          sourceDefId: es.sourceDefId,
          subject: { id, zcc: obj(ctx, id).zcc },
          effects: [
            {
              kind: 'returnSubject',
              ...(e.counters ? { counters: e.counters } : {}),
              ...(e.named ? { named: e.named } : {}),
            },
          ],
          fromTurn,
        });
      }
      return;
    }
    case 'returnSubject': {
      const o = es.subject && ctx.s.objects[es.subject.id];
      if (!o || o.zone !== 'exile' || o.zcc !== es.subject!.zcc) return;
      moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
      if (e.counters) addCounters(ctx, o.id, e.counters);
      if (e.named) (o.counters ??= {})[e.named] = 1;
      return;
    }
    case 'blink':
      for (const id of objectsOf(ctx, es, e.what)) {
        const owner = obj(ctx, id).owner;
        const token = obj(ctx, id).isToken;
        moveObject(ctx, id, 'exile');
        // A token ceases to exist in exile.
        if (token || !ctx.s.objects[id]) continue;
        moveObject(ctx, id, 'battlefield', { controller: owner });
        if (e.counters) addCounters(ctx, id, e.counters);
      }
      return;
    case 'revealUntil': {
      const lib = ctx.s.players[es.controller].library;
      const i = lib.findIndex((id) => cardMatches(ctx, id, e.filter));
      const revealed = lib.slice(0, i < 0 ? lib.length : i);
      if (i >= 0) {
        const found = lib[i]!;
        if (e.to === 'hand') moveObject(ctx, found, 'hand');
        else {
          moveObject(ctx, found, 'battlefield', { controller: es.controller });
          obj(ctx, found).tapped = true;
        }
        emit(ctx, { type: 'revealed', player: es.controller, id: found });
      }
      lib.splice(0, revealed.length);
      shuffleInPlace(ctx.s.rng, revealed);
      lib.push(...revealed);
      return;
    }
    case 'blinkOnCombatDamage':
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          blinkOnCombatDamage: true,
          expires: 'endOfTurn',
        });
      return;
    case 'putInLibrary': {
      // A graveyard card too (Barkform Harvester).
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      const card = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
      const fromGraveyard =
        card?.zone === 'graveyard' && t && 'object' in t && card.zcc === t.object.zcc
          ? [card.id]
          : [];
      for (const id of [...objectsOf(ctx, es, e.what), ...fromGraveyard])
        moveObject(ctx, id, 'library', { position: e.position });
      return;
    }
    case 'gainControl':
      for (const id of objectsOf(ctx, es, e.what)) {
        const o = obj(ctx, id);
        if (o.controller === es.controller) continue;
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: o.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          previousController: o.controller,
          expires: 'endOfTurn',
        });
        o.controller = es.controller;
        o.summoningSick = true;
      }
      return;
    case 'loseAbilities':
      for (const id of objectsOf(ctx, es, e.what)) {
        const o = obj(ctx, id);
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: o.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          loseAbilities: true,
          ...(e.basePT && def(ctx, id).types.includes('Creature') ? { basePT: e.basePT } : {}),
          expires: 'untilYourNextTurn',
          player: es.controller,
        });
        o.blank = true;
      }
      return;
    case 'returnSource': {
      // Only the same card, still in the graveyard it went to.
      const o = es.source && ctx.s.objects[es.source.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== es.source!.zcc) return;
      if (e.to === 'hand') return moveObject(ctx, o.id, 'hand');
      moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
      if (e.tapped) o.tapped = true;
      if (e.attacking && ctx.s.combat) {
        o.tapped = true;
        ctx.s.combat.attackers.push({
          id: o.id,
          defender: other(o.owner),
          blocked: false,
          blockers: [],
        });
      }
      if (e.counters) addCounters(ctx, o.id, e.counters);
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
      if (e.track) {
        const self = es.source && onBattlefield(ctx, es.source);
        if (self) (self.exiledWith ??= []).push(o.id);
      }
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
