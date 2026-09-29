import { power } from './characteristics.ts';
import { type Ctx, def, defOf, emit, moveObject, newId, obj, other, tap } from './context.ts';
import { type EffectSource, runEffects } from './effects.ts';
import { characteristics, countOf, hasKeyword } from './characteristics.ts';
import { changeLife, gainLife } from './effects.ts';
import { anyTypeCost, manaValue, payMana, planPayment } from './mana.ts';
import { shuffleInPlace } from './rng.ts';
import { shuffleLibrary } from './setup.ts';
import { addCosts, spellOnStack, variantOf } from './spells.ts';
import { isTargetLegal } from './targets.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';
import { givePriority } from './turn.ts';
import type {
  AbilityDef,
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
}

/** Ward {2}: an opponent targeting it pays {2} more (we charge it up front). */
function wardedTargets(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]) {
  return targets.flatMap((t) => {
    if (!('object' in t)) return [];
    const o = ctx.s.objects[t.object.id];
    return o && o.zone === 'battlefield' && o.controller !== player && hasKeyword(ctx, o.id, 'ward')
      ? [def(ctx, o.id)]
      : [];
  });
}

export function wardCost(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): ManaCost {
  let cost: ManaCost = { generic: 0, colored: {} };
  for (const d of wardedTargets(ctx, player, targets))
    cost = addCosts(cost, d.wardCost?.mana ?? { generic: 2, colored: {} });
  return cost;
}

/** Life an opponent pays for ward (Ovika: 3). */
export function wardLife(ctx: Ctx, player: PlayerId, targets: readonly TargetChoice[]): number {
  return wardedTargets(ctx, player, targets).reduce((n, d) => n + (d.wardCost?.life ?? 0), 0);
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
export function castCost(ctx: Ctx, player: PlayerId, card: ObjectId, choice: CastChoice): ManaCost {
  const o = obj(ctx, card);
  const d = defOf(ctx, o.defId);
  const v = variantOf(d, o.zone, choice);
  if (!v) throw new Error(`${o.defId} can't be cast that way`);
  let cost = v.cost;
  let reduce = d.costReduction !== undefined ? amountFor(ctx, player, d.costReduction) : 0;
  // Archmage of Runes: instants and sorceries cost less.
  if (d.types.includes('Instant') || d.types.includes('Sorcery'))
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player) continue;
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'instantsAndSorceriesCostLess')
          reduce += a.effect.amount;
    }
  if (reduce) cost = { ...cost, generic: Math.max(0, cost.generic - reduce) };
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
): void {
  const o = obj(ctx, card);
  const d = defOf(ctx, o.defId);
  const v = variantOf(d, o.zone, choice)!;
  const flashback = o.zone === 'graveyard' && !!d.flashback;
  // Rule 601.2: move to stack, choose targets, then pay costs.
  const cost = addCosts(castCost(ctx, player, card, choice), wardCost(ctx, player, targets));
  const payment = planPayment(ctx, player, cost, payWith, undefined, d.subtypes);
  moveObject(ctx, card, 'stack', { controller: player });
  if (choice.sacrifice) moveObject(ctx, choice.sacrifice, 'graveyard');
  if (v.removeCounters) removeCounters(ctx, player, v.removeCounters);
  changeLife(ctx, player, -wardLife(ctx, player, targets));
  ctx.s.stack.push({
    kind: 'spell',
    id: card,
    controller: player,
    targets,
    ...(choice.mode !== undefined ? { mode: choice.mode } : {}),
    ...(choice.kicked ? { kicked: true } : {}),
    ...(flashback ? { flashback: true } : {}),
  });
  payMana(ctx, payment);
  emit(ctx, { type: 'spellCast', id: card, player });
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

export function activatedAbility(ctx: Ctx, source: ObjectId, index: number) {
  const a = defOf(ctx, obj(ctx, source).defId).abilities[index];
  if (!a || a.kind !== 'activated') throw new Error(`No activated ability ${source}#${index}`);
  return a;
}

export function activateAbility(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  index: number,
  targets: TargetChoice[],
  payWith?: ObjectId[],
  sacrifice?: ObjectId,
): void {
  const a = activatedAbility(ctx, source, index);
  const src = obj(ctx, source);
  const sourceRef = { id: source, zcc: src.zcc };
  const payment = planPayment(
    ctx,
    player,
    addCosts(a.cost.mana ?? { generic: 0, colored: {} }, wardCost(ctx, player, targets)),
    payWith,
    a.cost.tapSelf ? source : undefined,
  );
  if (sacrifice) moveObject(ctx, sacrifice, 'graveyard');
  changeLife(ctx, player, -wardLife(ctx, player, targets));
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
  };
  if (a.cost.tapSelf) tap(ctx, source);
  payMana(ctx, payment);
  if (a.once) (src.usedAbilities ??= []).push(index);
  if (a.cost.sacrificeSelf) {
    item.lkiPower = power(ctx, source);
    moveObject(ctx, source, 'graveyard');
  }
  ctx.s.stack.push(item);
  emit(ctx, { type: 'abilityActivated', id, source, player });
}

export function pushTrigger(
  ctx: Ctx,
  t: PendingTrigger,
  targets: TargetChoice[],
  mode?: number,
): void {
  // "You may pay ..." and ward: paid as it goes on the stack.
  const cost = addCosts(
    triggeredAbility(ctx, t).cost ?? { generic: 0, colored: {} },
    wardCost(ctx, t.controller, targets),
  );
  if (manaValue(cost) > 0) payMana(ctx, planPayment(ctx, t.controller, cost, undefined));
  changeLife(ctx, t.controller, -wardLife(ctx, t.controller, targets));
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
    ...(mode !== undefined ? { mode } : {}),
  });
  emit(ctx, { type: 'triggerStacked', id, source: t.source.id, player: t.controller });
}

function abilityOf(
  ctx: Ctx,
  item: Extract<StackItem, { kind: 'ability' }>,
): Exclude<AbilityDef, { kind: 'mana' | 'static' }> {
  if (item.inline) return triggeredAbility(ctx, item);
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
      };
      const paused = {
        kind: 'spell' as const,
        id: item.id,
        ...(item.flashback ? { exile: true } : {}),
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
    if (d.entersWithCounters && checkCondition(ctx, d.entersWithCountersIf, item.controller, o))
      o.plusOneCounters += d.entersWithCounters;
    if (host) o.attachedTo = host;
    o.plusOneCounters += bonusCounters(ctx, item.controller, o.id, d.subtypes);
    if (item.kicked) o.kicked = true;
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
    ...(item.subject ? { subject: item.subject } : {}),
    ...(item.amount !== undefined ? { amount: item.amount } : {}),
  };
  if (runEffects(ctx, es, a.effects as EffectDef[], { kind: 'ability', id: item.id })) return true;
  finishResolution(ctx, { kind: 'ability', id: item.id });
  return false;
}

/** Last step of resolving (rule 608.2n): an instant or sorcery goes to the graveyard. */
export function finishResolution(ctx: Ctx, item: PausedResolution['item']): void {
  emit(ctx, { type: 'resolved', id: item.id });
  if (item.kind === 'spell') moveObject(ctx, item.id, item.exile ? 'exile' : 'graveyard');
}

/** Carries on with a resolution that paused to ask a question. */
function resume(ctx: Ctx, r: PausedResolution, thenPriority: PlayerId): void {
  if (runEffects(ctx, r, r.effects, r.item)) return;
  finishResolution(ctx, r.item);
  givePriority(ctx, thenPriority);
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
  else moveObject(ctx, card, 'graveyard');
  resume(ctx, d.resume, d.thenPriority);
}

/** Strongbox Raider: the chosen exiled card is playable until the end of your next turn. */
export function answerPickExiled(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'pickExiled') throw new Error('Not choosing');
  const ownTurn = ctx.s.turn.activePlayer === d.player;
  obj(ctx, card).playableUntilTurn = ctx.s.turn.number + (ownTurn ? 2 : 1);
  resume(ctx, d.resume, d.thenPriority);
}

/** A player chose the creature to sacrifice (Tribute to Hunger). */
export function answerSacrifice(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'sacrifice') throw new Error('Not sacrificing');
  const t = Math.max(0, characteristics(ctx, card).toughness);
  moveObject(ctx, card, 'graveyard');
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
      moveObject(ctx, card, 'hand');
      return resume(ctx, d.resume, d.thenPriority);
    }
    if (!d.to || d.to === 'hand') moveObject(ctx, card, 'hand');
    else {
      moveObject(ctx, card, 'battlefield', { controller: d.player });
      if (d.to === 'battlefieldTapped') obj(ctx, card).tapped = true;
    }
    emit(ctx, { type: 'searched', player: d.player, id: card });
  }
  const lib = ctx.s.players[d.player].library;
  if (d.looked) {
    const rest = d.looked.filter((id) => id !== card);
    for (const id of rest) lib.splice(lib.indexOf(id), 1);
    shuffleInPlace(ctx.s.rng, rest);
    lib.push(...rest);
  } else if (d.shuffle !== false) shuffleLibrary(ctx, d.player);
  resume(ctx, d.resume, d.thenPriority);
}

/** Discard from an effect: one card at a time, then resolution continues. */
export function answerDiscard(ctx: Ctx, card: ObjectId): void {
  const d = ctx.s.decision;
  if (d.kind !== 'discard') throw new Error('Not discarding');
  moveObject(ctx, card, 'graveyard');
  d.count--;
  if (d.count === 0 || ctx.s.players[d.player].hand.length === 0)
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
