import type { CardDb, CardDefId, CardDefinition } from '@mtg/engine';
import { BEHAVIORS, TOKENS } from './behaviors.ts';
import { buildCard, slug } from './build.ts';
import { DECKS, type Decklist } from './decks.ts';
import scryfall from './generated/scryfall.json' with { type: 'json' };
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
export type { ScryfallCard } from './scryfall-types.ts';

export const SCRYFALL: readonly ScryfallCard[] = scryfall as ScryfallCard[];

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

export function deckById(id: string): Decklist {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown deck "${id}"`);
  return d;
}
