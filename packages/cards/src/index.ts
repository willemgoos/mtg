import type { CardDb, CardDefId, CardDefinition, NewGameOptions, PlayerId } from '@mtg/engine';
import { BEHAVIORS, TOKENS } from './behaviors.ts';
import { buildCard, slug } from './build.ts';
import { DECKS, type Decklist } from './decks.ts';
import { type Packet, PACKETS, packetCards } from './jumpin.ts';
import scryfall from './generated/scryfall.json' with { type: 'json' };
import foundations from './generated/foundations-pack-candidates.json' with { type: 'json' };
import type { ScryfallCard } from './scryfall-types.ts';

export { BEHAVIORS, TOKENS } from './behaviors.ts';
export { buildCard, slug, parseManaCost, parseTypeLine } from './build.ts';
export {
  BLACK_POOL,
  BLOOMBURROW_POOL,
  MARVEL_POOL,
  BLUE_POOL,
  FOUNDATIONS_DRAFT_POOL,
  FOUNDATIONS_JUMP_IN_POOL,
  GREEN_POOL,
  LAND_POOL,
  MARVEL_BRAWL_POOL,
  FINAL_FANTASY_POOL,
  FINAL_FANTASY_BRAWL_POOL,
  OTHER_POOL,
  RED_POOL,
  WHITE_POOL,
} from './pool.ts';
export { describeEvent } from './log.ts';
export {
  ARENA_DECKS,
  BLOOMBURROW_DECKS,
  BLOOMBURROW_TROPHY_DECKS,
  COLOR_CHALLENGE_DECKS,
  DECKS,
  FOUNDATIONS_TROPHY_DECKS,
  MARVEL_DECKS,
  MARVEL_BRAWL_DECKS,
  MARVEL_TROPHY_DECKS,
  FINAL_FANTASY_TROPHY_DECKS,
  FINAL_FANTASY_DECKS,
  FINAL_FANTASY_STARTER_KIT_DECKS,
  FINAL_FANTASY_BRAWL_DECKS,
} from './decks.ts';
export type { Decklist } from './decks.ts';
export {
  ARENA_BLB_PACKETS,
  MARVEL_JUMPSTART_PACKETS,
  ARENA_FDN_PACKETS,
  PACKET_LANDS,
  PACKETS,
  packetCards,
} from './jumpin.ts';
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

/** The name to show: the Marvel name on a Marvel reprint, else the card's name. */
export const displayName = (d: CardDefinition): string => d.flavorName ?? d.name;

/** Expands a decklist to card ids. */
export function deckIds(list: Decklist): CardDefId[] {
  return list.cards.flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

/** Cards in the list we haven't implemented yet (empty = playable). */
export function missingCards(list: Decklist): string[] {
  return [...list.cards.map(([name]) => name), ...(list.commander ? [list.commander] : [])].filter(
    (name) => !cardDb.has(slug(name)),
  );
}

/** A Brawl deck's commander as a card id (undefined for other decks). */
export const commanderId = (list: Decklist): CardDefId | undefined =>
  list.commander ? slug(list.commander) : undefined;

/**
 * Engine options for a game between two decks: Brawl decks bring their
 * commanders and the Brawl format.
 */
export function deckGameOptions(
  p1: Decklist,
  p2: Decklist,
): Pick<NewGameOptions, 'format' | 'commanders'> & { decks: Record<PlayerId, CardDefId[]> } {
  const brawl = p1.series === 'brawl' || p2.series === 'brawl';
  const c1 = commanderId(p1);
  const c2 = commanderId(p2);
  return {
    decks: { p1: deckIds(p1), p2: deckIds(p2) },
    ...(brawl
      ? {
          format: 'brawl' as const,
          commanders: { ...(c1 ? { p1: c1 } : {}), ...(c2 ? { p2: c2 } : {}) },
        }
      : {}),
  };
}

/** Is this a Brawl deck (plays only against other Brawl decks)? */
export const isBrawl = (list: Decklist): boolean => list.series === 'brawl';

export const isPlayable = (list: Decklist): boolean => missingCards(list).length === 0;

/** Playable 60-card decks (Brawl decks are separate: they only play each other). */
export const PLAYABLE_DECKS: readonly Decklist[] = DECKS.filter(
  (d) => isPlayable(d) && !isBrawl(d),
);

/** Playable Brawl decks. */
export const PLAYABLE_BRAWL_DECKS: readonly Decklist[] = DECKS.filter(
  (d) => isPlayable(d) && isBrawl(d),
);

/** Id of the deck made from two Jump In packets. */
export const jumpInId = (a: string, b: string): string => `jump-in:${a}+${b}`;
export const isJumpIn = (id: string): boolean => id.startsWith('jump-in:');

/** The two packets of a Jump In deck id, if it is one. */
export function jumpInPackets(id: string): [Packet, Packet] | undefined {
  const m = /^jump-in:([\w-]+)\+([\w-]+)$/.exec(id);
  const a = PACKETS.find((p) => p.id === m?.[1]);
  const b = PACKETS.find((p) => p.id === m?.[2]);
  return a && b ? [a, b] : undefined;
}

/** Two packets shuffled together: 40 cards named after both themes, with the first one's face. */
function jumpInDeck(id: string): Decklist | undefined {
  const pair = jumpInPackets(id);
  if (!pair) return undefined;
  const [a, b] = pair;
  const counts = new Map<string, number>();
  for (const [name, n] of [...packetCards(a), ...packetCards(b)])
    counts.set(name, (counts.get(name) ?? 0) + n);
  return {
    id,
    name: `${a.name} + ${b.name}`,
    colors: [...new Set([...a.colors, ...b.colors])],
    face: a.face,
    source: 'custom',
    series: 'jumpIn',
    // Both halves from one set: the deck is of that set. Mixed pairs aren't.
    ...(a.set && a.set === b.set ? { set: a.set } : {}),
    cards: [...counts],
  };
}

/** Decks that live outside this package (a Season deck taken on an expedition), by id. */
const custom = new Map<string, Decklist>();

/** Makes a deck from elsewhere findable by id, like the built-in ones. */
export function registerDeck(list: Decklist): void {
  custom.set(list.id, list);
}

/** A deck by id: one of DECKS, a Jump In pair, or a registered deck. */
export function findDeck(id: string): Decklist | undefined {
  return DECKS.find((x) => x.id === id) ?? jumpInDeck(id) ?? custom.get(id);
}

export function deckById(id: string): Decklist {
  const d = findDeck(id);
  if (!d) throw new Error(`Unknown deck "${id}"`);
  return d;
}

/** Every pair of different Jump In packets, one deck per pair; sets mix freely. */
export const JUMP_IN_DECKS: readonly Decklist[] = PACKETS.flatMap((a, i) =>
  PACKETS.slice(i + 1).map((b) => jumpInDeck(jumpInId(a.id, b.id))!),
).filter(isPlayable);

/**
 * Who bots play, in tenths: Jump In pairs most of the time, so opponents vary
 * a lot, with the starter and Color Challenge decks mixed in.
 */
const OPPONENT_GROUPS: [tenths: number, decks: readonly Decklist[]][] = [
  [7, JUMP_IN_DECKS],
  [2, PLAYABLE_DECKS.filter((d) => d.series === 'starter')],
  [1, PLAYABLE_DECKS.filter((d) => d.series === 'colorChallenge')],
];

/** Draft decks that won on Arena: the tougher opponents (Expedition elites and bosses). */
export const TROPHY_DECKS: readonly Decklist[] = PLAYABLE_DECKS.filter(
  (d) => d.series === 'trophy',
);

/** Every deck a bot can play. */
export const OPPONENT_DECKS: readonly Decklist[] = OPPONENT_GROUPS.flatMap(([, d]) => d);

/**
 * A bot's deck id, never the same as `you`. `int(n)` is the caller's random
 * integer below n, so picks follow the caller's seed. Decks already `met`
 * don't come back while any deck is left unmet: when the rolled group has run
 * out, the pick comes from the rest of the pool.
 */
export function pickOpponent(
  int: (n: number) => number,
  you?: string,
  met: readonly string[] = [],
): string {
  let roll = int(10);
  const group = OPPONENT_GROUPS.find(([tenths]) => (roll -= tenths) < 0)![1];
  const others = (ds: readonly Decklist[]) => ds.filter((d) => d.id !== you);
  const unmet = (ds: readonly Decklist[]) => others(ds).filter((d) => !met.includes(d.id));
  const from = [unmet(group), unmet(OPPONENT_DECKS), others(group)].find((ds) => ds.length)!;
  return from[int(from.length)]!.id;
}

/** A trophy deck for a tough fight, like `pickOpponent`: unmet ones first, never `you`. */
export function pickTrophyOpponent(
  int: (n: number) => number,
  you?: string,
  met: readonly string[] = [],
): string {
  const others = TROPHY_DECKS.filter((d) => d.id !== you);
  const unmet = others.filter((d) => !met.includes(d.id));
  const from = unmet.length ? unmet : others;
  return from[int(from.length)]!.id;
}
