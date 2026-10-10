import { characteristics } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  def,
  drawCard,
  moveObject,
  obj,
} from './context.ts';
import { damageSourceFor, dealDamage, runEffect } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { Color, EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Tarkir: Dragonstorm (19b, clans): one-off effects of the Abzan, Jeskai and Sultai cards, as custom effects, and the choosers
 * behind `chooseCustom` (each choice is made step by step): Severance Priest, New Way Forward, Call the Spirit Dragons and
 * Rediscover the Way. See docs/tarkir-dragonstorm-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const choose = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  ...(params ? { params } : {}),
});

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
const SPIRIT = 'tdm-spirit-token';

// ---------------------------------------------------------------------------
// New Way Forward
// ---------------------------------------------------------------------------

/**
 * New Way Forward: damage from the chosen source that would be dealt to `player` is prevented (the shield is used up); New Way
 * Forward then deals that much damage to the source's controller and the player draws that many cards. Returns the damage
 * that is still dealt.
 */
export function applySourceShield(
  ctx: Ctx,
  src: { id: ObjectId; controller: PlayerId },
  player: PlayerId,
  amount: number,
): number {
  const shields = ctx.s.turn.sourceShields;
  if (!shields || amount <= 0) return amount;
  const i = shields.findIndex((x) => x.player === player && x.source === src.id);
  if (i < 0) return amount;
  const [shield] = shields.splice(i, 1);
  if (shields.length === 0) delete ctx.s.turn.sourceShields;
  const from = damageSourceFor(ctx, shield!.by, player);
  dealDamage(ctx, from, { player: src.controller }, amount, false);
  for (let k = 0; k < amount; k++) drawCard(ctx, player);
  return 0;
}

// ---------------------------------------------------------------------------
// Call the Spirit Dragons
// ---------------------------------------------------------------------------

/** The Dragons a player controls that are this colour. */
function dragonsOfColor(ctx: Ctx, player: PlayerId, color: Color): ObjectId[] {
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    if (o.controller !== player) return false;
    const c = characteristics(ctx, id);
    return c.types.includes('Creature') && c.subtypes.includes('Dragon') && def(ctx, id).colors.includes(color);
  });
}

/**
 * Call the Spirit Dragons, from colour number `from` on: a colour with no Dragon of that colour is skipped, a single Dragon gets
 * its counter at once, and with several the player is asked (`csdPick`). At the end, five different Dragons with counters win.
 */
function csdAdvance(ctx: Ctx, es: EffectSource, from: number, got: ObjectId[]): void {
  for (let i = from; i < COLORS.length; i++) {
    const dragons = dragonsOfColor(ctx, es.controller, COLORS[i]!);
    if (dragons.length === 0) continue;
    if (dragons.length === 1) {
      addCounters(ctx, dragons[0]!, 1);
      if (!got.includes(dragons[0]!)) got = [...got, dragons[0]!];
      continue;
    }
    (ctx.deferred ??= []).push(choose('csdPick', { i, got }));
    return;
  }
  if (got.length >= 5) (ctx.deferred ??= []).push({ kind: 'winGame' });
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export const TDM_CLANS_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Severance Priest, "When this creature leaves the battlefield, the exiled card's owner creates an X/X white Spirit creature
   * token, where X is the mana value of the exiled card": the owner and mana value were remembered on the Priest as it exiled the
   * card (`linkedExile`).
   */
  severanceToken(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    const link = self?.linkedExile;
    if (!self || !link) return;
    delete self.linkedExile;
    runEffect(
      ctx,
      { ...es, controller: link.owner },
      { kind: 'createToken', token: SPIRIT, count: 1, pt: link.mv },
    );
  },

  /** New Way Forward: the chosen source is shielded for the rest of the turn (see `applySourceShield`). */
  nwfShield(ctx, es, params) {
    const source = (params as { source?: ObjectId } | undefined)?.source;
    if (source === undefined || !es.source) return;
    (ctx.s.turn.sourceShields ??= []).push({ player: es.controller, source, by: es.source.id });
  },

  /** Call the Spirit Dragons: at the beginning of your upkeep, a counter on a Dragon of each colour. */
  csdStart(ctx, es) {
    csdAdvance(ctx, es, 0, []);
  },

  /** Call the Spirit Dragons: the Dragon chosen for colour number `i` gets its counter; on to the next colour. */
  csdPut(ctx, es, params) {
    const p = params as { i: number; got: ObjectId[]; pick: ObjectId };
    if (ctx.s.objects[p.pick]?.zone === 'battlefield') addCounters(ctx, p.pick, 1);
    csdAdvance(ctx, es, p.i + 1, p.got.includes(p.pick) ? p.got : [...p.got, p.pick]);
  },

  /** Rediscover the Way, I and II: the chosen card of the top three goes to your hand, the rest to the bottom in the order chosen. */
  rediscoverTake(ctx, _es, params) {
    const p = params as { cards: ObjectId[]; take: ObjectId };
    if (ctx.s.objects[p.take]?.zone === 'library') moveObject(ctx, p.take, 'hand');
    const rest = p.cards.filter((id) => id !== p.take && ctx.s.objects[id]?.zone === 'library');
    if (rest.length > 1) (ctx.deferred ??= []).push(choose('rediscoverOrder', { rest }));
    else for (const id of rest) moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /** Rediscover the Way: the rest go to the bottom of the library, the first listed first (so the last listed is the bottom card). */
  rediscoverBottom(ctx, _es, params) {
    for (const id of (params as { order: ObjectId[] }).order)
      if (ctx.s.objects[id]?.zone === 'library') moveObject(ctx, id, 'library', { position: 'bottom' });
  },
};

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

const nameOf = (ctx: Ctx, id: ObjectId) => def(ctx, id).name;

/** Every ordering of a small list. */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

const TDM_CLANS_CHOOSERS: Record<string, Chooser> = {
  /**
   * New Way Forward: the source to shield. Any permanent or spell, the opponent's biggest first (they are what damages you), then
   * yours.
   */
  nwfSource(ctx, es) {
    const self = es.source?.id;
    const ids: ObjectId[] = [
      ...ctx.s.battlefield,
      ...ctx.s.stack.filter((x) => x.kind === 'spell' && x.id !== self).map((x) => x.id),
    ];
    const rank = (id: ObjectId) => {
      const o = obj(ctx, id);
      const mine = o.controller === es.controller ? 1 : 0;
      const power = o.zone === 'battlefield' ? characteristics(ctx, id).power : 0;
      return mine * 1000 - power;
    };
    const label = (id: ObjectId) => {
      const o = obj(ctx, id);
      const where = o.zone === 'stack' ? 'spell' : 'permanent';
      const c = o.zone === 'battlefield' ? characteristics(ctx, id) : undefined;
      const pt = c && c.types.includes('Creature') ? ` ${c.power}/${c.toughness}` : '';
      return `${nameOf(ctx, id)}${pt}, ${o.controller === es.controller ? 'yours' : "opponent's"} ${where}`;
    };
    const options = [...ids]
      .sort((a, b) => rank(a) - rank(b))
      .map((id) => ({ label: label(id), effects: [custom('nwfShield', { source: id })] }));
    return options.length ? { title: 'New Way Forward: choose a source', options } : null;
  },

  /** Call the Spirit Dragons: which Dragon of the colour gets the counter. */
  csdPick(ctx, es, params) {
    const { i, got } = params as { i: number; got: ObjectId[] };
    const color = COLORS[i]!;
    const names: Record<Color, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
    return {
      title: `Call the Spirit Dragons: a +1/+1 counter on a ${names[color]} Dragon`,
      options: dragonsOfColor(ctx, es.controller, color).map((id) => ({
        label: `${nameOf(ctx, id)} (${characteristics(ctx, id).power}/${characteristics(ctx, id).toughness})${got.includes(id) ? ', already has one' : ''}`,
        effects: [custom('csdPut', { i, got, pick: id })],
      })),
    };
  },

  /** Rediscover the Way, I and II: look at the top three cards of your library; the one to put in your hand. */
  rediscoverPick(ctx, es) {
    const cards = ctx.s.players[es.controller].library.slice(0, 3);
    if (cards.length === 0) return null;
    return {
      title: 'Rediscover the Way: put one of them into your hand',
      options: cards.map((id) => ({
        label: nameOf(ctx, id),
        effects: [custom('rediscoverTake', { cards, take: id })],
      })),
    };
  },

  /** Rediscover the Way: the order of the rest on the bottom of the library. */
  rediscoverOrder(ctx, _es, params) {
    const rest = (params as { rest: ObjectId[] }).rest;
    return {
      title: 'Rediscover the Way: the order on the bottom of your library (top to bottom)',
      options: permutations(rest).map((order) => ({
        label: order.map((id) => nameOf(ctx, id)).join(', then '),
        effects: [custom('rediscoverBottom', { order })],
      })),
    };
  },
};
Object.assign(CHOOSERS, TDM_CLANS_CHOOSERS);
