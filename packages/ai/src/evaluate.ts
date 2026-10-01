import {
  type CardDb,
  type GameState,
  getCharacteristics,
  type Keyword,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';
import { other } from './view.ts';

const KEYWORD_VALUE: Partial<Record<Keyword, number>> = {
  flying: 1.5,
  doubleStrike: 2.5,
  deathtouch: 1.5,
  firstStrike: 1,
  lifelink: 1,
  menace: 0.8,
  hexproof: 0.7,
  indestructible: 1.5,
  trample: 0.5,
  vigilance: 0.5,
  reach: 0.5,
  haste: 0.2,
};

export const CARD_IN_HAND = 2;
export const LAND_ON_BATTLEFIELD = 0.4;
/** Treasure, Food and similar one-shot tokens. */
export const SPENDABLE_TOKEN = 0.8;
/** Other noncreature permanents (Equipment, enchantments); an attached Equipment also shows in its creature's stats. */
export const OTHER_PERMANENT = 1.5;
/** Each loyalty counter on a planeswalker. */
export const LOYALTY = 0.4;

/** Life is worth more the lower it gets. */
export function lifeValue(life: number): number {
  return 10 * Math.log(1 + Math.max(0, life));
}

export function creatureValue(s: GameState, db: CardDb, id: ObjectId): number {
  const c = getCharacteristics(s, db, id);
  let v = 1 + 1.5 * Math.max(0, c.power) + Math.max(0, c.toughness);
  for (const k of c.keywords) v += KEYWORD_VALUE[k] ?? 0;
  const def = db.get(s.objects[id]!.defId);
  if (
    def?.abilities.some(
      (a) => a.kind === 'activated' || a.kind === 'triggered' || a.kind === 'static',
    )
  )
    v += 1;
  return v;
}

/**
 * Static evaluation from `me`'s point of view. Until-end-of-turn effects are
 * ignored: a pump spell only scores if it changes a combat outcome.
 */
export function evaluate(s: GameState, db: CardDb, me: PlayerId): number {
  if (s.winner) return s.winner === 'draw' ? 0 : s.winner === me ? 10000 : -10000;
  const opp = other(me);
  let v = lifeValue(s.players[me].life) - lifeValue(s.players[opp].life);
  v += CARD_IN_HAND * (s.players[me].hand.length - s.players[opp].hand.length);

  const effects = s.effects;
  s.effects = [];
  try {
    for (const id of s.battlefield) {
      const o = s.objects[id]!;
      const def = db.get(o.defId);
      const sign = o.controller === me ? 1 : -1;
      if (def?.types.includes('Creature')) v += sign * creatureValue(s, db, id);
      else if (def?.types.includes('Land')) v += sign * LAND_ON_BATTLEFIELD;
      // A planeswalker is worth more the more loyalty it has.
      else if (def?.types.includes('Planeswalker'))
        v += sign * (OTHER_PERMANENT + LOYALTY * (o.counters?.loyalty ?? 0));
      else v += sign * (o.isToken ? SPENDABLE_TOKEN : OTHER_PERMANENT);
    }
  } finally {
    s.effects = effects;
  }
  return v;
}
