import { isCreature } from './characteristics.ts';
import {
  addCounters,
  type Ctx,
  type CustomEffect,
  def,
  drawCard,
  moveObject,
  obj,
  tap,
} from './context.ts';
import { manaValue } from './cost.ts';
import { escalateCrew } from './stack.ts';
import type { ObjectId } from './types.ts';

/** Secrets of Strixhaven (14b, group A: white, Silverquill, Lorehold): one-offs, as custom effects. */

type Source = Parameters<CustomEffect>[1];

/** The card or permanent the nth target names, if it is still in `zone`. */
function targetIn(ctx: Ctx, es: Source, n: number, zone: string): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === zone && o.zcc === t.object.zcc ? o.id : undefined;
}

/** "Until the end of its owner's next turn": the turn number to compare with `playableUntilTurn`. */
function untilEndOfNextTurn(ctx: Ctx, owner: string): number {
  return ctx.s.turn.number + (ctx.s.turn.activePlayer === owner ? 2 : 1);
}

export const SOS_14B_A_EFFECTS: Record<string, CustomEffect> = {
  /** Practiced Offense: a +1/+1 counter on each creature the target player controls. */
  countersOnTargetPlayersCreatures(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    for (const id of [...ctx.s.battlefield])
      if (obj(ctx, id).controller === t.player && isCreature(ctx, id)) addCounters(ctx, id, 1);
  },

  /** Fix What's Broken: return each artifact and creature card with mana value X from your graveyard. */
  returnEachWithManaValueX(ctx, es) {
    const x = es.x ?? 0;
    for (const id of [...ctx.s.players[es.controller].graveyard]) {
      const d = def(ctx, id);
      if (!d.types.includes('Artifact') && !d.types.includes('Creature')) continue;
      if (manaValue(d.manaCost) !== x) continue;
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
    }
  },

  /**
   * Nita, Forum Conciliator: exile the target instant or sorcery card from an
   * opponent's graveyard. You may cast it this turn with mana of any type; if it
   * would go to a graveyard it's exiled instead.
   */
  nitaExile(ctx, es) {
    const id = targetIn(ctx, es, 0, 'graveyard');
    if (!id) return;
    moveObject(ctx, id, 'exile');
    const o = obj(ctx, id);
    o.castableBy = es.controller;
    o.castableUntilTurn = ctx.s.turn.number;
    o.anyMana = true;
    o.exileAfterCast = true;
  },

  /** Flashback: the target instant or sorcery card gains flashback (its mana cost) until end of turn. */
  grantFlashback(ctx, es) {
    const id = targetIn(ctx, es, 0, 'graveyard');
    if (id === undefined) return;
    const o = obj(ctx, id);
    o.playableUntilTurn = ctx.s.turn.number;
    o.flashbackGrantedTurn = ctx.s.turn.number;
    o.noSpellLock = true;
  },

  /** Ark of Hunger: mill a card; you may play it this turn. */
  millAndMayPlay(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return;
    moveObject(ctx, top, 'graveyard');
    const o = obj(ctx, top);
    if (o.zone !== 'graveyard') return;
    o.playableUntilTurn = ctx.s.turn.number;
    o.noSpellLock = true;
  },

  /** Borrowed Knowledge, second mode: discard your hand, then draw that many cards. */
  discardHandDrawThatMany(ctx, es) {
    const hand = [...ctx.s.players[es.controller].hand];
    for (const id of hand) moveObject(ctx, id, 'graveyard');
    for (let i = 0; i < hand.length; i++) drawCard(ctx, es.controller);
  },

  /** Aziza, Mage Tower Captain: tap three untapped creatures you control (the least powerful). */
  tapThreeCreatures(ctx, es) {
    for (const id of escalateCrew(ctx, es.controller, 3) ?? []) tap(ctx, id);
  },

  /** Practiced Scrollsmith: exile the target card from your graveyard; you may cast it until the end of your next turn. */
  exileCastUntilNextTurn(ctx, es) {
    const id = targetIn(ctx, es, 0, 'graveyard');
    if (!id) return;
    moveObject(ctx, id, 'exile');
    obj(ctx, id).playableUntilTurn = untilEndOfNextTurn(ctx, es.controller);
  },

  /**
   * Suspend Aggression: exile the target nonland permanent and the top card of
   * your library; each one's owner may play it until the end of their next turn.
   */
  suspendAggression(ctx, es) {
    const cards: ObjectId[] = [];
    const permanent = targetIn(ctx, es, 0, 'battlefield');
    if (permanent) cards.push(permanent);
    const top = ctx.s.players[es.controller].library[0];
    if (top !== undefined) cards.push(top);
    for (const id of cards) {
      const o = obj(ctx, id);
      const owner = o.owner;
      const isToken = o.isToken;
      moveObject(ctx, id, 'exile');
      if (isToken) continue;
      obj(ctx, id).playableUntilTurn = untilEndOfNextTurn(ctx, owner);
    }
  },
};
