import { creatureValue } from './evaluate.ts';
import {
  type Action,
  type CardDefinition,
  type Engine,
  type GameState,
  HIDDEN_CARD,
  type ManaType,
  manaValue,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';

function defOf(engine: Engine, s: GameState, id: ObjectId): CardDefinition | undefined {
  const defId = s.objects[id]?.defId;
  return defId && defId !== HIDDEN_CARD ? engine.db.get(defId) : undefined;
}

function manaTypes(d: CardDefinition): ManaType[] {
  return d.abilities.flatMap((a) => (a.kind === 'mana' ? [a.produces] : []));
}

function landsInPlay(engine: Engine, s: GameState, me: PlayerId): ObjectId[] {
  return s.battlefield.filter(
    (id) => s.objects[id]!.controller === me && !!defOf(engine, s, id)?.types.includes('Land'),
  );
}

/**
 * Which land to play. A land that enters tapped goes down on turns where one
 * more untapped mana wouldn't let us cast anything extra; otherwise we play
 * an untapped one. Ties go to the land adding a colour our hand needs.
 */
export function chooseLandToPlay(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  landPlays: Extract<Action, { type: 'playLand' }>[],
): Action {
  const hand = s.players[me].hand
    .map((id) => defOf(engine, s, id))
    .filter((d): d is CardDefinition => !!d && !d.types.includes('Land'));
  const lands = landsInPlay(engine, s, me);
  const untapped = lands.filter((id) => !s.objects[id]!.tapped).length;
  const needsOneMore = hand.some((d) => manaValue(d.manaCost) === untapped + 1);

  const have = new Set(lands.flatMap((id) => manaTypes(defOf(engine, s, id)!)));
  const wanted = new Map<ManaType, number>();
  for (const d of hand)
    for (const [t, n] of Object.entries(d.manaCost.colored) as [ManaType, number][])
      wanted.set(t, (wanted.get(t) ?? 0) + n);

  const score = (a: Extract<Action, { type: 'playLand' }>) => {
    const d = defOf(engine, s, a.card)!;
    const tappedScore = d.entersTapped ? (needsOneMore ? -10 : 1) : 0;
    const colours = manaTypes(d);
    const newColours = colours.filter((t) => !have.has(t) && wanted.has(t)).length;
    const useful = colours.reduce((n, t) => n + (wanted.get(t) ?? 0), 0);
    return tappedScore + 3 * newColours + 0.1 * useful;
  };
  return landPlays.reduce((best, a) => (score(a) > score(best) ? a : best));
}

/** Sacrifice: the creature we value least. */
export function chooseSacrifice(engine: Engine, s: GameState, legal: Action[]): Action {
  const value = (a: Action) =>
    a.type === 'chooseCard' && a.card ? creatureValue(s, engine.db, a.card) : Infinity;
  return legal.reduce((best, a) => (value(a) < value(best) ? a : best));
}

/**
 * Perforating Artist: take the life loss while life is comfortable; otherwise
 * give up the cheapest card in hand (lands first once we have enough) or,
 * failing that, the least valuable permanent.
 */
export function choosePunishment(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  legal: Action[],
): Action {
  const d = s.decision;
  if (d.kind !== 'punisher') return legal[0]!;
  const lose: Action = { type: 'chooseCard', player: me, card: null };
  if (s.players[me].life - d.life > 8) return lose;
  const lands = landsInPlay(engine, s, me).length;
  const handCost = (id: ObjectId) => {
    const c = defOf(engine, s, id);
    if (!c) return 5;
    if (c.types.includes('Land')) return lands >= 5 ? 0 : 6;
    return manaValue(c.manaCost);
  };
  const inHand = d.options.filter((id) => s.objects[id]!.zone === 'hand');
  const cheapest = inHand.sort((a, b) => handCost(a) - handCost(b))[0];
  if (cheapest !== undefined && handCost(cheapest) <= 2)
    return { type: 'chooseCard', player: me, card: cheapest };
  const perms = d.options.filter((id) => s.objects[id]!.zone === 'battlefield');
  const value = (id: ObjectId) =>
    defOf(engine, s, id)?.types.includes('Creature') ? creatureValue(s, engine.db, id) : 1.5;
  const weakest = perms.sort((a, b) => value(a) - value(b))[0];
  if (weakest !== undefined && value(weakest) < 3)
    return { type: 'chooseCard', player: me, card: weakest };
  if (cheapest !== undefined) return { type: 'chooseCard', player: me, card: cheapest };
  return lose;
}

/** Strongbox Raider: the exiled card we are most likely to use, preferring the priciest castable spell. */
export function choosePickExiled(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  legal: Action[],
): Action {
  const lands = landsInPlay(engine, s, me).length;
  const score = (a: Action) => {
    if (a.type !== 'chooseCard' || !a.card) return -1;
    const c = defOf(engine, s, a.card);
    if (!c) return 0;
    if (c.types.includes('Land')) return lands < 5 ? 4 : 0.5;
    const mv = manaValue(c.manaCost);
    return mv <= lands + 1 ? 2 + mv : 1;
  };
  return legal.reduce((best, a) => (score(a) > score(best) ? a : best));
}

/** Curator of Destinies (splitting): the best card alone face up, the rest face down. */
export function chooseSplit(engine: Engine, s: GameState, me: PlayerId, legal: Action[]): Action {
  const d = s.decision;
  if (d.kind !== 'splitPiles') return legal[0]!;
  const value = (id: ObjectId) => {
    const c = defOf(engine, s, id);
    return !c || c.types.includes('Land') ? 0 : manaValue(c.manaCost);
  };
  const best = [...d.cards].sort((a, b) => value(b) - value(a))[0]!;
  return (
    legal.find((a) => a.type === 'splitPiles' && a.faceUp.length === 1 && a.faceUp[0] === best) ??
    legal[0]!
  );
}

/** Curator of Destinies (choosing for the opponent's hand): the smaller pile, ties to face down. */
export function choosePile(s: GameState, me: PlayerId): Action {
  const d = s.decision;
  if (d.kind !== 'choosePile') throw new Error('not choosing a pile');
  const pile = d.faceUp.length < d.faceDown.length ? 'faceUp' : 'faceDown';
  return { type: 'choosePile', player: me, pile };
}

/** Library search for a basic land: the colour our hand needs most and we produce least. */
export function chooseSearch(engine: Engine, s: GameState, me: PlayerId, legal: Action[]): Action {
  const d = s.decision;
  // Loot / Inspiration from Beyond: take the most expensive card.
  if (d.kind === 'searchLibrary' && (d.to === 'battlefield' || d.fromGraveyard)) {
    const mv = (a: Action) => {
      const c = a.type === 'chooseCard' && a.card ? defOf(engine, s, a.card) : undefined;
      return c ? manaValue(c.manaCost) : -1;
    };
    return legal.reduce((best, a) => (mv(a) > mv(best) ? a : best));
  }
  const need = new Map<ManaType, number>();
  for (const id of s.players[me].hand) {
    const d = defOf(engine, s, id);
    if (!d) continue;
    for (const [t, n] of Object.entries(d.manaCost.colored) as [ManaType, number][])
      need.set(t, (need.get(t) ?? 0) + n);
  }
  for (const id of landsInPlay(engine, s, me))
    for (const t of manaTypes(defOf(engine, s, id)!)) need.set(t, (need.get(t) ?? 0) - 1);
  const score = (a: Action) => {
    if (a.type !== 'chooseCard' || !a.card) return -Infinity;
    const d = defOf(engine, s, a.card);
    return d ? Math.max(...manaTypes(d).map((t) => need.get(t) ?? 0)) : -Infinity;
  };
  return legal.reduce((best, a) => (score(a) > score(best) ? a : best));
}

/**
 * Scry: keep a land on top while we are short of lands, keep a spell on top
 * while we could cast it soon; everything else goes to the bottom.
 */
export function chooseScry(engine: Engine, s: GameState, me: PlayerId, legal: Action[]): Action {
  const d = s.decision;
  if (d.kind !== 'scry') return legal[0]!;
  const hand = s.players[me].hand.map((id) => defOf(engine, s, id));
  const lands =
    landsInPlay(engine, s, me).length + hand.filter((x) => x?.types.includes('Land')).length;
  const keep = (id: ObjectId) => {
    const c = defOf(engine, s, id);
    if (!c) return true;
    if (c.types.includes('Land')) return lands < 5;
    return lands >= 3 && manaValue(c.manaCost) <= lands + 1;
  };
  const top = d.cards.filter(keep);
  const bottom = d.cards.filter((id) => !keep(id));
  const want: Action = { type: 'scry', player: me, top, bottom };
  const key = JSON.stringify(want);
  return legal.find((a) => JSON.stringify(a) === key) ?? legal[0]!;
}
