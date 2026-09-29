import { cloneState } from './clone.ts';
import { createRng, shuffleInPlace } from './rng.ts';
import type { CardDefId, GameEvent, GameState, ObjectId, PlayerId, ZoneName } from './types.ts';
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
export function redactFor(state: GameState, viewer: PlayerId): GameState {
  const s = cloneState(state);
  for (const p of PLAYERS) {
    const ps = s.players[p];
    const hidden = p === viewer ? ps.library : [...ps.library, ...ps.hand];
    for (const id of hidden) s.objects[id]!.defId = HIDDEN_CARD;
  }
  s.seed = 0;
  s.rng = { s: [0, 0, 0, 0] };
  return s;
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
      if (o.owner !== p || o.isToken) continue;
      if (o.defId === HIDDEN_CARD) {
        hidden.push(id);
        continue;
      }
      const i = remaining.indexOf(o.defId);
      if (i < 0) throw new Error(`${o.defId} (${id}) is not in ${p}'s decklist`);
      remaining.splice(i, 1);
    }
    if (remaining.length !== hidden.length)
      throw new Error(
        `${p}: ${hidden.length} hidden cards but ${remaining.length} unaccounted for`,
      );
    shuffleInPlace(rng, remaining);
    hidden.forEach((id, i) => (s.objects[id]!.defId = remaining[i]!));
  }
  s.seed = seed;
  s.rng = createRng(seed ^ 0x5bd1e995);
  return s;
}
