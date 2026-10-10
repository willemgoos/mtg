import { type Ctx, type CustomEffect, def, drawCard, moveObject, obj } from './context.ts';
import { counterSpell } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { sharesCardType } from './targets.ts';
import type { EffectSource, ObjectId } from './types.ts';

/**
 * The Hobbit (20b, blue): one-off effects, as custom effects. Thranduil's Decree, Burglar's Plot, Enchanted River's Grasp, Gandalf,
 * Wandering Wizard. See docs/the-hobbit-plan.md.
 */

/** The permanent or spell a target slot points at, if it is still there (same zone change count). */
function targetObject(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

const PERMANENT_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];

export const HOB_BLUE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Thranduil's Decree: counter target spell. If a permanent spell is countered this way, exile it instead of putting it into its
   * owner's graveyard, and the Decree's controller may cast that card without paying its mana cost for as
   * long as it remains exiled.
   */
  hobThranduilsDecree(ctx, es) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined) return;
    const permanent = def(ctx, id).types.some((t) => PERMANENT_TYPES.includes(t));
    const countered = ctx.s.stack.some((x) => x.kind === 'spell' && x.id === id);
    counterSpell(ctx, id, permanent);
    if (!countered || !permanent) return;
    const o = ctx.s.objects[id];
    // A spell that can't be countered stays on the stack; a copy ceases to exist.
    if (o && o.zone === 'exile' && !o.isToken) o.playFreeBy = es.controller;
  },

  /**
   * Burglar's Plot: exchange control of two target nonland permanents that share a card type. Nothing happens unless both are
   * still legal targets (on the battlefield, still sharing a type) and they are controlled by different players.
   */
  hobExchangeControl(ctx, es) {
    const a = targetObject(ctx, es, 0);
    const b = targetObject(ctx, es, 1);
    if (a === undefined || b === undefined || a === b) return;
    const oa = obj(ctx, a);
    const ob = obj(ctx, b);
    if (oa.zone !== 'battlefield' || ob.zone !== 'battlefield') return;
    if (!sharesCardType(ctx, a, b)) return;
    if (oa.controller === ob.controller) return;
    const [ca, cb] = [oa.controller, ob.controller];
    oa.controller = cb;
    ob.controller = ca;
    oa.summoningSick = true;
    ob.summoningSick = true;
  },

  /** Enchanted River's Grasp: remove all counters from the enchanted creature. */
  hobRemoveAllCountersAttached(ctx, es) {
    const aura = es.source && ctx.s.objects[es.source.id];
    const host = aura && aura.attachedTo !== undefined ? ctx.s.objects[aura.attachedTo] : undefined;
    if (!host || host.zone !== 'battlefield') return;
    host.plusOneCounters = 0;
    for (const k of Object.keys(host.counters ?? {})) delete host.counters![k];
  },

  /** Gandalf, Wandering Wizard: its owner shuffles it into their library and draws three cards. */
  hobGandalfShuffle(ctx, es) {
    const src = es.source && ctx.s.objects[es.source.id];
    if (!src) return;
    const owner = src.owner;
    if (src.zone === 'battlefield' && src.zcc === es.source!.zcc) {
      moveObject(ctx, src.id, 'library', { position: 'top' });
      shuffleInPlace(ctx.s.rng, ctx.s.players[owner].library);
    } else {
      // Gone already (the cost can't be paid with it gone, but the owner still shuffles and draws if it left in response).
      shuffleInPlace(ctx.s.rng, ctx.s.players[owner].library);
    }
    for (let i = 0; i < 3; i++) drawCard(ctx, owner);
  },
};
