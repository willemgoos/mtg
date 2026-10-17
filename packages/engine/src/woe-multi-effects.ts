import { cardMatches, countOf, isCreature, matchesFilter } from './characteristics.ts';
import { manaValue } from './cost.ts';
import { protectedFrom } from './brawl-15b-w-effects.ts';
import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  defOf,
  emit,
  moveObject,
  obj,
} from './context.ts';
import { defsWithStatic } from './ecl-multi-b-effects.ts';
import { type EffectSource, plusFoodTokens, runEffect } from './effects.ts';
import { attachAura } from './stack.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type {
  AbilityDef,
  CardDefinition,
  CardFilter,
  Color,
  EffectDef,
  ManaCost,
  ObjectId,
  PlayerId,
} from './types.ts';
import { defHasAdventure } from './woe-23a.ts';

/**
 * Wilds of Eldraine (23b multi): one-offs of the multicolour, colorless and land groups. The vocabulary that lives in types.ts is
 * marked "Wilds of Eldraine (23b multi)".
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

// ---------------------------------------------------------------------------
// Filters that compare names (The Apprentice's Folly, Yenna) and the chosen number (Talion)
// ---------------------------------------------------------------------------

/** The controller of the source (or of the object itself, with no source). */
const controllerFor = (ctx: Ctx, id: ObjectId, sourceId?: ObjectId): PlayerId =>
  obj(ctx, sourceId ?? id).controller;

/** True if `filter`'s Wilds of Eldraine (23b multi) conditions rule the object out. */
export function woeMultiFilterFails(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter,
  sourceId?: ObjectId,
): boolean {
  if (filter.manaValuePowerOrToughness !== undefined) {
    const d = def(ctx, id);
    const n = filter.manaValuePowerOrToughness;
    const x =
      d.manaCost.x && obj(ctx, id).zone === 'stack'
        ? (ctx.s.stack.find((i) => i.kind === 'spell' && i.id === id)?.x ?? 0) * d.manaCost.x
        : 0;
    if (manaValue(d.manaCost) + x !== n && d.power !== n && d.toughness !== n) return true;
  }
  // The Apprentice's Folly: "doesn't have the same name as a token you control".
  if (filter.nameNotOfYourToken) {
    const player = controllerFor(ctx, id, sourceId);
    const name = def(ctx, id).name;
    if (
      ctx.s.battlefield.some(
        (t) =>
          obj(ctx, t).isToken && obj(ctx, t).controller === player && def(ctx, t).name === name,
      )
    )
      return true;
  }
  // Yenna: "doesn't have the same name as another permanent you control".
  if (filter.nameUniqueAmongYourPermanents) {
    const player = controllerFor(ctx, id, sourceId);
    const name = def(ctx, id).name;
    if (
      ctx.s.battlefield.some(
        (t) => t !== id && obj(ctx, t).controller === player && def(ctx, t).name === name,
      )
    )
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rowan, Scion of War; Will, Scion of Peace
// ---------------------------------------------------------------------------

/**
 * "Spells you cast this turn that are black and/or red cost {X} less to cast, where X is the amount of life you lost this turn":
 * the generic mana the spell being cast costs less, from the discounts `player` has this turn.
 */
export function woeLifeDiscount(ctx: Ctx, player: PlayerId, card: ObjectId): number {
  const list = ctx.s.players[player].woeLifeDiscounts;
  if (!list) return 0;
  let less = 0;
  for (const d of list) {
    if (d.turn !== ctx.s.turn.number || !cardMatches(ctx, card, { colors: d.colors })) continue;
    less +=
      d.by === 'lifeLost'
        ? (ctx.s.turn.lifeLostTotal?.[player] ?? 0)
        : (ctx.s.turn.lifeGained?.[player] ?? 0);
  }
  return less;
}

// ---------------------------------------------------------------------------
// Johann, Apprentice Sorcerer
// ---------------------------------------------------------------------------

/**
 * A spell was cast from the top of `player`'s library: if only a "once each turn" permission lets them cast it (Johann), that
 * turn's use is gone.
 */
export function woeNoteTopCast(ctx: Ctx, player: PlayerId, card: ObjectId): void {
  const d = def(ctx, card);
  if (!d.types.includes('Instant') && !d.types.includes('Sorcery')) return;
  let once = false;
  let other = false;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'playFromTop') continue;
      if (!cardMatches(ctx, card, a.effect.filter, id)) continue;
      if (a.effect.oncePerTurn) once = true;
      else other = true;
    }
  }
  if (once && !other) ctx.s.players[player].woeTopCastTurn = ctx.s.turn.number;
}

// ---------------------------------------------------------------------------
// Agatha of the Vile Cauldron, Agatha's Soul Cauldron
// ---------------------------------------------------------------------------

/** The mana an activated ability of a creature costs after "activated abilities of creatures you control cost {X} less". */
export function woeActivationCost(
  ctx: Ctx,
  source: ObjectId,
  a: Extract<AbilityDef, { kind: 'activated' }>,
  cost: ManaCost | undefined,
): ManaCost | undefined {
  const o = obj(ctx, source);
  if (!cost || o.zone !== 'battlefield') return cost;
  const discounters = defsWithStatic(ctx.db, 'activatedAbilitiesCostLess');
  const anyColor = defsWithStatic(ctx.db, 'anyColorForCreatureAbilities');
  const present = (set: ReadonlySet<string>) =>
    ctx.s.battlefield.some(
      (id) => obj(ctx, id).controller === o.controller && set.has(obj(ctx, id).defId),
    );
  if (!present(discounters) && !present(anyColor)) return cost;
  if (!isCreature(ctx, source)) return cost;
  let out = cost;
  let less = 0;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== o.controller || !discounters.has(obj(ctx, id).defId)) continue;
    for (const s of def(ctx, id).abilities) {
      if (s.kind !== 'static') continue;
      if (s.effect.kind === 'activatedAbilitiesCostLess') {
        const n = s.effect.amount;
        less += typeof n === 'number' ? n : amountFor(ctx, id, n);
      }
    }
  }
  if (less > 0 && !a.powerUp) {
    // "This effect can't reduce the mana in that cost to less than one mana."
    const total = manaValue(out);
    const reducible = Math.max(0, Math.min(less, out.generic, total - 1));
    if (reducible > 0) out = { ...out, generic: out.generic - reducible };
  }
  // Agatha's Soul Cauldron: "You may spend mana as though it were mana of any color to activate abilities of creatures you control."
  if (present(anyColor)) out = anyColorCost(out);
  return out;
}

/** The cost with its coloured parts (not {C}) payable by mana of any color. */
function anyColorCost(cost: ManaCost): ManaCost {
  let generic = cost.generic;
  const colored: ManaCost['colored'] = {};
  for (const [k, v] of Object.entries(cost.colored) as [
    'W' | 'U' | 'B' | 'R' | 'G' | 'C',
    number,
  ][]) {
    if (k === 'C') colored[k] = v;
    else generic += v;
  }
  const hybrid = (cost.hybrid ?? []).filter(([x, y]) => x === 'C' || y === 'C');
  generic += (cost.hybrid ?? []).length - hybrid.length;
  return {
    ...cost,
    generic,
    colored,
    ...(hybrid.length ? { hybrid } : {}),
  };
}

const amountFor = (ctx: Ctx, sourceId: ObjectId, n: Parameters<typeof countOf>[2]): number =>
  countOf(ctx, obj(ctx, sourceId).controller, n, false, sourceId);

/**
 * Agatha's Soul Cauldron: "Creatures you control with +1/+1 counters on them have all activated abilities of all creature cards
 * exiled with Agatha's Soul Cauldron." `d` plus those abilities.
 */
export function withCauldronAbilities(ctx: Ctx, id: ObjectId, d: CardDefinition): CardDefinition {
  const o = obj(ctx, id);
  if (o.plusOneCounters <= 0 || !d.types.includes('Creature')) return d;
  const given: AbilityDef[] = [];
  for (const c of ctx.s.battlefield) {
    const cauldron = obj(ctx, c);
    if (cauldron.controller !== o.controller || !cauldron.exiledWith?.length) continue;
    if (
      !defOf(ctx, cauldron.defId).abilities.some(
        (s) => s.kind === 'static' && s.effect.kind === 'cauldronAbilities',
      )
    )
      continue;
    for (const ex of cauldron.exiledWith) {
      const card = ctx.s.objects[ex];
      if (!card || card.zone !== 'exile') continue;
      const cd = defOf(ctx, card.defId);
      if (!cd.types.includes('Creature')) continue;
      for (const a of cd.abilities)
        if (
          (a.kind === 'mana' || a.kind === 'activated') &&
          // Abilities that work from another zone aren't abilities of a creature on the battlefield.
          !(a.kind === 'activated' && (a.fromHand || a.fromGraveyard || a.fromExile))
        )
          given.push(a);
    }
  }
  return given.length ? { ...d, abilities: [...d.abilities, ...given] } : d;
}

// ---------------------------------------------------------------------------
// Aura copies (Yenna)
// ---------------------------------------------------------------------------

/** Could a copy of this Aura enter attached to `host` under `controller` (rule 303.4f: nothing is targeted)? */
function canCopyEnchant(ctx: Ctx, aura: ObjectId, controller: PlayerId, host: ObjectId): boolean {
  const spec = def(ctx, aura).enchant;
  const h = obj(ctx, host);
  if (h.zone !== 'battlefield' || !spec) return false;
  if (spec.what === 'creature' && !isCreature(ctx, host)) return false;
  if (
    spec.what === 'any' &&
    !isCreature(ctx, host) &&
    !def(ctx, host).types.includes('Planeswalker')
  )
    return false;
  if (spec.what === 'player' || spec.what === 'spell' || spec.what === 'graveyardCard')
    return false;
  if (spec.controller === 'you' && h.controller !== controller) return false;
  if (spec.controller === 'opponent' && h.controller === controller) return false;
  if (protectedFrom(ctx, host, aura)) return false;
  return matchesFilter(ctx, host, spec.filter, aura);
}

/** The Yenna chain: the token copy of `aura` (for each token the player makes) enters attached to a permanent its controller chooses. */
const WOE_MULTI_CHOOSERS: Record<string, Chooser> = {
  woeYennaHost(ctx, es, params) {
    const { aura, left, first } = params as { aura: ObjectId; left: number; first: boolean };
    const hosts = ctx.s.battlefield.filter((h) => canCopyEnchant(ctx, aura, es.controller, h));
    if (hosts.length === 0) {
      // No more copies can enter; Yenna's "if the token is an Aura" still happened for the ones that did.
      if (!first) yennaFinish(ctx, es);
      return null;
    }
    const finish: EffectDef[] =
      left > 1
        ? [
            {
              kind: 'chooseCustom',
              handler: 'woeYennaHost',
              params: { aura, left: left - 1, first: false },
            },
          ]
        : [custom('woeYennaFinish')];
    return {
      title: `${def(ctx, aura).name} copy enters: choose what it enchants`,
      options: hosts.map((host) => ({
        label: `Enchant ${def(ctx, host).name}`,
        effects: [custom('woeAttachAuraCopy', { aura, host }), ...finish],
      })),
    };
  },
};
Object.assign(CHOOSERS, WOE_MULTI_CHOOSERS);

/** "Untap Yenna, then scry 2." */
function yennaFinish(ctx: Ctx, es: EffectSource): void {
  runEffect(ctx, es, { kind: 'untap', what: 'self' });
  runEffect(ctx, es, { kind: 'scry', amount: 2 });
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const WOE_MULTI_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Rowan, Scion of War / Will, Scion of Peace: "Spells you cast this turn that are <colors> cost {X} less to cast, where X is the
   * amount of life you lost [gained] this turn."
   */
  woeLifeDiscount(ctx, es, params) {
    const { by, colors } = params as { by: 'lifeLost' | 'lifeGained'; colors: Color[] };
    const ps = ctx.s.players[es.controller];
    const turn = ctx.s.turn.number;
    ps.woeLifeDiscounts = [
      ...(ps.woeLifeDiscounts ?? []).filter((d) => d.turn === turn),
      { turn, by, colors },
    ];
  },

  /** Beluna Grandsquall's Seek Thrills: "Mill seven cards. Then put all cards that have an Adventure from among the milled cards into your hand." */
  woeSeekThrills(ctx, es) {
    const before = new Set(ctx.s.players[es.controller].graveyard);
    runEffect(ctx, es, { kind: 'mill', count: 7 });
    const milled = ctx.s.players[es.controller].graveyard.filter((id) => !before.has(id));
    for (const id of milled)
      if (ctx.s.objects[id]?.zone === 'graveyard' && defHasAdventure(ctx.db, def(ctx, id)))
        moveObject(ctx, id, 'hand');
  },

  /**
   * Agatha's Soul Cauldron: "Exile target card from a graveyard. When a creature card is exiled this way, put a +1/+1 counter on
   * target creature you control." The card is remembered by the Cauldron; the reflexive ability is the card's `reflexive` trigger.
   */
  woeCauldronExile(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const card = ctx.s.objects[t.object.id];
    if (!card || card.zcc !== t.object.zcc || card.zone !== 'graveyard') return;
    const wasCreature = defOf(ctx, card.defId).types.includes('Creature');
    moveObject(ctx, card.id, 'exile');
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (self && self.zone === 'battlefield')
      self.exiledWith = [...(self.exiledWith ?? []), card.id];
    if (!wasCreature || !es.source) return;
    ctx.s.woeCauldron = true;
    const index = defOf(ctx, es.sourceDefId ?? self?.defId ?? '').abilities.findIndex(
      (a) => a.kind === 'triggered' && a.trigger.on === 'reflexive',
    );
    if (index >= 0)
      ctx.s.pendingTriggers.push({
        source: es.source,
        sourceDefId: es.sourceDefId,
        abilityIndex: index,
        controller: es.controller,
      });
  },

  /** Yenna: the token copy of the Aura enters attached to the chosen permanent. */
  woeAttachAuraCopy(ctx, es, params) {
    const { aura, host } = params as { aura: ObjectId; host: ObjectId };
    const original = ctx.s.objects[aura];
    if (!original || !canCopyEnchant(ctx, aura, es.controller, host)) return;
    const t = createObject(ctx, original.defId, es.controller, 'battlefield', true);
    t.nonlegendary = true;
    if (original.copyPT) t.copyPT = { ...original.copyPT };
    t.attachedTo = host;
    ctx.s.battlefield.push(t.id);
    attachAura(ctx, t.id, host);
    emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
    plusFoodTokens(ctx, es.controller); // Tippy-Toe and the like
  },

  /** Yenna: "If the token is an Aura, untap Yenna, then scry 2." */
  woeYennaFinish(ctx, es) {
    yennaFinish(ctx, es);
  },
};

// ---------------------------------------------------------------------------
// Expanders: custom effects that turn into other effects when they come up
// ---------------------------------------------------------------------------

export type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

export const WOE_MULTI_EXPANDERS: Record<string, Expander> = {
  /**
   * Yenna, Redtooth Regent: "Choose target enchantment you control that doesn't have the same name as another permanent you
   * control. Create a token that's a copy of it, except it isn't legendary. If the token is an Aura, untap Yenna, then scry 2."
   * An Aura copy isn't cast: its controller chooses what it enchants as it enters (one choice for each token a doubler makes).
   */
  woeYennaCopy(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return [];
    const target = ctx.s.objects[t.object.id];
    if (!target || target.zone !== 'battlefield' || target.zcc !== t.object.zcc) return [];
    const d = def(ctx, target.id);
    if (!d.subtypes.includes('Aura'))
      // A Saga copy gets its first lore counter as it enters (the engine adds it to any Saga that enters).
      return [{ kind: 'tokenCopy', of: { target: 0 }, notLegendary: true }];
    return [
      {
        kind: 'chooseCustom',
        handler: 'woeYennaHost',
        params: { aura: target.id, left: tokenMultiplier(ctx, es.controller), first: true },
      },
    ];
  },
};
