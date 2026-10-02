import { power } from './characteristics.ts';
import {
  type Ctx,
  def,
  defOf,
  emit,
  moveObject,
  newId,
  obj,
  other,
  sacrifice as sacrificePermanent,
  tap,
  addCounters,
  createObject,
  refOf,
} from './context.ts';
import { commanderTax, commanderTypes } from './brawl.ts';
import { type EffectSource, runEffects } from './effects.ts';
import {
  characteristics,
  countOf,
  hasKeyword,
  isCreature,
  hasSubtype,
  cardMatches,
  matchesFilter,
} from './characteristics.ts';
import { changeLife, counterSpell, gainLife } from './effects.ts';
import { foodsOf, payForage } from './forage.ts';
import {
  anyTypeCost,
  artifactHelpers,
  creatureHelpers,
  hasImprovise,
  manaSources,
  manaValue,
  payMana,
  planPayment,
} from './mana.ts';
import { reduceCost } from './cost.ts';
import { defaultTeamwork, payTeamwork } from './teamwork.ts';
import { shuffleInPlace } from './rng.ts';
import { shuffleLibrary } from './setup.ts';
import { addCosts, type CastVia, spellOnStack, spellTags, variantOf } from './spells.ts';
import { isTargetLegal } from './targets.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';
import { givePriority } from './turn.ts';
import type {
  AbilityDef,
  CardDefinition,
  Decision,
  Amount,
  EffectDef,
  ManaCost,
  ObjectId,
  PausedResolution,
  PendingTrigger,
  PlayerId,
  StackItem,
  StaticDef,
  TargetChoice,
  TargetSpec,
} from './types.ts';

export interface CastChoice {
  mode?: number | undefined;
  kicked?: boolean | undefined;
  /** The creature sacrificed as an additional cost. */
  sacrifice?: ObjectId | undefined;
  /** Forage as an additional cost: a Food, or 'graveyard'. */
  forage?: ObjectId | 'graveyard' | undefined;
  /** The card discarded as an additional cost. */
  discard?: ObjectId | undefined;
  /** The value chosen for X. */
  x?: number | undefined;
  /** Pawprint modes (Seasons). */
  paws?: number[] | undefined;
  /** Cast for free, or from the graveyard through another card. */
  via?: CastVia | undefined;
  /** Exile it instead of putting it into the graveyard afterwards. */
  exileAfter?: boolean | undefined;
  /** Mockingbird: the creature to enter as a copy of. */
  copyOf?: ObjectId | undefined;
  /** Rottenmouth Viper: permanents sacrificed to make it cheaper. */
  sacrificeMany?: ObjectId[] | undefined;
  /** Times multikicker is paid (Batroc). */
  kickCount?: number | undefined;
  /** Cast as its back face (a modal double-faced card). */
  back?: boolean | undefined;
  /** Sneak: the unblocked attacker returned to hand. */
  sneak?: ObjectId | undefined;
  /** Teamwork: the creatures to tap. Omitted: the engine picks. */
  teamwork?: ObjectId[] | undefined;
}

/** The creatures a kicked teamwork cast taps: the chosen ones, or the engine's pick (sparing mana sources if it can). */
export function teamworkFor(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  choice: CastChoice,
): ObjectId[] | undefined {
  const n = defOf(ctx, obj(ctx, card).defId).kicker?.teamwork;
  if (!choice.kicked || n === undefined) return undefined;
  if (choice.teamwork) return choice.teamwork;
  const mana = manaSources(ctx, player).map((s) => s.id);
  return (
    defaultTeamwork(ctx, player, n, [...mana, card]) ??
    defaultTeamwork(ctx, player, n, [card]) ??
    undefined
  );
}

/** Valiant needs to know what a player's spell or ability targeted. */
function noteTargets(
  ctx: Ctx,
  player: PlayerId,
  targets: readonly TargetChoice[],
  byAbility = false,
): void {
  const ids = targets.flatMap((t) => ('object' in t ? [t.object.id] : []));
  if (ids.length || (byAbility && targets.length))
    emit(ctx, {
      type: 'targeted',
      player,
      ids,
      ...(byAbility ? { byAbility: true, anyTarget: targets.length > 0 } : {}),
    });
}

type WardCost = NonNullable<CardDefinition['wardCost']>;

/**
 * Ward: an opponent targeting it pays more (we charge it up front). The cost
 * is the card's own (default {2}), or {1} for granted "ward {1}".
 */
function wardedTargets(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): WardCost[] {
  return targets.flatMap((t) => {
    if (!('object' in t)) return [];
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.controller === player) return [];
    if (hasKeyword(ctx, o.id, 'ward'))
      return [def(ctx, o.id).wardCost ?? { mana: { generic: 2, colored: {} } }];
    if (hasKeyword(ctx, o.id, 'wardOne')) return [{ mana: { generic: 1, colored: {} } }];
    return [];
  });
}

export function wardCost(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): ManaCost {
  let cost: ManaCost = { generic: 0, colored: {} };
  for (const w of wardedTargets(ctx, player, targets)) cost = addCosts(cost, w.mana);
  return cost;
}

/** Life an opponent pays for ward (Ovika: 3). */
export function wardLife(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): number {
  return wardedTargets(ctx, player, targets).reduce((n, w) => n + (w.life ?? 0), 0);
}

/** Can `player` pay ward's discard and sacrifice costs? `inHand`: the card being cast is still in hand. */
export function wardPayable(
  ctx: Ctx,
  player: PlayerId,
  targets: readonly TargetChoice[],
  inHand = 0,
): boolean {
  const w = wardedTargets(ctx, player, targets);
  const discards = w.filter((x) => x.discard).length;
  const foods = w.filter((x) => x.sacrificeFood).length;
  return (
    ctx.s.players[player].hand.length - inHand >= discards && foodsOf(ctx, player).length >= foods
  );
}

/**
 * Pays ward's discard and sacrifice costs. The card discarded is the one with
 * the lowest mana value, the Food the first one (a simplification: the player
 * doesn't choose).
 */
function payWardExtras(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): void {
  for (const w of wardedTargets(ctx, player, targets)) {
    if (w.discard) {
      const hand = ctx.s.players[player].hand;
      const card = [...hand].sort(
        (a, b) => manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
      )[0];
      if (card) moveObject(ctx, card, 'graveyard');
    }
    if (w.sacrificeFood) {
      const food = foodsOf(ctx, player)[0];
      if (food) sacrificePermanent(ctx, food);
    }
  }
}

/** +1/+1 counters on creatures `player` controls (for Quilled Greatwurm). */
export function countersYouControl(ctx: Ctx, player: PlayerId): number {
  return ctx.s.battlefield.reduce((n, id) => {
    const o = obj(ctx, id);
    return o.controller === player ? n + o.plusOneCounters : n;
  }, 0);
}

/** Removes counters from `player`'s creatures, most counters first. */
function removeCounters(ctx: Ctx, player: PlayerId, n: number): void {
  const mine = ctx.s.battlefield
    .map((id) => obj(ctx, id))
    .filter((o) => o.controller === player && o.plusOneCounters > 0)
    .sort((a, b) => b.plusOneCounters - a.plusOneCounters);
  for (const o of mine) {
    const take = Math.min(n, o.plusOneCounters);
    o.plusOneCounters -= take;
    n -= take;
    if (n === 0) return;
  }
}

/** The cost to pay for casting `card` this way, from where it is now. */
export function castCost(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  choice: CastChoice,
  targets?: readonly TargetChoice[],
): ManaCost {
  const o = obj(ctx, card);
  const d = defOf(ctx, o.defId);
  const v = variantOf(d, o.zone, choice);
  if (!v) throw new Error(`${o.defId} can't be cast that way`);
  let cost = v.cost;
  // Brawl: commander tax.
  if (o.zone === 'command') cost = { ...cost, generic: cost.generic + commanderTax(ctx, player) };
  let reduce = d.costReduction !== undefined ? amountFor(ctx, player, d.costReduction) : 0;
  // Heroic Return, Avenge: "costs {2} less if ...".
  if (d.costReductionIf && checkCondition(ctx, d.costReductionIf.condition, player, o))
    reduce += d.costReductionIf.amount;
  const first = targets?.[0];
  if (
    d.costReductionIfTarget &&
    first &&
    'object' in first &&
    matchesFilter(ctx, first.object.id, d.costReductionIfTarget.filter)
  )
    reduce += d.costReductionIfTarget.amount;
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller === player)
      for (const a of def(ctx, id).abilities) {
        if (
          a.kind === 'static' &&
          a.effect.kind === 'spellsCostLess' &&
          cardMatches(ctx, card, a.effect.filter, id)
        )
          reduce += countOf(ctx, player, a.effect.amount, false, id);
        if (
          a.kind === 'static' &&
          a.effect.kind === 'spellsCostLessIf' &&
          cardMatches(ctx, card, a.effect.filter) &&
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id))
        )
          reduce += a.effect.amount;
      }
  // Archmage of Runes: instants and sorceries cost less.
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player) continue;
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'instantsAndSorceriesCostLess')
          reduce += a.effect.amount;
    }
  // {X}: X is chosen as the spell is cast.
  if (cost.x) cost = { ...cost, generic: cost.generic + cost.x * (choice.x ?? 0), x: 0 };
  reduce += choice.sacrificeMany?.length ?? 0;
  if (reduce) cost = { ...cost, generic: Math.max(0, cost.generic - reduce) };
  // Eluge: the first instant or sorcery each turn costs {U} less per flooded land.
  const flood = floodDiscount(ctx, player, d);
  if (flood) {
    const blue = Math.min(flood, cost.colored.U ?? 0);
    cost = {
      ...cost,
      colored: { ...cost.colored, U: (cost.colored.U ?? 0) - blue },
      generic: Math.max(0, cost.generic - (flood - blue)),
    };
  }
  if (o.anyMana) return anyTypeCost(cost);
  // Vizier of the Menagerie: any type of mana for creature spells.
  if (d.types.includes('Creature') && hasStatic(ctx, player, 'creaturesFromTopOfLibrary'))
    return anyTypeCost(cost);
  return cost;
}

export function castSpell(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  targets: TargetChoice[],
  choice: CastChoice,
  payWith?: ObjectId[],
): boolean {
  const o = obj(ctx, card);
  // A modal double-faced card cast as its back face is that face on the stack and battlefield.
  const back = choice.back ? defOf(ctx, o.defId).back : undefined;
  if (back) {
    o.front = o.defId;
    o.defId = back;
  }
  const d = defOf(ctx, o.defId);
  const v = choice.sneak
    ? { cost: d.sneak!, spell: d.spell ?? null }
    : variantOf(d, o.zone, choice)!;
  const sneakFrom = choice.sneak
    ? ctx.s.combat?.attackers.find((a) => a.id === choice.sneak)?.defender
    : undefined;
  const flashback = (o.zone === 'graveyard' && !choice.via && !!d.flashback) || !!choice.exileAfter;
  const fromHand = o.zone === 'hand';
  // Rule 601.2: move to stack, choose targets, then pay costs.
  const cost = addCosts(
    choice.sneak ? d.sneak! : castCost(ctx, player, card, choice, targets),
    wardCost(ctx, player, targets),
  );
  const teamwork = teamworkFor(ctx, player, card, choice);
  // Convoke: remembered for "each creature that convoked this spell" (Lethal Scheme).
  const convokers = d.convoke
    ? creatureHelpers(ctx, player, manaSources(ctx, player, undefined, spellTags(d))).map(
        (h) => h.id,
      )
    : [];
  const payment = planPayment(
    ctx,
    player,
    cost,
    payWith,
    undefined,
    spellTags(d),
    [
      // Convoke: creatures pay for generic mana; improvise: artifacts do.
      ...(d.convoke
        ? creatureHelpers(ctx, player, manaSources(ctx, player, undefined, spellTags(d)))
        : []),
      ...(hasImprovise(ctx, player, card)
        ? artifactHelpers(ctx, player, manaSources(ctx, player, undefined, spellTags(d)), card)
        : []),
    ],
    [
      choice.sacrifice,
      ...(choice.sacrificeMany ?? []),
      choice.forage !== 'graveyard' ? choice.forage : undefined,
      ...(teamwork ?? []),
      choice.sneak,
    ],
  );
  if (o.zone === 'command')
    ctx.s.players[player].commanderCasts = (ctx.s.players[player].commanderCasts ?? 0) + 1;
  moveObject(ctx, card, 'stack', { controller: player });
  if (choice.sneak) moveObject(ctx, choice.sneak, 'hand');
  if (choice.discard) moveObject(ctx, choice.discard, 'graveyard');
  for (const id of choice.sacrificeMany ?? []) sacrificePermanent(ctx, id);
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    (ctx.s.turn.instantsSorceriesCast ??= { p1: 0, p2: 0 })[player]++;
  if (choice.sacrifice) sacrificePermanent(ctx, choice.sacrifice);
  if (v.removeCounters) removeCounters(ctx, player, v.removeCounters);
  changeLife(ctx, player, -wardLife(ctx, player, targets) - (v.life ?? 0));
  // Toxic Deluge: "As an additional cost to cast this spell, pay X life."
  if (d.payXLife && choice.x) changeLife(ctx, player, -choice.x);
  payWardExtras(ctx, player, targets);
  ctx.s.stack.push({
    kind: 'spell',
    id: card,
    controller: player,
    targets,
    ...(fromHand ? { fromHand: true } : {}),
    ...(o.zone === 'exile' ? { fromExile: true } : {}),
    ...(choice.kickCount ? { kickCount: choice.kickCount } : {}),
    ...(choice.mode !== undefined ? { mode: choice.mode } : {}),
    ...(choice.kicked ? { kicked: true } : {}),
    ...(flashback ? { flashback: true } : {}),
    ...(choice.x ? { x: choice.x } : {}),
    ...(choice.paws ? { paws: choice.paws } : {}),
    ...(v.finality ? { finality: true } : {}),
    ...(choice.copyOf ? { copyOf: choice.copyOf } : {}),
    ...(sneakFrom ? { sneak: sneakFrom } : {}),
  });
  payMana(ctx, payment);
  if (teamwork) payTeamwork(ctx, teamwork);
  if (convokers.length) o.convokedBy = payment.filter((id) => convokers.includes(id));
  if (d.types.includes('Creature')) scryForAncestry(ctx, player, d, payment);
  // Escalate: tap a creature for each mode beyond the first.
  if (v.spell?.escalate)
    for (const id of escalateCrew(ctx, player, v.spell.escalate) ?? []) tap(ctx, id);
  ((ctx.s.turn.castDefs ??= { p1: [], p2: [] })[player] ??= []).push(o.defId);
  // "When you cast this spell" (Ancestral Communion, Hatut Zeraze Strike Force).
  d.abilities.forEach((a, i) => {
    if (a.kind !== 'triggered' || a.trigger.on !== 'castSelf') return;
    if (!checkCondition(ctx, a.condition, player, o)) return;
    ctx.s.pendingTriggers.push({
      source: { id: o.id, zcc: o.zcc },
      sourceDefId: o.defId,
      abilityIndex: i,
      controller: player,
      subject: { id: o.id, zcc: o.zcc },
    });
  });
  // Conduit of Worlds: a card cast this way stops further spells this turn.
  if (choice.via === 'conduit') (ctx.s.turn.spellLock ??= []).push(player);
  const cast = (ctx.s.turn.spellsCast ??= { p1: 0, p2: 0 });
  emit(ctx, { type: 'spellCast', id: card, player, nth: ++cast[player] });
  noteTargets(ctx, player, targets);
  return (
    choice.forage !== undefined && payForage(ctx, player, choice.forage, { thenPriority: player })
  );
}

/**
 * Path of Ancestry: its mana spent on a creature spell that shares a creature
 * type with your commander triggers "scry 1".
 */
function scryForAncestry(
  ctx: Ctx,
  player: PlayerId,
  d: CardDefinition,
  payment: readonly ObjectId[],
): void {
  const types = commanderTypes(ctx, player);
  if (!d.subtypes.some((t) => types.includes(t))) return;
  for (const id of new Set(payment)) {
    const o = ctx.s.objects[id];
    if (!o || !def(ctx, id).abilities.some((a) => a.kind === 'mana' && a.scryIfCommanderType))
      continue;
    ctx.s.pendingTriggers.push({
      source: refOf(o),
      sourceDefId: o.defId,
      abilityIndex: -1,
      controller: player,
      inline: [{ kind: 'scry', amount: 1 }],
    });
  }
}

/** Eluge: {U} off the first instant or sorcery each turn, per land with a flood counter. */
function floodDiscount(ctx: Ctx, player: PlayerId, d: CardDefinition): number {
  if (!d.types.includes('Instant') && !d.types.includes('Sorcery')) return 0;
  if ((ctx.s.turn.instantsSorceriesCast?.[player] ?? 0) > 0) return 0;
  if (!hasStatic(ctx, player, 'floodDiscount')) return 0;
  return ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && (obj(ctx, id).counters?.flood ?? 0) > 0,
  ).length;
}

/** A count from `player`'s point of view (for cost reduction). */
function amountFor(ctx: Ctx, player: PlayerId, a: Amount): number {
  return countOf(ctx, player, a);
}

/** Does `player` control a permanent with this static ability? */
export function hasStatic(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind),
  );
}

/** The onceTurns key marking a planeswalker's loyalty ability this turn. */
export const LOYALTY_KEY = -500;

export function activatedAbility(ctx: Ctx, source: ObjectId, index: number) {
  // Its current abilities (a Sugar Coat Food has only the Food ability).
  const a = def(ctx, source).abilities[index];
  if (!a || a.kind !== 'activated') throw new Error(`No activated ability ${source}#${index}`);
  return a;
}

/** The mana an activated ability costs right now (power-up is cheaper the turn it entered). */
export function abilityManaCost(
  ctx: Ctx,
  source: ObjectId,
  a: ReturnType<typeof activatedAbility>,
): ManaCost | undefined {
  const o = obj(ctx, source);
  if (!a.powerUp || !a.cost.mana) return a.cost.mana;
  let cost = a.cost.mana;
  if (o.zoneTurn === ctx.s.turn.number) cost = reduceCost(cost, def(ctx, source).manaCost);
  for (const id of ctx.s.battlefield) {
    if (id === source || obj(ctx, id).controller !== o.controller) continue;
    for (const s of def(ctx, id).abilities)
      if (s.kind === 'static' && s.effect.kind === 'powerUpCostsLess')
        cost = reduceCost(cost, { generic: s.effect.amount, colored: {} });
  }
  return cost;
}

export function activateAbility(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  index: number,
  targets: TargetChoice[],
  payWith?: ObjectId[],
  sacrifice?: ObjectId,
  forage?: ObjectId | 'graveyard',
  discard?: ObjectId,
  x?: number,
): boolean {
  const a = activatedAbility(ctx, source, index);
  const src = obj(ctx, source);
  const mana = abilityManaCost(ctx, source, a);
  const sourceRef = { id: source, zcc: src.zcc };
  const exclude = a.cost.tapSelf ? source : undefined;
  const payment = planPayment(
    ctx,
    player,
    addCosts(
      mana
        ? { ...mana, generic: mana.generic + (x ?? 0) * (mana.x ?? 0) }
        : { generic: 0, colored: {} },
      wardCost(ctx, player, targets),
    ),
    payWith,
    exclude,
    // Shang-Chi's mana can pay for abilities of creature sources.
    isCreature(ctx, source) ? ['CreatureAbility'] : undefined,
    a.cost.convoke ? creatureHelpers(ctx, player, manaSources(ctx, player, exclude), exclude) : [],
    [sacrifice, forage !== 'graveyard' ? forage : undefined],
  );
  if (discard) moveObject(ctx, discard, 'graveyard');
  // Cycling.
  if (a.cost.discardSelf) moveObject(ctx, source, 'graveyard');
  if (a.cost.tapTokens)
    for (const id of tokensToTap(ctx, player, source).slice(0, a.cost.tapTokens)) tap(ctx, id);
  if (a.cost.crew) for (const id of crewFor(ctx, player, source, a.cost.crew) ?? []) tap(ctx, id);
  if (a.cost.sacrificeArtifacts)
    for (const id of artifactsToSacrifice(ctx, player, a.cost.sacrificeArtifacts) ?? [])
      sacrificePermanent(ctx, id);
  const sacrificedPower = sacrifice ? power(ctx, sacrifice) : undefined;
  if (sacrifice) sacrificePermanent(ctx, sacrifice);
  changeLife(ctx, player, -wardLife(ctx, player, targets) - (a.cost.life ?? 0));
  payWardExtras(ctx, player, targets);
  if (a.cost.removeCounters) {
    const c = (src.counters ??= {});
    c[a.cost.removeCounters.name] =
      (c[a.cost.removeCounters.name] ?? 0) - a.cost.removeCounters.count;
  }
  const id = newId(ctx);
  const item: StackItem = {
    kind: 'ability',
    id,
    source: sourceRef,
    sourceDefId: src.defId,
    abilityIndex: index,
    controller: player,
    targets,
    ...(sacrificedPower !== undefined ? { lkiPower: sacrificedPower } : {}),
    // The ability itself, in case the source's abilities change (or it's gone).
    activated: a,
    ...(x !== undefined ? { x } : {}),
  };
  if (a.cost.tapSelf) tap(ctx, source);
  if (a.oncePerTurn) src.onceTurns = { ...src.onceTurns, [-1 - index]: ctx.s.turn.number };
  // Loyalty abilities: one per planeswalker per turn; the cost changes its loyalty.
  if (a.cost.loyalty !== undefined) {
    src.onceTurns = { ...src.onceTurns, [LOYALTY_KEY]: ctx.s.turn.number };
    if (a.cost.loyalty > 0) addCounters(ctx, source, a.cost.loyalty, 'loyalty');
    else (src.counters ??= {}).loyalty = (src.counters?.loyalty ?? 0) + a.cost.loyalty;
  }
  payMana(ctx, payment);
  if (a.once || a.powerUp) (src.usedAbilities ??= []).push(index);
  if (a.cost.sacrificeSelf) {
    item.lkiPower = power(ctx, source);
    sacrificePermanent(ctx, source);
  }
  if (a.cost.exileSelf) moveObject(ctx, source, 'exile');
  ctx.s.stack.push(item);
  emit(ctx, { type: 'abilityActivated', id, source, player });
  noteTargets(ctx, player, targets, true);
  return forage !== undefined && payForage(ctx, player, forage, { thenPriority: player });
}

export function pushTrigger(
  ctx: Ctx,
  t: PendingTrigger,
  targets: TargetChoice[],
  mode?: number,
): void {
  // "You may pay ..." and ward: paid as it goes on the stack.
  const cost = addCosts(
    (triggeredAbility(ctx, t).targets.length ? triggeredAbility(ctx, t).cost : undefined) ?? {
      generic: 0,
      colored: {},
    },
    wardCost(ctx, t.controller, targets),
  );
  if (manaValue(cost) > 0) payMana(ctx, planPayment(ctx, t.controller, cost, undefined));
  const ability = triggeredAbility(ctx, t);
  if (mode !== undefined && ability.modesOnce) {
    const src = ctx.s.objects[t.source.id];
    if (src) src.usedModes = [...(src.usedModes ?? []), mode];
  }
  const life = ability.targets.length && ability.lifeCost ? ability.lifeCost : 0;
  changeLife(ctx, t.controller, -wardLife(ctx, t.controller, targets) - life);
  payWardExtras(ctx, t.controller, targets);
  const id = newId(ctx);
  ctx.s.stack.push({
    kind: 'ability',
    id,
    source: t.source,
    sourceDefId: t.sourceDefId,
    abilityIndex: t.abilityIndex,
    controller: t.controller,
    targets,
    ...(t.lkiPower !== undefined ? { lkiPower: t.lkiPower } : {}),
    ...(t.subject ? { subject: t.subject } : {}),
    ...(t.amount !== undefined ? { amount: t.amount } : {}),
    ...(t.inline ? { inline: t.inline } : {}),
    ...(t.emblem ? { emblem: t.emblem } : {}),
    ...(mode !== undefined ? { mode } : {}),
  });
  emit(ctx, { type: 'triggerStacked', id, source: t.source.id, player: t.controller });
  noteTargets(ctx, t.controller, targets, true);
}

function abilityOf(
  ctx: Ctx,
  item: Extract<StackItem, { kind: 'ability' }>,
): Exclude<AbilityDef, { kind: 'mana' | 'static' }> {
  if (item.inline || item.emblem) return triggeredAbility(ctx, item);
  if (item.activated) return item.activated;
  const a = defOf(ctx, item.sourceDefId).abilities[item.abilityIndex];
  if (a?.kind === 'triggered') {
    // A modal trigger resolves as the chosen mode.
    const m = item.mode !== undefined ? a.modes?.[item.mode] : undefined;
    return m ? { ...a, targets: m.targets, effects: m.effects } : a;
  }
  if (a?.kind === 'activated') return a;
  throw new Error(`Bad ability on stack: ${item.sourceDefId}#${item.abilityIndex}`);
}

/**
 * Rechecks targets on resolution (rule 608.2b). Returns null if the spell or
 * ability should fizzle: it had targets and all of them are now illegal.
 */
function checkTargets(
  ctx: Ctx,
  specs: readonly TargetSpec[],
  targets: readonly TargetChoice[],
  controller: PlayerId,
  sourceId: ObjectId | undefined,
): (TargetChoice | null)[] | null {
  const src = sourceId ? { controller, sourceId } : { controller };
  const checked = targets.map((t, i) =>
    specs[i] && isTargetLegal(ctx, specs[i], t, src) ? t : null,
  );
  if (targets.length > 0 && checked.every((t) => t === null)) return null;
  return checked;
}

/** Resolves the top of the stack. Returns true if it paused to ask a player something. */
export function resolveTop(ctx: Ctx): boolean {
  const item = ctx.s.stack.pop();
  if (!item) throw new Error('Stack is empty');

  if (item.kind === 'spell') {
    const o = obj(ctx, item.id);
    const d = defOf(ctx, o.defId);
    const spell = spellOnStack(d, item);
    if (spell) {
      const targets = checkTargets(ctx, spell.targets, item.targets, item.controller, item.id);
      if (!targets) {
        emit(ctx, { type: 'fizzled', id: item.id });
        moveObject(ctx, item.id, item.flashback ? 'exile' : 'graveyard');
        return false;
      }
      const es: EffectSource = {
        controller: item.controller,
        source: { id: o.id, zcc: o.zcc },
        sourceDefId: o.defId,
        targets,
        ...(item.x !== undefined ? { x: item.x } : {}),
      };
      const paused = {
        kind: 'spell' as const,
        id: item.id,
        ...(item.flashback || d.afterResolving === 'exile' ? { exile: true } : {}),
        ...(d.afterResolving === 'libraryBottom' ? { libraryBottom: true } : {}),
        // Rebound: cast from your hand, it's exiled and cast again at your next upkeep.
        ...(d.rebound && item.fromHand && !item.flashback ? { rebound: item.controller } : {}),
      };
      if (runEffects(ctx, es, spell.effects, paused)) return true;
      finishResolution(ctx, paused);
      return false;
    }
    // Permanent spell. An Aura needs its target to still be legal.
    let host: ObjectId | undefined;
    if (d.enchant) {
      const t = checkTargets(ctx, [d.enchant], item.targets, item.controller, item.id);
      const target = t?.[0];
      if (!target || !('object' in target)) {
        emit(ctx, { type: 'fizzled', id: item.id });
        moveObject(ctx, item.id, 'graveyard');
        return false;
      }
      host = target.object.id;
    }
    emit(ctx, { type: 'resolved', id: item.id });
    moveObject(ctx, item.id, 'battlefield', { controller: item.controller });
    if (item.kicked) o.kicked = true;
    // Multikicker: "enters with a +1/+1 counter for each time he was kicked".
    if (item.kickCount) {
      o.kickCount = item.kickCount;
      if (d.multikicker) addCounters(ctx, o.id, item.kickCount);
    }
    // Sneak: it enters tapped and attacking (it was never declared as an attacker).
    if (item.sneak && ctx.s.combat) {
      o.tapped = true;
      ctx.s.combat.attackers.push({ id: o.id, defender: item.sneak, blocked: false, blockers: [] });
    }
    // Royal Talon Fighter Jet: "enters with X +1/+1 counters".
    if (d.entersWithXCounters && item.x) addCounters(ctx, o.id, item.x);
    if (d.entersWithCounters && checkCondition(ctx, d.entersWithCountersIf, item.controller, o))
      addCounters(ctx, o.id, d.entersWithCounters);
    if (host) attachAura(ctx, o.id, host);
    if (item.finality) (o.counters ??= {}).finality = 1;
    // Marvel Super Heroes: "enters with a shield counter".
    for (const [k, v] of Object.entries(d.entersWithNamedCounters ?? {}))
      (o.counters ??= {})[k] = (o.counters[k] ?? 0) + v;
    if (d.loyalty !== undefined) (o.counters ??= {}).loyalty = d.loyalty;
    if (item.x) o.xPaid = item.x;
    if (item.copyOf && d.entersAsCopy) enterAsCopy(ctx, o.id, item.copyOf, d.entersAsCopy);
    addCounters(ctx, o.id, bonusCounters(ctx, item.controller, o.id, d.subtypes));
    // A permanent's gift (Scrapshooter): the opponent gets it as it resolves.
    if (item.kicked && d.kicker?.as === 'gift' && d.kicker.gift)
      runEffects(
        ctx,
        {
          controller: item.controller,
          source: { id: o.id, zcc: o.zcc },
          sourceDefId: o.defId,
          targets: [],
        },
        [d.kicker.gift, { kind: 'giftGiven' }],
        { kind: 'ability', id: o.id },
      );
    return false;
  }

  const a = abilityOf(ctx, item);
  const targets = checkTargets(ctx, a.targets, item.targets, item.controller, item.source.id);
  if (!targets) {
    emit(ctx, { type: 'fizzled', id: item.id });
    return false;
  }
  const es: EffectSource = {
    controller: item.controller,
    source: item.source,
    sourceDefId: item.sourceDefId,
    targets,
    ...(item.lkiPower !== undefined ? { lkiPower: item.lkiPower } : {}),
    ...(item.x !== undefined ? { x: item.x } : {}),
    ...(item.subject ? { subject: item.subject } : {}),
    ...(item.amount !== undefined ? { amount: item.amount } : {}),
  };
  const effects: EffectDef[] =
    a.kind === 'triggered' && !a.targets.length && (a.optional || a.cost)
      ? [{ kind: 'may', effects: a.effects, ...(a.cost ? { cost: a.cost } : {}) }]
      : a.effects;
  if (runEffects(ctx, es, effects, { kind: 'ability', id: item.id })) return true;
  finishResolution(ctx, { kind: 'ability', id: item.id });
  return false;
}

/**
 * Mockingbird: it becomes a copy of the creature (if still there), except
 * it's also a Bird and has flying. It turns back as it leaves the battlefield.
 */
function enterAsCopy(
  ctx: Ctx,
  id: ObjectId,
  of: ObjectId,
  extra: NonNullable<CardDefinition['entersAsCopy']>,
): void {
  const model = ctx.s.objects[of];
  if (!model || model.zone !== 'battlefield') return;
  const o = obj(ctx, id);
  o.originalDefId = o.defId;
  o.defId = model.defId;
  if (model.copyPT) o.copyPT = { ...model.copyPT };
  if (extra.addSubtype) o.addedSubtypes = [...(o.addedSubtypes ?? []), extra.addSubtype];
  if (extra.addKeyword) o.grantedKeywords = [extra.addKeyword];
  // Spark Double: an additional +1/+1 counter, and it isn't legendary.
  if (extra.notLegendary) o.nonlegendary = true;
  if (extra.counter) addCounters(ctx, id, 1);
}

/** An Aura attaches; Sugar Coat makes its host a Food, Kitnap takes control of it. */
function attachAura(ctx: Ctx, aura: ObjectId, host: ObjectId): void {
  const a = obj(ctx, aura);
  a.attachedTo = host;
  const h = obj(ctx, host);
  for (const ab of def(ctx, aura).abilities) {
    if (ab.kind !== 'static') continue;
    if (ab.effect.kind === 'enchantedIsFood') h.foodBy = aura;
    if (ab.effect.kind === 'attached' && ab.effect.control && h.controller !== a.controller) {
      h.controlledBy = { aura, previous: h.controller };
      h.controller = a.controller;
      h.summoningSick = true;
    }
  }
}

/** Last step of resolving (rule 608.2n): an instant or sorcery goes to the graveyard. */
export function finishResolution(ctx: Ctx, item: PausedResolution['item']): void {
  emit(ctx, { type: 'resolved', id: item.id });
  if (item.kind !== 'spell') return;
  if (item.libraryBottom) return moveObject(ctx, item.id, 'library', { position: 'bottom' });
  moveObject(ctx, item.id, item.exile || item.rebound ? 'exile' : 'graveyard');
  const o = ctx.s.objects[item.id];
  if (item.rebound && o?.zone === 'exile')
    (ctx.s.delayed ??= []).push({
      controller: item.rebound,
      sourceDefId: o.defId,
      subject: { id: o.id, zcc: o.zcc },
      effects: [{ kind: 'castFreeCard', card: { id: o.id, zcc: o.zcc } }],
      fromTurn: ctx.s.turn.number + 1,
      whose: item.rebound,
      at: 'upkeep',
    });
}

/** Carries on with a resolution that paused to ask a question. */
function resume(ctx: Ctx, r: PausedResolution, thenPriority: PlayerId): void {
  if (runEffects(ctx, r, r.effects, r.item)) return;
  finishResolution(ctx, r.item);
  givePriority(ctx, thenPriority);
}

/**
 * Untapped tokens `player` could tap for a cost, least useful first:
 * noncreature tokens, then the weakest creatures (the engine picks; a simplification).
 */
/**
 * Crew N: untapped creatures `player` controls (not the Vehicle) with total
 * power N or more. The engine picks: the smallest creatures that reach N
 * (a simplification). Null if they can't.
 */
export function crewFor(
  ctx: Ctx,
  player: PlayerId,
  vehicle: ObjectId,
  n: number,
): ObjectId[] | null {
  const crew = ctx.s.battlefield
    .filter((id) => {
      const o = obj(ctx, id);
      return id !== vehicle && o.controller === player && !o.tapped && isCreature(ctx, id);
    })
    .map((id) => ({ id, power: power(ctx, id) }))
    .filter((c) => c.power > 0)
    .sort((a, b) => a.power - b.power);
  // One creature big enough, else the smallest ones adding up.
  const one = crew.find((c) => c.power >= n);
  if (one) return [one.id];
  const out: ObjectId[] = [];
  let total = 0;
  for (const c of [...crew].reverse()) {
    if (total >= n) break;
    out.push(c.id);
    total += c.power;
  }
  return total >= n ? out : null;
}

/** Escalate (Collective Effort): the N smallest untapped creatures `player` controls, or null. */
export function escalateCrew(ctx: Ctx, player: PlayerId, n: number): ObjectId[] | null {
  const ready = ctx.s.battlefield
    .filter(
      (id) => obj(ctx, id).controller === player && !obj(ctx, id).tapped && isCreature(ctx, id),
    )
    .sort((a, b) => power(ctx, a) - power(ctx, b));
  return ready.length >= n ? ready.slice(0, n) : null;
}

/** Metalwork Colossus: the N least useful artifacts `player` controls (tokens, then the cheapest), or null. */
export function artifactsToSacrifice(ctx: Ctx, player: PlayerId, n: number): ObjectId[] | null {
  const artifacts = ctx.s.battlefield
    .filter((id) => obj(ctx, id).controller === player && def(ctx, id).types.includes('Artifact'))
    .sort(
      (a, b) =>
        Number(obj(ctx, b).isToken) - Number(obj(ctx, a).isToken) ||
        manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
    );
  return artifacts.length >= n ? artifacts.slice(0, n) : null;
}

export function tokensToTap(ctx: Ctx, player: PlayerId, source?: ObjectId): ObjectId[] {
  return ctx.s.battlefield
    .filter((id) => {
      const o = obj(ctx, id);
      return id !== source && o.controller === player && o.isToken && !o.tapped;
    })
    .sort((x, y) => {
      const cx = def(ctx, x).types.includes('Creature') ? 1 + power(ctx, x) : 0;
      const cy = def(ctx, y).types.includes('Creature') ? 1 + power(ctx, y) : 0;
      return cx - cy;
    });
}

/** Carries on with a paused resolution, running `first` before the rest of it. */
function continueWith(
  ctx: Ctx,
  r: PausedResolution,
  first: readonly EffectDef[],
  thenPriority: PlayerId,
): void {
  if (runEffects(ctx, r, [...first, ...r.effects], r.item)) return;
  finishResolution(ctx, r.item);
  givePriority(ctx, thenPriority);
}

/** "You may forage. If you do, ...": a Food, the graveyard, or (null) not foraging. */
export function answerForage(ctx: Ctx, choice: ObjectId | 'graveyard' | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'forage') throw new Error('Not foraging');
  if (choice === null) return resume(ctx, d.resume, d.thenPriority);
  const paused = payForage(ctx, d.player, choice, {
    then: d.then,
    resume: d.resume,
    thenPriority: d.thenPriority,
  });
  if (!paused) continueWith(ctx, d.resume, d.then, d.thenPriority);
}

/** A card chosen from an opponent's hand is discarded or exiled. */
export function answerChooseFromHand(ctx: Ctx, card: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'chooseFromHand') throw new Error('Not choosing from a hand');
  if (card) {
    moveObject(ctx, card, d.then === 'discard' ? 'graveyard' : 'exile');
    if (d.castable) {
      obj(ctx, card).castableBy = d.player;
      obj(ctx, card).anyMana = true;
    }
  }
  resume(ctx, d.resume, d.thenPriority);
}

/** A permanent chosen for 'chooseYourPermanent' (or none: its "otherwise"). */
export function answerChooseObject(ctx: Ctx, card: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'chooseObject') throw new Error('Not choosing a permanent');
  if (card === null) return continueWith(ctx, d.resume, d.otherwise, d.thenPriority);
  const chosen = { id: card, zcc: obj(ctx, card).zcc };
  continueWith(ctx, { ...d.resume, chosen }, d.then, d.thenPriority);
}

/** "Counter it unless its controller pays": pay (true) or let it be countered. */
export function answerPayOrCounter(ctx: Ctx, pay: boolean): void {
  const d = ctx.s.decision;
  if (d.kind !== 'payOrCounter') throw new Error('Not paying');
  if (pay) payMana(ctx, planPayment(ctx, d.player, d.cost, undefined));
  else counterSpell(ctx, d.spell);
  resume(ctx, d.resume, d.thenPriority);
}

/**
 * A 'castFree' decision answered: the card was cast (or not). Portent's other
 * cards go to hand; then the paused resolution carries on.
 */
export function finishCastFree(ctx: Ctx, cast: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'castFree') throw new Error('Not casting for free');
  for (const id of d.thenToHand ?? [])
    if (id !== cast && ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
  for (const id of d.thenToBottom ?? [])
    if (id !== cast && ctx.s.objects[id]?.zone === 'exile')
      moveObject(ctx, id, 'library', { position: 'bottom' });
  resume(ctx, d.resume, d.thenPriority);
}

/** One more permanent sacrificed for 'sacrificeSeveral'; when all are, its effects follow. */
export function answerSacrificeSeveral(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'sacrificeSeveral') throw new Error('Not sacrificing');
  sacrificePermanent(ctx, card);
  d.options = d.options.filter((id) => id !== card);
  d.count--;
  if (d.count > 0) return;
  continueWith(ctx, d.resume, d.then, d.thenPriority);
}

/** One of a 'chooseOption' decision's options: its effects, then the rest. */
export function answerChooseOption(ctx: Ctx, index: number): void {
  const d = ctx.s.decision;
  if (d.kind !== 'chooseOption') throw new Error('Not choosing an option');
  continueWith(ctx, d.resume, d.options[index]!.effects, d.thenPriority);
}

/** Foraging from the graveyard: one card exiled at a time. */
export function answerForageExile(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'forageExile') throw new Error('Not foraging');
  moveObject(ctx, card, 'exile');
  d.count--;
  if (d.count > 0 && ctx.s.players[d.player].graveyard.length > 0) return;
  if (d.resume) continueWith(ctx, d.resume, d.then ?? [], d.thenPriority);
  else givePriority(ctx, d.thenPriority);
}

export function answerOptionalEffect(ctx: Ctx, accept: boolean): void {
  const d = ctx.s.decision;
  if (d.kind !== 'optionalEffect') throw Error('Not choosing an optional effect');
  if (accept) {
    payMana(ctx, planPayment(ctx, d.player, d.cost, undefined));
    if (runEffects(ctx, d.resume, [...d.effects, ...d.resume.effects], d.resume.item)) return;
    finishResolution(ctx, d.resume.item);
    givePriority(ctx, d.thenPriority);
  } else resume(ctx, d.resume, d.thenPriority);
}

/** Applies a scry answer, then carries on with the paused resolution. */
export function answerScry(ctx: Ctx, top: readonly ObjectId[], bottom: readonly ObjectId[]): void {
  const d = ctx.s.decision;
  if (d.kind !== 'scry') throw new Error('Not scrying');
  const lib = ctx.s.players[d.player].library;
  lib.splice(0, d.cards.length);
  lib.unshift(...top);
  if (d.surveil) {
    // Surveil: "bottom" means the graveyard. Put them back on top first so moveObject finds them.
    lib.unshift(...bottom);
    for (const id of bottom) moveObject(ctx, id, 'graveyard');
  } else lib.push(...bottom);
  emit(ctx, { type: 'scried', player: d.player, top: top.length, bottom: bottom.length });
  resume(ctx, d.resume, d.thenPriority);
}

/** Perforating Artist: sacrifice a permanent, discard a card, or (null) lose the life. */
export function answerPunisher(ctx: Ctx, card: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'punisher') throw new Error('Not choosing');
  if (card === null) changeLife(ctx, d.player, -d.life);
  else if (obj(ctx, card).zone === 'battlefield') sacrificePermanent(ctx, card);
  else moveObject(ctx, card, 'graveyard');
  resume(ctx, d.resume, d.thenPriority);
}

/** Strongbox Raider: the chosen exiled card is playable until the end of your next turn. */
export function answerPickExiled(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'pickExiled') throw new Error('Not choosing');
  const ownTurn = ctx.s.turn.activePlayer === d.player;
  obj(ctx, card).playableUntilTurn = d.thisTurn
    ? ctx.s.turn.number
    : ctx.s.turn.number + (ownTurn ? 2 : 1);
  resume(ctx, d.resume, d.thenPriority);
}

/** A player chose the creature to sacrifice (Tribute to Hunger). */
export function answerSacrifice(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'sacrifice') throw new Error('Not sacrificing');
  const t = Math.max(0, characteristics(ctx, card).toughness);
  if (d.exile) moveObject(ctx, card, 'exile');
  else sacrificePermanent(ctx, card);
  if (d.gainLifeFor) gainLife(ctx, d.gainLifeFor, t);
  resume(ctx, d.resume, d.thenPriority);
}

/**
 * Giada: "each other Angel you control enters with an additional +1/+1
 * counter for each Angel you already control".
 */
function bonusCounters(
  ctx: Ctx,
  player: PlayerId,
  entering: ObjectId,
  subtypes: readonly string[],
) {
  let n = 0;
  for (const id of ctx.s.battlefield) {
    if (id === entering || obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities) {
      if (
        a.kind === 'static' &&
        a.effect.kind === 'othersEnterWithCounter' &&
        defOf(ctx, obj(ctx, entering).defId).types.includes('Creature') &&
        checkCondition(ctx, a.effect.condition, player, obj(ctx, id)) &&
        // Metallic Mimic: of the chosen type.
        (!a.effect.filter || cardMatches(ctx, entering, a.effect.filter, id))
      )
        n++;
      if (a.kind !== 'static' || a.effect.kind !== 'entersWithCountersPerSubtype') continue;
      const sub = a.effect.subtype;
      if (!subtypes.includes(sub)) continue;
      n += ctx.s.battlefield.filter(
        (x) =>
          x !== entering &&
          obj(ctx, x).controller === player &&
          characteristics(ctx, x).subtypes.includes(sub),
      ).length;
    }
  }
  return n;
}

/**
 * Library search / look answer: the card goes to hand or onto the battlefield;
 * then the library is shuffled, or the looked-at cards go to the bottom.
 */
export function answerSearch(ctx: Ctx, card: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'searchLibrary') throw new Error('Not searching');
  if (card !== null) {
    if (d.fromGraveyard) {
      if (d.to === 'battlefield') {
        moveObject(ctx, card, 'battlefield', { controller: d.player });
        if (d.counter) (obj(ctx, card).counters ??= {})[d.counter] = 1;
      } else moveObject(ctx, card, 'hand');
      squirrelFood(ctx, d, card);
      return resume(ctx, d.resume, d.thenPriority);
    }
    const onBattlefield =
      d.to === 'battlefield' ||
      d.to === 'battlefieldTapped' ||
      (d.battlefieldOnYourTurn && ctx.s.turn.activePlayer === d.player);
    if (d.to === 'graveyard') moveObject(ctx, card, 'graveyard');
    else if (d.to === 'libraryTop') {
      // Fountainport Bell: shuffle, then put it on top (done after the shuffle below).
    } else if (onBattlefield) {
      moveObject(ctx, card, 'battlefield', { controller: d.player });
      if (d.to === 'battlefieldTapped') obj(ctx, card).tapped = true;
      // Fabled Passage: untap it if you control enough lands.
      if (
        d.untapIfLands &&
        ctx.s.battlefield.filter(
          (id) => obj(ctx, id).controller === d.player && def(ctx, id).types.includes('Land'),
        ).length >= d.untapIfLands
      )
        obj(ctx, card).tapped = false;
    } else moveObject(ctx, card, 'hand');
    emit(ctx, { type: 'searched', player: d.player, id: card });
  }
  if (d.fromGraveyard) {
    squirrelFood(ctx, d, null);
    return resume(ctx, d.resume, d.thenPriority);
  }
  const lib = ctx.s.players[d.player].library;
  if (d.looked && d.restOnTop) {
    // Herald's Horn: what wasn't taken stays where it was.
  } else if (d.looked && d.restToGraveyard) {
    // Earth's Mightiest Heroes: the rest go to the graveyard.
    for (const id of d.looked)
      if (id !== card && obj(ctx, id).zone === 'library') moveObject(ctx, id, 'graveyard');
  } else if (d.looked) {
    const rest = d.looked.filter((id) => id !== card);
    for (const id of rest) lib.splice(lib.indexOf(id), 1);
    shuffleInPlace(ctx.s.rng, rest);
    lib.push(...rest);
  } else if (d.shuffle !== false) shuffleLibrary(ctx, d.player);
  if (card !== null && d.to === 'libraryTop') {
    lib.splice(lib.indexOf(card), 1);
    lib.unshift(card);
  }
  resume(ctx, d.resume, d.thenPriority);
}

/** Cache Grab: a Food if you control a Squirrel or took a Squirrel card. */
function squirrelFood(
  ctx: Ctx,
  d: Extract<Decision, { kind: 'searchLibrary' }>,
  card: ObjectId | null,
): void {
  if (!d.squirrelFood) return;
  const tookSquirrel = card !== null && def(ctx, card).subtypes.includes('Squirrel');
  const haveSquirrel = ctx.s.battlefield.some(
    (id) => obj(ctx, id).controller === d.player && hasSubtype(ctx, id, 'Squirrel'),
  );
  if (!tookSquirrel && !haveSquirrel) return;
  const food = createObject(ctx, 'food-token', d.player, 'battlefield', true);
  ctx.s.battlefield.push(food.id);
  emit(ctx, { type: 'objectMoved', id: food.id, defId: food.defId, from: null, to: 'battlefield' });
}

/** Discard from an effect: one card at a time, then resolution continues. */
export function answerDiscard(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'discard') throw new Error('Not discarding');
  const nonland = !def(ctx, card).types.includes('Land');
  moveObject(ctx, card, d.exile ? 'exile' : 'graveyard');
  d.count--;
  const c = d.connive && ctx.s.objects[d.connive.id];
  if (c && nonland && c.zone === 'battlefield' && c.zcc === d.connive!.zcc)
    addCounters(ctx, c.id, 1);
  // "Whenever a creature you control connives" (Glorious Purpose, Iron Monger, Ultron).
  if (c && c.zone === 'battlefield' && c.zcc === d.connive!.zcc)
    emit(ctx, { type: 'connived', id: c.id, player: c.controller });
  const left = ctx.s.players[d.player].hand.filter(
    (id) => !d.filter || cardMatches(ctx, id, d.filter),
  );
  if (d.count === 0 || left.length === 0) resume(ctx, d.resume, d.thenPriority);
}

/** Stargaze: one chosen card into your hand; once all are chosen, the rest go to the graveyard. */
export function answerPickCards(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'pickCards') throw new Error('Not picking cards');
  moveObject(ctx, card, 'hand');
  d.options = d.options.filter((id) => id !== card);
  d.count--;
  if (d.count > 0 && d.options.length > 0) return;
  for (const id of d.options) moveObject(ctx, id, 'graveyard');
  resume(ctx, d.resume, d.thenPriority);
}

/** Curator of Destinies: the owner split the cards; now an opponent picks a pile. */
export function answerSplit(ctx: Ctx, faceUp: readonly ObjectId[]): void {
  const d = ctx.s.decision;
  if (d.kind !== 'splitPiles') throw new Error('Not splitting');
  ctx.s.decision = {
    kind: 'choosePile',
    player: other(d.player),
    owner: d.player,
    faceUp: d.cards.filter((id) => faceUp.includes(id)),
    faceDown: d.cards.filter((id) => !faceUp.includes(id)),
    resume: d.resume,
    thenPriority: d.thenPriority,
  };
}

export function answerPile(ctx: Ctx, pile: 'faceUp' | 'faceDown'): void {
  const d = ctx.s.decision;
  if (d.kind !== 'choosePile') throw new Error('Not choosing a pile');
  const [toHand, toGrave] = pile === 'faceUp' ? [d.faceUp, d.faceDown] : [d.faceDown, d.faceUp];
  for (const id of toHand) moveObject(ctx, id, 'hand');
  for (const id of toGrave) moveObject(ctx, id, 'graveyard');
  resume(ctx, d.resume, d.thenPriority);
}
