import type { CardDb, CardDefId, CardDefinition } from '@mtg/engine';
import { BEHAVIORS, TOKENS } from './behaviors.ts';
import { buildCard, slug } from './build.ts';
import { DECKS, type Decklist } from './decks.ts';
import { PACKETS, packetCards } from './jumpin.ts';
import scryfall from './generated/scryfall.json' with { type: 'json' };
import foundations from './generated/foundations-pack-candidates.json' with { type: 'json' };
import type { ScryfallCard } from './scryfall-types.ts';

export { BEHAVIORS, TOKENS } from './behaviors.ts';
export { buildCard, slug, parseManaCost, parseTypeLine } from './build.ts';
export {
  BLACK_POOL,
  BLUE_POOL,
  GREEN_POOL,
  LAND_POOL,
  OTHER_POOL,
  RED_POOL,
  WHITE_POOL,
} from './pool.ts';
export { describeEvent } from './log.ts';
export { ARENA_DECKS, COLOR_CHALLENGE_DECKS, DECKS } from './decks.ts';
export type { Decklist } from './decks.ts';
export { PACKET_LANDS, PACKETS, packetCards } from './jumpin.ts';
export type { Packet } from './jumpin.ts';
export type { ScryfallCard } from './scryfall-types.ts';

export const SCRYFALL: readonly ScryfallCard[] = scryfall as ScryfallCard[];
export const FOUNDATIONS_PACK_CANDIDATES = foundations;

export const CARDS: readonly CardDefinition[] = [
  ...SCRYFALL.map((sc) => buildCard(sc, BEHAVIORS[sc.name])),
  ...TOKENS,
];

export const cardDb: CardDb = new Map(CARDS.map((c) => [c.id, c]));

/** Scryfall data by card id, for image hotlinking in the UI. */
export const scryfallById: ReadonlyMap<CardDefId, ScryfallCard> = new Map(
  SCRYFALL.map((sc) => [slug(sc.name), sc]),
);

/** Expands a decklist to card ids. */
export function deckIds(list: Decklist): CardDefId[] {
  return list.cards.flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

/** Cards in the list we haven't implemented yet (empty = playable). */
export function missingCards(list: Decklist): string[] {
  return list.cards.map(([name]) => name).filter((name) => !cardDb.has(slug(name)));
}

export const isPlayable = (list: Decklist): boolean => missingCards(list).length === 0;

export const PLAYABLE_DECKS: readonly Decklist[] = DECKS.filter(isPlayable);

/** Id of the deck made from two Jump In packets. */
export const jumpInId = (a: string, b: string): string => `jump-in:${a}+${b}`;
export const isJumpIn = (id: string): boolean => id.startsWith('jump-in:');

/** Two packets shuffled together: 40 cards named after both themes, with the first one's face. */
function jumpInDeck(id: string): Decklist | undefined {
  const m = /^jump-in:([\w-]+)\+([\w-]+)$/.exec(id);
  const a = PACKETS.find((p) => p.id === m?.[1]);
  const b = PACKETS.find((p) => p.id === m?.[2]);
  if (!a || !b) return undefined;
  const counts = new Map<string, number>();
  for (const [name, n] of [...packetCards(a), ...packetCards(b)])
    counts.set(name, (counts.get(name) ?? 0) + n);
  return {
    id,
    name: `${a.name} + ${b.name}`,
    colors: [...new Set([a.color, b.color])],
    face: a.face,
    source: 'custom',
    series: 'jumpIn',
    cards: [...counts],
  };
}

/** A deck by id: one of DECKS, or a Jump In pair. */
export function findDeck(id: string): Decklist | undefined {
  return DECKS.find((x) => x.id === id) ?? jumpInDeck(id);
}

export function deckById(id: string): Decklist {
  const d = findDeck(id);
  if (!d) throw new Error(`Unknown deck "${id}"`);
  return d;
}
