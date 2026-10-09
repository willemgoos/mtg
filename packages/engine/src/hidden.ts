import { cloneState } from './clone.ts';
import { createRng, shuffleInPlace } from './rng.ts';
import type {
  CardDb,
  CardDefId,
  GameEvent,
  GameState,
  ObjectId,
  PlayerId,
  ZoneName,
} from './types.ts';
import { PLAYERS } from './types.ts';

/** defId of a card whose identity the viewer doesn't know. */
export const HIDDEN_CARD = '?';

function zoneVisible(zone: ZoneName | null, owner: PlayerId, viewer: PlayerId): boolean {
  if (zone === 'library') return false;
  if (zone === 'hand') return owner === viewer;
  return true;
}

/**
 * The state as `viewer` may see it: both libraries and the opponent's hand
 * become HIDDEN_CARD, and the seed/RNG are wiped (they would predict shuffles).
 * Zone sizes, ids and all public zones are kept.
 */
export function redactFor(state: GameState, viewer: PlayerId, db?: CardDb): GameState {
  const s = cloneState(state);
  for (const p of PLAYERS) {
    const ps = s.players[p];
    // Strixhaven (13a): the opponent's sideboard is not known.
    if (p !== viewer && ps.sideboard) ps.sideboard = ps.sideboard.map(() => HIDDEN_CARD);
    const hidden = p === viewer ? ps.library : [...ps.library, ...ps.hand];
    const d = state.decision;
    const seen =
      p === viewer
        ? knownLibraryCards(state, viewer, db)
        : d.kind === 'choosePile' && d.player === viewer && d.owner === p
          ? d.faceUp
          : // They reveal their hand while the viewer chooses from it.
            d.kind === 'chooseFromHand' && d.player === viewer && d.from === p
            ? (d.among ?? ps.hand) // Lorwyn Eclipsed (18b, black): Taster of Wares, only the cards they chose to reveal
            : [];
    // Brawl: everyone knows which card a commander is, wherever it went (a simplification in a library).
    for (const id of hidden)
      if (!seen.includes(id) && id !== ps.commander) s.objects[id]!.defId = HIDDEN_CARD;
  }
  if (state.decision.kind === 'chooseOption' && state.decision.lifeGainReplay) {
    for (const id of state.decision.lifeGainReplay.revealed)
      if (s.objects[id]) s.objects[id]!.defId = state.objects[id]!.defId;
  }
  // Caretakers: redact the one bounded replay snapshot independently, then
  // preserve identities the viewer learned during the partial resolution.
  if (state.decision.kind === 'chooseOption' && state.decision.lifeGainReplay &&
      s.decision.kind === 'chooseOption' && s.decision.lifeGainReplay) {
    const original = state.decision.lifeGainReplay.original;
    const redacted = redactFor(original, viewer, db);
    for (const id in redacted.objects) {
      if (s.objects[id] && s.objects[id]!.defId !== HIDDEN_CARD)
        redacted.objects[id]!.defId = original.objects[id]!.defId;
    }
    s.decision.lifeGainReplay.original = redacted;
  }
  s.seed = 0;
  s.rng = { s: [0, 0, 0, 0] };
  return s;
}

/**
 * Library cards `viewer` may look at right now: while scrying or searching,
 * and the top card with Vizier of the Menagerie (needs `db` to tell).
 */
function knownLibraryCards(s: GameState, viewer: PlayerId, db: CardDb | undefined): ObjectId[] {
  const d = s.decision;
  const out: ObjectId[] = [];
  if (d.kind === 'scry' && d.player === viewer) out.push(...d.cards);
  if (d.kind === 'searchLibrary' && d.player === viewer && !d.fromGraveyard)
    out.push(...(d.looked ?? s.players[viewer].library));
  if (d.kind === 'splitPiles' && d.player === viewer) out.push(...d.cards);
  // The owner knows both piles; the chooser only sees the face-up one (checked below for the owner's library).
  if (d.kind === 'choosePile' && d.owner === viewer) out.push(...d.faceUp, ...d.faceDown);
  const top = s.players[viewer].library[0];
  const vizier = (id: ObjectId) =>
    s.objects[id]!.controller === viewer &&
    !!db
      ?.get(s.objects[id]!.defId)
      ?.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'creaturesFromTopOfLibrary');
  if (top && s.battlefield.some(vizier)) out.push(top);
  // Glarb: "You may look at the top card of your library any time."
  const glarb = (id: ObjectId) =>
    s.objects[id]!.controller === viewer &&
    !!db
      ?.get(s.objects[id]!.defId)
      ?.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'playFromTop');
  if (top && !out.includes(top) && s.battlefield.some(glarb)) out.push(top);
  return out;
}

/** Hides card identities in events that move a card between zones the viewer can't see. */
export function redactEvents(
  events: readonly GameEvent[],
  stateAfter: GameState,
  viewer: PlayerId,
): GameEvent[] {
  return events.map((e) => {
    if (e.type !== 'objectMoved') return e;
    const owner = stateAfter.objects[e.id]?.owner;
    if (!owner) return e; // tokens are always public
    const hidden = !zoneVisible(e.from, owner, viewer) && !zoneVisible(e.to, owner, viewer);
    return hidden ? { ...e, defId: HIDDEN_CARD } : e;
  });
}

/**
 * Fills in hidden cards with a random assignment consistent with the known
 * decklists (each deck minus that player's visible cards), and gives the state
 * a fresh RNG. Bots simulate on many such samples ("determinization").
 */
export function determinize(
  redacted: GameState,
  decks: Record<PlayerId, readonly CardDefId[]>,
  seed: number,
): GameState {
  const s = cloneState(redacted);
  const rng = createRng(seed);
  for (const p of PLAYERS) {
    const remaining = [...decks[p]];
    const hidden: ObjectId[] = [];
    for (const id in s.objects) {
      const o = s.objects[id]!;
      // A commander isn't in the decklist (and is never hidden).
      if (o.owner !== p || o.isToken || id === s.players[p].commander) continue;
      if (o.defId === HIDDEN_CARD) {
        hidden.push(id);
        continue;
      }
      // A permanent copying another card (Mirage Mirror, Mockingbird) is still its own card in the list.
      const card = o.originalDefId ?? o.defId;
      const i = remaining.indexOf(card);
      if (i < 0) throw new Error(`${card} (${id}) is not in ${p}'s decklist`);
      remaining.splice(i, 1);
    }
    if (remaining.length !== hidden.length)
      throw new Error(
        `${p}: ${hidden.length} hidden cards but ${remaining.length} unaccounted for`,
      );
    shuffleInPlace(rng, remaining);
    hidden.forEach((id, i) => (s.objects[id]!.defId = remaining[i]!));
  }
  // Reuse the same physical-card assignment by object ID in the original
  // snapshot. Sample only once, so a card drawn before the choice stays known.
  if (s.decision.kind === 'chooseOption' && s.decision.lifeGainReplay) {
    const original = cloneState(s.decision.lifeGainReplay.original);
    for (const id in original.objects) {
      const o = original.objects[id]!;
      if (o.defId === HIDDEN_CARD && s.objects[id])
        o.defId = s.objects[id]!.originalDefId ?? s.objects[id]!.defId;
    }
    original.seed = seed;
    original.rng = createRng(seed ^ 0x5bd1e995);
    s.decision.lifeGainReplay.original = original;
  }
  s.seed = seed;
  s.rng = createRng(seed ^ 0x5bd1e995);
  return s;
}
