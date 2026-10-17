import { isCreature, matchesFilter } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  moveObject,
  obj,
  onBattlefield,
} from './context.ts';
import { runEffect } from './effects.ts';
import { cantBeSacrificed } from './tdm-19a.ts';
import type { Chooser } from './stx-13c-a-effects.ts';
import type {
  CardFilter,
  CostDef,
  EffectDef,
  GameObject,
  ObjectId,
  PlayerId,
  TargetChoice,
} from './types.ts';

/**
 * Wilds of Eldraine (23b white): the one-off effects of the white cards. Break the Spell ("if a permanent you controlled or a token was
 * destroyed this way"), Eerie Interference (a turn-long prevention, read by `woeCreatureDamagePrevented` from the damage code), The
 * Princess Takes Flight (the card chapter I exiles comes back in chapter III), Expel the Interlopers (the number is chosen with
 * `chooseCustom`), and the cost of Dutiful Griffin ("sacrifice two enchantments", `sacrificeWays`).
 */

/** The object a target names, if it's still the same object on the battlefield. */
function battlefieldTarget(ctx: Ctx, t: TargetChoice | null | undefined): GameObject | undefined {
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

export const WOE_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Break the Spell: "Destroy target enchantment. If a permanent you controlled or a token was destroyed this way, draw a card."
   * An enchantment that survives (indestructible, a regeneration or shield) draws nothing.
   */
  woeBreakTheSpell(ctx, es) {
    const target = battlefieldTarget(ctx, es.targets[0]);
    if (!target) return;
    const id = target.id;
    const zcc = target.zcc;
    const youControlledOrToken = target.controller === es.controller || target.isToken === true;
    runEffect(ctx, es, { kind: 'destroy', what: { target: 0 } });
    const now = ctx.s.objects[id];
    const destroyed = !now || now.zone !== 'battlefield' || now.zcc !== zcc;
    if (destroyed && youControlledOrToken)
      runEffect(ctx, es, { kind: 'draw', who: 'controller', amount: 1 });
  },

  /**
   * Stroke of Midnight: "Destroy target nonland permanent. Its controller creates a 1/1 white Human creature token." Its controller
   * is the one it had on the battlefield, even if the permanent was a token that has ceased to exist.
   */
  woeStrokeOfMidnight(ctx, es, params) {
    const target = battlefieldTarget(ctx, es.targets[0]);
    if (!target) return;
    const controller = target.controller;
    runEffect(ctx, es, { kind: 'destroy', what: { target: 0 } });
    runEffect(
      ctx,
      { ...es, controller },
      { kind: 'createToken', token: String(params?.token), count: 1 },
    );
  },

  /** Eerie Interference: "Prevent all damage that would be dealt to you and creatures you control this turn by creatures." */
  woeEerieInterference(ctx, es) {
    const list = (ctx.s.turn.woeCreatureDamagePrevented ??= []);
    if (!list.includes(es.controller)) list.push(es.controller);
  },

  /**
   * The Princess Takes Flight, chapter I: "Exile up to one target creature." The Saga remembers the card (a token is gone for good,
   * so only a card is remembered).
   */
  woePrincessExile(ctx, es) {
    const target = battlefieldTarget(ctx, es.targets[0]);
    if (!target) return;
    const isToken = target.isToken === true;
    const id = target.id;
    moveObject(ctx, id, 'exile');
    const saga = es.source && ctx.s.objects[es.source.id];
    if (saga && !isToken && ctx.s.objects[id]?.zone === 'exile') saga.exiledWith = [id];
  },

  /** The Princess Takes Flight, chapter III: "Return the exiled card to the battlefield under its owner's control." */
  woePrincessReturn(ctx, es) {
    const saga = es.source && ctx.s.objects[es.source.id];
    if (!saga) return;
    const cards = saga.exiledWith ?? [];
    saga.exiledWith = [];
    for (const id of cards) {
      const o = ctx.s.objects[id];
      if (o && o.zone === 'exile') moveObject(ctx, id, 'battlefield', { controller: o.owner });
    }
  },
};

/** Expel the Interlopers: "Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number." */
export const WOE_WHITE_CHOOSERS: Record<string, Chooser> = {
  woeChooseNumber(_ctx, _es, params) {
    const max = Number(params?.max ?? 10);
    const effects = (n: number): EffectDef[] => [
      { kind: 'destroy', what: { each: 'creature', filter: { minPower: n } } },
    ];
    return {
      title: 'Expel the Interlopers: choose a number between 0 and 10',
      options: Array.from({ length: max + 1 }, (_, n) => ({
        label: String(n),
        effects: effects(n),
      })),
    };
  },
};

/**
 * Eerie Interference: is damage from this source to this player (or this creature) prevented because it comes from a creature and
 * the one hit is a protected player or a creature that player controls?
 */
export function woeCreatureDamagePrevented(
  ctx: Ctx,
  srcId: ObjectId,
  to: TargetChoice,
): boolean {
  const protectedPlayers = ctx.s.turn.woeCreatureDamagePrevented;
  if (!protectedPlayers?.length) return false;
  const source = ctx.s.objects[srcId];
  if (!source) return false;
  const fromCreature =
    source.zone === 'battlefield' ? isCreature(ctx, srcId) : def(ctx, srcId).types.includes('Creature');
  if (!fromCreature) return false;
  if ('player' in to) return protectedPlayers.includes(to.player);
  const hit = onBattlefield(ctx, to.object);
  return !!hit && isCreature(ctx, hit.id) && protectedPlayers.includes(hit.controller);
}

// ---------------------------------------------------------------------------
// "Sacrifice two enchantments" as a cost (Dutiful Griffin)
// ---------------------------------------------------------------------------

/** The permanents `player` could sacrifice for this cost. */
function sacrificeable(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  filter: CardFilter,
): ObjectId[] {
  return ctx.s.battlefield.filter(
    (id) =>
      obj(ctx, id).controller === player &&
      matchesFilter(ctx, id, filter, source) &&
      !cantBeSacrificed(ctx, id),
  );
}

/** Can the cost be paid at all? */
export function canSacrificePermanents(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  cost: NonNullable<CostDef['sacrificePermanents']>,
): boolean {
  return sacrificeable(ctx, player, source, cost.filter).length >= cost.count;
}

/**
 * Every way of choosing the permanents to sacrifice, in the order the board picks them (permanents that look alike are one way).
 */
export function sacrificeWays(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  cost: NonNullable<CostDef['sacrificePermanents']>,
): ObjectId[][] {
  const can = sacrificeable(ctx, player, source, cost.filter);
  const key = (id: ObjectId) => {
    const o = obj(ctx, id);
    return `${o.defId}|${o.isToken ? 1 : 0}|${o.attachedTo ?? ''}|${o.plusOneCounters}|${JSON.stringify(o.counters ?? {})}`;
  };
  const ways: ObjectId[][] = [];
  const seen = new Set<string>();
  const pick = (chosen: ObjectId[]): void => {
    if (chosen.length === cost.count) {
      const k = chosen.map(key).join(',');
      if (!seen.has(k)) {
        seen.add(k);
        ways.push(chosen);
      }
      return;
    }
    for (const id of can) if (!chosen.includes(id)) pick([...chosen, id]);
  };
  pick([]);
  return ways;
}

/** The permanents that are sacrificed: the ones chosen if they fit the cost, else the first that do. */
export function permanentsToSacrifice(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  cost: NonNullable<CostDef['sacrificePermanents']>,
  chosen: ObjectId[] | undefined,
): ObjectId[] {
  const can = sacrificeable(ctx, player, source, cost.filter);
  const picked = [...new Set(chosen ?? [])].filter((id) => can.includes(id));
  return [...picked, ...can.filter((id) => !picked.includes(id))].slice(0, cost.count);
}
