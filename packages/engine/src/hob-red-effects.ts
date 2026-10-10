import { hasSubtype } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
  drawCard,
} from './context.ts';
import { dealDamage, damageSourceFor, sendToBottomRandom } from './effects.ts';
import { nextInt } from './rng.ts';
import { checkCondition } from './triggers.ts';
import type { ConditionDef, EffectSource, ObjectId, TargetChoice } from './types.ts';

/** The Hobbit (20b), red: one-off effects, as custom effects. */

/** The object a chosen target names, if it is still the same object on the battlefield. */
function battlefieldTarget(ctx: Ctx, t: TargetChoice | null | undefined): ObjectId | undefined {
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : undefined;
}

/** "You control a Wizard." */
const CONTROLS_WIZARD: ConditionDef = {
  kind: 'controlsPermanents',
  filter: { subtype: 'Wizard' },
  min: 1,
};

export const HOB_RED_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Balin, Loremaster, after "you may": discard your hand, then draw X cards, X the number of cards discarded this way. With an
   * enduring story, Balin deals X damage to each opponent.
   */
  hobBalinDiscardDraw(ctx: Ctx, es: EffectSource) {
    const hand = [...ctx.s.players[es.controller].hand];
    for (const id of hand) moveObject(ctx, id, 'graveyard');
    const x = hand.length;
    for (let i = 0; i < x; i++) drawCard(ctx, es.controller);
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (x <= 0 || !checkCondition(ctx, { kind: 'enduringStory' }, es.controller, self)) return;
    const from = damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller);
    for (const p of ['p1', 'p2'] as const)
      if (p !== es.controller) dealDamage(ctx, from, { player: p }, x, false);
  },

  /**
   * Thorin, Mountain-king: attach any number of target Equipment you control (targets 1 and after) to the target creature you
   * control (target 0). When one or more Equipment become attached to that creature this way (an Equipment already attached
   * doesn't), the reflexive ability `params.reflexive` triggers with that creature as its subject.
   */
  hobThorinAttach(ctx: Ctx, es: EffectSource, params) {
    const creature = battlefieldTarget(ctx, es.targets[0]);
    if (!creature || !def(ctx, creature).types.includes('Creature')) return;
    let attached = false;
    for (const t of es.targets.slice(1)) {
      const eq = battlefieldTarget(ctx, t);
      if (!eq) continue;
      const o = obj(ctx, eq);
      if (o.controller !== es.controller || !hasSubtype(ctx, eq, 'Equipment')) continue;
      if (o.attachedTo === creature) continue;
      o.attachedTo = creature;
      o.timestamp = newTimestamp(ctx);
      attached = true;
    }
    if (!attached || !es.source) return;
    ctx.s.pendingTriggers.push({
      source: es.source,
      sourceDefId: es.sourceDefId,
      abilityIndex: Number(params?.reflexive),
      controller: es.controller,
      subject: { id: creature, zcc: obj(ctx, creature).zcc },
    });
  },

  /**
   * Getaway Barrel: reveal the top thirteen cards of your library. Put a random creature card from among them onto the battlefield.
   * Put the rest on the bottom of your library in a random order.
   */
  hobGetawayBarrel(ctx: Ctx, es: EffectSource) {
    const lib = ctx.s.players[es.controller].library;
    const top = lib.slice(0, 13);
    if (top.length === 0) return;
    emit(ctx, {
      type: 'cardsRevealed',
      player: es.controller,
      cards: top.map((id) => ({ id, defId: obj(ctx, id).defId })),
    });
    const creatures = top.filter((id) => def(ctx, id).types.includes('Creature'));
    const pick = creatures.length ? creatures[nextInt(ctx.s.rng, creatures.length)] : undefined;
    if (pick !== undefined) moveObject(ctx, pick, 'battlefield', { controller: es.controller });
    sendToBottomRandom(
      ctx,
      es.controller,
      top.filter((id) => id !== pick),
    );
  },

  /**
   * Flameshape: look at the top two cards of your library and exile them face down. For as long as they remain exiled, you may
   * play them if you control a Wizard.
   */
  hobFlameshape(ctx: Ctx, es: EffectSource) {
    for (const id of [...ctx.s.players[es.controller].library.slice(0, 2)]) {
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      if (o.zone === 'exile') o.playableIf = CONTROLS_WIZARD;
    }
  },
};
