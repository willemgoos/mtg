import { characteristics, hasSubtype } from './characteristics.ts';
import { type Ctx, def, obj } from './context.ts';
import { isLegendaryNow } from './ltr-black-effects.ts';
import { queue } from './triggers.ts';
import type { GameEvent, GameObject, ObjectId, PlayerId } from './types.ts';

/**
 * Lord of the Rings (22): rules hooks for the main-set commons and uncommons outside the Jumpstart packets (filters, event
 * tracking, casting). No registrations at load time, so the core modules can import this file; the choosers and custom effects
 * are in ltr-main-effects.ts. See docs/lord-of-the-rings-plan.md, "Phase 22".
 */

// ---------------------------------------------------------------------------
// You Cannot Pass!: "target creature that blocked or was blocked by a legendary creature this turn"
// ---------------------------------------------------------------------------

/** Events phase 22 watches (called from the trigger detection with every event). */
export function detectLtrMain(ctx: Ctx, ev: GameEvent): void {
  if (ev.type === 'objectMoved') return firesPlayed(ctx, ev);
  if (ev.type !== 'blockersDeclared') return;
  const s = ctx.s;
  const list = [...(s.turn.ltrBlockedWithLegendary ?? [])];
  const note = (id: ObjectId) => {
    const o = s.objects[id];
    if (o && !list.some((r) => r.id === id && r.zcc === o.zcc)) list.push({ id, zcc: o.zcc });
  };
  for (const b of ev.blocks) {
    if (isLegendaryNow(ctx, b.attacker)) note(b.blocker);
    if (isLegendaryNow(ctx, b.blocker)) note(b.attacker);
  }
  if (list.length) s.turn.ltrBlockedWithLegendary = list;
}

/**
 * Lord of the Rings Starter Kit: Fires of Mount Doom. A card it exiled is played from exile this turn (cast, or a land played):
 * "When you play a card this way, Fires of Mount Doom deals 2 damage to each player." Queues that Fires' reflexive ability.
 */
function firesPlayed(ctx: Ctx, ev: Extract<GameEvent, { type: 'objectMoved' }>): void {
  const list = ctx.s.turn.ltrFiresExiled;
  if (!list?.length || ev.from !== 'exile' || (ev.to !== 'stack' && ev.to !== 'battlefield'))
    return;
  const hit = list.find((x) => x.id === ev.id);
  if (!hit) return;
  ctx.s.turn.ltrFiresExiled = list.filter((x) => x !== hit);
  const fires = ctx.s.objects[hit.source.id];
  if (fires) queue(ctx, fires, hit.ability, hit.controller);
}

/** `blockedWithLegendaryThisTurn` in a filter: did this creature block or get blocked by a legendary creature this turn? */
export function blockedWithLegendaryThisTurn(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  return (
    !!o && (ctx.s.turn.ltrBlockedWithLegendary ?? []).some((r) => r.id === id && r.zcc === o.zcc)
  );
}

/** Ringsight: does this card share a color with a legendary creature its owner controls? */
export function sharesColorWithYourLegendary(ctx: Ctx, id: ObjectId): boolean {
  const colors = def(ctx, id).colors;
  const owner = obj(ctx, id).owner;
  return ctx.s.battlefield.some((p) => {
    if (obj(ctx, p).controller !== owner || !isLegendaryNow(ctx, p)) return false;
    return (
      characteristics(ctx, p).types.includes('Creature') &&
      def(ctx, p).colors.some((x) => colors.includes(x))
    );
  });
}

/**
 * Long List of the Ents: a creature spell `player` just cast uses up each noted type it has this turn (one +1/+1 counter as it
 * enters for each). Called as the spell is cast.
 */
export function ltrNotedTypeCounters(ctx: Ctx, player: PlayerId, spell: GameObject): void {
  const boons = ctx.s.turn.ltrNotedTypeBoons;
  if (!boons?.length) return;
  const used = boons.filter((b) => b.player === player && hasSubtype(ctx, spell.id, b.type));
  if (!used.length) return;
  spell.bonusCounters = (spell.bonusCounters ?? 0) + used.length;
  ctx.s.turn.ltrNotedTypeBoons = boons.filter((b) => !used.includes(b));
}
