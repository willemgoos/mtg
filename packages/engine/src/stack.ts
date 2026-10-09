import { creaturesOnBattlefield, power } from './characteristics.ts';
import { ignoresHexproofAndWard } from './brawl-15b-b-effects.ts';
import {
  type Ctx,
  ceaseSpellCopy,
  def,
  defOf,
  emit,
  moveObject,
  newId,
  newTimestamp,
  obj,
  other,
  sacrifice as sacrificePermanent,
  tap,
  addCounters,
  createObject,
  refOf,
  drawCard,
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
import {
  changeLife,
  counterSpell,
  damageSourceFor,
  dealDamage,
  gainLife,
  plusFoodTokens,
  sendToBottomRandom,
} from './effects.ts';
import { foodsOf, payForage } from './forage.ts';
import {
  abilityTags,
  anyTypeCost,
  artifactHelpers,
  colorsSpent,
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
import { useFreeCast } from './msh-analyzed.ts';
import { revealBeheld } from './fra-pw-b-effects.ts';
import {
  beholdOfType,
  beholdTypes,
  blightCreature,
  colorSplitOfPayment,
  conspireOptions,
  counterKinds,
  creatureCounterOptions,
  creatureCounterTotal,
  exiledWithCastable,
  hasConvoke,
  removeCounterKinds,
} from './ecl-18a.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';
import { givePriority } from './turn.ts';
import type {
  AbilityDef,
  CardDefinition,
  CardFilter,
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
  /** Reality Fracture (17c): beholding for `beholdOrPay` (Countersculpt). */
  beheld?: boolean | undefined;
  /** Reality Fracture (17c): the card beheld (a kicker's behold, or `beholdOrPay`); one from your hand is revealed. */
  beholdCard?: ObjectId | undefined;
  /** Cast as its back face (a modal double-faced card). */
  back?: boolean | undefined;
  /** Sneak: the unblocked attacker returned to hand. */
  sneak?: ObjectId | undefined;
  /** Teamwork: the creatures to tap. Omitted: the engine picks. */
  teamwork?: ObjectId[] | undefined;
  // Strixhaven (13c): a 'free' cast that costs something (Jadzi: {1}, Uvilda: {4} less).
  freePay?: ManaCost | undefined;
  freeLess?: number | undefined;
  /** Strixhaven Brawl (15b, u): delve, the cards exiled from the graveyard. */
  delve?: number | undefined;
  // Lorwyn Eclipsed (18a)
  /** The creature that gets the -1/-1 counters of a blight cost. */
  blight?: ObjectId | undefined;
  /** Cast for its evoke cost. */
  evoked?: boolean | undefined;
  /** Conspire: tap two creatures as it's cast. */
  conspire?: boolean | undefined;
  /** Beheld for a flashback that beholds several cards. */
  beholdCards?: ObjectId[] | undefined;
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
    // Strixhaven Brawl (15b, b): Nowhere to Run: their ward abilities don't trigger.
    if (ignoresHexproofAndWard(ctx, o.controller)) return [];
    if (hasKeyword(ctx, o.id, 'ward')) {
      const w = def(ctx, o.id).wardCost ?? { mana: { generic: 2, colored: {} } };
      // Final Fantasy (11c): ward paid in life (Raubahn: life equal to his power).
      return [w.lifeEqualsPower ? { ...w, life: Math.max(0, power(ctx, o.id)) } : w];
    }
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
  // Strixhaven Brawl (15b, b): Vein Ripper, ward—sacrifice a creature.
  const creatures = w.filter((x) => x.sacrificeCreature).length;
  // Reality Fracture (17a): Emrakul, the Exigent Doom, ward—sacrifice three permanents.
  const permanents = w.reduce((n, x) => n + (x.sacrificePermanents ?? 0), 0);
  return (
    ctx.s.players[player].hand.length - inHand >= discards &&
    foodsOf(ctx, player).length >= foods &&
    (creatures === 0 || creaturesOnBattlefield(ctx, player).length >= creatures) &&
    (permanents === 0 ||
      ctx.s.battlefield.filter((id) => obj(ctx, id).controller === player).length >= permanents)
  );
}

/**
 * Pays ward's discard and Food costs. The card discarded is the one with
 * the lowest mana value, the Food the first one (a simplification: the player
 * doesn't choose). Sacrificed creatures and permanents are chosen: payWardSacrifices.
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
    // Reality Fracture (17a fixes): ward's sacrifices (Vein Ripper, Emrakul) are chosen by the player: payWardSacrifices.
  }
}

// Reality Fracture (17a fixes): Vein Ripper, "Ward—Sacrifice a creature"; Emrakul, the Exigent Doom, "Ward—Sacrifice three permanents".
/** What ward asks `player` to sacrifice for these targets: creatures, then other permanents. */
function wardSacrifices(
  ctx: Ctx,
  player: PlayerId,
  targets: readonly TargetChoice[],
): { creatures: number; permanents: number } {
  const w = wardedTargets(ctx, player, targets);
  return {
    creatures: w.filter((x) => x.sacrificeCreature).length,
    permanents: w.reduce((n, x) => n + (x.sacrificePermanents ?? 0), 0),
  };
}

/** The permanents `player` could sacrifice for ward next. */
export function wardSacrificeOptions(
  ctx: Ctx,
  player: PlayerId,
  creaturesOnly: boolean,
): ObjectId[] {
  return ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && (!creaturesOnly || isCreature(ctx, id)),
  );
}

/**
 * Asks for what ward costs in sacrifices, one permanent at a time, once the spell or ability is on the stack
 * (ward is a trigger: the mana is already spent). Sacrifices with no real choice are made at once. Returns true
 * if a 'wardSacrifice' decision was set.
 */
function nextWardSacrifice(
  ctx: Ctx,
  player: PlayerId,
  creatures: number,
  permanents: number,
  after: {
    thenPriority: PlayerId;
    forage?: ObjectId | 'graveyard';
    afterFree?: Extract<Decision, { kind: 'wardSacrifice' }>['afterFree'];
  },
): boolean {
  for (let guard = 0; guard < 100 && (creatures > 0 || permanents > 0); guard++) {
    const creaturesOnly = creatures > 0;
    const left = creaturesOnly ? creatures : permanents;
    const options = wardSacrificeOptions(ctx, player, creaturesOnly);
    if (options.length > left) {
      ctx.s.decision = { kind: 'wardSacrifice', player, creatures, permanents, ...after };
      return true;
    }
    for (const id of options) sacrificePermanent(ctx, id);
    if (creaturesOnly) creatures = 0;
    else permanents = 0;
  }
  return false;
}

/** Pays ward's sacrifices for these targets (true if paused to ask which). */
function payWardSacrifices(
  ctx: Ctx,
  player: PlayerId,
  targets: readonly TargetChoice[],
  after: Parameters<typeof nextWardSacrifice>[4],
): boolean {
  const { creatures, permanents } = wardSacrifices(ctx, player, targets);
  return nextWardSacrifice(ctx, player, creatures, permanents, after);
}

/** One permanent sacrificed for ward; when all are, play goes on (after any forage). */
export function answerWardSacrifice(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'wardSacrifice') throw new Error('Not paying ward');
  sacrificePermanent(ctx, card);
  const creatures = d.creatures > 0 ? d.creatures - 1 : 0;
  const permanents = d.creatures > 0 ? d.permanents : d.permanents - 1;
  const after = {
    thenPriority: d.thenPriority,
    ...(d.forage !== undefined ? { forage: d.forage } : {}),
    ...(d.afterFree ? { afterFree: d.afterFree } : {}),
  };
  if (nextWardSacrifice(ctx, d.player, creatures, permanents, after)) return;
  if (
    d.forage !== undefined &&
    payForage(ctx, d.player, d.forage, {
      thenPriority: d.thenPriority,
      ...(d.afterFree ? { afterFree: d.afterFree } : {}),
    })
  )
    return;
  if (d.afterFree) {
    ctx.s.decision = d.afterFree.decision;
    return finishCastFree(ctx, d.afterFree.cast);
  }
  givePriority(ctx, d.thenPriority);
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

// Strixhaven (13b): Killian, Ink Duelist.
/** Does `player` control a permanent that makes spells cost less by what they target? */
export function hasTargetCostReduction(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'spellsCostLessTargeting',
      ),
  );
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
  // Strixhaven (13c): Jadzi (pay {1}) and Uvilda ({4} less) cast it for a price.
  // Reality Fracture (17a fixes): a free variant's cost is its additional costs only, which stay.
  if (choice.via === 'free') {
    if (choice.freePay) cost = addCosts(choice.freePay, cost);
    else if (choice.freeLess)
      cost = addCosts(
        { ...d.manaCost, generic: Math.max(0, d.manaCost.generic - choice.freeLess) },
        cost,
      );
  }
  // Brawl: commander tax.
  if (o.zone === 'command') cost = { ...cost, generic: cost.generic + commanderTax(ctx, player) };
  let reduce = d.costReduction !== undefined ? amountFor(ctx, player, d.costReduction) : 0;
  // Final Fantasy Commander (12f): spells cast from your graveyard cost less (Emet-Selch of the Third Seat).
  if (o.zone === 'graveyard' || o.fromGraveyardCast)
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === player)
        for (const a of def(ctx, id).abilities)
          if (a.kind === 'static' && a.effect.kind === 'graveyardSpellsCostLess')
            reduce += a.effect.amount;
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
  // Secrets of Strixhaven (14b): Brush Off takes a coloured pip off too.
  const reducedPip =
    d.costReductionIfTarget?.alsoColored &&
    first &&
    'object' in first &&
    matchesFilter(ctx, first.object.id, d.costReductionIfTarget.filter)
      ? d.costReductionIfTarget.alsoColored
      : // Strixhaven Brawl (15b, b): Blasphemous Edict.
        d.costReductionIf?.alsoColored &&
          checkCondition(ctx, d.costReductionIf.condition, player, o)
        ? d.costReductionIf.alsoColored
        : undefined;
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller === player)
      for (const a of def(ctx, id).abilities) {
        if (
          a.kind === 'static' &&
          a.effect.kind === 'spellsCostLess' &&
          cardMatches(ctx, card, a.effect.filter, id) &&
          // Strixhaven Brawl (15b, pair): Zimone, Infinite Analyst: only before you've cast a spell with {X} this turn.
          !(
            a.effect.firstXOnly &&
            (ctx.s.turn.castDefs?.[player] ?? []).some((cd) => !!defOf(ctx, cd).manaCost.x)
          )
        )
          reduce += countOf(ctx, player, a.effect.amount, false, id);
        // Strixhaven (13b): Killian, Ink Duelist.
        if (a.kind === 'static' && a.effect.kind === 'spellsCostLessTargeting') {
          const cheaper = a.effect;
          if (
            targets?.some((t) => 'object' in t && matchesFilter(ctx, t.object.id, cheaper.filter))
          )
            reduce += cheaper.amount;
        }
        if (
          a.kind === 'static' &&
          a.effect.kind === 'spellsCostLessIf' &&
          cardMatches(ctx, card, a.effect.filter) &&
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id))
        )
          reduce += a.effect.amount;
      }
  // Strixhaven (13b): Maelstrom Muse's "next instant or sorcery costs less".
  const discount = ctx.s.players[player].nextSpellDiscount;
  if (
    discount?.turn === ctx.s.turn.number &&
    (d.types.includes('Instant') || d.types.includes('Sorcery'))
  )
    reduce += discount.amount;
  // Archmage of Runes: instants and sorceries cost less.
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player) continue;
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'instantsAndSorceriesCostLess')
          reduce += a.effect.amount;
    }
  // Strixhaven Brawl (15b, u): delve pays for generic mana.
  if (choice.delve) reduce += choice.delve;
  // {X}: X is chosen as the spell is cast.
  if (cost.x) cost = { ...cost, generic: cost.generic + cost.x * (choice.x ?? 0), x: 0 };
  // Reality Fracture (17a): Thalia, the Survivor: your opponents' permanents make these spells cost more.
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller !== player)
      for (const a of def(ctx, id).abilities)
        if (
          a.kind === 'static' &&
          a.effect.kind === 'opponentSpellsCostMore' &&
          cardMatches(ctx, card, a.effect.filter, id)
        )
          cost = { ...cost, generic: cost.generic + a.effect.amount };
  // Strixhaven (13c): Plumb the Forbidden's sacrifices make copies, not a discount.
  if (!d.sacrificeCreaturesToCopy)
    reduce += (choice.sacrificeMany?.length ?? 0) * (d.sacrificeCreaturesForReduction ?? 1);
  if (reduce) cost = { ...cost, generic: Math.max(0, cost.generic - reduce) };
  if (reducedPip && (cost.colored[reducedPip] ?? 0) > 0)
    cost = { ...cost, colored: { ...cost.colored, [reducedPip]: cost.colored[reducedPip]! - 1 } };
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
  // Marvel Super Heroes Jumpstart (Analyzed): Vision's once this turn is used (while it's in hand).
  if (choice.via === 'freeOnceEachTurn') useFreeCast(ctx, player, card);
  const d = defOf(ctx, o.defId);
  const v = choice.sneak
    ? { cost: d.sneak!, spell: d.spell ?? null }
    : variantOf(d, o.zone, choice)!;
  const sneakFrom = choice.sneak
    ? ctx.s.combat?.attackers.find((a) => a.id === choice.sneak)?.defender
    : undefined;
  const flashback =
    (o.zone === 'graveyard' && !choice.via && !!d.flashback) ||
    !!choice.exileAfter ||
    // Secrets of Strixhaven (14b): Flashback grants flashback until end of turn.
    (o.zone === 'graveyard' && o.flashbackGrantedTurn === ctx.s.turn.number) ||
    !!o.exileAfterCast; // Secrets of Strixhaven (14b): Nita, Forum Conciliator
  const escaping = o.zone === 'graveyard' && !choice.via && !!d.escapeExiles;
  const fromHand = o.zone === 'hand';
  // Reality Fracture (17a): Twinned Vision, "if this spell wasn't cast from your hand" (the stack item is gone by resolution).
  o.castFromHand = fromHand;
  // Rule 601.2: move to stack, choose targets, then pay costs.
  const cost = addCosts(
    choice.sneak ? d.sneak! : castCost(ctx, player, card, choice, targets),
    wardCost(ctx, player, targets),
  );
  // Strixhaven (13b): the Maelstrom Muse discount is used up by the next instant or sorcery.
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    delete ctx.s.players[player].nextSpellDiscount;
  const teamwork = teamworkFor(ctx, player, card, choice);
  // Convoke: remembered for "each creature that convoked this spell" (Lethal Scheme).
  const convokers = hasConvoke(ctx, player, card)
    ? creatureHelpers(ctx, player, manaSources(ctx, player, undefined, spellTags(d, o.zone))).map(
        (h) => h.id,
      )
    : [];
  const payment = planPayment(
    ctx,
    player,
    cost,
    payWith,
    undefined,
    spellTags(d, o.zone),
    [
      // Convoke: creatures pay for generic mana; improvise: artifacts do.
      ...(hasConvoke(ctx, player, card)
        ? creatureHelpers(ctx, player, manaSources(ctx, player, undefined, spellTags(d, o.zone)))
        : []),
      ...(hasImprovise(ctx, player, card)
        ? artifactHelpers(
            ctx,
            player,
            manaSources(ctx, player, undefined, spellTags(d, o.zone)),
            card,
          )
        : []),
    ],
    [
      // Final Fantasy (11b): a land returned for kicker may tap for mana first.
      choice.kicked && d.kicker?.returnLand ? undefined : choice.sacrifice,
      ...(choice.sacrificeMany ?? []),
      choice.forage !== 'graveyard' ? choice.forage : undefined,
      ...(teamwork ?? []),
      choice.sneak,
      // Lorwyn Eclipsed (18a): a card beheld and exiled, and the creatures conspire may tap, aren't tapped for mana.
      ...(v.beholdExile ? [choice.beholdCard] : []),
      ...(choice.conspire ? conspireOptions(ctx, player, card) : []),
    ],
  );
  if (o.zone === 'command')
    ctx.s.players[player].commanderCasts = (ctx.s.players[player].commanderCasts ?? 0) + 1;
  // Secrets of Strixhaven (14a): converge. The colours of mana spent (read before the sources tap).
  const manaColors = colorsSpent(
    ctx,
    player,
    payment.filter((id) => !convokers.includes(id)),
  );
  // Lorwyn Eclipsed (18a): Dawnhand Dissident, how many counters this cast removes (read while the card is still in exile).
  const payCounters =
    choice.via === 'exiledWithSelf' ? (exiledWithCastable(ctx, player).get(card) ?? 0) : 0;
  // Lorwyn Eclipsed (18a): the split of colours spent, for "if {W}{W} was spent to cast it".
  const manaPaid = colorSplitOfPayment(
    ctx,
    player,
    payment.filter((id) => !convokers.includes(id)),
  );
  moveObject(ctx, card, 'stack', { controller: player });
  // Reality Fracture (17c): beholding a card from your hand reveals it (a permanent you control is only chosen).
  // Lorwyn Eclipsed (18a): "behold … and exile it" exiles the card instead (nothing is revealed).
  if (choice.beholdCard !== undefined && v.beholdExile) {
    moveObject(ctx, choice.beholdCard, 'exile');
    const gone = ctx.s.objects[choice.beholdCard];
    if (gone) o.beholdExiled = { id: gone.id, zcc: gone.zcc };
  } else if (choice.beholdCard !== undefined) revealBeheld(ctx, player, choice.beholdCard);
  for (const id of choice.beholdCards ?? []) revealBeheld(ctx, player, id);
  // Lorwyn Eclipsed (18a): blight as an additional cost.
  if (v.blight !== undefined && choice.blight !== undefined)
    blightCreature(ctx, player, choice.blight, v.blight === 'x' ? (choice.x ?? 0) : v.blight);
  // Secrets of Strixhaven (14b): Soaring Stoneglider, exile two cards from your graveyard unless kicked.
  if (d.unkickedExilesGraveyard && !choice.kicked)
    for (let i = 0; i < d.unkickedExilesGraveyard; i++) {
      const gone = graveyardCostCard(ctx, player, {}, card);
      if (gone) moveObject(ctx, gone, 'exile');
    }
  // Strixhaven Brawl (15b, u): delve exiles the least useful cards from your graveyard.
  for (let i = 0; i < (choice.delve ?? 0); i++) {
    const gone = graveyardCostCard(ctx, player, {}, card);
    if (gone) moveObject(ctx, gone, 'exile');
  }
  // Strixhaven Brawl (15b, u): Quicken is used up by the next sorcery you cast.
  if (d.types.includes('Sorcery') && ctx.s.turn.sorceryFlash?.includes(player))
    ctx.s.turn.sorceryFlash = ctx.s.turn.sorceryFlash.filter((p) => p !== player);
  // Strixhaven Brawl (15a): Patchplate Resolute's boon: that creature enters with an additional +1/+1 counter.
  if (d.types.includes('Creature') && (ctx.s.players[player].creatureBoons ?? 0) > 0) {
    ctx.s.players[player].creatureBoons!--;
    o.bonusCounters = (o.bonusCounters ?? 0) + 1;
  }
  // Secrets of Strixhaven (14a): prepare. Casting the copy unprepares its creature.
  const preparer = o.preparedBy !== undefined ? ctx.s.objects[o.preparedBy] : undefined;
  if (preparer && preparer.prepared === card) {
    delete preparer.prepared;
    emit(ctx, { type: 'unprepared', id: preparer.id, player });
  }
  if (choice.sneak) moveObject(ctx, choice.sneak, 'hand');
  // Strixhaven (13c): Draconic Intervention exiles a card from your graveyard; its mana value is X.
  let exiledValue: number | undefined;
  if (choice.discard && d.exileFromGraveyardToCast) {
    exiledValue = manaValue(def(ctx, choice.discard).manaCost);
    moveObject(ctx, choice.discard, 'exile');
  } else if (choice.discard && choice.kicked && d.kicker?.exileFromHand) {
    // Mystical Archive (16): Force of Will.
    moveObject(ctx, choice.discard, 'exile');
  } else if (choice.discard) moveObject(ctx, choice.discard, 'graveyard');
  for (const id of choice.sacrificeMany ?? []) sacrificePermanent(ctx, id);
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    (ctx.s.turn.instantsSorceriesCast ??= { p1: 0, p2: 0 })[player]++;
  // Final Fantasy (11b): "Kicker—Return a land you control to its owner's hand".
  // Strixhaven (13b): the sacrificed creature's power (Tend the Pests).
  const sacrificedPower = choice.sacrifice ? power(ctx, choice.sacrifice) : undefined;
  if (choice.sacrifice && choice.kicked && d.kicker?.returnLand)
    moveObject(ctx, choice.sacrifice, 'hand');
  else if (choice.sacrifice) sacrificePermanent(ctx, choice.sacrifice);
  if (v.removeCounters) removeCounters(ctx, player, v.removeCounters);
  changeLife(ctx, player, -wardLife(ctx, player, targets) - (v.life ?? 0));
  // Toxic Deluge: "As an additional cost to cast this spell, pay X life."
  if (d.payXLife && choice.x) changeLife(ctx, player, -choice.x);
  payWardExtras(ctx, player, targets);
  ctx.s.stack.push({
    kind: 'spell',
    castBy: player,
    id: card,
    controller: player,
    targets,
    ...(fromHand ? { fromHand: true } : {}),
    ...(o.zone === 'exile' ? { fromExile: true } : {}),
    ...(choice.kickCount ? { kickCount: choice.kickCount } : {}),
    ...(choice.mode !== undefined ? { mode: choice.mode } : {}),
    ...(choice.kicked ? { kicked: true } : {}),
    ...(choice.evoked ? { evoked: true } : {}),
    ...(choice.conspire ? { conspire: true } : {}),
    // Dawnhand Dissident: cast by removing counters from among your creatures.
    ...(payCounters ? { payCounters } : {}),
    ...(flashback && !escaping ? { flashback: true } : {}),
    ...(choice.x ? { x: choice.x } : {}),
    ...(exiledValue ? { x: exiledValue } : {}),
    ...(sacrificedPower !== undefined ? { lkiPower: sacrificedPower } : {}),
    ...(choice.paws ? { paws: choice.paws } : {}),
    ...(v.finality ? { finality: true } : {}),
    ...(choice.copyOf ? { copyOf: choice.copyOf } : {}),
    ...(sneakFrom ? { sneak: sneakFrom } : {}),
  });
  payMana(ctx, payment);
  // Reality Fracture (17a): Emrakul, the Exigent Doom: lands tap for {C}{C} only until the card is cast from exile.
  for (const id of ctx.s.battlefield) {
    const held = obj(ctx, id).abilitiesUntilCast;
    if (held?.some((x) => x.card === card)) {
      const rest = held.filter((x) => x.card !== card);
      if (rest.length) obj(ctx, id).abilitiesUntilCast = rest;
      else delete obj(ctx, id).abilitiesUntilCast;
    }
  }
  // Final Fantasy (11b): mana spent (convoking creatures don't spend mana).
  o.manaSpent = payment.filter((id) => !convokers.includes(id)).length;
  o.manaColors = manaColors;
  o.manaPaid = manaPaid;
  if (teamwork) payTeamwork(ctx, teamwork);
  if (convokers.length) o.convokedBy = payment.filter((id) => convokers.includes(id));
  if (d.types.includes('Creature')) scryForAncestry(ctx, player, d, payment);
  // Escalate: tap a creature for each mode beyond the first.
  if (v.spell?.escalate)
    for (const id of escalateCrew(ctx, player, v.spell.escalate, v.spell.escalateFilter) ?? [])
      tap(ctx, id);
  // Conduit of Worlds: a card cast this way stops further spells this turn.
  if (choice.via === 'conduit' && !o.noSpellLock) (ctx.s.turn.spellLock ??= []).push(player);
  // Secrets of Strixhaven (14b): Zaffai and the Tempests, once each turn.
  if (choice.via === 'zaffai') (ctx.s.turn.zaffaiUsed ??= []).push(player);
  // Runaways: escape chooses every exiled card without enumerating combinations.
  if (escaping && d.escapeExiles) {
    const graveyard = ctx.s.players[player].graveyard;
    if (graveyard.length === d.escapeExiles) {
      for (const id of [...graveyard]) moveObject(ctx, id, 'exile');
    } else {
      ctx.s.decision = {
        kind: 'forageExile',
        player,
        count: d.escapeExiles,
        thenPriority: player,
        castingSpell: { card, targets, sacrificed: choice.sacrificeMany?.length ?? 0 },
      };
      return true;
    }
  }
  if (
    choice.forage !== undefined &&
    payForage(ctx, player, choice.forage, {
      thenPriority: player,
      castingSpell: { card, targets, sacrificed: choice.sacrificeMany?.length ?? 0 },
    })
  )
    return true;
  return finishCasting(ctx, player, card, targets, choice.sacrificeMany?.length ?? 0);
}

/** Runaways: casting completes after every additional cost, including sequential exile choices. */
function finishCasting(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  targets: TargetChoice[],
  sacrificed: number,
): boolean {
  const o = obj(ctx, card);
  const d = def(ctx, card);
  ((ctx.s.turn.castDefs ??= { p1: [], p2: [] })[player] ??= []).push(o.defId);
  // "When you cast this spell" (Ancestral Communion, Hatut Zeraze Strike Force).
  d.abilities.forEach((a, i) => {
    if (a.kind !== 'triggered' || a.trigger.on !== 'castSelf') return;
    if (!checkCondition(ctx, a.condition, player, o)) return;
    // Strixhaven (13c): Plumb the Forbidden: one copy for each creature sacrificed to cast it.
    if (a.trigger.perSacrificed && sacrificed === 0) return;
    ctx.s.pendingTriggers.push({
      source: { id: o.id, zcc: o.zcc },
      sourceDefId: o.defId,
      abilityIndex: i,
      controller: player,
      subject: { id: o.id, zcc: o.zcc },
      // Marvel Super Heroes Jumpstart (Scarlet): storm counts the spells cast before it (Grapeshot).
      amount: a.trigger.perSacrificed ? sacrificed : (ctx.s.turn.spellsCast?.[player] ?? 0),
    });
  });
  // Reality Fracture (17c): Theorist's Proxy: "the next spell you cast this turn can't be countered".
  if (ctx.s.turn.nextSpellUncounterable?.includes(player)) {
    o.cantBeCountered = true;
    ctx.s.turn.nextSpellUncounterable = ctx.s.turn.nextSpellUncounterable.filter((p) => p !== player);
  }
  const cast = (ctx.s.turn.spellsCast ??= { p1: 0, p2: 0 });
  emit(ctx, { type: 'spellCast', id: card, player, nth: ++cast[player] });
  noteTargets(ctx, player, targets);
  return continueCasting(ctx, player, card, targets, 'counters');
}

/**
 * The choices a cast makes one at a time once the spell is on the stack, in order: the creature type and creatures to behold
 * (Celestial Reunion), the creatures to tap for conspire, ward's sacrifices. `from` is where to pick up. True: paused to ask.
 */
function continueCasting(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  targets: TargetChoice[],
  from: 'counters' | 'behold' | 'conspire' | 'ward',
): boolean {
  const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === card);
  const cd = def(ctx, card);
  // Lorwyn Eclipsed (18a): Dawnhand Dissident, counters removed from among your creatures one at a time.
  if (from === 'counters' && item?.kind === 'spell' && item.payCounters) {
    const options = creatureCounterOptions(ctx, player);
    if (options.length > 0) {
      payCountersStep(ctx, {
        kind: 'payCounters',
        player,
        spell: card,
        left: item.payCounters,
        options,
        targets,
        thenPriority: player,
      });
      return true;
    }
  }
  if (from === 'counters') from = 'behold';
  // Lorwyn Eclipsed (18a): "choose a creature type and behold two creatures of that type".
  if (
    from === 'behold' &&
    item?.kind === 'spell' &&
    item.kicked &&
    cd.kicker?.beholdChosenType !== undefined
  ) {
    const count = cd.kicker.beholdChosenType;
    const types = beholdTypes(ctx, player, card, count);
    if (types.length > 0) {
      ctx.s.decision = {
        kind: 'beholdType',
        player,
        spell: card,
        count,
        types,
        options: [],
        chosen: [],
        targets,
        thenPriority: player,
      };
      return true;
    }
  }
  // Lorwyn Eclipsed (18a): conspire, the creatures to tap are chosen one at a time.
  if (from !== 'ward' && item?.kind === 'spell' && item.conspire) {
    const options = conspireOptions(ctx, player, card);
    if (options.length >= 2) {
      ctx.s.decision = {
        kind: 'conspire',
        player,
        spell: card,
        options,
        chosen: [],
        targets,
        thenPriority: player,
      };
      return true;
    }
  }
  // Reality Fracture (17a fixes): ward's sacrifices are chosen (true: paused to ask which).
  return payWardSacrifices(ctx, player, targets, { thenPriority: player });
}

/** Dawnhand Dissident: one more counter removed (or the last of them), or all that remain if there is no real choice. */
function payCountersStep(ctx: Ctx, d: Extract<Decision, { kind: 'payCounters' }>): void {
  // With exactly as many counters as are left to remove, there is nothing to choose.
  const total = creatureCounterTotal(ctx, d.player);
  if (d.left > 0 && total <= d.left) {
    for (const o of creatureCounterOptions(ctx, d.player)) {
      const n = counterKinds(ctx, o.creature)[o.kind] ?? 0;
      removeCounterKinds(ctx, o.creature, Array<string>(n).fill(o.kind));
    }
    d.left = 0;
  }
  if (d.left > 0) {
    ctx.s.decision = { ...d, options: creatureCounterOptions(ctx, d.player) };
    return;
  }
  if (continueCasting(ctx, d.player, d.spell, d.targets, 'behold')) return;
  givePriority(ctx, d.thenPriority);
}

/** Dawnhand Dissident: the counter chosen (an index into `options`). */
export function answerPayCounters(ctx: Ctx, index: number): void {
  const d = ctx.s.decision;
  if (d.kind !== 'payCounters') throw new Error('Not removing counters');
  const pick = d.options[index];
  if (!pick) throw new Error('No such counter');
  removeCounterKinds(ctx, pick.creature, [pick.kind]);
  payCountersStep(ctx, { ...d, left: d.left - 1 });
}

/** Celestial Reunion: the creature type chosen, then each creature beheld. */
function beholdTypeStep(ctx: Ctx, d: Extract<Decision, { kind: 'beholdType' }>): void {
  // With no real choice left, take what remains.
  const need = d.count - d.chosen.length;
  if (d.chosenType !== undefined && d.options.length <= need) {
    d.chosen = [...d.chosen, ...d.options];
    d.options = [];
  }
  if (d.chosenType === undefined || d.chosen.length < d.count) {
    ctx.s.decision = d;
    return;
  }
  for (const id of d.chosen) revealBeheld(ctx, d.player, id);
  obj(ctx, d.spell).chosenType = d.chosenType;
  if (continueCasting(ctx, d.player, d.spell, d.targets, 'conspire')) return;
  givePriority(ctx, d.thenPriority);
}

/** Celestial Reunion: the creature type chosen (an index into `types`). */
export function answerBeholdType(ctx: Ctx, index: number): void {
  const d = ctx.s.decision;
  if (d.kind !== 'beholdType' || d.chosenType !== undefined) throw new Error('Not choosing a type');
  const chosenType = d.types[index];
  if (chosenType === undefined) throw new Error('No such creature type');
  beholdTypeStep(ctx, {
    ...d,
    chosenType,
    options: beholdOfType(ctx, d.player, d.spell, chosenType),
  });
}

/** Celestial Reunion: one creature beheld. */
export function answerBeholdCreature(ctx: Ctx, creature: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'beholdType' || d.chosenType === undefined) throw new Error('Not beholding');
  beholdTypeStep(ctx, {
    ...d,
    chosen: [...d.chosen, creature],
    options: d.options.filter((id) => id !== creature),
  });
}

/** Conspire: a creature chosen to tap (the first, then the second); then the spell is copied. */
export function answerConspire(ctx: Ctx, creature: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'conspire') throw new Error('Not conspiring');
  const chosen = [...d.chosen, creature];
  if (chosen.length < 2) {
    ctx.s.decision = { ...d, chosen, options: d.options.filter((id) => id !== creature) };
    return;
  }
  for (const id of chosen) tap(ctx, id);
  // "When you do, copy it and you may choose new targets for the copy."
  const o = obj(ctx, d.spell);
  ctx.s.pendingTriggers.push({
    source: { id: o.id, zcc: o.zcc },
    sourceDefId: o.defId,
    abilityIndex: -1,
    controller: d.player,
    subject: { id: o.id, zcc: o.zcc },
    inline: [{ kind: 'copySpell', what: 'subject', newTargets: true }],
  });
  if (continueCasting(ctx, d.player, d.spell, d.targets, 'ward')) return;
  givePriority(ctx, d.thenPriority);
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
  /** Final Fantasy (11d): the chosen targets ('best': the cheapest any target could make it). */
  targets?: readonly TargetChoice[] | 'best',
): ManaCost | undefined {
  const o = obj(ctx, source);
  // Final Fantasy (11c): activated cost reduction (Balamb Garden), and Firion's cheaper equip.
  const less =
    (a.costReduction !== undefined
      ? countOf(ctx, o.controller, a.costReduction, false, source)
      : 0) +
    // Firion's copies' own discount, and "equip abilities you activate cost less" (Fighter Class).
    (a.cost.mana ? equipDiscount(ctx, o, a, targets) : 0) +
    // Reality Fracture (17a): Warrior's Blades, "{1} less for each +1/+1 counter on the creature it targets".
    (a.costReductionPerTargetCounter ? counterDiscount(ctx, o.controller, targets) : 0);
  if (less && a.cost.mana && !a.powerUp)
    return reduceCost(a.cost.mana, { generic: Math.min(less, a.cost.mana.generic), colored: {} });
  if (!a.powerUp || !a.cost.mana) return a.cost.mana;
  // Marvel Super Heroes Jumpstart (Trained): Advancing the Spirit, the first power-up on your turn costs {0}.
  if (
    ctx.s.turn.activePlayer === o.controller &&
    !ctx.s.turn.powerUpActivated &&
    ctx.s.battlefield.some(
      (id) =>
        obj(ctx, id).controller === o.controller &&
        def(ctx, id).abilities.some(
          (s) => s.kind === 'static' && s.effect.kind === 'firstPowerUpFree',
        ),
    )
  )
    return { generic: 0, colored: {} };
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

// Reality Fracture (17a): Warrior's Blades
/** The +1/+1 counters on the creature a cost-reducing ability targets ('best': the most on a creature of yours). */
function counterDiscount(
  ctx: Ctx,
  player: PlayerId,
  targets?: readonly TargetChoice[] | 'best',
): number {
  if (targets === 'best')
    return Math.max(
      0,
      ...ctx.s.battlefield
        .filter((id) => obj(ctx, id).controller === player && isCreature(ctx, id))
        .map((id) => obj(ctx, id).plusOneCounters),
    );
  const t = targets?.[0];
  return t && 'object' in t ? (ctx.s.objects[t.object.id]?.plusOneCounters ?? 0) : 0;
}

// Final Fantasy Commander (12b): equip cost reductions.
/** How much less an equip ability costs: the controller's "equip abilities cost less" and the Equipment's own. */
function equipDiscount(
  ctx: Ctx,
  o: { id: ObjectId; controller: PlayerId; equipDiscount?: number },
  a: ReturnType<typeof activatedAbility>,
  targets?: readonly TargetChoice[] | 'best',
): number {
  const isEquip =
    def(ctx, o.id).subtypes.includes('Equipment') &&
    a.effects.length === 1 &&
    a.effects[0]!.kind === 'attach';
  if (!isEquip) return 0;
  let n = o.equipDiscount ?? 0;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== o.controller) continue;
    for (const s of def(ctx, id).abilities)
      if (
        s.kind === 'static' &&
        s.effect.kind === 'equipCostsLess' &&
        checkCondition(ctx, s.effect.condition, o.controller, obj(ctx, id)) &&
        // Final Fantasy (11d): only when equipping this creature (Cloud, Planet's Champion).
        (!s.effect.targetSelf ||
          targets === 'best' ||
          (!!targets?.[0] && 'object' in targets[0] && targets[0].object.id === id))
      )
        n += s.effect.amount;
  }
  return n;
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
  tapCreature?: ObjectId,
  tapArtifacts?: ObjectId[],
  blight?: ObjectId,
  removeKinds?: string[],
): boolean {
  const a = activatedAbility(ctx, source, index);
  const src = obj(ctx, source);
  const mana = abilityManaCost(ctx, source, a, targets);
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
    // Shang-Chi's mana can pay for abilities of creature sources; Eclipsed Realms' mana for sources of the chosen type.
    abilityTags(ctx, source),
    a.cost.convoke ? creatureHelpers(ctx, player, manaSources(ctx, player, exclude), exclude) : [],
    [sacrifice, forage !== 'graveyard' ? forage : undefined, tapCreature, ...(tapArtifacts ?? [])],
  );
  if (discard) {
    // Strixhaven (13c): Uvilda exiles the card with three refine counters.
    moveObject(ctx, discard, a.cost.exileRefine ? 'exile' : 'graveyard');
    if (a.cost.exileRefine)
      obj(ctx, discard).counters = { ...obj(ctx, discard).counters, refine: 3 };
  }
  // Cycling.
  if (a.cost.discardSelf) moveObject(ctx, source, 'graveyard');
  // Strixhaven Brawl (15b, multi): Suspend N, "exile it from your hand with N time counters".
  if (a.cost.suspendSelf) {
    moveObject(ctx, source, 'exile');
    const exiled = obj(ctx, source);
    exiled.suspended = true;
    exiled.counters = { ...exiled.counters, time: a.cost.suspendSelf };
  }
  if (a.cost.tapTokens)
    for (const id of tokensToTap(ctx, player, source).slice(0, a.cost.tapTokens)) tap(ctx, id);
  // Secrets of Strixhaven (14b): Harmonized Trio.
  if (a.cost.tapOtherCreatures)
    for (const id of creaturesToTap(ctx, player, undefined, source, true).slice(
      0,
      a.cost.tapOtherCreatures,
    ))
      tap(ctx, id);
  // Marvel Super Heroes Jumpstart (Masters of Evil)
  if (a.cost.tapCreature) {
    const can = creaturesToTap(ctx, player, a.cost.tapCreature, source);
    // Villainous Syndication: the Villain chosen, if it still can be.
    const id = tapCreature && can.includes(tapCreature) ? tapCreature : can[0];
    if (id) tap(ctx, id);
  }
  // Reality Fracture (17a): Tenured Tethermage, "tap two untapped artifacts you control".
  if (a.cost.tapArtifacts) {
    const can = artifactsToTap(ctx, player);
    const chosen = (tapArtifacts ?? []).filter(
      (id, i, all) => can.includes(id) && all.indexOf(id) === i,
    );
    for (const id of [...chosen, ...can.filter((id) => !chosen.includes(id))].slice(
      0,
      a.cost.tapArtifacts,
    ))
      tap(ctx, id);
  }
  // Lorwyn Eclipsed (18b, multi-b): High Perfect Morcant, Kirol, "tap three untapped Elves you control".
  if (a.cost.tapUntapped) {
    const can = untappedMatching(ctx, player, a.cost.tapUntapped.filter, source);
    const chosen = (tapArtifacts ?? []).filter(
      (id, i, all) => can.includes(id) && all.indexOf(id) === i,
    );
    for (const id of [...chosen, ...can.filter((id) => !chosen.includes(id))].slice(
      0,
      a.cost.tapUntapped.count,
    ))
      tap(ctx, id);
  }
  if (a.cost.crew) {
    const crew = crewFor(ctx, player, source, a.cost.crew) ?? [];
    for (const id of crew) tap(ctx, id);
    // Final Fantasy (11c): crewed by (Balthier and Fran).
    const v = obj(ctx, source);
    const before = v.crewedBy?.turn === ctx.s.turn.number ? v.crewedBy.ids : [];
    v.crewedBy = { turn: ctx.s.turn.number, ids: [...before, ...crew] };
  }
  if (a.cost.sacrificeArtifacts)
    for (const id of artifactsToSacrifice(
      ctx,
      player,
      a.cost.sacrificeArtifacts,
      a.cost.sacrificeArtifactsFilter,
    ) ?? [])
      sacrificePermanent(ctx, id);
  // Strixhaven (13a): exile a card from your graveyard as a cost.
  // Reality Fracture (17a fixes): Gallia, Tragic Host: with a real choice of card, the player picks it (after the
  // ability is on the stack, like a forage); otherwise the only possible card goes.
  let chooseGraveyardCard = false;
  if (a.cost.exileFromGraveyard) {
    const options = graveyardCostOptions(ctx, player, a.cost.exileFromGraveyard, source);
    if (new Set(options.map((id) => obj(ctx, id).defId)).size > 1) chooseGraveyardCard = true;
    else {
      const card = graveyardCostCard(ctx, player, a.cost.exileFromGraveyard, source);
      if (card) moveObject(ctx, card, 'exile');
    }
  }
  const sacrificedPower = sacrifice ? power(ctx, sacrifice) : undefined;
  if (sacrifice) sacrificePermanent(ctx, sacrifice);
  changeLife(ctx, player, -wardLife(ctx, player, targets) - (a.cost.life ?? 0));
  payWardExtras(ctx, player, targets);
  // Lorwyn Eclipsed (18a): Blight N in the cost.
  if (a.cost.blight && blight !== undefined) blightCreature(ctx, player, blight, a.cost.blight);
  // "Remove a counter from this creature": counters of the kinds chosen.
  if (a.cost.removeAnyCounters) removeCounterKinds(ctx, source, removeKinds ?? []);
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
    // Reality Fracture (17c): Kiora of Salt and Sand ("if you've activated a loyalty ability this turn").
    if (!ctx.s.turn.loyaltyActivated?.includes(player))
      ctx.s.turn.loyaltyActivated = [...(ctx.s.turn.loyaltyActivated ?? []), player];
    if (a.cost.loyalty > 0) addCounters(ctx, source, a.cost.loyalty, 'loyalty', player);
    else
      (src.counters ??= {}).loyalty =
        (src.counters?.loyalty ?? 0) + a.cost.loyalty - (a.cost.loyaltyX ? (x ?? 0) : 0);
  }
  payMana(ctx, payment);
  if (a.once || a.powerUp) (src.usedAbilities ??= []).push(index);
  // Marvel Super Heroes Jumpstart (Trained): Advancing the Spirit frees only the first power-up each turn.
  if (a.powerUp && player === ctx.s.turn.activePlayer) ctx.s.turn.powerUpActivated = true;
  if (a.cost.sacrificeSelf) {
    item.lkiPower = power(ctx, source);
    sacrificePermanent(ctx, source);
  }
  if (a.cost.exileSelf) moveObject(ctx, source, 'exile');
  // Strixhaven (13c): Rootha returns to hand as a cost.
  if (a.cost.returnSelf) moveObject(ctx, source, 'hand');
  ctx.s.stack.push(item);
  emit(ctx, { type: 'abilityActivated', id, source, player });
  noteTargets(ctx, player, targets, true);
  // Reality Fracture (17a fixes): Gallia, Tragic Host.
  if (chooseGraveyardCard) {
    ctx.s.decision = {
      kind: 'forageExile',
      player,
      count: 1,
      filter: a.cost.exileFromGraveyard,
      source,
      thenPriority: player,
    };
    return true;
  }
  // Reality Fracture (17a fixes): ward's sacrifices are chosen (after them, any forage).
  if (
    payWardSacrifices(ctx, player, targets, {
      thenPriority: player,
      ...(forage !== undefined ? { forage } : {}),
    })
  )
    return true;
  return forage !== undefined && payForage(ctx, player, forage, { thenPriority: player });
}

export function pushTrigger(
  ctx: Ctx,
  t: PendingTrigger,
  targets: TargetChoice[],
  mode?: number,
  /** Who gets priority afterwards (needed if ward's sacrifices must be chosen). */
  thenPriority?: PlayerId,
): boolean {
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
    ...(t.subjects ? { subjects: t.subjects } : {}),
    ...(t.amount !== undefined ? { amount: t.amount } : {}),
    ...(t.inline ? { inline: t.inline } : {}),
    ...(t.emblem ? { emblem: t.emblem } : {}),
    ...(mode !== undefined ? { mode } : {}),
  });
  emit(ctx, { type: 'triggerStacked', id, source: t.source.id, player: t.controller });
  noteTargets(ctx, t.controller, targets, true);
  // Reality Fracture (17a fixes): ward's sacrifices are chosen by the player who pays them.
  return (
    thenPriority !== undefined && payWardSacrifices(ctx, t.controller, targets, { thenPriority })
  );
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
  // Marvel Super Heroes Jumpstart (Blink): an "any number" spec covers every target from its index on.
  const last = specs[specs.length - 1];
  const specAt = (i: number) => specs[i] ?? (last?.anyNumber ? last : undefined);
  const checked = targets.map((t, i) => {
    const spec = specAt(i);
    return spec && isTargetLegal(ctx, spec, t, src) ? t : null;
  });
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
    // Lorwyn Eclipsed (18a): "if this spell's additional cost was paid" (the `wasKicked` condition) works for instants and sorceries too.
    if (item.kicked) o.kicked = true;
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
        ...(item.lkiPower !== undefined ? { lkiPower: item.lkiPower } : {}),
      };
      const paused = {
        kind: 'spell' as const,
        id: item.id,
        ...(item.flashback || d.afterResolving === 'exile' ? { exile: true } : {}),
        ...(d.afterResolving === 'libraryBottom' ? { libraryBottom: true } : {}),
        // Rebound: cast from your hand, it's exiled and cast again at your next upkeep.
        ...(d.rebound && item.fromHand && !item.flashback ? { rebound: item.controller } : {}),
        // Final Fantasy (11a): an Adventure goes on an adventure (exile) as it resolves.
        ...(o.front && defOf(ctx, o.front).adventure && !item.copy ? { adventure: true } : {}),
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
        // Strixhaven Brawl (15b, w): bestow, an illegal target means it resolves as a creature (rule 702.103e).
        if (d.bestowFront) {
          o.defId = d.bestowFront;
          delete o.front;
        } else {
          emit(ctx, { type: 'fizzled', id: item.id });
          moveObject(ctx, item.id, 'graveyard');
          return false;
        }
      } else host = target.object.id;
    }
    emit(ctx, { type: 'resolved', id: item.id });
    // Reality Fracture (17a): Uldaros Theorix: a permanent spell cast this way becomes a token.
    if (o.copyBecomesToken) {
      o.isToken = true;
      delete o.spellCopyCard;
      delete o.copyBecomesToken;
    }
    moveObject(ctx, item.id, 'battlefield', {
      controller: item.controller,
      ...(!item.fromHand && !item.copy && item.castBy ? { castFromNonHandBy: item.castBy } : {}),
    });
    // Secrets of Strixhaven (14b): Choreographed Sparks: the copy has haste and is sacrificed at the end step.
    if (item.hasteSacrifice) {
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: o.id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords: ['haste'],
        expires: 'endOfTurn',
      });
      (ctx.s.delayed ??= []).push({
        controller: item.controller,
        sourceDefId: o.defId,
        subject: { id: o.id, zcc: o.zcc },
        effects: [{ kind: 'sacrifice', what: 'subject' }],
        fromTurn: ctx.s.turn.number,
      });
    }
    if (item.kicked) o.kicked = true;
    // Lorwyn Eclipsed (18a): evoked, its sacrifice trigger is queued as it enters.
    if (item.evoked) o.evoked = true;
    // Reality Fracture (17a): Null Summoner, Uldaros Theorix: "if you cast it".
    o.wasCast = true;
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
    if (d.entersWithXCounters && item.x)
      addCounters(
        ctx,
        o.id,
        item.x * (typeof d.entersWithXCounters === 'number' ? d.entersWithXCounters : 1),
      );
    // Secrets of Strixhaven (14a): converge, "enters with a +1/+1 counter for each color of mana spent".
    if (d.entersWithCountersPerColorSpent) addCounters(ctx, o.id, o.manaColors?.length ?? 0);
    // Secrets of Strixhaven (14b): Slumbering Trudge, "enters with 3 - X stun counters; tapped if X is 2 or less".
    if (d.stunCountersMinusX) {
      const x = item.x ?? 0;
      const stun = Math.max(0, d.stunCountersMinusX - x);
      if (stun) (o.counters ??= {}).stun = (o.counters.stun ?? 0) + stun;
      if (x < d.stunCountersMinusX) o.tapped = true;
    }
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
    // Strixhaven Brawl (15b, pair): Altered Ego, X additional +1/+1 counters if it copied.
    if (item.copyOf && d.entersAsCopy?.xCounters && item.x) addCounters(ctx, o.id, item.x);
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
    ...(item.subjects ? { subjects: item.subjects } : {}),
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
export function attachAura(ctx: Ctx, aura: ObjectId, host: ObjectId): void {
  const a = obj(ctx, aura);
  a.attachedTo = host;
  const h = obj(ctx, host);
  for (const ab of def(ctx, aura).abilities) {
    if (ab.kind !== 'static') continue;
    if (ab.effect.kind === 'enchantedIsFood') h.foodBy = aura;
    // Marvel Super Heroes Jumpstart (Pym): Quantum Reduction, no window before it loses them.
    if (ab.effect.kind === 'attached' && ab.effect.loseAbilities) {
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: host, zcc: h.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        loseAbilities: true,
        expires: 'whileSource',
        whileSourceId: aura,
        player: a.controller,
      });
      h.blank = true;
    }
    // Reality Fracture (17a): Puppet Crafting, the enchanted permanent is a creature while the Aura stays.
    if (ab.effect.kind === 'attached' && ab.effect.becomesCreature) {
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: host, zcc: h.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        becomesCreature: true,
        creatureOnly: true,
        expires: 'whileSource',
        whileSourceId: aura,
        player: a.controller,
      });
    }
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
  // A copy that returned itself to hand (Unexpected Results) has already ceased to exist.
  if (!ctx.s.objects[item.id]) return;
  // Final Fantasy (11a): a spell that put itself onto the battlefield as it resolved (Esper Origins).
  if (ctx.s.objects[item.id]?.zone === 'battlefield') return;
  // Strixhaven (13c): a spell that returned itself to its owner's hand (Journey to the Oracle).
  if (ctx.s.objects[item.id]?.zone === 'hand') return;
  // Strixhaven (13c): Dragon's Approach exiled itself as it resolved.
  if (ctx.s.objects[item.id]?.zone === 'exile') return;
  // Mystical Archive (16): Blue Sun's Zenith and Approach of the Second Sun put themselves into the library.
  if (ctx.s.objects[item.id]?.zone === 'library') return;
  // Final Fantasy (11a): adventure lands. Its owner may play the land from exile later.
  if (item.adventure) {
    moveObject(ctx, item.id, 'exile');
    const o = ctx.s.objects[item.id];
    if (o?.zone === 'exile') o.onAdventure = true;
    return;
  }
  // Secrets of Strixhaven (14a): paradigm. The card is exiled; a copy is cast at each of your first main phases.
  const resolved = ctx.s.objects[item.id];
  if (
    resolved &&
    !resolved.isToken &&
    !resolved.spellCopyCard &&
    defOf(ctx, resolved.defId).paradigm
  ) {
    const ps = (ctx.s.players[resolved.controller].paradigms ??= []);
    if (!ps.includes(resolved.defId)) ps.push(resolved.defId);
    return moveObject(ctx, item.id, 'exile');
  }
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
export function escalateCrew(
  ctx: Ctx,
  player: PlayerId,
  n: number,
  filter?: CardFilter,
): ObjectId[] | null {
  const ready = ctx.s.battlefield
    .filter(
      (id) =>
        obj(ctx, id).controller === player &&
        !obj(ctx, id).tapped &&
        isCreature(ctx, id) &&
        (!filter || matchesFilter(ctx, id, filter)),
    )
    .sort((a, b) => power(ctx, a) - power(ctx, b));
  return ready.length >= n ? ready.slice(0, n) : null;
}

/** Metalwork Colossus: the N least useful artifacts `player` controls (tokens, then the cheapest), or null. */
export function artifactsToSacrifice(
  ctx: Ctx,
  player: PlayerId,
  n: number,
  filter?: CardFilter,
): ObjectId[] | null {
  const artifacts = ctx.s.battlefield
    .filter(
      (id) =>
        obj(ctx, id).controller === player &&
        def(ctx, id).types.includes('Artifact') &&
        // Strixhaven Brawl (15b, r): Magda, Brazen Outlaw: five Treasures.
        (!filter || matchesFilter(ctx, id, filter)),
    )
    .sort(
      (a, b) =>
        Number(obj(ctx, b).isToken) - Number(obj(ctx, a).isToken) ||
        manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
    );
  return artifacts.length >= n ? artifacts.slice(0, n) : null;
}

/**
 * Strixhaven (13a): the card a "exile a card from your graveyard" cost takes
 * (Stonerise Spirit, Tome Shredder): the engine picks the least useful match,
 * lands first and cards you may want to return (instants, sorceries, Spirits,
 * cheap creatures) last. Null if there is none.
 */
export function graveyardCostCard(
  ctx: Ctx,
  player: PlayerId,
  filter: CardFilter,
  source: ObjectId,
): ObjectId | null {
  return graveyardCostOptions(ctx, player, filter, source)[0] ?? null;
}

/** Reality Fracture (17a fixes): every card a graveyard cost could exile, least useful first. */
export function graveyardCostOptions(
  ctx: Ctx,
  player: PlayerId,
  filter: CardFilter,
  source: ObjectId,
): ObjectId[] {
  const keep = (id: ObjectId) => {
    const d = def(ctx, id);
    if (d.types.includes('Land')) return 0;
    if (d.types.includes('Instant') || d.types.includes('Sorcery') || d.subtypes.includes('Spirit'))
      return 3;
    return d.types.includes('Creature') && manaValue(d.manaCost) <= 3 ? 2 : 1;
  };
  return ctx.s.players[player].graveyard
    .filter((id) => id !== source && matchesFilter(ctx, id, filter, source))
    .sort(
      (a, b) =>
        keep(a) - keep(b) || manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
    );
}

// Marvel Super Heroes Jumpstart (Masters of Evil)
/**
 * Untapped creatures you control matching the filter, weakest first ("Tap an untapped Villain you
 * control"); with `other`, not the source (Secrets of Strixhaven (14b): Harmonized Trio).
 */
export function creaturesToTap(
  ctx: Ctx,
  player: PlayerId,
  filter: CardFilter | undefined,
  source?: ObjectId,
  other = false,
): ObjectId[] {
  return ctx.s.battlefield
    .filter((id) => {
      const o = obj(ctx, id);
      return (
        !(other && id === source) &&
        o.controller === player &&
        !o.tapped &&
        isCreature(ctx, id) &&
        (!filter || matchesFilter(ctx, id, filter, source))
      );
    })
    .sort((x, y) => power(ctx, x) - power(ctx, y));
}

/** Reality Fracture (17a): Tenured Tethermage. The untapped artifacts `player` controls. */
export function artifactsToTap(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    return (
      o.controller === player && !o.tapped && characteristics(ctx, id).types.includes('Artifact')
    );
  });
}

/** Lorwyn Eclipsed (18b, multi-b): the untapped creatures `player` controls that match the filter (the source may be one). */
export function untappedMatching(
  ctx: Ctx,
  player: PlayerId,
  filter: CardFilter,
  source?: ObjectId,
): ObjectId[] {
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    return (
      o.controller === player &&
      !o.tapped &&
      isCreature(ctx, id) &&
      matchesFilter(ctx, id, filter, source)
    );
  });
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
      // Reality Fracture (17a): Null Summoner, "as long as there are seven or more cards in your graveyard".
      if (d.castableIf) obj(ctx, card).castableIf = d.castableIf;
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
  // Strixhaven (13c): Archway Commons, Wandering Archaic: something else happens unless they pay.
  else if (d.otherwise) return continueWith(ctx, d.resume, d.otherwise, d.thenPriority);
  else if (d.spell) counterSpell(ctx, d.spell, d.exile);
  resume(ctx, d.resume, d.thenPriority);
}

/**
 * A 'castFree' decision answered: the card was cast (or not). Portent's other
 * cards go to hand; then the paused resolution carries on.
 */
export function finishCastFree(ctx: Ctx, cast: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'castFree') throw new Error('Not casting for free');
  // Secrets of Strixhaven (14b): Improvisation Capstone: any number may be cast, one after another.
  if (d.more && cast !== null) {
    // Reality Fracture (17a): Uldaros Theorix: only cards that still fit in the total mana value.
    const budget =
      d.budget !== undefined ? d.budget - manaValue(def(ctx, cast).manaCost) : undefined;
    const cards = d.cards.filter(
      (id) =>
        id !== cast &&
        ctx.s.objects[id]?.zone === 'exile' &&
        (budget === undefined || manaValue(def(ctx, id).manaCost) <= budget),
    );
    if (cards.length > 0) {
      ctx.s.decision = { ...d, cards, ...(budget !== undefined ? { budget } : {}) };
      return;
    }
  }
  // Reality Fracture (17a): copies that weren't cast cease to exist.
  for (const id of d.copies ?? []) if (id !== cast) ceaseSpellCopy(ctx, id);
  for (const id of d.thenToHand ?? [])
    if (id !== cast && ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
  for (const id of d.thenToBottom ?? [])
    if (id !== cast && ctx.s.objects[id]?.zone === 'exile')
      moveObject(ctx, id, 'library', { position: 'bottom' });
  // Reality Fracture (17c): Chandra, Torch of Defiance: "if you don't".
  if (cast === null && d.ifNotCast?.length)
    return continueWith(ctx, d.resume, d.ifNotCast, d.thenPriority);
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
  if (
    d.castingSpell &&
    finishCasting(
      ctx,
      d.player,
      d.castingSpell.card,
      d.castingSpell.targets,
      d.castingSpell.sacrificed,
    )
  )
    return;
  if (d.resume) continueWith(ctx, d.resume, d.then ?? [], d.thenPriority);
  // Reality Fracture (17a fixes): the forage of a free cast: that cast goes on.
  else if (d.afterFree) {
    ctx.s.decision = d.afterFree.decision;
    finishCastFree(ctx, d.afterFree.cast);
  } else givePriority(ctx, d.thenPriority);
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
    // Reality Fracture (17a): Enlightened Confidant: a card with low enough mana value goes to your hand.
    // Reality Fracture (17c): Chandra, Chill of Compliance: or one matching a filter.
    if (d.toHandMaxMv !== undefined || d.toHandFilter)
      for (const id of bottom)
        if (
          ctx.s.objects[id]?.zone === 'graveyard' &&
          (d.toHandMaxMv === undefined || manaValue(def(ctx, id).manaCost) <= d.toHandMaxMv) &&
          (!d.toHandFilter || cardMatches(ctx, id, d.toHandFilter))
        )
          moveObject(ctx, id, 'hand');
  } else lib.push(...bottom);
  // Reality Fracture (17a): Surveillance Phantasm, "as long as you've scried or surveilled this turn".
  const seen = (ctx.s.turn.scriedOrSurveilled ??= []);
  if (!seen.includes(d.player)) seen.push(d.player);
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
  // Strixhaven (13c): Deadly Brew: "if you sacrificed a permanent this way".
  if (d.then) {
    const left = ctx.s.objects[card];
    const chosen = left && left.zone === 'graveyard' ? { id: card, zcc: left.zcc } : undefined;
    return continueWith(
      ctx,
      { ...d.resume, ...(chosen ? { chosen } : {}) },
      d.then,
      d.thenPriority,
    );
  }
  resume(ctx, d.resume, d.thenPriority);
}

/**
 * Strixhaven (13c): Emergent Sequence. The land becomes a 0/0 Fractal creature
 * (it stays a land) with a +1/+1 counter for each land that entered under
 * its controller's control this turn. Colours (green and blue) are not tracked.
 */
function makeFractalLand(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  ctx.s.effects.push({
    timestamp: newTimestamp(ctx),
    affected: { id, zcc: o.zcc },
    power: 0,
    toughness: 0,
    keywords: [],
    becomesCreature: true,
    basePT: [0, 0],
    expires: 'permanent',
  });
  o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Fractal'];
  const lands = ctx.s.battlefield.filter(
    (x) =>
      obj(ctx, x).controller === o.controller &&
      def(ctx, x).types.includes('Land') &&
      obj(ctx, x).zoneTurn === ctx.s.turn.number,
  ).length;
  addCounters(ctx, id, lands);
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
      // Secrets of Strixhaven (14b): Wildgrowth Archaic: creature spells you cast enter with a counter per colour spent.
      if (
        a.kind === 'static' &&
        a.effect.kind === 'entersWithColorsSpentCounters' &&
        defOf(ctx, obj(ctx, entering).defId).types.includes('Creature')
      )
        n += obj(ctx, entering).manaColors?.length ?? 0;
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
  // Strixhaven Brawl (15b, multi): Gorma, the Gullet: nontoken creatures you control enter with an
  // additional +1/+1 counter for each creature that died under your control this turn (once per Gorma).
  const eo = obj(ctx, entering);
  const died = ctx.s.turn.creaturesLost?.[player] ?? 0;
  if (died > 0 && !eo.isToken && defOf(ctx, eo.defId).types.includes('Creature'))
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player) continue;
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'nontokenEnterWithDiedCounters') n += died;
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
    // Strixhaven (13c): Ardent Dustspeaker puts a graveyard card on the bottom of the library.
    if (d.fromGraveyard && d.to === 'libraryBottom') {
      moveObject(ctx, card, 'library', { position: 'bottom' });
      return continueWith(ctx, d.resume, d.onPick ?? [], d.thenPriority);
    }
    if (d.fromGraveyard) {
      if (d.to === 'battlefield' || d.to === 'battlefieldTapped') {
        // Final Fantasy (11c): onto the battlefield attacking (checked as the card, before it enters).
        const attacking = !!d.attackingIf && cardMatches(ctx, card, d.attackingIf);
        moveObject(ctx, card, 'battlefield', { controller: d.player });
        // Strixhaven (13a): Zimone puts a land onto the battlefield tapped.
        if (d.to === 'battlefieldTapped') obj(ctx, card).tapped = true;
        if (d.counter) (obj(ctx, card).counters ??= {})[d.counter] = 1;
        // Final Fantasy (11c): The Darkness Crystal.
        if (d.enterTapped) obj(ctx, card).tapped = true;
        if (d.enterCounters) addCounters(ctx, card, d.enterCounters);
        if (attacking && ctx.s.combat && obj(ctx, card).zone === 'battlefield') {
          obj(ctx, card).tapped = true;
          ctx.s.combat.attackers.push({
            id: card,
            defender: other(d.player),
            blocked: false,
            blockers: [],
          });
        }
        // Marvel Super Heroes (Nick Fury, Spymaster): "it" for the effects after it ('chosen').
        const put = obj(ctx, card);
        if (put.zone === 'battlefield') d.resume.chosen = { id: put.id, zcc: put.zcc };
      } else moveObject(ctx, card, 'hand');
      squirrelFood(ctx, d, card);
      return resume(ctx, d.resume, d.thenPriority);
    }
    // Reality Fracture (17a fixes): Loyal Tutor, "reveal it": shown to everyone.
    if (d.reveal)
      emit(ctx, {
        type: 'cardsRevealed',
        player: d.player,
        cards: [{ id: card, defId: obj(ctx, card).defId }],
      });
    const onBattlefield =
      d.to === 'battlefield' ||
      d.to === 'battlefieldTapped' ||
      // Secrets of Strixhaven (14b): Zimone's Experiment: lands go onto the battlefield tapped.
      (d.landsTapped && def(ctx, card).types.includes('Land')) ||
      (d.battlefieldOnYourTurn && ctx.s.turn.activePlayer === d.player) ||
      // Lorwyn Eclipsed (18a): Celestial Reunion, a card of the chosen creature type.
      (d.battlefieldIfType !== undefined && hasSubtype(ctx, card, d.battlefieldIfType));
    if (d.to === 'hideaway') {
      // Final Fantasy (11c): hideaway. Exiled face down, remembered by the land.
      moveObject(ctx, card, 'exile');
      const land = d.resume.source && ctx.s.objects[d.resume.source.id];
      if (land && land.zone === 'battlefield') land.exiledWith = [card];
    } else if (d.to === 'graveyard') moveObject(ctx, card, 'graveyard');
    else if (d.to === 'castFree') moveObject(ctx, card, 'exile');
    else if (d.to === 'libraryTop') {
      // Fountainport Bell: shuffle, then put it on top (done after the shuffle below).
    } else if (onBattlefield) {
      // Strixhaven (13c): Verdant Mastery: it enters under an opponent's control.
      moveObject(ctx, card, 'battlefield', {
        controller: d.forOpponent ? other(d.player) : d.player,
      });
      if (d.to === 'battlefieldTapped' || d.landsTapped) obj(ctx, card).tapped = true;
      // Strixhaven (13c): Emergent Sequence.
      if (d.fractalLand) makeFractalLand(ctx, card);
      // Fabled Passage: untap it if you control enough lands.
      if (
        d.untapIfLands &&
        ctx.s.battlefield.filter(
          (id) => obj(ctx, id).controller === d.player && def(ctx, id).types.includes('Land'),
        ).length >= d.untapIfLands
      )
        obj(ctx, card).tapped = false;
    } else moveObject(ctx, card, 'hand');
    if (d.to !== 'hideaway') emit(ctx, { type: 'searched', player: d.player, id: card });
    // Reality Fracture (17a): Fblthp, Hexhaven Invigorator: "up to N cards", one more pick while some are left.
    if (d.remaining !== undefined && d.remaining > 1) {
      const options = d.options.filter(
        (id) =>
          id !== card &&
          ctx.s.objects[id]?.zone === 'library' &&
          !(d.differentNames && obj(ctx, id).defId === obj(ctx, card).defId),
      );
      if (options.length > 0) {
        d.options = options;
        d.remaining--;
        return;
      }
    }
    // Strixhaven (13c): Oriq Loremage: a +1/+1 counter if it's an instant or sorcery card.
    if (d.sourceCounterIfTypes && d.resume.source) {
      const src = ctx.s.objects[d.resume.source.id];
      if (
        src &&
        src.zone === 'battlefield' &&
        src.zcc === d.resume.source.zcc &&
        d.sourceCounterIfTypes.some((t) => def(ctx, card).types.includes(t))
      )
        addCounters(ctx, src.id, 1);
    }
  }
  if (d.fromGraveyard) {
    squirrelFood(ctx, d, null);
    return resume(ctx, d.resume, d.thenPriority);
  }
  // Strixhaven (13c): Explore the Vastlands: now choose from what's left of the cards looked at.
  if (d.followUp && d.looked && !(d.landsTapped && card === null)) {
    const left = d.looked.filter((id) => id !== card && ctx.s.objects[id]?.zone === 'library');
    const options = left.filter((id) => cardMatches(ctx, id, d.followUp!));
    if (options.length > 0) {
      ctx.s.decision = {
        kind: 'searchLibrary',
        player: d.player,
        options,
        looked: left,
        ...(d.landsTapped ? { landsTapped: true } : {}),
        resume: d.resume,
        thenPriority: d.thenPriority,
      };
      return;
    }
    sendToBottomRandom(ctx, d.player, left);
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
  // Strixhaven (13c): Kasmina's ultimate: exile it, then you may cast it without paying its mana cost.
  if (card !== null && d.to === 'castFree') {
    ctx.s.decision = {
      kind: 'castFree',
      player: d.player,
      cards: [card],
      resume: d.resume,
      thenPriority: d.thenPriority,
    };
    return;
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
  plusFoodTokens(ctx, d.player); // Tippy-Toe
}

/** Discard from an effect: one card at a time, then resolution continues. */
export function answerDiscard(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'discard') throw new Error('Not discarding');
  const nonland = !def(ctx, card).types.includes('Land');
  moveObject(ctx, card, d.exile ? 'exile' : 'graveyard');
  // Strixhaven (13c): Flamethrower Sonata.
  const dealt = d.damageTo !== undefined ? d.resume.targets[d.damageTo] : undefined;
  if (
    dealt &&
    (def(ctx, card).types.includes('Instant') || def(ctx, card).types.includes('Sorcery'))
  )
    dealDamage(
      ctx,
      damageSourceFor(ctx, d.resume.source?.id ?? 'unknown', d.player),
      dealt,
      manaValue(def(ctx, card).manaCost),
      false,
    );
  d.count--;
  if (nonland) d.nonlandDiscarded = (d.nonlandDiscarded ?? 0) + 1;
  const c = d.connive && ctx.s.objects[d.connive.id];
  if (c && nonland && c.zone === 'battlefield' && c.zcc === d.connive!.zcc)
    addCounters(ctx, c.id, 1);
  // "Whenever a creature you control connives" (Glorious Purpose, Iron Monger, Ultron).
  if (c && c.zone === 'battlefield' && c.zcc === d.connive!.zcc)
    emit(ctx, { type: 'connived', id: c.id, player: c.controller });
  const left = ctx.s.players[d.player].hand.filter(
    (id) => !d.filter || cardMatches(ctx, id, d.filter),
  );
  // Strixhaven (13c): "discard any number of cards, then draw that many".
  if (d.anyNumber) {
    d.anyNumber.discarded++;
    if (left.length === 0 || d.anyNumber.discarded === d.anyNumber.max) finishDiscardAny(ctx);
    return;
  }
  if (d.count === 0 || left.length === 0) {
    // Reality Fracture (17c): Garruk, Veiled Butcher: "you draw a card" unless they discarded enough nonland cards.
    if (d.drawUnlessNonland !== undefined && (d.nonlandDiscarded ?? 0) < d.drawUnlessNonland)
      drawCard(ctx, d.resume.controller);
    // Reality Fracture (17a): Seasoned Cryomancer: "when you discard one or more nonland cards this way".
    if (d.reflexiveOnNonland !== undefined && d.nonlandDiscarded && d.resume.source)
      ctx.s.pendingTriggers.push({
        source: d.resume.source,
        sourceDefId: d.resume.sourceDefId,
        abilityIndex: d.reflexiveOnNonland,
        controller: d.resume.controller,
        amount: d.nonlandDiscarded,
      });
    // Strixhaven Brawl (15a): Seasoned Pyromancer: draw, then a token for each nonland card.
    if (d.drawAfter) {
      const after: EffectDef[] = [{ kind: 'draw', who: 'controller', amount: d.drawAfter }];
      if (d.tokenPerNonland && d.nonlandDiscarded)
        after.push({ kind: 'createToken', token: d.tokenPerNonland, count: d.nonlandDiscarded });
      continueWith(ctx, d.resume, after, d.thenPriority);
    } else if (d.then) {
      // Reality Fracture (17a): "If you do" (Tether Technician, Improvised Act).
      continueWith(ctx, d.resume, d.then, d.thenPriority);
    } else resume(ctx, d.resume, d.thenPriority);
  }
}

/** Strixhaven (13c): Illuminate History: the player stopped discarding; they draw that many. */
export function finishDiscardAny(ctx: Ctx): void {
  const d = ctx.s.decision;
  if (d.kind !== 'discard' || !d.anyNumber) throw new Error('Not discarding any number');
  for (let i = 0; i < d.anyNumber.discarded + (d.anyNumber.plus ?? 0); i++) drawCard(ctx, d.player);
  resume(ctx, d.resume, d.thenPriority);
}

/** Strixhaven (13c): The Biblioplex: the card looked at goes into the graveyard instead. */
export function binLookedCard(ctx: Ctx): void {
  const d = ctx.s.decision;
  if (d.kind !== 'searchLibrary' || !d.canBin) throw new Error('Not looking at a card');
  const top = d.looked?.[0];
  if (top && ctx.s.objects[top]?.zone === 'library') moveObject(ctx, top, 'graveyard');
  resume(ctx, d.resume, d.thenPriority);
}

/** Stargaze: one chosen card into your hand; once all are chosen, the rest go to the graveyard. */
export function answerPickCards(ctx: Ctx, card: ObjectId | null): void {
  const d = ctx.s.decision;
  if (d.kind !== 'pickCards') throw new Error('Not picking cards');
  if (card !== null) {
    moveObject(ctx, card, 'hand');
    // Strixhaven (13c): Search for Blex.
    if (d.lifePerCard) changeLife(ctx, d.player, -d.lifePerCard);
    d.options = d.options.filter((id) => id !== card);
    d.count--;
    if (d.count > 0 && d.options.length > 0) return;
  }
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
