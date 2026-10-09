import { creatureValue } from './evaluate.ts';
import {
  type Action,
  type CardDefinition,
  type Engine,
  getCharacteristics,
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
 * Reality Fracture (17a): Variable Chaser's Arc of Fortune ("you may discard your hand and draw seven
 * cards"). The choice has no visible effect until the spell finishes, so evaluation can't compare the
 * options: a small hand is worth swapping for seven fresh cards.
 */
export function chooseHandSwap(s: GameState, me: PlayerId): number {
  return s.players[me].hand.length <= 3 ? 0 : 1;
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

/**
 * Forage, exiling from the graveyard: lands first, then other spells, and
 * creature cards last (cheapest first), since those can come back.
 */
export function chooseForageExile(engine: Engine, s: GameState, legal: Action[]): Action {
  const keep = (a: Action) => {
    const d = a.type === 'chooseCard' && a.card ? defOf(engine, s, a.card) : undefined;
    if (!d || d.types.includes('Land')) return 0;
    return d.types.includes('Creature') ? 10 + manaValue(d.manaCost) : 1 + manaValue(d.manaCost);
  };
  return legal.reduce((best, a) => (keep(a) < keep(best) ? a : best));
}

/**
 * Reality Fracture (17a fixes): ward's sacrifices (Vein Ripper, Emrakul): the permanent we'd miss least:
 * tokens, then surplus lands, then the cheapest or weakest of the rest.
 */
export function chooseWardSacrifice(engine: Engine, s: GameState, legal: Action[]): Action {
  const value = (a: Action) => {
    if (a.type !== 'chooseCard' || !a.card) return Infinity;
    const o = s.objects[a.card]!;
    const d = defOf(engine, s, a.card);
    if (d?.types.includes('Creature'))
      return (o.isToken ? 0 : 10) + creatureValue(s, engine.db, a.card);
    if (o.isToken) return 0;
    if (d?.types.includes('Land')) return 4;
    return 6 + (d ? manaValue(d.manaCost) : 0);
  };
  return legal.reduce((best, a) => (value(a) < value(best) ? a : best));
}

/**
 * Reality Fracture (17a fixes): "choose a creature type" with every type on offer (hundreds: never evaluate each).
 * The type our creatures (and, a little, our hand) share most; for a spell that wipes or bounces everything else
 * (Kindred Judgment, Raise the Palisade) the type that keeps our creatures and not theirs.
 */
/**
 * Celestial Reunion: the creature type to behold. The one the most creature cards on its side of the table (battlefield, hand,
 * graveyard) have is the one a creature it fetches is likeliest to share. The creatures themselves: the first.
 */
export function chooseBeholdType(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  d: Extract<GameState['decision'], { kind: 'beholdType' }>,
  legal: Action[],
): Action {
  if (d.chosenType !== undefined) return legal[0]!;
  const seen = [
    ...s.battlefield.filter((id) => s.objects[id]!.controller === me),
    ...s.players[me].hand,
    ...s.players[me].graveyard,
  ];
  let best = 0;
  let bestCount = -1;
  d.types.forEach((t, i) => {
    const n = seen.filter((id) => defOf(engine, s, id)?.subtypes.includes(t)).length;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  });
  return { type: 'chooseOption', player: me, index: best };
}

export function chooseCreatureType(
  engine: Engine,
  s: GameState,
  me: PlayerId,
  d: Extract<GameState['decision'], { kind: 'chooseOption' }>,
): Action {
  const src = engine.db.get(d.resume.sourceDefId);
  const purge = JSON.stringify(src?.spell ?? []).includes('notChosenTypeOfSource');
  const score = new Map<string, number>();
  const add = (type: string, v: number) => score.set(type, (score.get(type) ?? 0) + v);
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    const c = getCharacteristics(s, engine.db, id);
    if (!c.types.includes('Creature')) continue;
    const v = creatureValue(s, engine.db, id);
    for (const t of c.subtypes) add(t, o.controller === me ? v : purge ? -v : 0);
  }
  for (const id of s.players[me].hand) {
    const c = defOf(engine, s, id);
    if (c?.types.includes('Creature') && !purge) for (const t of c.subtypes) add(t, 0.5);
  }
  let best = 0;
  let bestScore = -Infinity;
  d.options.forEach((o, i) => {
    const v = score.get(o.label) ?? 0;
    if (v > bestScore) {
      best = i;
      bestScore = v;
    }
  });
  return { type: 'chooseOption', player: me, index: best };
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
    // Reality Fracture (17a): Enlightened Confidant: a card put into the graveyard that cheap goes to hand.
    if (d.toHandMaxMv !== undefined && manaValue(c.manaCost) <= d.toHandMaxMv) return false;
    if (c.types.includes('Land')) return lands < 5;
    return lands >= 3 && manaValue(c.manaCost) <= lands + 1;
  };
  const top = d.cards.filter(keep);
  const bottom = d.cards.filter((id) => !keep(id));
  const want: Action = { type: 'scry', player: me, top, bottom };
  const key = JSON.stringify(want);
  return legal.find((a) => JSON.stringify(a) === key) ?? legal[0]!;
}

/** Choosing from an opponent's hand (Thought-Stalker Warlock): their most expensive card. */
export function chooseFromHand(engine: Engine, s: GameState, legal: Action[]): Action {
  const value = (a: Action) => {
    const d = a.type === 'chooseCard' && a.card ? defOf(engine, s, a.card) : undefined;
    return d ? manaValue(d.manaCost) : -1;
  };
  const best = legal.reduce((b, a) => (value(a) > value(b) ? a : b));
  // Strixhaven (13c): Search for Blex: "any number" at 3 life each; only spells worth it, while life lasts.
  const d = s.decision;
  if (d.kind === 'pickCards' && d.upTo) {
    const done = legal.find((a) => a.type === 'chooseCard' && !a.card);
    const life = s.players[d.player].life - (d.lifePerCard ?? 0);
    if (done && (life < 8 || value(best) < 2)) return done;
  }
  return best;
}
