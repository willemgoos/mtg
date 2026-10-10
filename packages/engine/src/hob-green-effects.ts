import { hasAllCreatureTypes } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
} from './context.ts';
import { manaValue } from './cost.ts';
import { millCount } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { AbilityDef, EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * The Hobbit (20b, green): the one-off effects of Cantankerous Keepers ("mill four cards, then put all Elf cards from among
 * them into your hand"), Part in Friendship, Through the Forest Gate ("put any number of land cards from among them onto the
 * battlefield tapped"), Beorn the Fierce ("it becomes a Bear in addition to its other types"), Beorn's Hospitality and Down in
 * the Valley, as custom effects and the choosers behind `chooseCustom`.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const choose = (handler: string, params: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  params,
});

/** The target's object, if it is still on the battlefield (the same object as when it was chosen). */
function targetOnBattlefield(ctx: Ctx, es: EffectSource, n: number): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : undefined;
}

/** The source permanent, if it is still the same one on the battlefield. */
function sourceOnBattlefield(ctx: Ctx, es: EffectSource): ObjectId | undefined {
  const src = es.source && ctx.s.objects[es.source.id];
  return src && src.zone === 'battlefield' && src.zcc === es.source!.zcc ? src.id : undefined;
}

/** Cards put on the bottom of their owner's library in a random order. */
function toBottomRandom(ctx: Ctx, player: PlayerId, cards: ObjectId[]): void {
  const lib = ctx.s.players[player].library;
  const rest = cards.filter((id) => ctx.s.objects[id]?.zone === 'library');
  for (const id of rest) {
    const i = lib.indexOf(id);
    if (i >= 0) lib.splice(i, 1);
  }
  shuffleInPlace(ctx.s.rng, rest);
  lib.push(...rest);
}

const isLandCard = (ctx: Ctx, id: ObjectId) => def(ctx, id).types.includes('Land');

/** The Elf creature type, or all of them (changeling) on a card in a graveyard. */
const isElfCard = (ctx: Ctx, id: ObjectId) =>
  def(ctx, id).subtypes.includes('Elf') || hasAllCreatureTypes(ctx, id);

/** Down in the Valley, chapter II: "Landfall - Whenever a land you control enters, create a 1/1 green Elf creature token." */
export const HOB_VALLEY_LANDFALL: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'landfall' },
  targets: [],
  effects: [{ kind: 'createToken', token: 'hob-elf-token', count: 1 }],
};

export const HOB_GREEN_EFFECTS: Record<string, CustomEffect> = {
  /** Cantankerous Keepers: mill four cards, then put all Elf cards among them into your hand. */
  hobKeepersMill(ctx, es) {
    const lib = ctx.s.players[es.controller].library;
    const milled = lib.slice(0, millCount(ctx, es.controller, 4));
    for (const id of milled) moveObject(ctx, id, 'graveyard');
    for (const id of milled)
      if (ctx.s.objects[id]?.zone === 'graveyard' && isElfCard(ctx, id))
        moveObject(ctx, id, 'hand');
  },

  /**
   * Part in Friendship: reveal cards from the top of your library until you reveal a creature card. If its mana value is less
   * than or equal to the number of lands you control, put it onto the battlefield; otherwise into your hand. The rest go on the
   * bottom in a random order.
   */
  hobPartInFriendship(ctx, es) {
    const player = es.controller;
    const lib = ctx.s.players[player].library;
    const revealed: ObjectId[] = [];
    let found: ObjectId | undefined;
    for (const id of lib) {
      revealed.push(id);
      emit(ctx, { type: 'revealed', player, id });
      if (def(ctx, id).types.includes('Creature')) {
        found = id;
        break;
      }
    }
    if (found !== undefined) {
      const lands = ctx.s.battlefield.filter(
        (id) => obj(ctx, id).controller === player && isLandCard(ctx, id),
      ).length;
      if (manaValue(def(ctx, found).manaCost) <= lands)
        moveObject(ctx, found, 'battlefield', { controller: player });
      else moveObject(ctx, found, 'hand');
    }
    toBottomRandom(ctx, player, revealed);
  },

  /**
   * Through the Forest Gate: look at the top twenty cards; the player puts any number of the lands among them onto the
   * battlefield tapped (`hobGatePick`), then shuffles.
   */
  hobGateLook(ctx, es) {
    const cards = ctx.s.players[es.controller].library.slice(0, 20);
    if (cards.some((id) => isLandCard(ctx, id)))
      (ctx.deferred ??= []).push(choose('hobGatePick', { cards, chosen: [] }));
    else (ctx.deferred ??= []).push(custom('hobGateFinish', { cards, chosen: [] }));
  },

  /** Through the Forest Gate, last step: the chosen lands enter tapped (together), then the library is shuffled. */
  hobGateFinish(ctx, es, params) {
    const p = params as unknown as { cards: ObjectId[]; chosen: ObjectId[] };
    for (const id of p.chosen) {
      if (ctx.s.objects[id]?.zone !== 'library') continue;
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
      obj(ctx, id).tapped = true;
    }
    shuffleInPlace(ctx.s.rng, ctx.s.players[es.controller].library);
  },

  /** Beorn the Fierce: the target creature becomes a Bear in addition to its other types (for good). */
  hobAddBear(ctx, es) {
    const id = targetOnBattlefield(ctx, es, 0);
    if (id === undefined) return;
    const o = obj(ctx, id);
    if (!def(ctx, id).subtypes.includes('Bear') && !o.addedSubtypes?.includes('Bear'))
      o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Bear'];
  },

  /**
   * Beorn's Hospitality: this enchantment becomes a Bear creature in addition to its other types and gains "This creature's
   * power and toughness are each equal to the number of lands you control". This effect doesn't end (until it leaves).
   */
  hobBecomeBear(ctx, es) {
    const id = sourceOnBattlefield(ctx, es);
    if (id === undefined) return;
    const o = obj(ctx, id);
    if (!o.hobLandsPT) {
      o.hobLandsPT = true;
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        becomesCreature: true,
        creatureOnly: true,
        expires: 'permanent',
      });
    }
    if (!o.addedSubtypes?.includes('Bear')) o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Bear'];
  },

  /** Down in the Valley, chapter II: this Saga gains the landfall ability for as long as it is on the battlefield. */
  hobValleyGain(ctx, es) {
    const id = sourceOnBattlefield(ctx, es);
    if (id === undefined) return;
    const o = obj(ctx, id);
    if (!o.hobGainedAbilities?.length) o.hobGainedAbilities = [HOB_VALLEY_LANDFALL];
  },
};

const HOB_GREEN_CHOOSERS: Record<string, Chooser> = {
  /** Through the Forest Gate: put any number of the land cards onto the battlefield tapped, one at a time. */
  hobGatePick(ctx, _es, params) {
    const p = params as unknown as { cards: ObjectId[]; chosen: ObjectId[] };
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of p.cards) {
      if (p.chosen.includes(id) || ctx.s.objects[id]?.zone !== 'library' || !isLandCard(ctx, id))
        continue;
      options.push({
        label: `Put ${def(ctx, id).name} onto the battlefield tapped`,
        effects: [choose('hobGatePick', { ...p, chosen: [...p.chosen, id] })],
      });
    }
    options.push({
      label:
        p.chosen.length === 0
          ? 'Put no lands onto the battlefield'
          : 'Done: put the chosen lands onto the battlefield and shuffle',
      effects: [custom('hobGateFinish', p)],
    });
    return {
      title: 'Through the Forest Gate: put any number of land cards onto the battlefield tapped',
      options,
    };
  },
};
Object.assign(CHOOSERS, HOB_GREEN_CHOOSERS);
