import { BASIC_ART, deckById, isJumpIn, jumpInPackets, slug } from '@mtg/cards';
import type { CardDefId, GameState, ObjectId, PlayerId } from '@mtg/engine';

/*
 * Basic lands wear the art of the set their deck belongs to (a Bloomburrow deck's Forests are
 * Bloomburrow's full-art Forests). A Jump In deck mixes the art of both its packets' sets. Each
 * land keeps one printing for the whole game: it's picked by its object id.
 */

const NAMES: Record<string, string> = Object.fromEntries(
  ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((n) => [slug(n), n]),
);
/** Commander sets use their main set's lands. */
const MAIN_SET: Record<string, string> = { msc: 'msh', fic: 'fin', soc: 'sos' };

let sets: Partial<Record<PlayerId, string[]>> = {};
const owners = new Map<ObjectId, PlayerId>();

function setsOf(deckId: string): string[] {
  const packets = isJumpIn(deckId) ? jumpInPackets(deckId) : undefined;
  const raw = packets ? packets.map((p) => p.set) : [deckById(deckId)?.set];
  return [...new Set(raw.map((s) => MAIN_SET[s ?? ''] ?? s ?? 'fdn'))];
}

/** Sets the art for a new game. */
export function setBasicArt(you: string, them: string): void {
  sets = { p1: setsOf(you), p2: setsOf(them) };
  owners.clear();
}

/** Notes who owns each basic land in the game, so a card can find its art by object id. */
export function trackBasics(state: GameState): void {
  for (const o of Object.values(state.objects))
    if (NAMES[o.defId] && !o.isToken && !owners.has(o.id)) owners.set(o.id, o.owner);
}

/** The art for a basic land object, or null for any other card (or before a game sets it). */
export function basicImage(defId: CardDefId, id: ObjectId | null | undefined): string | null {
  const name = NAMES[defId];
  const owner = id ? owners.get(id) : undefined;
  if (!name || !id || !owner) return null;
  const urls = (sets[owner] ?? []).flatMap((s) => BASIC_ART[s]?.[name] ?? []);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return urls.length ? urls[h % urls.length]! : null;
}
