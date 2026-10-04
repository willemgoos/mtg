import { isCreature, matchesFilter, nameId } from './characteristics.ts';
import {
  addCounters,
  type Ctx,
  type CustomEffect,
  def,
  drawCard,
  moveObject,
  obj,
} from './context.ts';
import { manaValue } from './cost.ts';
import { copyStackAbility } from './msh-analyzed.ts';
import { addLore } from './sagas.ts';
import { shuffleLibrary } from './setup.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId } from './types.ts';

/**
 * Marvel Super Heroes one-offs, as custom effects. They run without asking:
 * where the card offers a choice, the engine makes it (noted on each).
 */

const isCreatureCard = (ctx: Ctx, id: ObjectId) => def(ctx, id).types.includes('Creature');

export const MSH_EFFECTS: Record<string, CustomEffect> = {
  // Marvel Super Heroes Jumpstart (Trained)
  /** She-Hulk, Attorney-at-Law: "double the number of +1/+1 counters on each creature you control". */
  doubleCountersOnYourCreatures(ctx, es, params) {
    // Marvel Super Heroes Jumpstart (Incredible): Hulk, Strongest There Is only doubles Gamma creatures.
    const subtype = (params as { subtype?: string } | undefined)?.subtype;
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller || !isCreature(ctx, id) || !o.plusOneCounters) continue;
      if (subtype && !matchesFilter(ctx, id, { subtype })) continue;
      addCounters(ctx, id, o.plusOneCounters);
    }
  },

  // Marvel Super Heroes Jumpstart (Tenacious/Rampaging)
  /**
   * Powerful Broker: "for each kind of counter on target permanent, give it another counter of
   * that kind" (players have no counters here). Lore counters trigger the Saga's chapter.
   */
  counterOfEachKind(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    if (o.plusOneCounters > 0) addCounters(ctx, o.id, 1);
    for (const [name, n] of Object.entries(o.counters ?? {})) {
      if (n <= 0) continue;
      if (name === 'lore') addLore(ctx, o.id);
      else addCounters(ctx, o.id, 1, name);
    }
  },

  // Marvel Super Heroes Jumpstart (Analyzed)
  /**
   * Echo, Perceptive Prodigy: copy the target ability (an activated or triggered ability on the
   * stack). The copy is 'chosen', so a following 'chooseNewTargets' may retarget it.
   */
  copyTargetStackAbility(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const id = copyStackAbility(ctx, t.object.id);
    if (!id) return;
    const copy = ctx.s.stack.find((x) => x.id === id)!;
    copy.controller = es.controller;
    es.chosen = { id, zcc: 0 };
  },

  /**
   * Victor Mancha, Runaway: exile the target card from your graveyard; you may play it for as
   * long as you control the source.
   */
  exilePlayableWhileControlling(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t) || !es.source) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
    moveObject(ctx, o.id, 'exile');
    obj(ctx, o.id).playableWhileControlling = { source: es.source, player: es.controller };
  },

  // Marvel Super Heroes Jumpstart (Scarlet)
  /**
   * Hex Magic: exile all the cards from your hand, then draw that many; until
   * the end of your next turn, you may play the exiled cards.
   */
  exileHandDrawPlayable(ctx, es) {
    const hand = [...ctx.s.players[es.controller].hand];
    const ownTurn = ctx.s.turn.activePlayer === es.controller;
    for (const id of hand) {
      moveObject(ctx, id, 'exile');
      obj(ctx, id).playableUntilTurn = ctx.s.turn.number + (ownTurn ? 2 : 1);
    }
    for (let i = 0; i < hand.length; i++) drawCard(ctx, es.controller);
  },

  /** Earth's Mightiest Heroes with teamwork: every creature card among the top N onto the battlefield, the rest into the graveyard. */
  putAllCreaturesFromTop(ctx, es, params) {
    const count = (params as { count: number }).count;
    const lib = ctx.s.players[es.controller].library;
    for (const id of lib.slice(0, count))
      moveObject(
        ctx,
        id,
        isCreatureCard(ctx, id) ? 'battlefield' : 'graveyard',
        isCreatureCard(ctx, id) ? { controller: es.controller } : {},
      );
  },

  /**
   * Vision Quest: an artifact creature card with mana value X or less from your
   * library or graveyard onto the battlefield with X more +1/+1 counters (haste if
   * X is 4 or more). The engine picks the one with the greatest mana value.
   */
  visionQuest(ctx, es) {
    const x = es.x ?? 0;
    const p = ctx.s.players[es.controller];
    const fits = (id: ObjectId) => {
      const d = def(ctx, id);
      return (
        d.types.includes('Artifact') && d.types.includes('Creature') && manaValue(d.manaCost) <= x
      );
    };
    const best = [...p.library, ...p.graveyard]
      .filter(fits)
      .sort((a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost))[0];
    if (!best) return;
    const fromLibrary = p.library.includes(best);
    moveObject(ctx, best, 'battlefield', { controller: es.controller });
    if (x > 0) addCounters(ctx, best, x);
    if (x >= 4)
      obj(ctx, best).grantedKeywords = [...(obj(ctx, best).grantedKeywords ?? []), 'haste'];
    if (fromLibrary) shuffleLibrary(ctx, es.controller);
  },

  /**
   * Worlds Within Worlds: exile all creatures; each player puts every creature
   * card from their hand onto the battlefield (the engine always does); the
   * exiled cards go to their owners' hands. (It goes to the graveyard, not exile.)
   */
  worldsWithinWorlds(ctx) {
    const exiled = ctx.s.battlefield.filter((id) => isCreatureCard(ctx, id));
    for (const id of exiled) moveObject(ctx, id, 'exile');
    for (const player of ['p1', 'p2'] as const)
      for (const id of [...ctx.s.players[player].hand])
        if (isCreatureCard(ctx, id)) moveObject(ctx, id, 'battlefield', { controller: player });
    for (const id of exiled) if (ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
  },
};

const MSH_CHOOSERS: Record<string, Chooser> = {
  // Marvel Super Heroes Jumpstart (Tricksters)
  /**
   * The Clone Saga, chapter III: "Choose a card name." The names worth choosing: the creatures on
   * the battlefield and the creature cards in your hand (yours first). `then` is the emblem, which
   * gets the name.
   */
  cloneSagaName(ctx, es, params) {
    const then = (params as { then: EffectDef }).then;
    const ids = [
      ...ctx.s.battlefield.filter((id) => obj(ctx, id).controller === es.controller),
      ...ctx.s.players[es.controller].hand,
      ...ctx.s.battlefield.filter((id) => obj(ctx, id).controller !== es.controller),
    ].filter((id) => isCreatureCard(ctx, id) && !obj(ctx, id).isToken);
    // Impossible Man keeps his own name while he's a copy.
    const names = [...new Set(ids.map((id) => nameId(ctx, id)))];
    return {
      title: 'Choose a card name',
      options: names.map((defId) => ({
        label: ctx.db.get(defId)?.name ?? defId,
        effects: [{ ...then, named: defId } as EffectDef],
      })),
    };
  },
};
Object.assign(CHOOSERS, MSH_CHOOSERS);
