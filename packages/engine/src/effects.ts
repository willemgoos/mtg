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
  ceaseSpellCopy,
  createObject,
  def,
  defOf,
  drawCard,
  emit,
  moveObject,
  newId,
  newTimestamp,
  obj,
  onBattlefield,
  other,
  addCounters,
  sacrifice,
  tap,
  transform,
  untap,
  prepareObject,
  unprepareObject,
} from './context.ts';
import { CREATURE_TYPES } from './creature-types.ts';
import { setMonarch } from './monarch.ts';
import { spellOnStack } from './spells.ts';
import { isTargetLegal, targetCandidates, targetCombos } from './targets.ts';
import { phaseOut } from './phasing.ts';
import { foodsOf } from './forage.ts';
import { canPayFrom, manaSources, manaValue } from './mana.ts';
import { nextInt, shuffleInPlace } from './rng.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';
import { addLore } from './sagas.ts';
import { CHOOSERS } from './stx-13c-a-effects.ts';
import { planeswalkersSurvive, tokenMultiplier } from './brawl-15a-w-effects.ts';
import { protectedFrom } from './brawl-15b-w-effects.ts';
import { SOS_14B_C_CHOOSERS } from './sos-14b-c-effects.ts';
import type {
  AbilityDef,
  CardDefId,
  CardFilter,
  GameObject,
  ObjectRef,
  Amount,
  EffectSource,
  PausedResolution,
  EffectDef,
  Keyword,
  ObjectId,
  PlayerId,
  Ref,
  StackItem,
  TargetChoice,
  TargetSpec,
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
  to = redirected(ctx, to);
  amount += damageBonus(ctx, src, to, combat);
  // Marvel Super Heroes (Mjölnir): "Double all damage equipped creature would deal."
  if (
    ctx.s.battlefield.some(
      (id) =>
        obj(ctx, id).attachedTo === src.id &&
        def(ctx, id).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'attached' && a.effect.doubleDamage,
        ),
    )
  )
    amount *= 2;
  // Final Fantasy (11b): Diamond Weapon: "Prevent all combat damage that would be dealt to it."
  if (
    combat &&
    'object' in to &&
    hasStaticKind(ctx, to.object.id, 'preventCombatDamageToSelf') &&
    !ctx.s.battlefield.some((id) => hasStaticKind(ctx, id, 'damageCantBePrevented'))
  )
    return;
  // Final Fantasy (11c): damage doubling (Trance Kuja's Wizards, Lightning's Stagger).
  amount *= doubling(ctx, src, to);
  amount = prevented(ctx, src, to, amount);
  if (amount <= 0) return;
  // Reality Fracture (17a): Ruric Thar, "as long as they haven't dealt combat damage yet".
  if (combat && ctx.s.objects[src.id]?.zone === 'battlefield')
    ctx.s.objects[src.id]!.dealtCombatDamage = true;
  // The monarch: combat damage to them makes the attacker's controller the monarch.
  if (combat && 'player' in to && ctx.s.monarch === to.player && src.controller !== to.player)
    setMonarch(ctx, src.controller);
  if ('player' in to) {
    // Reality Fracture (17a): Grim Repriser, Command the Stage, Master of Barbs: "dealt noncombat damage this turn".
    if (!combat && !ctx.s.turn.noncombatDamaged?.includes(to.player))
      ctx.s.turn.noncombatDamaged = [...(ctx.s.turn.noncombatDamaged ?? []), to.player];
    emit(ctx, { type: 'damageDealt', source: src.id, to, amount, combat });
    changeLife(ctx, to.player, -amount);
  } else {
    const o = onBattlefield(ctx, to.object);
    if (!o) return;
    // Damage to a planeswalker removes loyalty counters.
    if (def(ctx, o.id).types.includes('Planeswalker')) {
      const c = (o.counters ??= {});
      // Strixhaven Brawl (15a): Deification leaves one loyalty counter.
      const left = (c.loyalty ?? 0) - amount;
      c.loyalty =
        left < 1 && (c.loyalty ?? 0) >= 1 && planeswalkersSurvive(ctx, o.controller) ? 1 : left;
      emit(ctx, { type: 'damageDealt', source: src.id, to, amount, combat });
      if (has(src, 'lifelink')) gainLife(ctx, src.controller, amount);
      return;
    }
    // Wolverine: "that damage is dealt, but all other damage already dealt to him is healed".
    o.damage = hasStaticKind(ctx, o.id, 'damageDoesntAccumulate') ? amount : o.damage + amount;
    if (has(src, 'deathtouch')) o.damagedByDeathtouch = true;
    // Hawkeye: "if Hawkeye dealt damage to it this turn".
    if (!o.damagedBy?.includes(src.id)) o.damagedBy = [...(o.damagedBy ?? []), src.id];
    emit(ctx, { type: 'damageDealt', source: src.id, to, amount, combat });
  }
  if (has(src, 'lifelink')) gainLife(ctx, src.controller, amount);
}

/**
 * Heroic Sacrifice: damage that would be dealt to a player or a creature they
 * control is dealt to the chosen creature instead, while it's on the battlefield.
 */
function redirected(ctx: Ctx, to: TargetChoice): TargetChoice {
  const owner = 'player' in to ? to.player : (onBattlefield(ctx, to.object)?.controller ?? null);
  if (!owner) return to;
  for (const e of ctx.s.effects) {
    if (e.redirectFor !== owner) continue;
    const host = onBattlefield(ctx, e.affected);
    if (!host || ('object' in to && to.object.id === host.id)) continue;
    return { object: { id: host.id, zcc: host.zcc } };
  }
  // Final Fantasy (11c): damage absorbing. Ancient Adamantoise takes it for you and your other permanents.
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== owner || ('object' in to && to.object.id === id)) continue;
    if (
      hasStaticKind(ctx, id, 'absorbDamage') &&
      characteristics(ctx, id).types.includes('Creature')
    )
      return { object: { id, zcc: obj(ctx, id).zcc } };
  }
  return to;
}

/** Final Fantasy (11c): damage doubling. The factor damage is multiplied by. */
function doubling(ctx: Ctx, src: DamageSource, to: TargetChoice): number {
  let factor = 1;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== src.controller || !ctx.s.objects[src.id]) continue;
    for (const a of def(ctx, id).abilities)
      if (
        a.kind === 'static' &&
        a.effect.kind === 'doubleDamage' &&
        cardMatches(ctx, src.id, a.effect.source)
      )
        factor *= 2;
  }
  const hit = 'player' in to ? to.player : onBattlefield(ctx, to.object)?.controller;
  for (const x of ctx.s.staggered ?? []) if (x.player === hit) factor *= 2;
  return factor;
}

/**
 * Prevention (Wakanda Forever): Heart-Shaped Herb prevents 1 of each opponent's
 * damage to you; Panther Habit turns damage to its creature into counters.
 * Returns what's left.
 */
function prevented(ctx: Ctx, src: DamageSource, to: TargetChoice, amount: number): number {
  // Marvel Super Heroes: a shield counter is removed instead (even if damage can't be prevented).
  if ('object' in to && useShield(ctx, to.object.id)) return 0;
  if (ctx.s.battlefield.some((id) => hasStaticKind(ctx, id, 'damageCantBePrevented')))
    return amount;
  // Marvel Super Heroes Jumpstart (Squadron): Hyperion prevents all but 1 of damage to you and your Heroes.
  if (amount > 1 && allButOne(ctx, to)) amount = 1;
  if ('player' in to) {
    if (src.controller === to.player) return amount;
    // Mystical Archive (16): Deflecting Palm, the next damage to you this turn is prevented and dealt to its source's controller.
    if (ctx.s.turn.deflect?.includes(to.player)) {
      const i = ctx.s.turn.deflect.indexOf(to.player);
      ctx.s.turn.deflect = ctx.s.turn.deflect.filter((_, j) => j !== i);
      dealDamage(ctx, src, { player: src.controller }, amount, false);
      return 0;
    }
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== to.player) continue;
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'preventDamageToYou')
          amount -= a.effect.amount;
    }
    return amount;
  }
  const host = to.object.id;
  // Strixhaven Brawl (15b, w): protection from a colour prevents damage from sources of that colour.
  if (protectedFrom(ctx, host, src.id)) return 0;
  // Marvel Super Heroes: "Prevent all damage that would be dealt to Black Panther."
  if (hasStaticKind(ctx, host, 'preventDamageToSelf')) return 0;
  // Final Fantasy (11a): Summon: Alexander prevents all damage to its controller's creatures this turn.
  if (ctx.s.turn.creaturesShielded?.includes(obj(ctx, host).controller)) return 0;
  const habit = ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).attachedTo === host &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'attached' && a.effect.damageToCounters,
      ),
  );
  if (!habit) return amount;
  addCounters(ctx, host, amount);
  return 0;
}

/** Marvel Super Heroes Jumpstart (Squadron): whether damage to this player or permanent is cut to 1 (Hyperion). */
function allButOne(ctx: Ctx, to: TargetChoice): boolean {
  const hit = 'player' in to ? to.player : onBattlefield(ctx, to.object)?.controller;
  if (!hit) return false;
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === hit &&
      def(ctx, id).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.effect.kind === 'preventAllButOne' &&
          ('player' in to || matchesFilter(ctx, to.object.id, a.effect.filter)),
      ),
  );
}

const hasStaticKind = (ctx: Ctx, id: ObjectId, kind: string) =>
  def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind);

const PERMANENT_TYPES: readonly string[] = [
  'Artifact',
  'Creature',
  'Enchantment',
  'Land',
  'Planeswalker',
  'Battle',
];

/**
 * Reality Fracture (17a): Draconic Visitor: the token `player` creates instead of an artifact token
 * (`token`: the token's, or a token copy's original's, card id), if something replaces them.
 */
export function artifactTokenReplacement(
  ctx: Ctx,
  player: PlayerId,
  token: CardDefId,
): CardDefId | undefined {
  if (!defOf(ctx, token).types.includes('Artifact')) return undefined;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'artifactTokensBecome') return a.effect.token;
  }
  return undefined;
}

/** Divine Visitation: the token a player creates instead of a creature token. */
export function replacedToken(ctx: Ctx, player: PlayerId, token: CardDefId): CardDefId {
  // Reality Fracture (17a): Draconic Visitor.
  const artifact = artifactTokenReplacement(ctx, player, token);
  if (artifact) return artifact;
  if (!defOf(ctx, token).types.includes('Creature')) return token;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'creatureTokensBecome') return a.effect.token;
  }
  return token;
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
      if (b.otherSources && src.id === id) continue;
      if (b.source && !(source?.zone === 'battlefield' && matchesFilter(ctx, src.id, b.source)))
        continue;
      if (b.condition && !checkCondition(ctx, b.condition, o.controller, o)) continue;
      n += b.amount === 'sourcePower' ? Math.max(0, characteristics(ctx, id).power ?? 0) : b.amount;
    }
  }
  return n;
}

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const;

/** Card types Portent of Calamity looks for, in the order it picks. */
const PORTENT_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
] as const;

/**
 * Reality Fracture (17a fixes): the creature types offered for "choose a creature type": every one (Scryfall's
 * catalog), those on creatures on the battlefield and in the chooser's hand first, then the rest, each part A to Z.
 */
function creatureTypesOf(ctx: Ctx, player: PlayerId): string[] {
  const first = new Set<string>();
  const note = (id: ObjectId) => {
    const d = defOf(ctx, obj(ctx, id).defId);
    if (d.types.includes('Creature')) for (const t of d.subtypes) first.add(t);
  };
  for (const id of ctx.s.battlefield) note(id);
  for (const id of ctx.s.players[player].hand) note(id);
  const rest = CREATURE_TYPES.filter((t) => !first.has(t));
  return [...[...first].sort(), ...rest];
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

/** The targets an activated or triggered ability on the stack asks for (Bolt Bend). */
function abilityTargetSpecs(
  ctx: Ctx,
  item: Extract<StackItem, { kind: 'ability' }>,
): readonly TargetSpec[] {
  if (item.activated) return item.activated.targets;
  if (item.inline || item.emblem) return triggeredAbility(ctx, item).targets;
  const a = defOf(ctx, item.sourceDefId).abilities[item.abilityIndex];
  if (a?.kind === 'triggered')
    return (item.mode !== undefined ? a.modes?.[item.mode]?.targets : undefined) ?? a.targets;
  return a?.kind === 'activated' ? a.targets : [];
}

/** How a target reads in a choice for `viewer` (Bolt Bend's new targets). */
function targetLabel(ctx: Ctx, viewer: PlayerId, t: TargetChoice): string {
  if ('player' in t) return t.player === viewer ? 'You' : 'Your opponent';
  const o = ctx.s.objects[t.object.id];
  if (o) return `${defOf(ctx, o.defId).name} (${o.controller === viewer ? 'yours' : "opponent's"})`;
  const ab = ctx.s.stack.find((x) => x.id === t.object.id);
  return ab?.kind === 'ability' ? `${defOf(ctx, ab.sourceDefId).name}'s ability` : 'Another target';
}

/**
 * The other legal targets for a spell or ability on the stack, as options for
 * `es.controller`: Bolt Bend's "change the target of target spell or ability
 * with a single target" (`single`), or a copy's "you may choose new targets".
 * The best for the chooser come first (aimed at the other side from before).
 */
function newTargetOptions(
  ctx: Ctx,
  es: EffectSource,
  id: ObjectId | undefined,
  single: boolean,
): { label: string; effects: EffectDef[] }[] {
  const item = ctx.s.stack.find((x) => x.id === id);
  if (!item || item.targets.length === 0 || (single && item.targets.length !== 1)) return [];
  const spec =
    item.kind === 'spell'
      ? (spellOnStack(defOf(ctx, obj(ctx, item.id).defId), item)?.targets ?? [])
      : abilityTargetSpecs(ctx, item);
  const sourceId = item.kind === 'spell' ? item.id : item.source.id;
  const combos = targetCombos(ctx, spec, { controller: item.controller, sourceId }).filter(
    (c) => c.length === item.targets.length && JSON.stringify(c) !== JSON.stringify(item.targets),
  );
  const mine = (c: TargetChoice) =>
    'player' in c
      ? c.player === es.controller
      : ctx.s.objects[c.object.id]?.controller === es.controller;
  const wasMine = mine(item.targets[0]!);
  const best = (c: TargetChoice[]) => Number(mine(c[0]!) === wasMine);
  return combos
    .sort((a, b) => best(a) - best(b))
    .map((c) => ({
      label: c.map((x) => targetLabel(ctx, es.controller, x)).join(', '),
      effects: [{ kind: 'setStackTargets', id: item.id, targets: c }],
    }));
}

/**
 * Iron Fist, Hero for Hire; Rhino, Terrible Trampler: the next step of a 'divide': a choice of
 * one more target and how much it gets (the last target allowed gets all that's left), or the
 * finished split.
 */
function divideStep(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'divide' }>,
): EffectDef[] {
  const chosen = e.chosen ?? [];
  const left = e.amount - chosen.reduce((n, c) => n + c.n, 0);
  const finish: EffectDef = { ...e, done: true };
  if (left <= 0 || chosen.length >= e.maxTargets) return chosen.length ? [finish] : [];
  const same = (a: TargetChoice, b: TargetChoice) =>
    'player' in a
      ? 'player' in b && a.player === b.player
      : 'object' in b && a.object.id === b.object.id;
  const cands = targetCandidates(ctx, e.spec, {
    controller: es.controller,
    ...(es.source ? { sourceId: es.source.id } : {}),
  }).filter((t) => !chosen.some((c) => same(c.to, t)));
  if (cands.length === 0) return chosen.length ? [finish] : [];
  const last = chosen.length === e.maxTargets - 1 || cands.length === 1;
  const what = (n: number) =>
    e.give === 'damage' ? `${n} damage to` : `${n} +1/+1 counter${n === 1 ? '' : 's'} on`;
  const options: { label: string; effects: EffectDef[] }[] = [];
  // "Up to": choosing no targets at all.
  if (!chosen.length) options.push({ label: 'No targets', effects: [] });
  for (let n = left; n >= (last ? left : 1); n--)
    for (const t of cands)
      options.push({
        label: `${what(n)} ${targetLabel(ctx, es.controller, t)}`,
        effects: [{ ...e, chosen: [...chosen, { to: t, n }] }],
      });
  return [{ kind: 'choose', options }];
}

/**
 * Marvel Super Heroes Jumpstart (Animal): Tippy-Toe, "if you would create one or more tokens,
 * instead create those tokens plus an additional Food token" (one per Tippy-Toe), after any
 * effect that created tokens for `owner`.
 */
export function plusFoodTokens(ctx: Ctx, owner: PlayerId): void {
  for (const id of [...ctx.s.battlefield])
    if (obj(ctx, id).controller === owner)
      for (const a of def(ctx, id).abilities)
        if (a.kind === 'static' && a.effect.kind === 'plusFoodToken') {
          // Reality Fracture (17a): Draconic Visitor turns the Food into a Dragon.
          const f = createObject(
            ctx,
            replacedToken(ctx, owner, 'food-token'),
            owner,
            'battlefield',
            true,
          );
          ctx.s.battlefield.push(f.id);
          emit(ctx, {
            type: 'objectMoved',
            id: f.id,
            defId: f.defId,
            from: null,
            to: 'battlefield',
          });
        }
}

/** The id of the spell or ability a target refers to (Bolt Bend). */
function stackTargetId(es: EffectSource, what: Ref): ObjectId | undefined {
  const t = typeof what === 'object' && 'target' in what ? es.targets[what.target] : null;
  return t && 'object' in t ? t.object.id : undefined;
}

/** Counters a spell (unless it can't be countered). */
export function counterSpell(ctx: Ctx, id: ObjectId, exile = false): void {
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
  // Mystical Archive (16): Veil of Summer.
  if (ctx.s.turn.uncounterable?.includes(controller)) return;
  ctx.s.stack.splice(i, 1);
  emit(ctx, { type: 'countered', id: item.id });
  moveObject(ctx, item.id, item.flashback || exile ? 'exile' : 'graveyard');
}

export function changeLife(ctx: Ctx, player: PlayerId, delta: number): void {
  if (delta === 0) return;
  const p = ctx.s.players[player];
  // Mystical Archive (16): Teferi's Protection (life can't change), Angel's Grace (can't drop below 1).
  if (p.lifeFrozen) return;
  if (delta < 0 && ctx.s.turn.cantLose?.includes(player)) delta = Math.max(delta, 1 - p.life);
  if (delta === 0) return;
  p.life += delta;
  if (delta < 0) (ctx.s.turn.lifeLost ??= { p1: 0, p2: 0 })[player]++;
  // Final Fantasy Commander (12d): how much, too (Y'shtola).
  if (delta < 0) (ctx.s.turn.lifeLostTotal ??= { p1: 0, p2: 0 })[player] -= delta;
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
  // Final Fantasy (11c): The Wind Crystal, "twice that much life instead".
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'doubleLifeGain') amount *= 2;
  }
  ctx.s.turn.lifeGains[player]++;
  // Final Fantasy (11c), Strixhaven (13c): life gained this turn (Hope Estheim, Fortifying Draught).
  (ctx.s.turn.lifeGained ??= { p1: 0, p2: 0 })[player] += amount;
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
  const printed = defId ? defOf(ctx, defId).keywords : [];
  // Strixhaven (13c): Radiant Scrollwielder, "instant and sorcery spells you control have lifelink".
  if (
    defId &&
    (defOf(ctx, defId).types.includes('Instant') || defOf(ctx, defId).types.includes('Sorcery')) &&
    ctx.s.battlefield.some(
      (b) =>
        obj(ctx, b).controller === controller &&
        def(ctx, b).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'instantsSorceriesLifelink',
        ),
    )
  )
    return { id, controller, keywords: [...printed, 'lifelink'] };
  return { id, controller, keywords: printed };
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
  // Reality Fracture (17a): Clash of Elements, "its owner".
  if (typeof ref === 'object' && 'ownerOf' in ref) {
    const t = es.targets[ref.ownerOf];
    const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    return o ? [{ player: o.owner }] : [];
  }
  // Marvel Super Heroes Jumpstart (Geniuses): "that player" (Super Intelligence).
  if (ref === 'attachedController') {
    const host = es.source && ctx.s.objects[es.source.id]?.attachedTo;
    const o = host && ctx.s.objects[host];
    return o && o.zone === 'battlefield' ? [{ player: o.controller }] : [];
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
  // Marvel Super Heroes Jumpstart (Blink): "any number of target ...".
  if (typeof ref === 'object' && 'targetsFrom' in ref)
    return es.targets
      .slice(ref.targetsFrom)
      .flatMap((t): TargetChoice[] =>
        !t ? [] : 'object' in t ? (onBattlefield(ctx, t.object) ? [t] : []) : [t],
      );
  // Vulture, Feathered Fiend: "each of those creatures" (the ones still on the battlefield).
  if (ref === 'subjects')
    return (es.subjects ?? []).flatMap((r) => {
      const o = onBattlefield(ctx, r);
      return o ? [{ object: { id: o.id, zcc: o.zcc } }] : [];
    });
  const sourceId = es.source?.id;
  return (
    ref.each === 'permanent'
      ? ctx.s.battlefield.map((id) => obj(ctx, id))
      : creaturesOnBattlefield(ctx)
  )
    .filter((c) => {
      // Reality Fracture (17a): Twisted Fates, "each creature target player controls".
      if ('targetPlayer' in ref && ref.targetPlayer !== undefined) {
        const tp = es.targets[ref.targetPlayer];
        if (!tp || !('player' in tp) || c.controller !== tp.player) return false;
      }
      if (ref.controller === 'you' && c.controller !== es.controller) return false;
      if (ref.controller === 'opponent' && c.controller === es.controller) return false;
      // Reality Fracture (17a): Command the Stage, "each other Wizard token" (not the one just created).
      if (ref.exceptChosen && es.chosen && c.id === es.chosen.id) return false;
      // Reality Fracture (17a): Face Yourself, "each creature target player controls".
      if (ref.controllerTarget !== undefined) {
        const who = es.targets[ref.controllerTarget];
        if (!who || !('player' in who) || c.controller !== who.player) return false;
      }
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
  // Reality Fracture (17a): Dark Matter Manipulator, Recursive Recruitment
  if ('floorDiv' in amount)
    return Math.floor(resolveAmount(ctx, es, amount.amount) / amount.floorDiv);
  if ('manaValueOf' in amount) {
    const id = objectsOf(ctx, es, amount.manaValueOf)[0];
    return id ? manaValue(def(ctx, id).manaCost) : 0;
  }
  // Final Fantasy (11a)
  if ('sum' in amount) return amount.sum.reduce<number>((n, a) => n + resolveAmount(ctx, es, a), 0);
  // Final Fantasy (11b): mana spent.
  if ('manaSpentOnSubject' in amount) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    return o?.manaSpent ?? 0;
  }
  // Secrets of Strixhaven (14b): Molten Note.
  if ('manaSpentOnSource' in amount) {
    const o = es.source && ctx.s.objects[es.source.id];
    return o?.manaSpent ?? 0;
  }
  // Secrets of Strixhaven (14b): Geometer's Arthropod.
  if ('xOfSubject' in amount) return ctx.s.stack.find((i) => i.id === es.subject?.id)?.x ?? 0;
  // Secrets of Strixhaven (14a): converge.
  if ('colorsSpent' in amount) {
    const ref = amount.colorsSpent === 'source' ? es.source : es.subject;
    return (ref && ctx.s.objects[ref.id]?.manaColors?.length) || 0;
  }
  if ('manaValueOfSubject' in amount) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    return o ? manaValue(def(ctx, o.id).manaCost) : 0;
  }
  if ('bluePipsOfSubject' in amount) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (!o) return 0;
    const c = def(ctx, o.id).manaCost;
    return (c.colored.U ?? 0) + (c.hybrid ?? []).filter((h) => h.includes('U')).length;
  }
  if ('greatestManaValueYouControl' in amount)
    return Math.max(
      0,
      ...ctx.s.battlefield
        .filter(
          (id) =>
            obj(ctx, id).controller === es.controller &&
            matchesFilter(ctx, id, amount.greatestManaValueYouControl),
        )
        .map((id) => manaValue(def(ctx, id).manaCost)),
    );
  if ('handSizeUpTo' in amount)
    return Math.max(0, amount.handSizeUpTo - ctx.s.players[es.controller].hand.length);
  // Reality Fracture (17a): Cruel Calculations.
  if ('milledThisTurn' in amount)
    return playersOf(ctx, es, amount.milledThisTurn).reduce(
      (n, p) => n + (ctx.s.turn.milled?.[p] ?? 0),
      0,
    );
  // Strixhaven (13b): Flunk
  if ('handGapOfControllerOf' in amount) {
    const id = objectsOf(ctx, es, amount.handGapOfControllerOf)[0];
    return id ? Math.max(0, amount.size - ctx.s.players[obj(ctx, id).controller].hand.length) : 0;
  }
  // Strixhaven (13c): Torrent Sculptor.
  if ('halfManaValueUpOf' in amount) {
    // A card in a graveyard: not a permanent, so read the chosen target directly.
    const ref = amount.halfManaValueUpOf;
    const t = typeof ref === 'object' && 'target' in ref ? es.targets[ref.target] : undefined;
    const id = t && 'object' in t ? t.object.id : objectsOf(ctx, es, ref)[0];
    return id ? Math.ceil(manaValue(def(ctx, id).manaCost) / 2) : 0;
  }
  if ('toughnessOf' in amount) {
    const id = objectsOf(ctx, es, amount.toughnessOf)[0];
    return id ? Math.max(0, characteristics(ctx, id).toughness) : 0;
  }
  if ('if' in amount) {
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    return checkCondition(ctx, amount.if, es.controller, self, es.targets)
      ? amount.then
      : (amount.else ?? 0);
  }
  if ('powerOf' in amount) {
    const ids = objectsOf(ctx, es, amount.powerOf);
    if (ids[0]) return Math.max(0, power(ctx, ids[0]));
    if (amount.powerOf === 'self') {
      const last = es.lkiPower ?? (es.source && ctx.s.objects[es.source.id]?.lastPower);
      return Math.max(0, last ?? 0);
    }
    // Final Fantasy (11c): "its power" for a creature that died (Jenova's Mutants).
    if (amount.powerOf === 'subject' && es.subject)
      return Math.max(0, ctx.s.objects[es.subject.id]?.lastPower ?? 0);
    return 0;
  }
  if ('event' in amount) return es.amount ?? 0;
  // Reality Fracture (17a fixes): Rise of the Deathbringer.
  if ('drawnThisWay' in amount) return es.drawnThisWay ?? 0;
  // Strixhaven (13c): life gained this turn (Fortifying Draught).
  if ('count' in amount && amount.count === 'lifeGainedThisTurn')
    return ctx.s.turn.lifeGained?.[es.controller] ?? 0;
  // Crystal: "the number of colors that spell is".
  if ('count' in amount && amount.count === 'subjectColors') {
    const o = es.subject && ctx.s.objects[es.subject.id];
    return o ? def(ctx, o.id).colors.length : 0;
  }
  if ('sacrificedPower' in amount) return Math.max(0, es.lkiPower ?? 0);
  if ('x' in amount) {
    const x = es.x ?? (es.source && ctx.s.objects[es.source.id]?.xPaid) ?? 0;
    return x * (amount.times ?? 1) + (amount.plus ?? 0);
  }
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
// Strixhaven (13c): Explore the Vastlands
const INSTANT_OR_SORCERY: CardFilter = { types: ['Instant', 'Sorcery'] };

/** Puts these cards from a library on its bottom in a random order. */
export function sendToBottomRandom(ctx: Ctx, player: PlayerId, ids: readonly ObjectId[]): void {
  const lib = ctx.s.players[player].library;
  const rest = ids.filter((id) => lib.includes(id));
  for (const id of rest) lib.splice(lib.indexOf(id), 1);
  shuffleInPlace(ctx.s.rng, rest);
  lib.push(...rest);
}

export function runEffects(
  ctx: Ctx,
  es: EffectSource,
  effects: readonly EffectDef[],
  item: PausedResolution['item'],
): boolean {
  const list = effects.slice();
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (e.kind === 'repeat') {
      const n = resolveAmount(ctx, es, e.count);
      list.splice(i, 1, ...Array.from({ length: n }, () => e.effects).flat());
      i--;
      continue;
    }
    // Bolt Bend: the caster chooses the new target among the other legal ones.
    if (e.kind === 'changeTarget') {
      const options = newTargetOptions(ctx, es, stackTargetId(es, e.what), true);
      list.splice(
        i,
        1,
        ...(options.length > 1 ? [{ kind: 'choose', options } as EffectDef] : []),
        ...(options.length === 1 ? options[0]!.effects : []),
      );
      i--;
      continue;
    }
    // Loki Laufeyson: "You may choose new targets for the copy" (the copy is 'chosen').
    if (e.kind === 'copySpell' && e.newTargets && list[i + 1]?.kind !== 'chooseNewTargets')
      list.splice(i + 1, 0, { kind: 'chooseNewTargets' });
    if (e.kind === 'chooseNewTargets') {
      const options = newTargetOptions(ctx, es, es.chosen?.id, false);
      const keep = { label: 'Keep the same targets', effects: [] };
      list.splice(
        i,
        1,
        ...(options.length ? [{ kind: 'choose', options: [keep, ...options] } as EffectDef] : []),
      );
      i--;
      continue;
    }
    // Iron Fist, Hero for Hire; Rhino, Terrible Trampler: divide among up to N targets.
    if (e.kind === 'divide' && !e.done) {
      list.splice(i, 1, ...divideStep(ctx, es, e));
      i--;
      continue;
    }
    if (e.kind === 'eachPlayerSacrifices') {
      // You choose, then your opponent.
      list.splice(i, 1, { kind: 'opponentSacrifices', you: true }, { kind: 'opponentSacrifices' });
      i--;
      continue;
    }
    // Final Fantasy (11c): Zodiark. Counted first; you choose, then your opponent.
    if (e.kind === 'eachPlayerSacrificesHalf') {
      const sourceId = es.source?.id;
      const half = (p: PlayerId) =>
        Math.floor(
          creaturesOnBattlefield(ctx, p).filter(
            (c) => c.id !== sourceId && matchesFilter(ctx, c.id, e.filter, sourceId),
          ).length / 2,
        );
      const mine = half(es.controller);
      const theirs = half(other(es.controller));
      const filter: CardFilter = { ...e.filter, types: ['Creature'] };
      const expanded: EffectDef[] = [
        ...(mine ? [{ kind: 'sacrificeSeveral', count: mine, filter, then: [] } as EffectDef] : []),
        ...Array.from({ length: theirs }, (): EffectDef => ({
          kind: 'opponentSacrifices',
          filter,
        })),
      ];
      list.splice(i, 1, ...expanded);
      i--;
      continue;
    }
    if (e.kind === 'if') {
      // Replace it with the chosen branch (which may itself pause).
      const self = es.source ? ctx.s.objects[es.source.id] : undefined;
      // Amounts at resolution know X and "that much" (West Coast Expansion: X is 5 or more).
      const holds =
        e.condition.kind === 'amountAtLeast'
          ? resolveAmount(ctx, es, e.condition.amount) >= e.condition.min
          : checkCondition(
              ctx,
              e.condition,
              es.controller,
              self,
              es.targets,
              // Reality Fracture (17a): Koth, the Geomancer ("if that land is a Mountain").
              es.subject ? ctx.s.objects[es.subject.id] : undefined,
            );
      const branch = holds ? e.then : (e.else ?? []);
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
      e.kind === 'connive' ||
      e.kind === 'conniveConvokers' ||
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
      e.kind === 'lookTakeRestGraveyard' ||
      e.kind === 'castFree' ||
      e.kind === 'sacrificeSeveral' ||
      e.kind === 'portent' ||
      e.kind === 'exileUntilNonlandCastByDiscard' ||
      e.kind === 'revealPutAndTake' ||
      e.kind === 'pickFromCards' ||
      e.kind === 'castFreeCard' ||
      e.kind === 'revealUntilCastable' ||
      e.kind === 'revealTopCastOrPlay' ||
      e.kind === 'takeStudyCard' ||
      e.kind === 'expressiveIteration' ||
      e.kind === 'castFreeFromTop' ||
      // Secrets of Strixhaven (14b)
      e.kind === 'exileUntilTotalCastFree' ||
      e.kind === 'exileCopyCastFree' || // Reality Fracture (17a): Uldaros Theorix
      // Final Fantasy (11a): saga creatures
      e.kind === 'removeLoreFromAny' ||
      // Reality Fracture (17a): Tam, the Possibility
      e.kind === 'proliferate' ||
      // Strixhaven (13a)
      e.kind === 'learn' ||
      // Strixhaven (13c)
      e.kind === 'chooseCustom' ||
      e.kind === 'graveyardCardToLibraryBottom' ||
      e.kind === 'discardAnyThenDraw' ||
      e.kind === 'lookTakeLandAndSpell' ||
      e.kind === 'payOrElse' ||
      // Final Fantasy (11c): The Darkness Crystal
      e.kind === 'putExiledWithSource' ||
      // Final Fantasy (11c): hideaway
      e.kind === 'hideaway'
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
        // Strixhaven (13b): Ingenious Mastery (the opponent scries)
        const scryer = e.kind === 'scry' && e.forOpponent ? other(controller) : controller;
        const cards = (
          e.kind === 'scry' && e.forOpponent ? ctx.s.players[scryer].library : lib
        ).slice(0, e.amount);
        if (cards.length === 0) {
          // Reality Fracture (17a): scrying or surveilling an empty library still counts as having done it.
          if (e.amount > 0) {
            if (!ctx.s.turn.scriedOrSurveilled?.includes(scryer))
              ctx.s.turn.scriedOrSurveilled = [...(ctx.s.turn.scriedOrSurveilled ?? []), scryer];
            emit(ctx, { type: 'scried', player: scryer, top: 0, bottom: 0 });
          }
          continue;
        }
        ctx.s.decision = {
          kind: 'scry',
          player: scryer,
          ...(e.kind === 'surveil' ? { surveil: true } : {}),
          // Reality Fracture (17a): Enlightened Confidant
          ...(e.kind === 'surveil' && e.graveyardToHand
            ? { toHandMaxMv: resolveAmount(ctx, es, e.graveyardToHand.maxManaValue) }
            : {}),
          cards,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'punisher') {
        const opp = other(controller);
        const options = [
          // Strixhaven (13c): Professor Onyx: only a discard avoids the life loss.
          ...(e.discardOnly
            ? []
            : ctx.s.battlefield.filter(
                (id) => obj(ctx, id).controller === opp && !def(ctx, id).types.includes('Land'),
              )),
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
      } else if (e.kind === 'sacrificeSeveral') {
        const sourceId = es.source?.id;
        const options = ctx.s.battlefield.filter(
          (id) =>
            (id !== sourceId || e.includeSource) && // Strixhaven (13b): Daemogoth Titan
            obj(ctx, id).controller === controller &&
            matchesFilter(ctx, id, e.filter, sourceId),
        );
        if (options.length < e.count) continue;
        ctx.s.decision = {
          kind: 'sacrificeSeveral',
          player: controller,
          options,
          count: e.count,
          then: e.then,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'revealPutAndTake' || e.kind === 'pickFromCards') {
        // Wakanda Forever!: the revealed cards go to the graveyard first; the picks come from there.
        const cards = e.kind === 'pickFromCards' ? e.cards : lib.slice(0, e.count);
        if (e.kind === 'revealPutAndTake') for (const id of cards) moveObject(ctx, id, 'graveyard');
        const options = cards.filter(
          (id) => ctx.s.objects[id]?.zone === 'graveyard' && cardMatches(ctx, id, e.filter),
        );
        const then: EffectDef[] =
          e.kind === 'revealPutAndTake'
            ? [{ kind: 'pickFromCards', cards, filter: e.filter, to: 'hand' }]
            : [];
        if (options.length === 0) {
          list.splice(i + 1, 0, ...then);
          continue;
        }
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: e.kind === 'pickFromCards' ? e.to : 'battlefield',
          shuffle: false,
          ...(e.counter ? { counter: e.counter } : {}),
          resume: { ...resume, effects: [...then, ...resume.effects] },
          thenPriority,
        };
      } else if (e.kind === 'castFreeCard') {
        // Rebound, Power Pack: the card must still be where it was exiled.
        const card = ctx.s.objects[e.card.id];
        // In exile (rebound, suspend), or just drawn (miracle).
        if (!card || (card.zone !== 'exile' && card.zone !== 'hand') || card.zcc !== e.card.zcc)
          continue;
        if (def(ctx, card.id).types.includes('Land')) continue;
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: [card.id],
          ...(e.exileAfter ? { exileAfter: true } : {}),
          ...(e.costLess ? { costLess: e.costLess } : {}),
          ...(e.pay ? { pay: e.pay } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'revealUntilCastable') {
        // Cascade and discover: exile until a cheap enough nonland card.
        const self = es.source && ctx.s.objects[es.source.id];
        const max =
          e.max === 'belowSource'
            ? manaValue(defOf(ctx, self?.defId ?? sourceDefId).manaCost) - 1
            : // Strixhaven (13c): Codie, Vociferous Codex: less than the spell that triggered it.
              e.max === 'belowSubject'
              ? resolveAmount(ctx, es, { manaValueOfSubject: true }) - 1
              : resolveAmount(ctx, es, e.max);
        const exiled: ObjectId[] = [];
        let hit: ObjectId | undefined;
        for (const id of [...lib]) {
          moveObject(ctx, id, 'exile');
          const d = def(ctx, id);
          if (
            !d.types.includes('Land') &&
            manaValue(d.manaCost) <= max &&
            (!e.filter || cardMatches(ctx, id, e.filter)) // Strixhaven (13c): Plargg
          ) {
            hit = id;
            break;
          }
          exiled.push(id);
        }
        // The misses go to the bottom in a random order.
        // Marvel Super Heroes Jumpstart (Scarlet): or stay in exile (Wanda's Vision).
        if (!e.stayExiled) {
          shuffleInPlace(ctx.s.rng, exiled);
          for (const id of exiled) moveObject(ctx, id, 'library', { position: 'bottom' });
        }
        if (!hit) continue;
        const after: EffectDef = {
          kind: 'afterReveal',
          card: { id: hit, zcc: obj(ctx, hit).zcc },
          to: e.orHand ? 'hand' : 'libraryBottom',
        };
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: [hit],
          resume: { ...resume, effects: [...(e.stayExiled ? [] : [after]), ...resume.effects] },
          thenPriority,
        };
      } else if (e.kind === 'takeStudyCard') {
        // Strixhaven (13c): Imbraham, Dean of Theory.
        const options = ctx.s.players[controller].exile.filter(
          (id) => (obj(ctx, id).counters?.study ?? 0) > 0,
        );
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: 'hand',
          shuffle: false,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'revealTopCastOrPlay') {
        // Strixhaven (13c): Jadzi, Oracle of Arcavios.
        const top = lib[0];
        if (top === undefined) continue;
        emit(ctx, { type: 'revealed', player: controller, id: top });
        if (def(ctx, top).types.includes('Land')) {
          moveObject(ctx, top, 'battlefield', { controller });
          continue;
        }
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: [top],
          pay: e.pay,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'expressiveIteration') {
        // One of the top three to your hand; the other two settle afterwards.
        const looked = lib.slice(0, 3);
        if (looked.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options: looked,
          looked,
          restOnTop: true,
          resume: {
            ...resume,
            effects: [{ kind: 'afterExpressive', cards: looked }, ...resume.effects],
          },
          thenPriority,
        };
      } else if (e.kind === 'castFree' && e.from) {
        // West Coast Expansion (from your hand), Scarlet Witch (cards exiled with her).
        const self = es.source && ctx.s.objects[es.source.id];
        const exiled = (self?.exiledWith ?? []).filter((id) => ctx.s.objects[id]?.zone === 'exile');
        const pool =
          e.from === 'hand'
            ? ctx.s.players[controller].hand
            : e.from === 'lastExiledWithSource'
              ? exiled.slice(-1)
              : exiled;
        // Final Fantasy (11c): "mana value less than or equal to that damage" (Buster Sword).
        const max = e.maxManaValue !== undefined ? resolveAmount(ctx, es, e.maxManaValue) : 99;
        const cards = pool.filter(
          (id) =>
            !def(ctx, id).types.includes('Land') &&
            cardMatches(ctx, id, e.filter ?? {}) &&
            manaValue(def(ctx, id).manaCost) <= max,
        );
        if (cards.length === 0) continue;
        ctx.s.decision = { kind: 'castFree', player: controller, cards, resume, thenPriority };
      } else if (e.kind === 'exileUntilTotalCastFree') {
        // Secrets of Strixhaven (14b): Improvisation Capstone.
        const exiled: ObjectId[] = [];
        let total = 0;
        while (total < e.total && lib.length > 0) {
          const id = lib[0]!;
          moveObject(ctx, id, 'exile');
          exiled.push(id);
          total += manaValue(def(ctx, id).manaCost);
        }
        const cards = exiled.filter((id) => !def(ctx, id).types.includes('Land'));
        if (cards.length === 0) continue;
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards,
          more: true,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'exileCopyCastFree') {
        // Reality Fracture (17a): Uldaros Theorix. The cards are exiled and copied; the copies may be cast.
        const copies: ObjectId[] = [];
        for (const t of es.targets.slice(e.from)) {
          if (!t || !('object' in t)) continue;
          const id = t.object.id;
          const card = ctx.s.objects[id];
          // Still in the graveyard it was targeted in.
          if (!card || card.zone !== 'graveyard' || card.zcc !== t.object.zcc) continue;
          moveObject(ctx, id, 'exile');
          const copy = createObject(ctx, card.defId, controller, 'exile');
          copy.spellCopyCard = true;
          copy.copyBecomesToken = true;
          ctx.s.players[controller].exile.push(copy.id);
          copies.push(copy.id);
        }
        const cards = copies.filter(
          (id) =>
            !def(ctx, id).types.includes('Land') && manaValue(def(ctx, id).manaCost) <= e.budget,
        );
        if (cards.length === 0) {
          for (const id of copies) ceaseSpellCopy(ctx, id);
          continue;
        }
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards,
          more: true,
          budget: e.budget,
          copies,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'castFreeFromTop') {
        // Marvel Super Heroes (Cosmic Cube, Doom Reigns Supreme).
        const who = e.from === 'yours' ? controller : other(controller);
        const top = ctx.s.players[who].library.slice(0, e.count);
        if (top.length === 0) continue;
        for (const id of top) moveObject(ctx, id, 'exile');
        const max = e.maxManaValue !== undefined ? resolveAmount(ctx, es, e.maxManaValue) : 99;
        const cards = top.filter(
          (id) =>
            !def(ctx, id).types.includes('Land') &&
            manaValue(def(ctx, id).manaCost) <= max &&
            (!e.filter || cardMatches(ctx, id, e.filter)), // Strixhaven (13c): Velomachus Lorehold
        );
        const rest = e.rest === 'bottom' ? { thenToBottom: top } : {};
        if (cards.length === 0) {
          for (const id of rest.thenToBottom ?? [])
            moveObject(ctx, id, 'library', { position: 'bottom' });
          continue;
        }
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards,
          ...rest,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'castFree') {
        // A target card in a graveyard, still there.
        const t =
          typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
        const card = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
        if (
          !card ||
          card.zone !== 'graveyard' ||
          !t ||
          !('object' in t) ||
          card.zcc !== t.object.zcc
        )
          continue;
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: [card.id],
          ...(e.exileAfter ? { exileAfter: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'portent') {
        // One card of each type (the most expensive, a simplification), the rest to the graveyard.
        const revealed = lib.slice(0, resolveAmount(ctx, es, { x: true }));
        const picked: ObjectId[] = [];
        for (const type of PORTENT_TYPES) {
          const best = revealed
            .filter((id) => !picked.includes(id) && def(ctx, id).types.includes(type))
            .sort((a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost))[0];
          if (best) picked.push(best);
        }
        for (const id of revealed) moveObject(ctx, id, picked.includes(id) ? 'exile' : 'graveyard');
        const spells = picked.filter((id) => !def(ctx, id).types.includes('Land'));
        if (picked.length < 4 || spells.length === 0) {
          for (const id of picked) moveObject(ctx, id, 'hand');
          continue;
        }
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: spells,
          thenToHand: picked,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'exileUntilNonlandCastByDiscard') {
        let card: ObjectId | undefined;
        while (lib.length) {
          const top = lib[0]!;
          moveObject(ctx, top, 'exile');
          if (!def(ctx, top).types.includes('Land')) {
            card = top;
            break;
          }
        }
        if (!card || ctx.s.players[controller].hand.length === 0) continue;
        ctx.s.decision = {
          kind: 'castFree',
          player: controller,
          cards: [card],
          discardInstead: true,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseColor') {
        ctx.s.decision = {
          kind: 'chooseOption',
          player: controller,
          // Thriving lands: "other than" their own colour.
          options: (['W', 'U', 'B', 'R', 'G'] as const)
            .filter((color) => color !== e.except)
            .map((color) => ({
              label: COLOR_NAMES[color],
              effects: [{ kind: 'custom', handler: 'setChosen', params: { color } }],
            })),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseCustom') {
        // Strixhaven (13c): a handler builds the options (and says who chooses).
        const made = (CHOOSERS[e.handler] ?? SOS_14B_C_CHOOSERS[e.handler])?.(ctx, es, e.params);
        if (!made || made.options.length === 0) continue;
        ctx.s.decision = {
          kind: 'chooseOption',
          player: made.player ?? controller,
          ...(made.title ? { title: made.title } : {}),
          options: made.options,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'learn') {
        // Learn: a Lesson from outside the game, or rummage, or nothing.
        const ps = ctx.s.players[controller];
        const lessons = [...new Set(ps.sideboard ?? [])].filter((id) =>
          ctx.db.get(id)?.subtypes.includes('Lesson'),
        );
        const options: { label: string; effects: EffectDef[] }[] = lessons.map((id) => ({
          label: `Reveal ${ctx.db.get(id)!.name} and put it into your hand`,
          effects: [{ kind: 'custom', handler: 'learnFetch', params: { defId: id } }],
        }));
        if (ps.hand.length > 0)
          options.push({
            label: 'Discard a card, then draw a card',
            effects: [
              { kind: 'discard', count: 1 },
              { kind: 'draw', who: 'controller', amount: 1 },
            ],
          });
        if (options.length === 0) continue;
        options.push({ label: 'Do nothing', effects: [] });
        ctx.s.decision = {
          kind: 'chooseOption',
          player: controller,
          title: 'Learn',
          options,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseCreatureType') {
        const types = creatureTypesOf(ctx, controller);
        ctx.s.decision = {
          kind: 'chooseOption',
          player: controller,
          title: 'Choose a creature type',
          options: types.map((type) => ({
            label: type,
            effects: [{ kind: 'custom', handler: 'setChosen', params: { type } }],
          })),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'millThenTake') {
        const milled = lib.slice(0, millCount(ctx, controller, e.count));
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
          // Secrets of Strixhaven (14b): Bind to Life puts it onto the battlefield.
          ...(e.to ? { to: e.to } : {}),
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
          // Strixhaven (13c): Search for Blex: any number, each costing life.
          ...(e.upTo ? { upTo: true } : {}),
          ...(e.lifePerCard ? { lifePerCard: e.lifePerCard } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'putFromHandOrGraveyard') {
        const ps = ctx.s.players[controller];
        const options = [
          ...(e.graveyardOnly ? [] : ps.hand),
          ...(e.handOnly ? [] : ps.graveyard),
        ].filter((id) =>
          // Secrets of Strixhaven (14b): Mind into Matter.
          cardMatches(
            ctx,
            id,
            e.maxManaValueX ? { ...e.filter, maxManaValue: es.x ?? 0 } : e.filter,
          ),
        );
        if (options.length === 0) continue;
        // Strixhaven (13c): Journey to the Oracle puts them all onto the battlefield.
        if (e.all) {
          for (const id of options) moveObject(ctx, id, 'battlefield', { controller });
          continue;
        }
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: e.tapped ? 'battlefieldTapped' : 'battlefield',
          shuffle: false,
          ...(e.counter ? { counter: e.counter } : {}),
          ...(e.attackingIf ? { attackingIf: e.attackingIf } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseYourPermanent') {
        const sourceId = es.source?.id;
        const options = ctx.s.battlefield.filter(
          (id) =>
            id !== sourceId &&
            // Vial Smasher: a permanent an opponent controls.
            (obj(ctx, id).controller === controller) !== !!e.opponents &&
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
        // Strixhaven Brawl (15b, u): Syncopate, "unless its controller pays {X}".
        // Final Fantasy Commander (12c), Strixhaven Brawl (15b, pair): a cost counted as it resolves ({X},
        // cards in your graveyard; Repulsive Mutation, "equal to the greatest power among creatures you control".
        const base =
          e.costAmount !== undefined
            ? { generic: Math.max(0, resolveAmount(ctx, es, e.costAmount)), colored: {} }
            : e.cost;
        const toPay = e.xCost ? { ...base, generic: base.generic + (x ?? 0) } : base;
        if (e.xCost && toPay.generic === 0 && Object.values(toPay.colored).every((n) => !n))
          continue; // X is 0: paid
        // Can't pay: countered straight away.
        if (!canPayFrom(toPay, manaSources(ctx, item.controller))) {
          counterSpell(ctx, item.id, e.exile);
          continue;
        }
        ctx.s.decision = {
          kind: 'payOrCounter',
          player: item.controller,
          spell: item.id,
          cost: toPay,
          ...(e.exile ? { exile: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'chooseFromOpponentHand') {
        const from = other(controller);
        let options = ctx.s.players[from].hand.filter(
          (id) => !e.filter || cardMatches(ctx, id, e.filter),
        );
        // Klaw: they reveal only some cards (picked for them: the cheapest), and you choose among those.
        if (e.reveal !== undefined)
          options = [...options]
            .sort((a, b) => manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost))
            .slice(0, resolveAmount(ctx, es, e.reveal));
        ctx.s.decision = {
          kind: 'chooseFromHand',
          player: controller,
          from,
          options,
          then: e.then,
          ...(e.castable ? { castable: true } : {}),
          ...(e.castableIf ? { castableIf: e.castableIf } : {}), // Reality Fracture (17a): Null Summoner
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
        const doomed = e.permanents
          ? ctx.s.battlefield.map((id) => obj(ctx, id))
          : creaturesOnBattlefield(ctx);
        for (const c of doomed) {
          if (
            !matchesFilter(ctx, c.id, e.filter, es.source?.id) ||
            hasKeyword(ctx, c.id, 'indestructible')
          )
            continue;
          if (useShield(ctx, c.id)) continue;
          moveObject(ctx, c.id, 'graveyard');
          died.push(c.id);
        }
        // Avenge: "You gain 1 life for each creature destroyed this way."
        if (e.gainPerDestroyed) gainLife(ctx, controller, e.gainPerDestroyed * died.length);
        // Strixhaven (13c): Culling Ritual: one mana for each permanent destroyed.
        if (e.manaPerDestroyed)
          for (let k = 0; k < died.length; k++)
            (ctx.s.players[controller].pool ??= []).push({ produces: [...e.manaPerDestroyed] });
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
        // Secrets of Strixhaven (14b): Geometer's Arthropod looks at X cards.
        const n = typeof e.count === 'number' ? e.count : resolveAmount(ctx, es, e.count);
        const looked = lib.slice(0, n);
        if (looked.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options: looked.filter((id) => cardMatches(ctx, id, e.filter, es.source?.id)),
          looked,
          ...(e.battlefieldOnYourTurn ? { battlefieldOnYourTurn: true } : {}),
          ...(e.restOnTop ? { restOnTop: true } : {}),
          ...(e.restToGraveyard ? { restToGraveyard: true } : {}),
          // Strixhaven (13c): The Biblioplex
          ...(e.canBin ? { canBin: true } : {}),
          // Final Fantasy (11b): look for a land (Ignis Scientia).
          ...(e.to ? { to: e.to } : {}),
          // Secrets of Strixhaven (14a): Follow the Lumarets.
          ...(e.followUp ? { followUp: e.followUp } : {}),
          // Secrets of Strixhaven (14b): Zimone's Experiment.
          ...(e.landsTapped ? { landsTapped: true } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'graveyardCardToLibraryBottom') {
        // Strixhaven (13c): Ardent Dustspeaker
        const options = ctx.s.players[controller].graveyard.filter((id) =>
          cardMatches(ctx, id, e.filter, es.source?.id),
        );
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: 'libraryBottom',
          shuffle: false,
          onPick: e.then,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'lookTakeLandAndSpell') {
        // Strixhaven (13c): Explore the Vastlands
        const who = e.who === 'eachOpponent' ? other(controller) : controller;
        const looked = ctx.s.players[who].library.slice(0, 5);
        const lands = looked.filter((id) => cardMatches(ctx, id, { types: ['Land'] }));
        const spells = looked.filter((id) => cardMatches(ctx, id, INSTANT_OR_SORCERY));
        if (lands.length === 0 && spells.length === 0) {
          sendToBottomRandom(ctx, who, looked);
          continue;
        }
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: who,
          options: lands.length ? lands : spells,
          looked,
          ...(lands.length ? { followUp: INSTANT_OR_SORCERY } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'discardAnyThenDraw') {
        // Strixhaven (13c): Illuminate History, Fervent Mastery
        const who = e.who === 'eachOpponent' ? other(controller) : controller;
        if (ctx.s.players[who].hand.length === 0) {
          // Secrets of Strixhaven (14b): Colossus of the Blood Age still draws its extra card.
          for (let n = 0; n < (e.plus ?? 0); n++) drawCard(ctx, who);
          continue;
        }
        ctx.s.decision = {
          kind: 'discard',
          player: who,
          count: 1,
          anyNumber: {
            discarded: 0,
            ...(e.plus ? { plus: e.plus } : {}),
            ...(e.max ? { max: e.max } : {}),
          },
          resume,
          thenPriority,
        };
      } else if (e.kind === 'payOrElse') {
        // Strixhaven (13c): Archway Commons, Wandering Archaic
        const who = e.who === 'eachOpponent' ? other(controller) : controller;
        if (!canPayFrom(e.cost, manaSources(ctx, who))) {
          list.splice(i + 1, 0, ...e.otherwise);
          continue;
        }
        ctx.s.decision = {
          kind: 'payOrCounter',
          player: who,
          cost: e.cost,
          otherwise: e.otherwise,
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
        const opp = e.you ? controller : other(controller);
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
        // Secrets of Strixhaven (14b): End of the Hunt.
        if (e.greatestManaValue) {
          const most = Math.max(...options.map((id) => manaValue(def(ctx, id).manaCost)));
          options = options.filter((id) => manaValue(def(ctx, id).manaCost) === most);
        }
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'sacrifice',
          player: opp,
          options,
          ...(e.gainToughness ? { gainLifeFor: controller } : {}),
          ...(e.exile ? { exile: true } : {}),
          ...(e.then ? { then: e.then } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'discard') {
        let who = e.who === 'eachOpponent' ? other(controller) : controller;
        // Secrets of Strixhaven (14b): "target player discards X cards".
        if (e.of) {
          const t = resolveRef(ctx, es, e.of)[0];
          if (!t || !('player' in t)) continue;
          who = t.player;
        }
        const able = ctx.s.players[who].hand.filter(
          (id) => !e.filter || cardMatches(ctx, id, e.filter),
        );
        const count = Math.min(
          e.amount !== undefined ? resolveAmount(ctx, es, e.amount) : e.count,
          able.length,
        );
        if (count === 0) {
          // Strixhaven Brawl (15a): Seasoned Pyromancer still draws with an empty hand.
          for (let n = 0; n < (e.drawAfter ?? 0); n++) drawCard(ctx, who);
          continue;
        }
        ctx.s.decision = {
          kind: 'discard',
          player: who,
          count,
          ...(e.drawAfter ? { drawAfter: e.drawAfter } : {}),
          ...(e.tokenPerNonland ? { tokenPerNonland: e.tokenPerNonland } : {}),
          // Reality Fracture (17a): Seasoned Cryomancer.
          ...(e.reflexiveOnNonland !== undefined
            ? { reflexiveOnNonland: e.reflexiveOnNonland }
            : {}),
          ...(e.filter ? { filter: e.filter } : {}),
          ...(e.exile ? { exile: true } : {}),
          ...(e.damageTo !== undefined ? { damageTo: e.damageTo } : {}),
          // Reality Fracture (17a): Tether Technician, Improvised Act.
          ...(e.then ? { then: e.then } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'conniveConvokers') {
        // Lethal Scheme: each creature that helped cast it connives, one after another.
        const spell = es.source && ctx.s.objects[es.source.id];
        const convokers = (spell?.convokedBy ?? []).filter(
          (id) => ctx.s.objects[id]?.zone === 'battlefield',
        );
        list.splice(
          i + 1,
          0,
          ...convokers.flatMap((id): EffectDef[] => [
            { kind: 'focus', on: { id, zcc: obj(ctx, id).zcc } },
            { kind: 'connive', what: 'chosen' },
          ]),
        );
        continue;
      } else if (e.kind === 'connive') {
        // Rule 701.50: draw, then discard. A creature that has left still connives (no counter).
        const id = objectsOf(ctx, es, e.what)[0] ?? (e.what === 'self' ? es.source?.id : undefined);
        if (!id || !ctx.s.objects[id]) continue;
        const o = obj(ctx, id);
        const who = o.zone === 'battlefield' ? o.controller : controller;
        // Leader, Super-Genius: "instead you draw a card, then that creature connives" (each Leader).
        for (const id of ctx.s.battlefield)
          if (obj(ctx, id).controller === who)
            for (const a of def(ctx, id).abilities)
              if (a.kind === 'static' && a.effect.kind === 'conniveDrawsFirst') drawCard(ctx, who);
        drawCard(ctx, who);
        if (ctx.s.players[who].hand.length === 0) {
          if (o.zone === 'battlefield') emit(ctx, { type: 'connived', id, player: who });
          continue;
        }
        ctx.s.decision = {
          kind: 'discard',
          player: who,
          count: 1,
          connive: { id, zcc: o.zcc },
          resume,
          thenPriority,
        };
      } else if (e.kind === 'returnFromGraveyard') {
        const options = ctx.s.players[controller].graveyard.filter(
          (id) =>
            e.types.some((t) => def(ctx, id).types.includes(t)) &&
            // Strixhaven (13c): Deadly Brew: "another permanent card".
            !(e.exceptChosen && chosen && id === chosen.id),
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
      } else if (e.kind === 'proliferate') {
        // Reality Fracture (17a): Tam, the Possibility. Proliferate, `times` times: each time the player
        // picks permanents with counters one at a time (each at most once) until they say "Done".
        let remaining = e.remaining ?? resolveAmount(ctx, es, e.times ?? 1);
        let done = e.done ?? [];
        if (e.afterChoice) {
          const c = es.chosen && ctx.s.objects[es.chosen.id];
          if (c && c.zone === 'battlefield') {
            for (const [name, n] of Object.entries(c.counters ?? {}))
              if (n > 0) addCounters(ctx, c.id, 1, name);
            if (c.plusOneCounters > 0) addCounters(ctx, c.id, 1);
            done = [...done, c.id];
          }
        }
        const withCounters = () =>
          ctx.s.battlefield.filter((id) => {
            const o = obj(ctx, id);
            return (
              !done.includes(id) &&
              (o.plusOneCounters > 0 || Object.values(o.counters ?? {}).some((n) => n > 0))
            );
          });
        let options = withCounters();
        while (remaining > 0 && options.length === 0 && done.length > 0) {
          remaining--;
          done = [];
          options = withCounters();
        }
        if (remaining <= 0 || options.length === 0) continue;
        const nextPass: EffectDef[] =
          remaining > 1 ? [{ ...e, remaining: remaining - 1, done: [], afterChoice: false }] : [];
        ctx.s.decision = {
          kind: 'chooseObject',
          player: controller,
          options,
          optional: true,
          title: 'Proliferate',
          then: [{ ...e, remaining, done, afterChoice: true }],
          otherwise: nextPass,
          resume,
          thenPriority,
        };
      } else if (e.kind === 'removeLoreFromAny') {
        // Final Fantasy (11a): saga creatures. Garnet: one Saga at a time, each at most once.
        const options = ctx.s.battlefield.filter((id) => {
          const o = obj(ctx, id);
          return (
            o.controller === controller &&
            !!def(ctx, id).saga &&
            (o.counters?.lore ?? 0) > 0 &&
            o.loreRemovedTurn !== ctx.s.turn.number
          );
        });
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'chooseObject',
          player: controller,
          options,
          optional: true,
          then: [{ kind: 'removeLore', what: 'chosen' }, ...e.then, e],
          otherwise: [],
          resume,
          thenPriority,
        };
      } else if (e.kind === 'putExiledWithSource') {
        // Final Fantasy (11c): The Darkness Crystal. A card it exiled, still in exile.
        const self = es.source && ctx.s.objects[es.source.id];
        const options = (self?.exiledWith ?? []).filter(
          (id) => ctx.s.objects[id]?.zone === 'exile' && cardMatches(ctx, id, e.filter),
        );
        if (options.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options,
          fromGraveyard: true,
          to: 'battlefield',
          shuffle: false,
          ...(e.tapped ? { enterTapped: true } : {}),
          ...(e.counters ? { enterCounters: e.counters } : {}),
          resume,
          thenPriority,
        };
      } else if (e.kind === 'hideaway') {
        // Final Fantasy (11c): hideaway. One of the top N exiled face down, the rest to the bottom.
        const looked = lib.slice(0, e.count);
        if (looked.length === 0) continue;
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: controller,
          options: looked,
          looked,
          to: 'hideaway',
          required: true,
          resume,
          thenPriority,
        };
      } else {
        // Path to Exile: the exiled creature's controller searches their own library.
        const t = e.forControllerOf !== undefined ? es.targets[e.forControllerOf] : undefined;
        const searcher =
          (t && 'object' in t ? ctx.s.objects[t.object.id]?.controller : undefined) ?? controller;
        if (e.forControllerOf !== undefined && !t) continue;
        // Reality Fracture (17a): "up to 0 cards" (Fblthp with X = 0): the library is still shuffled.
        if (e.upTo !== undefined && resolveAmount(ctx, es, e.upTo) <= 0) {
          if (e.shuffle !== false) {
            shuffleInPlace(ctx.s.rng, ctx.s.players[searcher].library);
            emit(ctx, { type: 'shuffled', player: searcher });
          }
          continue;
        }
        const options = ctx.s.players[searcher].library.filter((id) => {
          if (typeof e.filter === 'object') {
            // Strixhaven (13c): Rushed Rebirth: "a creature card with lesser mana value" than the one that died.
            const sub =
              e.filter.lesserManaValueThanSubject && subject
                ? ctx.s.objects[subject.id]
                : undefined;
            if (
              sub &&
              manaValue(def(ctx, id).manaCost) >= manaValue(defOf(ctx, sub.defId).manaCost)
            )
              return false;
            // Mystical Archive (16): Bring to Light's filter looks at the colours spent on the spell.
            return cardMatches(ctx, id, e.filter, es.source?.id);
          }
          const d = defOf(ctx, obj(ctx, id).defId);
          const basic = d.supertypes.includes('Basic') && d.types.includes('Land');
          return basic || (e.filter === 'basicLandOrGate' && d.subtypes.includes('Gate'));
        });
        ctx.s.decision = {
          kind: 'searchLibrary',
          player: searcher,
          options,
          ...(e.required ? { required: true } : {}),
          ...(e.to !== 'hand' ? { to: e.to } : {}),
          ...(e.shuffle === false ? { shuffle: false } : {}),
          ...(e.untapIfLands ? { untapIfLands: e.untapIfLands } : {}),
          // Strixhaven (13c): Verdant Mastery, Emergent Sequence, Oriq Loremage.
          ...(e.forOpponent ? { forOpponent: true } : {}),
          ...(e.fractalLand ? { fractalLand: true } : {}),
          ...(e.sourceCounterIfTypes ? { sourceCounterIfTypes: e.sourceCounterIfTypes } : {}),
          // Reality Fracture (17a): Fblthp, Hexhaven Invigorator.
          ...(e.upTo !== undefined ? { remaining: resolveAmount(ctx, es, e.upTo) } : {}),
          ...(e.differentNames ? { differentNames: true } : {}),
          // Reality Fracture (17a fixes): Loyal Tutor.
          ...(e.reveal ? { reveal: true } : {}),
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
      for (const t of resolveRef(ctx, es, e.to)) {
        // Nova Flame: "each other creature".
        if (e.exceptFrom && 'object' in t && t.object.id === src.id) continue;
        const hit = e.excessTokens && 'object' in t ? onBattlefield(ctx, t.object) : undefined;
        const before = hit?.damage ?? 0;
        const lethal = hit ? Math.max(0, characteristics(ctx, hit.id).toughness - before) : 0;
        dealDamage(ctx, src, t, amount, false);
        // Goblin Negotiation: the damage beyond what was lethal.
        const excess = hit ? hit.damage - before - lethal : 0;
        if (e.excessTokens && excess > 0)
          runEffect(ctx, es, { kind: 'createToken', token: e.excessTokens, count: excess });
      }
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
          power: e.setBase ? 0 : p,
          toughness: e.setBase ? 0 : t,
          // Strixhaven (13c): Square Up (base power and toughness).
          ...(e.setBase && def(ctx, id).types.includes('Creature')
            ? { basePT: [p, t] as [number, number] }
            : {}),
          keywords: e.keywords ?? [],
          ...(e.cantBlock ? { cantBlock: true } : {}),
          ...(e.exileIfDies ? { exileIfDies: true } : {}),
          ...(e.cantBeBlocked ? { cantBeBlocked: true } : {}),
          ...(e.returnWhenDies ? { returnWhenDies: e.returnWhenDies } : {}),
          ...(e.cantBeBlockedExcept ? { cantBeBlockedExcept: e.cantBeBlockedExcept } : {}),
          // Marvel Super Heroes Jumpstart (Great Lakes Avengers)
          ...(e.cantBeBlockedBy ? { cantBeBlockedBy: e.cantBeBlockedBy } : {}),
          ...(e.switchPT ? { switchPT: true } : {}),
          ...(e.counterOnCombatDamage ? { counterOnCombatDamage: true } : {}),
          ...(e.ignoreDefender ? { ignoreDefender: true } : {}),
          ...(e.sacrificeOnCombatDamage ? { sacrificeOnCombatDamage: true } : {}),
          ...(e.basePT ? { basePT: e.basePT } : {}),
          ...(e.becomesCreature ? { becomesCreature: true } : {}),
          ...(e.preventCombatDamage ? { preventCombatDamage: true } : {}),
          ...(e.mustBeBlocked ? { mustBeBlocked: true } : {}),
          ...(e.untilYourNextTurn
            ? { expires: 'untilYourNextTurn' as const, player: es.controller }
            : { expires: 'endOfTurn' as const }),
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
    case 'changeTarget':
    case 'chooseNewTargets':
      return; // handled by runEffects
    // Quantum Entanglement, Villainous Syndication, Rhino's Rampage: "when you do".
    case 'reflexiveTrigger':
      if (es.source)
        ctx.s.pendingTriggers.push({
          source: es.source,
          sourceDefId: es.sourceDefId,
          abilityIndex: e.ability,
          controller: es.controller,
        });
      return;
    // Iron Fist, Hero for Hire; Rhino, Terrible Trampler: the finished split (chosen by runEffects).
    case 'divide': {
      const chosen = e.chosen ?? [];
      // Rechecked like targets: one that became illegal gets nothing.
      const src = {
        controller: es.controller,
        ...(es.source ? { sourceId: es.source.id } : {}),
      };
      const legal = chosen.filter((c) => isTargetLegal(ctx, e.spec, c.to, src));
      if (e.give === 'damage') {
        const from = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
        for (const c of legal) dealDamage(ctx, from, c.to, c.n, false);
      } else for (const c of legal) if ('object' in c.to) addCounters(ctx, c.to.object.id, c.n);
      for (const c of legal)
        for (const x of e.each ?? []) runEffect(ctx, { ...es, targets: [c.to] }, x);
      return;
    }
    case 'setStackTargets': {
      const item = ctx.s.stack.find((x) => x.id === e.id);
      if (item) item.targets = e.targets;
      return;
    }
    case 'endTheTurn': {
      // Rule 723.1: every spell and ability on the stack is exiled (Time Stop itself as it
      // finishes resolving), combat ends, and the turn skips to its cleanup step.
      const self = es.source?.id;
      for (const x of [...ctx.s.stack]) {
        if (x.kind === 'spell' && x.id === self) continue;
        ctx.s.stack.splice(ctx.s.stack.indexOf(x), 1);
        if (x.kind === 'spell') moveObject(ctx, x.id, 'exile');
      }
      ctx.s.combat = null;
      ctx.s.pendingTriggers = [];
      ctx.s.turn.endTheTurn = true;
      return;
    }
    case 'doesntUntapWhileSource':
      if (!es.source || !onBattlefield(ctx, es.source)) return;
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          doesntUntap: true,
          expires: 'whileSource',
          whileSourceId: es.source.id,
        });
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
      for (const id of objectsOf(ctx, es, e.to))
        // A negative amount removes +1/+1 counters (Mister Hyde).
        if (n < 0) obj(ctx, id).plusOneCounters = Math.max(0, obj(ctx, id).plusOneCounters + n);
        else addCounters(ctx, id, n);
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
      // Marvel Super Heroes Jumpstart (Tenacious/Rampaging): excess damage to b (Rhino's Rampage).
      const beforeB = obj(ctx, b).damage;
      const lethalB = Math.max(0, characteristics(ctx, b).toughness - beforeB);
      dealDamage(ctx, sa, { object: { id: b, zcc: obj(ctx, b).zcc } }, pa, false);
      dealDamage(ctx, sb, { object: { id: a, zcc: obj(ctx, a).zcc } }, pb, false);
      if (e.ifExcess && obj(ctx, b).damage - beforeB > lethalB)
        for (const x of e.ifExcess) runEffect(ctx, es, x);
      return;
    }
    case 'destroy':
      for (const id of objectsOf(ctx, es, e.what))
        if (!hasKeyword(ctx, id, 'indestructible') && !useShield(ctx, id))
          moveObject(ctx, id, 'graveyard');
      return;
    case 'sacrifice': {
      const ids = objectsOf(ctx, es, e.what);
      for (const id of ids) sacrifice(ctx, id);
      // Villainous Syndication: "when you do".
      if (ids.length) for (const x of e.then ?? []) runEffect(ctx, es, x);
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
      // Reality Fracture (17a fixes): Rise of the Deathbringer, "cards drawn this way".
      const before = ctx.s.turn.cardsDrawn[es.controller] ?? 0;
      for (const p of playersOf(ctx, es, e.who)) for (let i = 0; i < n; i++) drawCard(ctx, p);
      es.drawnThisWay = (ctx.s.turn.cardsDrawn[es.controller] ?? 0) - before;
      return;
    }
    case 'createToken': {
      const baseCount = resolveAmount(ctx, es, e.count);
      // Beast Within: "Its controller creates ..." (the target's controller, even once it's gone).
      const target = e.forControllerOf !== undefined ? es.targets[e.forControllerOf] : undefined;
      // Strixhaven (13c): Will, Scholar of Frost: an "up to" target left out makes no token.
      if (e.forControllerOf !== undefined && !target) return;
      // Secrets of Strixhaven (14b): Emeritus of Truce, "target player creates".
      const targetOwner =
        target && 'object' in target
          ? ctx.s.objects[target.object.id]?.controller
          : // Atlantis Attacks: "target player creates".
            target && 'player' in target
            ? target.player
            : undefined;
      const owner = targetOwner ?? (e.forOpponent ? other(es.controller) : es.controller);
      // Divine Visitation: creature tokens are 4/4 Angels instead.
      const token0 = replacedToken(ctx, owner, e.token);
      // Strixhaven Brawl (15b, g): Academy Manufactor: a Clue, Food or Treasure is one of each instead.
      const tokenKinds =
        ['treasure-token', 'food-token', 'clue-token'].includes(token0) &&
        ctx.s.battlefield.some(
          (id) =>
            obj(ctx, id).controller === owner &&
            def(ctx, id).abilities.some(
              (a) => a.kind === 'static' && a.effect.kind === 'clueFoodTreasure',
            ),
        )
          ? ['treasure-token', 'food-token', 'clue-token']
          : [token0];
      // Strixhaven Brawl (15a): Anointed Procession doubles the tokens.
      const n = baseCount * tokenMultiplier(ctx, owner);
      for (const token of tokenKinds.flatMap((k) => Array<string>(n).fill(k))) {
        const t = createObject(ctx, token, owner, 'battlefield', true);
        // "Then attach this Equipment to it" (Midnight Angel Armor): the token is "it".
        es.chosen = { id: t.id, zcc: t.zcc };
        if (defOf(ctx, e.token).entersTapped || e.tapped) t.tapped = true;
        if (e.counters) addCounters(ctx, t.id, resolveAmount(ctx, es, e.counters));
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
      // Final Fantasy Commander (12e): Quina, "those tokens plus a 1/1 green Frog".
      if (n > 0 && e.token !== 'frog-token')
        for (const id of ctx.s.battlefield)
          if (obj(ctx, id).controller === owner)
            for (const a of def(ctx, id).abilities)
              if (a.kind === 'static' && a.effect.kind === 'plusFrogToken') {
                const f = createObject(ctx, 'frog-token', owner, 'battlefield', true);
                ctx.s.battlefield.push(f.id);
                emit(ctx, {
                  type: 'objectMoved',
                  id: f.id,
                  defId: f.defId,
                  from: null,
                  to: 'battlefield',
                });
              }
      if (n > 0) plusFoodTokens(ctx, owner);
      return;
    }
    case 'scry':
    case 'surveil':
    case 'searchLibrary':
    case 'lookForCreature':
    case 'takeStudyCard':
    case 'revealTopCastOrPlay':
      return; // handled by runEffects
    // Reality Fracture (17a): Fblthp, Impossibly Lost.
    case 'winGame': {
      const opponent = other(es.controller);
      // "Your opponents can't win" (Angel's Grace): an opponent who can't lose this turn keeps the game going.
      if (ctx.s.winner || ctx.s.turn.cantLose?.includes(opponent)) return;
      // Winning happens before state-based actions: drawing from an empty library first doesn't lose.
      ctx.s.players[es.controller].drewFromEmptyLibrary = false;
      ctx.s.players[opponent].lost = true;
      ctx.s.winner = es.controller;
      ctx.s.decision = { kind: 'gameOver' };
      emit(ctx, { type: 'gameOver', winner: es.controller });
      return;
    }
    // Reality Fracture (17a): Sphinx of False Conclusions.
    case 'tokenCopyOfSource': {
      const t = createObject(ctx, es.sourceDefId, es.controller, 'battlefield', true);
      ctx.s.battlefield.push(t.id);
      emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
      return;
    }
    // Reality Fracture (17a): Sphinx's Approach.
    case 'exileSelfAndSameNameFromGraveyard': {
      const self = es.source && ctx.s.objects[es.source.id];
      if (!self) return;
      const same = ctx.s.players[es.controller].graveyard.filter(
        (id) => id !== self.id && ctx.s.objects[id]!.defId === self.defId,
      );
      if (same.length < e.count) return;
      for (const id of same.slice(0, e.count)) moveObject(ctx, id, 'exile');
      if (self.zone === 'stack') moveObject(ctx, self.id, 'exile');
      return;
    }
    // Reality Fracture (17a): Variable Chaser.
    case 'markHandSwap': {
      const p = e.who === 'controller' ? es.controller : other(es.controller);
      const marked = (ctx.s.turn.handSwap ??= []);
      if (!marked.includes(p)) marked.push(p);
      return;
    }
    case 'handSwap': {
      const marked = ctx.s.turn.handSwap ?? [];
      delete ctx.s.turn.handSwap;
      // Everyone discards, then everyone draws (in turn order).
      for (const p of [ctx.s.turn.activePlayer, other(ctx.s.turn.activePlayer)])
        if (marked.includes(p))
          for (const id of [...ctx.s.players[p].hand]) moveObject(ctx, id, 'graveyard');
      for (const p of [ctx.s.turn.activePlayer, other(ctx.s.turn.activePlayer)])
        if (marked.includes(p)) for (let i = 0; i < e.count; i++) drawCard(ctx, p);
      return;
    }
    case 'returnSelfFromStack': {
      // Strixhaven (13c): Journey to the Oracle.
      const o = es.source && ctx.s.objects[es.source.id];
      if (o && o.zone === 'stack') moveObject(ctx, o.id, 'hand');
      return;
    }
    case 'discard':
    case 'connive':
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
    case 'copyArtifactAbility': {
      // The topmost ability on the stack you control from an artifact source.
      for (let i = ctx.s.stack.length - 1; i >= 0; i--) {
        const item = ctx.s.stack[i]!;
        if (item.kind !== 'ability' || item.controller !== es.controller) continue;
        if (!defOf(ctx, item.sourceDefId).types.includes('Artifact')) continue;
        ctx.s.stack.push({ ...item, id: newId(ctx) });
        return;
      }
      return;
    }
    case 'keywordCountersFrom': {
      const self = es.source && onBattlefield(ctx, es.source);
      const from = objectsOf(ctx, es, e.what)[0];
      if (!self || !from) return;
      for (const k of SUPER_ADAPTOID_KEYWORDS)
        if (hasKeyword(ctx, from, k) && !hasKeyword(ctx, self.id, k))
          (self.counters ??= {})[k] = (self.counters[k] ?? 0) + 1;
      return;
    }
    case 'castFreeFromTop':
    case 'exileUntilTotalCastFree':
    case 'exileCopyCastFree':
      return; // handled by runEffects
    case 'removePlusOneCounters':
      for (const id of objectsOf(ctx, es, e.from)) obj(ctx, id).plusOneCounters = 0;
      return;
    case 'assignToughness':
      ctx.s.turn.toughnessDamage = [...(ctx.s.turn.toughnessDamage ?? []), es.controller];
      return;
    case 'extraTurn':
      ctx.s.extraTurns = [
        { player: es.controller, ...(e.noPowerUp ? { noPowerUp: true } : {}) },
        ...(ctx.s.extraTurns ?? []),
      ];
      return;
    case 'transform':
      for (const id of objectsOf(ctx, es, e.what))
        if (obj(ctx, id).zone === 'battlefield') transform(ctx, id);
      return;
    case 'mill': {
      const players = e.who ? playersOf(ctx, es, e.who) : [es.controller];
      for (const p of players)
        for (const id of ctx.s.players[p].library.slice(
          0,
          millCount(ctx, p, resolveAmount(ctx, es, e.count)),
        ))
          moveObject(ctx, id, 'graveyard');
      return;
    }
    case 'counter': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const item = findSpell(ctx, t.object.id);
      // Final Fantasy (11c): countering an activated or triggered ability (Louisoix's Sacrifice).
      if (!item) {
        const i = ctx.s.stack.findIndex((x) => x.kind === 'ability' && x.id === t.object.id);
        if (i >= 0) {
          ctx.s.stack.splice(i, 1);
          emit(ctx, { type: 'countered', id: t.object.id });
        }
        return;
      }
      const controller = item.controller;
      counterSpell(ctx, item.id);
      if (e.controllerTokens)
        runEffect(ctx, { ...es, controller }, { kind: 'createToken', ...e.controllerTokens });
      return;
    }
    // Strixhaven (13a): Divide by Zero
    case 'returnSpellToHand': {
      const t = typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
      if (!t || !('object' in t)) return;
      const i = ctx.s.stack.findIndex((x) => x.kind === 'spell' && x.id === t.object.id);
      if (i < 0) return;
      ctx.s.stack.splice(i, 1);
      moveObject(ctx, t.object.id, 'hand');
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
      // Final Fantasy (11c): "except it's a 5/5" (Ardyn).
      if (e.pt) token.copyPT = { power: e.pt[0], toughness: e.pt[1] };
      ctx.s.battlefield.push(token.id);
      emit(ctx, {
        type: 'objectMoved',
        id: token.id,
        defId: token.defId,
        from: null,
        to: 'battlefield',
      });
      plusFoodTokens(ctx, es.controller); // Tippy-Toe
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
    case 'bounce': {
      const ids = objectsOf(ctx, es, e.what);
      for (const id of ids) moveObject(ctx, id, 'hand');
      // Bob, Reluctant HYDRA Agent: "if you do".
      if (ids.length) for (const x of e.then ?? []) runEffect(ctx, es, x);
      return;
    }
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
    // Secrets of Strixhaven (14a): prepare
    case 'prepare':
      for (const id of objectsOf(ctx, es, e.what)) prepareObject(ctx, id);
      return;
    case 'unprepare':
      for (const id of objectsOf(ctx, es, e.what)) unprepareObject(ctx, id);
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
      // A target card, or (Marvel Super Heroes) the card that triggered it ("return it").
      const t =
        typeof e.what === 'object' && 'target' in e.what
          ? es.targets[e.what.target]
          : e.what === 'subject' && es.subject
            ? { object: es.subject }
            : null;
      if (!t || !('object' in t)) return;
      const o = ctx.s.objects[t.object.id];
      if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
      // Reality Fracture (17a): Ferocity of the Hunt, "under its owner's control".
      moveObject(ctx, o.id, 'battlefield', { controller: e.underOwner ? o.owner : es.controller });
      if (e.tapped) o.tapped = true;
      if (e.tapped) o.tapped = true;
      // Grim Reaper: "tapped and attacking" (never declared, so no attack triggers).
      if (e.attacking && ctx.s.combat && obj(ctx, o.id).zone === 'battlefield') {
        o.tapped = true;
        const self = es.source && ctx.s.combat.attackers.find((a) => a.id === es.source!.id);
        ctx.s.combat.attackers.push({
          id: o.id,
          defender: self?.defender ?? other(es.controller),
          ...(self?.planeswalker ? { planeswalker: self.planeswalker } : {}),
          blocked: false,
          blockers: [],
        });
      }
      if (e.counter) (o.counters ??= {})[e.counter] = 1;
      if (e.addSubtype) o.addedSubtypes = [...(o.addedSubtypes ?? []), e.addSubtype];
      // Heroic Return, Winter Soldier: "if a Hero enters this way, it enters with counters".
      if (e.countersIf && cardMatches(ctx, o.id, e.countersIf.filter))
        addCounters(ctx, o.id, e.countersIf.count);
      // "That creature" for the effects after it (Coiling Rebirth).
      es.chosen = { id: o.id, zcc: o.zcc };
      return;
    }
    // Avengers Assemble (9b).
    case 'exileTopWithSource': {
      const self = es.source && ctx.s.objects[es.source.id];
      const from = e.who === 'eachOpponent' ? other(es.controller) : es.controller;
      for (const id of ctx.s.players[from].library.slice(0, e.count)) {
        moveObject(ctx, id, 'exile');
        if (self) self.exiledWith = [...(self.exiledWith ?? []), id];
        if (e.castable) {
          obj(ctx, id).castableBy = es.controller;
          obj(ctx, id).anyMana = true;
        }
      }
      return;
    }
    case 'redirectDamage':
      for (const id of objectsOf(ctx, es, e.to))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          redirectFor: es.controller,
          ...(e.onDies
            ? {
                onDies: {
                  effects: e.onDies,
                  controller: es.controller,
                  sourceDefId: es.sourceDefId,
                },
              }
            : {}),
          expires: 'endOfTurn',
        });
      return;
    case 'phaseOut':
      phaseOut(ctx, objectsOf(ctx, es, e.what));
      return;
    case 'returnEnchantedThenAura': {
      // Gift of Immortality: the creature it was on comes back, then the Aura follows at the next end step.
      const aura = es.source && ctx.s.objects[es.source.id];
      const was = aura?.lastAttachedTo;
      const card = was && ctx.s.objects[was.id];
      if (!aura || !card || card.zone !== 'graveyard' || card.zcc !== was.zcc + 1) return;
      moveObject(ctx, card.id, 'battlefield');
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: { id: card.id, zcc: card.zcc },
        effects: [{ kind: 'returnAuraTo', aura: { id: aura.id, zcc: aura.zcc } }],
        fromTurn: ctx.s.turn.number,
      });
      return;
    }
    case 'returnAuraTo': {
      const aura = ctx.s.objects[e.aura.id];
      const host = es.subject && onBattlefield(ctx, es.subject);
      if (!aura || aura.zone !== 'graveyard' || aura.zcc !== e.aura.zcc || !host) return;
      moveObject(ctx, aura.id, 'battlefield', { controller: aura.owner });
      aura.attachedTo = host.id;
      return;
    }
    // Doom Prevails (9e).
    case 'chaosWarp':
      for (const id of objectsOf(ctx, es, e.what)) {
        const owner = obj(ctx, id).owner;
        moveObject(ctx, id, 'library');
        shuffleInPlace(ctx.s.rng, ctx.s.players[owner].library);
        const top = ctx.s.players[owner].library[0];
        if (!top) continue;
        emit(ctx, { type: 'revealed', player: owner, id: top });
        if (def(ctx, top).types.some((t) => PERMANENT_TYPES.includes(t)))
          moveObject(ctx, top, 'battlefield', { controller: owner });
      }
      return;
    case 'exileTopsPlayableFree':
      for (const p of ['p1', 'p2'] as const) {
        const top = ctx.s.players[p].library[0];
        if (!top) continue;
        moveObject(ctx, top, 'exile');
        obj(ctx, top).playFreeBy = es.controller;
      }
      return;
    case 'exileTopPlayableUntilNext': {
      // Superior Foes: the card exiled before stops being playable.
      const self = es.source && onBattlefield(ctx, es.source);
      const top = ctx.s.players[es.controller].library[0];
      if (!self || !top) return;
      for (const id of self.exiledWith ?? []) {
        const o = ctx.s.objects[id];
        if (o?.zone === 'exile') delete o.playableUntilTurn;
      }
      moveObject(ctx, top, 'exile');
      obj(ctx, top).playableUntilTurn = Number.MAX_SAFE_INTEGER;
      self.exiledWith = [top];
      return;
    }
    case 'suspend': {
      let card: ObjectId | undefined;
      if (e.what === 'nextNonlandFromLibrary') {
        // Kang Prime: exile until a nonland card; the lands stay in exile.
        for (const id of [...ctx.s.players[es.controller].library]) {
          moveObject(ctx, id, 'exile');
          if (!def(ctx, id).types.includes('Land')) {
            card = id;
            break;
          }
        }
      } else {
        card = (() => {
          const t =
            typeof e.what === 'object' && 'target' in e.what ? es.targets[e.what.target] : null;
          const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
          return o?.zone === 'graveyard' ? o.id : undefined;
        })();
        if (card) moveObject(ctx, card, 'exile');
      }
      if (!card) return;
      const o = obj(ctx, card);
      o.suspended = true;
      o.counters = { ...o.counters, time: e.time };
      return;
    }
    case 'unearth': {
      // The source returns with haste; it's exiled at the next end step, or instead of dying.
      const card = es.source && ctx.s.objects[es.source.id];
      if (!card || card.zone !== 'graveyard') return;
      moveObject(ctx, card.id, 'battlefield', { controller: es.controller });
      card.grantedKeywords = ['haste'];
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: card.id, zcc: card.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        exileIfDies: true,
        expires: 'untilYourNextTurn',
        player: es.controller,
      });
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: { id: card.id, zcc: card.zcc },
        effects: [{ kind: 'exile', what: 'subject' }],
        fromTurn: ctx.s.turn.number,
      });
      return;
    }
    case 'converterReturn': {
      // Currency Converter: the oldest card exiled with it.
      const self = es.source && onBattlefield(ctx, es.source);
      const card = (self?.exiledWith ?? []).find((id) => ctx.s.objects[id]?.zone === 'exile');
      if (!self || !card) return;
      self.exiledWith = self.exiledWith!.filter((id) => id !== card);
      const land = def(ctx, card).types.includes('Land');
      moveObject(ctx, card, 'graveyard');
      runEffect(ctx, es, {
        kind: 'createToken',
        token: land ? 'treasure-token' : 'rogue-2-2-token',
        count: 1,
      });
      return;
    }
    case 'ladyLoki': {
      // The spell that triggered it is exiled; then cascade-like: the next nonland card.
      const spell = es.subject && ctx.s.objects[es.subject.id];
      if (!spell || spell.zone !== 'stack') return;
      const mv = manaValue(def(ctx, spell.id).manaCost);
      const i = ctx.s.stack.findIndex((x) => x.id === spell.id);
      if (i >= 0) ctx.s.stack.splice(i, 1);
      moveObject(ctx, spell.id, 'exile');
      let hit: ObjectId | undefined;
      for (const id of [...ctx.s.players[es.controller].library]) {
        moveObject(ctx, id, 'exile');
        if (!def(ctx, id).types.includes('Land')) {
          hit = id;
          break;
        }
      }
      if (!hit) return;
      const diff = Math.abs(mv - manaValue(def(ctx, hit).manaCost));
      runEffect(ctx, es, { kind: 'damage', amount: diff, to: 'eachOpponent' });
      ctx.s.pendingTriggers.push({
        source: es.source ?? { id: hit, zcc: obj(ctx, hit).zcc },
        sourceDefId: es.sourceDefId,
        abilityIndex: -1,
        controller: es.controller,
        inline: [{ kind: 'castFreeCard', card: { id: hit, zcc: obj(ctx, hit).zcc } }],
      });
      return;
    }
    case 'focus':
      es.chosen = e.on;
      return;
    case 'exiledWithSourceToHand': {
      const self = es.source && ctx.s.objects[es.source.id];
      for (const id of self?.exiledWith ?? [])
        if (ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
      return;
    }
    case 'conniveConvokers':
      return; // handled by runEffects
    case 'exileDiscarded': {
      const card = es.subject && ctx.s.objects[es.subject.id];
      if (!card || card.zone !== 'graveyard' || card.zcc !== es.subject!.zcc) return;
      moveObject(ctx, card.id, 'exile');
      // Moonstone: until the end of your next turn.
      if (e.playable === 'untilEndOfNextTurn')
        card.playableUntilTurn =
          ctx.s.turn.number + (ctx.s.turn.activePlayer === es.controller ? 2 : 1);
      else if (e.playable) card.playableUntilTurn = ctx.s.turn.number;
      const self = e.track && es.source ? onBattlefield(ctx, es.source) : undefined;
      if (self) self.exiledWith = [...(self.exiledWith ?? []), card.id];
      return;
    }
    case 'flashForChosenType': {
      const self = es.source && onBattlefield(ctx, es.source);
      if (self?.chosenType)
        (ctx.s.turn.flashTypes ??= []).push({ player: es.controller, type: self.chosenType });
      return;
    }
    // The Fantastic Four (9d).
    case 'afterReveal': {
      // Cascade declined: to the bottom. Discover declined: into your hand.
      const o = ctx.s.objects[e.card.id];
      if (!o || o.zone !== 'exile' || o.zcc !== e.card.zcc) return;
      if (e.to === 'hand') moveObject(ctx, o.id, 'hand');
      else moveObject(ctx, o.id, 'library', { position: 'bottom' });
      return;
    }
    case 'afterExpressive': {
      // Of the two left on top: the first is exiled (playable this turn), the other goes to the bottom.
      const lib = ctx.s.players[es.controller].library;
      const rest = e.cards.filter((id) => lib.includes(id));
      if (rest[0]) {
        moveObject(ctx, rest[0], 'exile');
        obj(ctx, rest[0]).playableUntilTurn = ctx.s.turn.number;
      }
      if (rest[1]) moveObject(ctx, rest[1], 'library', { position: 'bottom' });
      return;
    }
    // Strixhaven (13a): Lorehold Apprentice
    case 'grantAbility':
      for (const id of objectsOf(ctx, es, e.to)) {
        const o = obj(ctx, id);
        if (o.zone !== 'battlefield') continue;
        const key = JSON.stringify(e.ability);
        // Reality Fracture (17a): Lyra, Tolarian Archangel: each activation grants its own ability.
        if (e.stacking || !o.tempAbilities?.some((a) => JSON.stringify(a) === key))
          o.tempAbilities = [...(o.tempAbilities ?? []), e.ability];
      }
      return;
    // Strixhaven (13a): Academic Dispute
    case 'mustBlock':
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          mustBlock: true,
          expires: 'endOfTurn',
        });
      return;
    case 'mustAttack':
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          mustAttack: true,
          ...(e.cantBlock ? { cantBlock: true } : {}),
          ...(e.draws ? { drawsFor: es.controller } : {}),
          expires: 'untilYourNextTurn',
          player: es.controller,
        });
      return;
    case 'explore':
      for (const id of objectsOf(ctx, es, e.what)) {
        const top = ctx.s.players[es.controller].library[0];
        if (!top) continue;
        emit(ctx, { type: 'revealed', player: es.controller, id: top });
        // A nonland card stays on top (a simplification: never into the graveyard).
        if (def(ctx, top).types.includes('Land')) moveObject(ctx, top, 'hand');
        else addCounters(ctx, id, 1);
      }
      return;
    case 'copyTopTrigger': {
      const top = [...ctx.s.stack]
        .reverse()
        .find((x) => x.kind === 'ability' && x.controller === es.controller && !x.activated);
      if (!top) return;
      for (let i = 0; i < e.count; i++) ctx.s.stack.push({ ...top, id: newId(ctx) });
      return;
    }
    case 'becomeCopy': {
      const source = es.source && onBattlefield(ctx, es.source);
      const of = objectsOf(ctx, es, e.of)[0];
      // Strixhaven (13c): Echoing Equation (and Loki, Lord of Misrule): a group (without the one copied) becomes the copy.
      const selves = (
        e.what ? objectsOf(ctx, es, e.what).filter((id) => id !== of) : source ? [source.id] : []
      ).map((id) => ctx.s.objects[id]);
      for (const self of selves) {
        if (!self || self.zone !== 'battlefield' || !of) continue;
        endCopy(ctx, self);
        self.originalDefId ??= self.defId;
        self.defId = obj(ctx, of).defId;
        if (obj(ctx, of).copyPT) self.copyPT = { ...obj(ctx, of).copyPT! };
        // Marvel Super Heroes: longer copies, and copies that stay creatures.
        if (e.until === 'yourNextTurn') self.copyUntilTurnOf = es.controller;
        else if (e.until === 'whileSource' && source) self.copyWhileSource = source.id;
        else self.copyingUntilTurn = ctx.s.turn.number;
        if (e.nonlegendary && !self.nonlegendary) {
          self.nonlegendary = true;
          self.copyNonlegendary = true;
        }
        // Marvel Super Heroes Jumpstart (Tricksters): keeps its name (Impossible Man).
        if (e.keepName) self.copyKeepsName = true;
        // Marvel Super Heroes Jumpstart (Young Avengers): "and he has this ability" (Hulkling).
        if (e.keepAbilities) self.copyKeptAbilities = e.keepAbilities;
        if (e.asCreature) {
          self.copyAsCreature = true;
          self.copyPT = { power: e.asCreature.power, toughness: e.asCreature.toughness };
          self.grantedKeywords = [...(self.grantedKeywords ?? []), ...e.asCreature.keywords];
          self.copyAddedSubtypes = e.asCreature.subtypes;
          self.addedSubtypes = [...(self.addedSubtypes ?? []), ...e.asCreature.subtypes];
        }
      }
      return;
    }
    case 'keepOneOfEachType':
      for (const p of ['p1', 'p2'] as const) {
        const theirs = ctx.s.battlefield.filter(
          (id) => obj(ctx, id).controller === p && !def(ctx, id).types.includes('Land'),
        );
        // The caster keeps their best of each type, and leaves the opponent their worst.
        const byValue = [...theirs].sort(
          (a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost),
        );
        if (p !== es.controller) byValue.reverse();
        const keep = new Set<ObjectId>();
        for (const type of ['Artifact', 'Creature', 'Enchantment', 'Planeswalker'] as const) {
          const pick = byValue.find((id) => !keep.has(id) && def(ctx, id).types.includes(type));
          if (pick) keep.add(pick);
        }
        for (const id of theirs) if (!keep.has(id)) sacrifice(ctx, id);
      }
      return;
    case 'promiseOfLoyalty':
      for (const p of ['p1', 'p2'] as const) {
        const theirs = creaturesOnBattlefield(ctx, p).map((c) => c.id);
        const best = [...theirs].sort((a, b) => power(ctx, b) - power(ctx, a))[0];
        for (const id of theirs) if (id !== best) sacrifice(ctx, id);
        if (best) {
          const o = obj(ctx, best);
          o.vowedTo = es.controller;
          o.counters = { ...o.counters, vow: 1 };
        }
      }
      return;
    case 'exileRandomToCastNextUpkeep': {
      const gy = ctx.s.players[es.controller].graveyard.filter((id) =>
        cardMatches(ctx, id, e.filter),
      );
      if (gy.length === 0) return;
      const id = gy[nextInt(ctx.s.rng, gy.length)]!;
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: { id, zcc: o.zcc },
        effects: [{ kind: 'castFreeCard', card: { id, zcc: o.zcc }, exileAfter: true }],
        fromTurn: ctx.s.turn.number + 1,
        whose: es.controller,
        at: 'upkeep',
      });
      return;
    }
    case 'ownersRegainControl':
      for (const id of ctx.s.battlefield) {
        const o = obj(ctx, id);
        if (o.controller !== o.owner && def(ctx, id).types.includes('Creature')) {
          o.controller = o.owner;
          delete o.controlledBy;
        }
      }
      return;
    case 'negativeZoneFlip': {
      const self = es.source && onBattlefield(ctx, es.source);
      if (!self) return;
      const exiled = (self.exiledWith ?? []).filter((id) => ctx.s.objects[id]?.zone === 'exile');
      const creatures = exiled.filter((id) => def(ctx, id).types.includes('Creature'));
      if (creatures.length < 4 || nextInt(ctx.s.rng, 2) === 0) return;
      sacrifice(ctx, self.id);
      const back = exiled[nextInt(ctx.s.rng, exiled.length)];
      if (back) moveObject(ctx, back, 'hand');
      return;
    }
    case 'lookPutPermanents':
      // Genesis Ultimatum: every permanent card onto the battlefield (they're all worth it).
      for (const id of ctx.s.players[es.controller].library.slice(0, e.count)) {
        const d = def(ctx, id);
        const permanent = d.types.some((t) => PERMANENT_TYPES.includes(t));
        moveObject(ctx, id, permanent ? 'battlefield' : 'hand', { controller: es.controller });
      }
      return;
    // Wakanda Forever (9c).
    case 'becomeMonarch':
      setMonarch(ctx, e.who === 'controller' ? es.controller : other(es.controller));
      return;
    case 'exileUntilOpponentMonarch':
      for (const id of objectsOf(ctx, es, e.what)) {
        moveObject(ctx, id, 'exile');
        const o = ctx.s.objects[id];
        if (o) o.jailedBy = es.controller;
      }
      return;
    case 'monstrosity': {
      const self = es.source && onBattlefield(ctx, es.source);
      if (!self || self.monstrous) return;
      addCounters(ctx, self.id, e.amount);
      self.monstrous = true;
      return;
    }
    case 'whenDiesThisTurn':
      for (const id of objectsOf(ctx, es, e.what))
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: obj(ctx, id).zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          onDies: { effects: e.effects, controller: es.controller, sourceDefId: es.sourceDefId },
          expires: 'endOfTurn',
        });
      return;
    case 'giveControl':
      for (const id of objectsOf(ctx, es, e.what)) {
        const o = obj(ctx, id);
        o.controller = other(es.controller);
        untap(ctx, id);
      }
      return;
    case 'castFromGraveyardThisTurn':
      for (const t of es.targets) {
        if (!t || !('object' in t)) continue;
        const o = ctx.s.objects[t.object.id];
        if (o?.zone === 'graveyard' && o.zcc === t.object.zcc)
          o.playableUntilTurn = ctx.s.turn.number;
      }
      return;
    case 'atNextUpkeep':
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: es.source ?? { id: '', zcc: 0 },
        effects: e.effects,
        fromTurn: ctx.s.turn.number + 1,
        at: 'upkeep',
      });
      return;
    case 'exileTopPlayable': {
      const lib = ctx.s.players[es.controller].library;
      const ownTurn = ctx.s.turn.activePlayer === es.controller;
      const until =
        e.until === 'endOfTurn'
          ? ctx.s.turn.number
          : // Marvel Super Heroes Jumpstart (Scarlet): until your next end step (this turn's if it's still ahead).
            e.until === 'yourNextEndStep'
            ? ctx.s.turn.number +
              (ownTurn ? (ctx.s.turn.step === 'end' || ctx.s.turn.step === 'cleanup' ? 2 : 0) : 1)
            : ctx.s.turn.number + (ownTurn ? 2 : 1);
      for (const id of lib.slice(0, resolveAmount(ctx, es, e.count))) {
        moveObject(ctx, id, 'exile');
        obj(ctx, id).playableUntilTurn = until;
        if (e.until === 'yourNextEndStep') obj(ctx, id).playableBeforeEndStep = true;
        if (e.ifExiled && cardMatches(ctx, id, e.ifExiled.filter))
          for (const then of e.ifExiled.then) runEffect(ctx, es, then);
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
    case 'revealPutAndTake':
    case 'pickFromCards':
      return; // handled by runEffects
    case 'proliferate': // Reality Fracture (17a)
    case 'chooseColor':
    case 'chooseCreatureType':
    case 'learn':
    case 'millThenTake':
    case 'lookTakeRestGraveyard':
    case 'graveyardCardToLibraryBottom': // Strixhaven (13c)
    case 'discardAnyThenDraw':
    case 'lookTakeLandAndSpell':
    case 'payOrElse':
      return; // handled by runEffects
    case 'copySpell': {
      // The triggering spell, or a target spell.
      const ref =
        e.what === 'subject'
          ? es.subject
          : typeof e.what === 'object' && 'target' in e.what
            ? (() => {
                const t = es.targets[e.what.target];
                return t && 'object' in t ? t.object : undefined;
              })()
            : undefined;
      const item = ref ? findSpell(ctx, ref.id) : undefined;
      if (!item) return;
      // Secrets of Strixhaven (14b): "This spell can't be copied."
      if (defOf(ctx, obj(ctx, item.id).defId).cantBeCopied) return;
      const n = e.count !== undefined ? resolveAmount(ctx, es, e.count) : 1;
      // Ancestral Communion: the copies take other legal targets where there are any.
      const spec = spellOnStack(defOf(ctx, obj(ctx, item.id).defId), item)?.targets ?? [];
      const others = e.retarget
        ? targetCombos(ctx, spec, { controller: es.controller, sourceId: item.id }).filter(
            (c) => JSON.stringify(c) !== JSON.stringify(item.targets),
          )
        : [];
      for (let i = 0; i < n; i++) {
        // A copy is a token-like object on the stack: it ceases to exist as it leaves.
        const copy = createObject(ctx, obj(ctx, item.id).defId, es.controller, 'stack', true);
        copy.controller = es.controller;
        // Strixhaven (13c): Double Major.
        if (e.nonlegendary) copy.nonlegendary = true;
        ctx.s.stack.push({
          kind: 'spell',
          id: copy.id,
          controller: es.controller,
          targets: others[i] ?? item.targets,
          ...(item.mode !== undefined ? { mode: item.mode } : {}),
          ...(item.kicked ? { kicked: true } : {}),
          ...(item.x ? { x: item.x } : {}),
          ...(item.paws ? { paws: item.paws } : {}),
          copy: true,
          ...(e.hasteSacrifice ? { hasteSacrifice: true } : {}),
        });
        // Strixhaven (13a): magecraft.
        emit(ctx, { type: 'spellCopied', id: copy.id, player: es.controller });
        // Loki Laufeyson: the copy whose targets may change next.
        if (e.newTargets) es.chosen = { id: copy.id, zcc: copy.zcc };
      }
      return;
    }
    case 'eachPlayerSacrifices':
    case 'repeat':
    case 'sacrificeSeveral':
    case 'castFree':
    case 'portent':
    case 'exileUntilNonlandCastByDiscard':
      return; // handled by runEffects
    case 'osteomancer':
      (ctx.s.turn.osteomancer ??= []).push(es.controller);
      return;
    case 'dragonhawkExile': {
      const ownTurn = ctx.s.turn.activePlayer === es.controller;
      const n = resolveAmount(ctx, es, e.count);
      const cards: ObjectRef[] = [];
      for (const id of ctx.s.players[es.controller].library.slice(0, n)) {
        moveObject(ctx, id, 'exile');
        // "Until your next end step": this turn on your turn, else your next one.
        obj(ctx, id).playableUntilTurn = ctx.s.turn.number + (ownTurn ? 0 : 1);
        cards.push({ id, zcc: obj(ctx, id).zcc });
      }
      if (cards.length === 0) return;
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: es.source ?? cards[0]!,
        effects: [{ kind: 'damagePerExiled', cards, amount: e.damage }],
        fromTurn: ctx.s.turn.number + (ownTurn && ctx.s.turn.step !== 'end' ? 0 : 1),
        whose: es.controller,
      });
      return;
    }
    case 'damagePerExiled': {
      const still = e.cards.filter((c) => {
        const o = ctx.s.objects[c.id];
        return o?.zone === 'exile' && o.zcc === c.zcc;
      }).length;
      const src = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
      dealDamage(ctx, src, { player: other(es.controller) }, still * e.amount, false);
      return;
    }
    case 'emblem': {
      const ownTurn = ctx.s.turn.activePlayer === es.controller;
      // Marvel Super Heroes Jumpstart (Tricksters): only creatures with the chosen name (The Clone Saga).
      let ability = e.ability;
      if (e.namedLike || e.named) {
        const like = e.namedLike ? objectsOf(ctx, es, e.namedLike)[0] : undefined;
        const named = e.named ?? (like ? obj(ctx, like).defId : undefined);
        const t = ability.kind === 'triggered' ? ability.trigger : undefined;
        if (!named || t?.on !== 'creatureYouControlDealsCombatDamage') return;
        ability = {
          ...ability,
          trigger: { ...t, filter: { ...t.filter, named } },
        } as AbilityDef;
      }
      (ctx.s.emblems ??= []).push({
        controller: es.controller,
        source: es.source ?? { id: 'emblem', zcc: 0 },
        sourceDefId: es.sourceDefId,
        ability,
        ...(e.until === 'endOfYourNextTurn'
          ? { untilTurn: ctx.s.turn.number + (ownTurn ? 2 : 1) }
          : {}),
        // Galvanic Iteration: "when you next cast an instant or sorcery spell this turn".
        ...(e.until === 'nextSpellThisTurn' ? { untilTurn: ctx.s.turn.number, once: true } : {}),
        // Final Fantasy (11c): "until end of turn" (Summon: Leviathan); Strixhaven (13c): First Day of Class.
        ...(e.until === 'endOfTurn' ? { untilTurn: ctx.s.turn.number } : {}),
      });
      return;
    }
    // Strixhaven (13b): Maelstrom Muse
    case 'nextSpellCostsLess': {
      const amount = resolveAmount(ctx, es, e.amount);
      if (amount > 0)
        ctx.s.players[es.controller].nextSpellDiscount = { turn: ctx.s.turn.number, amount };
      return;
    }
    case 'giftGiven':
      emit(ctx, { type: 'giftGiven', player: es.controller });
      return;
    case 'tokenCopy': {
      const n = e.count !== undefined ? resolveAmount(ctx, es, e.count) : 1;
      // Secrets of Strixhaven (14b): Echocasting Symposium: the token is created under a target player's control.
      const tokenOwnerTarget = e.underTarget !== undefined ? es.targets[e.underTarget] : undefined;
      const tokenOwner =
        tokenOwnerTarget && 'player' in tokenOwnerTarget ? tokenOwnerTarget.player : es.controller;
      let made = false;
      for (const id of objectsOf(ctx, es, e.of)) {
        const o = obj(ctx, id);
        const d = def(ctx, id);
        if (e.nonlegendary && d.supertypes.includes('Legendary')) continue;
        for (let i = 0; i < n; i++) {
          // Reality Fracture (17a): Draconic Visitor: a copy of an artifact is an artifact token, so a Dragon instead.
          const dragon = artifactTokenReplacement(ctx, tokenOwner, o.defId);
          if (dragon) {
            const t = createObject(ctx, dragon, tokenOwner, 'battlefield', true);
            ctx.s.battlefield.push(t.id);
            emit(ctx, {
              type: 'objectMoved',
              id: t.id,
              defId: t.defId,
              from: null,
              to: 'battlefield',
            });
            made = true;
            continue;
          }
          const t = createObject(ctx, o.defId, tokenOwner, 'battlefield', true);
          const pt = e.pt ?? (o.copyPT ? [o.copyPT.power, o.copyPT.toughness] : undefined);
          if (pt) t.copyPT = { power: pt[0], toughness: pt[1] };
          // "Except the token isn't legendary" (Quantum Misalignment); "that token gains haste" (Helm of the Host).
          if (e.notLegendary) t.nonlegendary = true;
          if (e.haste) t.grantedKeywords = ['haste'];
          if (e.addSubtype) t.addedSubtypes = [e.addSubtype];
          // Living Laser, Loki: "tapped and attacking".
          if (e.attacking && ctx.s.combat) {
            t.tapped = true;
            ctx.s.combat.attackers.push({
              id: t.id,
              defender: other(es.controller),
              blocked: false,
              blockers: [],
            });
          }
          // Secrets of Strixhaven (14b): Applied Geometry: a 0/0 Fractal creature in addition, with counters.
          if (e.asFractal !== undefined) {
            ctx.s.effects.push({
              timestamp: newTimestamp(ctx),
              affected: { id: t.id, zcc: t.zcc },
              power: 0,
              toughness: 0,
              keywords: [],
              becomesCreature: true,
              basePT: [0, 0],
              expires: 'permanent',
            });
            t.addedSubtypes = [...(t.addedSubtypes ?? []), 'Fractal'];
          }
          ctx.s.battlefield.push(t.id);
          emit(ctx, {
            type: 'objectMoved',
            id: t.id,
            defId: t.defId,
            from: null,
            to: 'battlefield',
          });
          if (e.asFractal) addCounters(ctx, t.id, e.asFractal);
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
          // Final Fantasy (11c): temporary token copies.
          if (e.equipDiscount) t.equipDiscount = e.equipDiscount;
          // Reality Fracture (17a): Face Yourself: "except it has ...".
          if (e.grantAbilities) t.perpetualAbilities = [...e.grantAbilities];
          if (e.sacrificeAt) {
            const late = ['end', 'cleanup'].includes(ctx.s.turn.step);
            const ownTurn = ctx.s.turn.activePlayer === es.controller;
            (ctx.s.delayed ??= []).push({
              controller: es.controller,
              sourceDefId: es.sourceDefId,
              subject: { id: t.id, zcc: t.zcc },
              effects: [{ kind: 'sacrifice', what: 'subject' }],
              ...(e.sacrificeAt === 'nextUpkeep'
                ? { fromTurn: ctx.s.turn.number + 1, at: 'upkeep' as const }
                : e.sacrificeAt === 'yourNextEndStep'
                  ? {
                      fromTurn: ctx.s.turn.number + (ownTurn && !late ? 0 : ownTurn ? 2 : 1),
                      whose: es.controller,
                    }
                  : { fromTurn: ctx.s.turn.number + (late ? 1 : 0) }),
            });
          }
          const chapters = defOf(ctx, t.defId).saga;
          if (e.lore && chapters)
            for (let k = 0; k < Math.min(e.lore, chapters - 1); k++) addLore(ctx, t.id);
          made = true;
        }
      }
      // Tippy-Toe: one Food for the token copies this effect made.
      if (made) plusFoodTokens(ctx, tokenOwner);
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
      const types = def(ctx, top).types;
      const permanent = types.some((t) => PERMANENT_TYPES.includes(t));
      if (e.permanent ? permanent : types.includes('Land')) {
        moveObject(ctx, top, 'battlefield', { controller: es.controller });
        if (!e.permanent) obj(ctx, top).tapped = true;
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
          pool.push({
            produces,
            ...(e.untilEndOfTurn ? { untilEndOfTurn: true } : {}),
            // Secrets of Strixhaven (14b): "Spend this mana only to cast instant and sorcery spells."
            ...(e.onlyFor ? { onlyFor: e.onlyFor } : {}),
          });
      return;
    }
    case 'discardHand':
      for (const id of [...ctx.s.players[es.controller].hand]) moveObject(ctx, id, 'graveyard');
      return;
    // Marvel Super Heroes Jumpstart (Kang Dynasty): Immortus, Master of Eternity.
    case 'shuffleHandAndGraveyardIntoLibrary':
      for (const p of playersOf(ctx, es, e.who)) {
        const ps = ctx.s.players[p];
        for (const id of [...ps.hand, ...ps.graveyard]) moveObject(ctx, id, 'library');
        shuffleInPlace(ctx.s.rng, ps.library);
      }
      return;
    case 'exileUntilEndStep': {
      const step = ctx.s.turn.step;
      const fromTurn = ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0);
      // Marvel Super Heroes Jumpstart (Blink): Silver Surfer, "return those cards" (one trigger, together).
      if (e.together) {
        const cards: ObjectRef[] = [];
        for (const id of objectsOf(ctx, es, e.what)) {
          const token = obj(ctx, id).isToken;
          moveObject(ctx, id, 'exile');
          if (!token && ctx.s.objects[id]) cards.push({ id, zcc: obj(ctx, id).zcc });
        }
        if (cards.length && es.source)
          (ctx.s.delayed ??= []).push({
            controller: es.controller,
            sourceDefId: es.sourceDefId,
            subject: es.source,
            effects: [
              { kind: 'returnExiledCards', cards, ...(e.landsTapped ? { landsTapped: true } : {}) },
            ],
            fromTurn,
          });
        return;
      }
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
              ...(e.loyaltyToo ? { loyaltyToo: true } : {}),
            },
          ],
          fromTurn,
        });
      }
      return;
    }
    // Marvel Super Heroes Jumpstart (Blink)
    case 'returnExiledCards': {
      const back = e.cards.flatMap((r) => {
        const o = ctx.s.objects[r.id];
        return o && o.zone === 'exile' && o.zcc === r.zcc ? [o] : [];
      });
      for (const o of back) {
        moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
        if (e.landsTapped && def(ctx, o.id).types.includes('Land')) obj(ctx, o.id).tapped = true;
      }
      return;
    }
    case 'returnSubject': {
      const o = es.subject && ctx.s.objects[es.subject.id];
      if (!o || o.zone !== 'exile' || o.zcc !== es.subject!.zcc) return;
      moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
      // Strixhaven (13c): Semester's End, a planeswalker gets a loyalty counter instead of a +1/+1 counter.
      if (e.loyaltyToo && def(ctx, o.id).types.includes('Planeswalker'))
        addCounters(ctx, o.id, 1, 'loyalty');
      else if (e.counters) addCounters(ctx, o.id, e.counters);
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
        // Final Fantasy (11a): "return it to the battlefield transformed".
        moveObject(ctx, id, 'battlefield', {
          controller: owner,
          ...(e.transformed ? { transformed: true } : {}),
        });
        if (e.tapped) obj(ctx, id).tapped = true;
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
          // Reality Fracture (17a): Identity Echo puts it onto the battlefield untapped.
          if (e.to === 'battlefieldTapped') obj(ctx, found).tapped = true;
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
      for (const id of [...objectsOf(ctx, es, e.what), ...fromGraveyard]) {
        const owner = obj(ctx, id).owner;
        moveObject(ctx, id, 'library', { position: e.position });
        // Final Fantasy (11b): "shuffles it into their library" (a token just ceases to exist).
        if (e.shuffle) shuffleInPlace(ctx.s.rng, ctx.s.players[owner].library);
      }
      return;
    }
    case 'gainControl':
      for (const id of objectsOf(ctx, es, e.what)) {
        const o = obj(ctx, id);
        if (o.controller === es.controller) continue;
        // Strixhaven (13c): Tempted by the Oriq, control for good.
        if (e.permanent) {
          o.controller = es.controller;
          o.summoningSick = true;
          continue;
        }
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: o.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          previousController: o.controller,
          ...(e.unattachOnRevert ? { unattachOnRevert: true } : {}),
          ...(e.whileSource && es.source
            ? { expires: 'whileSource' as const, whileSourceId: es.source.id }
            : e.untilYourNextTurn
              ? { expires: 'untilYourNextTurn' as const, player: es.controller }
              : { expires: 'endOfTurn' as const }),
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
          ...(e.whileSource && es.source
            ? { expires: 'whileSource' as const, whileSourceId: es.source.id }
            : // Reality Fracture (17a): Flourishing Grapple.
              e.untilEndOfTurn
              ? { expires: 'endOfTurn' as const }
              : { expires: 'untilYourNextTurn' as const }),
          player: es.controller,
        });
        o.blank = true;
      }
      return;
    case 'returnSource': {
      // Only the same card, still in the graveyard it went to (or in exile: Mister Immortal).
      const o = es.source && ctx.s.objects[es.source.id];
      if (!o || (o.zone !== 'graveyard' && o.zone !== 'exile') || o.zcc !== es.source!.zcc) return;
      if (e.to === 'hand') return moveObject(ctx, o.id, 'hand');
      // Strixhaven (13b): Bookwurm.
      if (e.to === 'libraryThird') {
        moveObject(ctx, o.id, 'library');
        const lib = ctx.s.players[o.owner].library;
        if (lib.length > 3 && lib[0] === o.id) {
          lib.shift();
          lib.splice(2, 0, o.id);
        }
        return;
      }
      // Final Fantasy (11b): returned transformed (Garland).
      moveObject(ctx, o.id, 'battlefield', {
        controller: o.owner,
        ...(e.transformed ? { transformed: true } : {}),
      });
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
      if (e.named) (o.counters ??= {})[e.named] = 1;
      // Hellcat: "She loses all abilities and gains haste" for as long as she stays.
      if (e.losesAbilitiesGains && obj(ctx, o.id).zone === 'battlefield') {
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id: o.id, zcc: o.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          loseAbilities: true,
          expires: 'whileSource',
          whileSourceId: o.id,
          player: es.controller,
        });
        o.blank = true;
        o.grantedKeywords = [...(o.grantedKeywords ?? []), ...e.losesAbilitiesGains];
      }
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
    // Final Fantasy (11a): job select
    case 'jobSelect': {
      // Create the Hero, then attach this Equipment to it (if it's still here).
      const equipment = es.source && onBattlefield(ctx, es.source);
      runEffect(ctx, es, { kind: 'createToken', token: e.token, count: 1 });
      const hero = es.chosen && onBattlefield(ctx, es.chosen);
      if (equipment && hero && equipment.controller === hero.controller)
        equipment.attachedTo = hero.id;
      return;
    }
    // Final Fantasy (11a): saga creatures
    case 'removeLore':
      for (const id of objectsOf(ctx, es, e.what)) {
        const o = obj(ctx, id);
        const lore = o.counters?.lore ?? 0;
        if (!def(ctx, id).saga || lore === 0) continue;
        o.counters = { ...o.counters, lore: lore - 1 };
        o.loreRemovedTurn = ctx.s.turn.number;
      }
      return;
    case 'addLore':
      for (const id of objectsOf(ctx, es, e.what)) addLore(ctx, id);
      return;
    case 'removeLoreFromAny':
    case 'chooseCustom': // Strixhaven (13c)
    case 'hideaway':
      return; // handled by runEffects
    case 'custom': {
      const fn = ctx.customEffects[e.handler];
      if (!fn) throw new Error(`No custom effect handler "${e.handler}"`);
      fn(ctx, es, e.params);
      return;
    }
  }
}

// Final Fantasy (11c): The Water Crystal

/** How many cards `player` mills for "mill N": opponents' Water Crystals add to it. */
export function millCount(ctx: Ctx, player: PlayerId, n: number): number {
  if (n <= 0) return n;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller === player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'opponentsMillMore') n += a.effect.amount;
  }
  return n;
}

// Shield counters (Marvel Super Heroes)

/** "If it would be dealt damage or destroyed, instead remove a shield counter from it." */
export function useShield(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield' || !o.counters?.shield) return false;
  o.counters.shield--;
  return true;
}

/** The keywords Super-Adaptoid copies as counters. */
const SUPER_ADAPTOID_KEYWORDS = [
  'haste',
  'flying',
  'firstStrike',
  'doubleStrike',
  'deathtouch',
  'indestructible',
  'lifelink',
  'menace',
  'reach',
  'trample',
  'vigilance',
] as const;

// Copies (Marvel Super Heroes)

/** Ends a "becomes a copy" effect: it's itself again. */
export function endCopy(ctx: Ctx, o: GameObject): void {
  if (!o.originalDefId) return;
  o.defId = o.originalDefId;
  delete o.originalDefId;
  delete o.copyPT;
  delete o.copyingUntilTurn;
  delete o.copyUntilTurnOf;
  delete o.copyWhileSource;
  delete o.copyKeepsName;
  // Marvel Super Heroes Jumpstart (Young Avengers).
  delete o.copyKeptAbilities;
  if (o.copyAsCreature) delete o.grantedKeywords;
  delete o.copyAsCreature;
  if (o.copyNonlegendary) {
    delete o.nonlegendary;
    delete o.copyNonlegendary;
  }
  if (o.copyAddedSubtypes) {
    const added = [...(o.addedSubtypes ?? [])];
    for (const st of o.copyAddedSubtypes) added.splice(added.indexOf(st), 1);
    o.addedSubtypes = added;
    delete o.copyAddedSubtypes;
  }
}
