import {
  type CardDb,
  type GameState,
  getCharacteristics,
  manaValue,
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
/**
 * Weights for what the evaluation added for the Marvel decks (exported so
 * experiments can switch them off).
 */
export const WEIGHTS = {
  /** Each mana value point above 2 of a noncreature permanent (engines such as Whirlwind of Thought). */
  permanentPerMana: 0.25,
  permanentCap: 3,
  /** Being the monarch: about a card and a half (a card every turn while it lasts). */
  monarch: 3,
  /** Each "if you've cast a noncreature spell this turn" combat payoff switched on before combat. */
  combatPayoff: 1.5,
  /** Cards still to come (rebound, suspend, castable in exile), relative to a card in hand. */
  laterCard: 1,
};
/** Each loyalty counter on a planeswalker. */
export const LOYALTY = 0.4;

/**
 * Before combat on `me`'s turn: permanents with a beginning-of-combat trigger
 * that needs a noncreature spell cast this turn, now that one has been.
 */
function precombatPayoffs(s: GameState, db: CardDb, me: PlayerId): number {
  if (s.turn.activePlayer !== me || !['upkeep', 'draw', 'main1'].includes(s.turn.step)) return 0;
  const cast = s.turn.castDefs?.[me] ?? [];
  if (!cast.some((id) => !db.get(id)?.types.includes('Creature'))) return 0;
  return s.battlefield.filter((id) => {
    const o = s.objects[id]!;
    return (
      o.controller === me &&
      !!db
        .get(o.defId)
        ?.abilities.some(
          (a) =>
            a.kind === 'triggered' &&
            a.trigger.on === 'beginningOfCombat' &&
            a.condition?.kind === 'castNoncreatureThisTurn',
        )
    );
  }).length;
}

/** Cards `p` will get to cast later: suspended, rebound, or exiled and castable by them. */
function laterCards(s: GameState, p: PlayerId): number {
  let n = 0;
  for (const q of ['p1', 'p2'] as const)
    for (const id of s.players[q].exile) {
      const o = s.objects[id]!;
      if (
        (q === p && (o.suspended || (o.playableUntilTurn ?? -1) >= s.turn.number)) ||
        o.castableBy === p ||
        o.playFreeBy === p
      )
        n++;
    }
  for (const d of s.delayed ?? [])
    if (d.controller === p && d.effects.some((e) => e.kind === 'castFreeCard')) n++;
  return n;
}

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
  // Brawl: a commander waiting in the command zone is a card in hand that costs more each time.
  v += CARD_IN_HAND * (s.players[me].command.length - s.players[opp].command.length);
  if (s.monarch) v += s.monarch === me ? WEIGHTS.monarch : -WEIGHTS.monarch;
  // The Fantastic Four: before combat, a noncreature spell switches on "at the beginning of combat" payoffs.
  v += WEIGHTS.combatPayoff * precombatPayoffs(s, db, me);
  // Cards still to come: rebound and suspend, free or stolen cards in exile.
  v += WEIGHTS.laterCard * CARD_IN_HAND * (laterCards(s, me) - laterCards(s, opp));

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
      else if (o.isToken) v += sign * SPENDABLE_TOKEN;
      else {
        const mv = def ? manaValue(def.manaCost) : 0;
        v +=
          sign *
          Math.min(
            WEIGHTS.permanentCap,
            OTHER_PERMANENT + WEIGHTS.permanentPerMana * Math.max(0, mv - 2),
          );
      }
    }
  } finally {
    s.effects = effects;
  }
  return v;
}
