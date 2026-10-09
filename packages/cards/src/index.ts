import type { CardDb, CardDefId, CardDefinition, NewGameOptions, PlayerId } from '@mtg/engine';
import { BEHAVIORS, TOKENS } from './behaviors.ts';
import { buildCard, slug } from './build.ts';
import { DECKS, type Decklist } from './decks.ts';
import { type Packet, PACKETS, packetCards } from './jumpin.ts';
import scryfall from './generated/scryfall.json' with { type: 'json' };
import basicArt from './generated/basic-art.json' with { type: 'json' };
import foundations from './generated/foundations-pack-candidates.json' with { type: 'json' };
import type { ScryfallCard } from './scryfall-types.ts';
import { SOS_BOOSTER_LIST } from './sos/booster-list.ts';
import { FRA_BOOSTER_LIST } from './fra/booster-list.ts';
import { ECL_BOOSTER_LIST } from './ecl/booster-list.ts';
import { STX_BOOSTER_LIST } from './stx/booster-list.ts';
import { SOA_ARCHIVE_LIST } from './sos/archive-list.ts';
import { STA_ARCHIVE_LIST } from './stx/archive-list.ts';
import { bestowAura } from './soc/cards-15b-w.ts';

/** Full-art basic land images by set, then basic land name (scripts/fetch-basic-art.ts). */
export const BASIC_ART: Record<string, Record<string, string[]>> = basicArt;

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
  STRIXHAVEN_POOL,
  SECRETS_OF_STRIXHAVEN_POOL,
  STRIXHAVEN_BRAWL_POOL,
  FINAL_FANTASY_BRAWL_POOL,
  REALITY_FRACTURE_POOL,
  LORWYN_ECLIPSED_POOL,
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
  STRIXHAVEN_BRAWL_DECKS,
  MARVEL_TROPHY_DECKS,
  FINAL_FANTASY_TROPHY_DECKS,
  FINAL_FANTASY_DECKS,
  STRIXHAVEN_DECKS,
  SECRETS_OF_STRIXHAVEN_DECKS,
  LORWYN_ECLIPSED_DECKS,
  REALITY_FRACTURE_DECKS,
  FINAL_FANTASY_STARTER_KIT_DECKS,
  FINAL_FANTASY_BRAWL_DECKS,
} from './decks.ts';
export type { Decklist } from './decks.ts';
export { ECL_THEME_DECKS } from './ecl/theme-deck-lists.ts';
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

/**
 * Strixhaven's booster cards by STX rarity, basics left out. scryfall.json keeps
 * one printing per card, so reprints there have another set; the list is by name.
 */
export function strixhavenBoosterSheets(): BoosterSheets {
  return boosterSheets(STX_BOOSTER_LIST);
}

/** Secrets of Strixhaven's booster cards by SOS rarity (main set, no basics). */
export function secretsOfStrixhavenBoosterSheets(): BoosterSheets {
  return boosterSheets(SOS_BOOSTER_LIST);
}

/**
 * Reality Fracture's booster cards by FRA rarity (main set, no basics). Only cards the pool has
 * (the planeswalker group waits for phase 17c), so they join the sheets as they are built.
 */
export function realityFractureBoosterSheets(): BoosterSheets {
  return boosterSheets(FRA_BOOSTER_LIST, (c) => cardDb.has(slug(c.name)));
}

/** Lorwyn Eclipsed's booster cards by ECL rarity (main set, no basics), the cards the pool has. */
export function lorwynEclipsedBoosterSheets(): BoosterSheets {
  return boosterSheets(ECL_BOOSTER_LIST, (c) => cardDb.has(slug(c.name)));
}

/**
 * Mystical Archive (16): the bonus card in Strixhaven (STA) and Secrets of
 * Strixhaven (SOA) boosters, by archive rarity. Reprints keep another printing's
 * set and rarity in scryfall.json, so the lists (and `ARCHIVE_RARITY`) are by name.
 */
export function strixhavenArchiveSheets(): ArchiveSheets {
  return archiveSheets(STA_ARCHIVE_LIST);
}
export function secretsOfStrixhavenArchiveSheets(): ArchiveSheets {
  return archiveSheets(SOA_ARCHIVE_LIST);
}

/**
 * Chance (out of 8) that the archive slot is an uncommon, a rare or a mythic. Arena's odds
 * aren't published: it follows the main sheets' shape (a mythic one time in eight).
 */
export const ARCHIVE_SLOT_WEIGHTS = { uncommon: 4, rare: 3, mythic: 1 } as const;

/** An archive card's rarity in the archive (not the rarity of whichever printing the game shows). */
export const ARCHIVE_RARITY: ReadonlyMap<string, 'uncommon' | 'rare' | 'mythic'> = new Map([
  ...STA_ARCHIVE_LIST,
  ...SOA_ARCHIVE_LIST,
]);

type ArchiveSheets = Record<'uncommon' | 'rare' | 'mythic', ScryfallCard[]>;

function archiveSheets(list: typeof STA_ARCHIVE_LIST): ArchiveSheets {
  const byName = new Map(SCRYFALL.map((c) => [c.name, c]));
  const sheets: ArchiveSheets = { uncommon: [], rare: [], mythic: [] };
  for (const [name, rarity] of list) {
    const c = byName.get(name);
    if (c) sheets[rarity].push(c);
  }
  return sheets;
}

type BoosterSheets = Record<'common' | 'uncommon' | 'rare' | 'mythic', ScryfallCard[]>;

function boosterSheets(
  list: typeof STX_BOOSTER_LIST,
  keep: (c: ScryfallCard) => boolean = () => true,
): BoosterSheets {
  const byName = new Map(SCRYFALL.map((c) => [c.name, c]));
  const sheets: BoosterSheets = { common: [], uncommon: [], rare: [], mythic: [] };
  for (const [name, rarity] of list) {
    const c = byName.get(name);
    if (c && !c.typeLine.startsWith('Basic') && keep(c)) sheets[rarity].push(c);
  }
  return sheets;
}

const BUILT = SCRYFALL.map((sc) => buildCard(sc, BEHAVIORS[sc.name]));
const builtById = new Map(BUILT.map((c) => [c.id, c]));
// Strixhaven Brawl (15b, w): bestow. Each bestow creature has an Aura form of its own (its `back`).
const BESTOW_AURAS = BUILT.filter((c) => c.bestow).map(bestowAura);

/** Strixhaven (13a): a modal double-faced card's colour identity covers both faces (Brawl). */
function withBackIdentity(c: CardDefinition): CardDefinition {
  const back = c.back ? builtById.get(c.back) : undefined;
  if (!back) return c;
  const ids = new Set([...(c.colorIdentity ?? c.colors), ...(back.colorIdentity ?? back.colors)]);
  return { ...c, colorIdentity: (['W', 'U', 'B', 'R', 'G'] as const).filter((x) => ids.has(x)) };
}

export const CARDS: readonly CardDefinition[] = [
  ...BUILT.map(withBackIdentity),
  ...TOKENS,
  ...BESTOW_AURAS,
];

export const cardDb: CardDb = new Map(CARDS.map((c) => [c.id, c]));

/** Scryfall data by card id, for image hotlinking in the UI. */
export const scryfallById: ReadonlyMap<CardDefId, ScryfallCard> = new Map([
  ...SCRYFALL.map((sc): [CardDefId, ScryfallCard] => [slug(sc.name), sc]),
  // A bestowed creature shows its card.
  ...BESTOW_AURAS.flatMap((c): [CardDefId, ScryfallCard][] => {
    const sc = SCRYFALL.find((x) => slug(x.name) === c.bestowFront);
    return sc ? [[c.id, sc]] : [];
  }),
]);

/** The name to show: the Marvel name on a Marvel reprint, else the card's name. */
export const displayName = (d: CardDefinition): string => d.flavorName ?? d.name;

/** Expands a decklist to card ids. */
export function deckIds(list: Decklist): CardDefId[] {
  return list.cards.flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

/** A deck's sideboard (the Lessons Learn can fetch) as card ids. */
export function sideboardIds(list: Decklist): CardDefId[] {
  return (list.sideboard ?? []).flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}

/** Cards in the list we haven't implemented yet (empty = playable). */
export function missingCards(list: Decklist): string[] {
  return [
    ...list.cards.map(([name]) => name),
    ...(list.sideboard ?? []).map(([name]) => name),
    ...(list.commander ? [list.commander] : []),
  ].filter((name) => !cardDb.has(slug(name)));
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
): Pick<NewGameOptions, 'format' | 'commanders' | 'sideboards'> & {
  decks: Record<PlayerId, CardDefId[]>;
} {
  const brawl = p1.series === 'brawl' || p2.series === 'brawl';
  const c1 = commanderId(p1);
  const c2 = commanderId(p2);
  return {
    decks: { p1: deckIds(p1), p2: deckIds(p2) },
    ...(p1.sideboard || p2.sideboard
      ? { sideboards: { p1: sideboardIds(p1), p2: sideboardIds(p2) } }
      : {}),
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
