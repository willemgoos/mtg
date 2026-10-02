import { FOUNDATIONS_PACK_CANDIDATES, SCRYFALL, cardDb, slug } from '@mtg/cards';
import { nextInt, type RngState } from '@mtg/engine';
import {
  copyLimit,
  isBasic,
  RARITIES,
  requireSeason,
  type Counts,
  type PackGenerator,
  type PackReward,
  type Rarity,
  type SeasonPackKind,
  type WildcardMisses,
} from './season.ts';

/** Explicit identity sheets; artwork printing/set never determines pack inclusion. */
export const FOUNDATIONS_SHEETS = Object.fromEntries(
  RARITIES.map((rarity) => [
    rarity,
    FOUNDATIONS_PACK_CANDIDATES.filter(
      (c) => c.rarity === rarity && cardDb.has(c.id) && !isBasic(c.id),
    ).map((c) => c.id),
  ]),
) as Record<Rarity, string[]>;
export const FOUNDATIONS_PACK_COUNT = Object.values(FOUNDATIONS_SHEETS).reduce(
  (n, sheet) => n + sheet.length,
  0,
);

/** Bloomburrow's booster cards: every card in the set but the basics. */
export const BLOOMBURROW_SHEETS = Object.fromEntries(
  RARITIES.map((rarity) => [
    rarity,
    SCRYFALL.filter((c) => c.set === 'blb' && c.rarity === rarity)
      .map((c) => slug(c.name))
      .filter((id) => cardDb.has(id) && !isBasic(id)),
  ]),
) as Record<Rarity, string[]>;

/** Marvel Super Heroes' booster cards: every card in the set we play, but the basics (fronts only). */
export const MARVEL_SHEETS = Object.fromEntries(
  RARITIES.map((rarity) => [
    rarity,
    SCRYFALL.filter((c) => c.set === 'msh' && c.rarity === rarity && !c.front)
      .map((c) => slug(c.name))
      .filter((id) => cardDb.has(id) && !isBasic(id)),
  ]),
) as Record<Rarity, string[]>;

const SHEETS: Record<SeasonPackKind, Record<Rarity, string[]>> = {
  foundations: FOUNDATIONS_SHEETS,
  bloomburrow: BLOOMBURROW_SHEETS,
  marvel: MARVEL_SHEETS,
};

/** The pack generator for a kind of booster. */
export const packGenerator =
  (kind: SeasonPackKind): PackGenerator =>
  (rng, collection, misses) =>
    generatePack(SHEETS[kind], rng, collection, misses);

/** Uniform waiting time 1..(2*mean-1): mean exactly matches the published average.
 * Conditional hit chance rises after misses. High wildcards share a mean-15 stream
 * with equal rare/mythic outcomes, yielding one of each per 30 packs on average.
 * This explicit approximation is not Arena's unpublished pity algorithm.
 */
export function wildcardHit(
  rng: RngState,
  misses: WildcardMisses,
  key: keyof WildcardMisses,
): boolean {
  const maximum = { common: 5, uncommon: 9, rareMythic: 29 }[key];
  requireSeason(
    Number.isSafeInteger(misses[key]) && misses[key] >= 0 && misses[key] < maximum,
    'Invalid wildcard misses',
  );
  const hit = nextInt(rng, maximum - misses[key]) === 0;
  misses[key] = hit ? 0 : misses[key] + 1;
  return hit;
}
export function protectedCard(
  rng: RngState,
  rarity: Rarity,
  collection: Readonly<Counts>,
  sheets: Record<Rarity, string[]> = FOUNDATIONS_SHEETS,
): string {
  const sheet = sheets[rarity];
  requireSeason(sheet.length > 0, `No supported ${rarity} pack cards`);
  const incomplete =
    rarity === 'rare' || rarity === 'mythic'
      ? sheet.filter((id) => (collection[id] ?? 0) < copyLimit(id))
      : sheet;
  const choices = incomplete.length ? incomplete : sheet;
  return choices[nextInt(rng, choices.length)]!;
}
export function generateFoundationsPack(
  rng: RngState,
  collection: Readonly<Counts>,
  misses: WildcardMisses,
): PackReward[] {
  return generatePack(FOUNDATIONS_SHEETS, rng, collection, misses);
}

function generatePack(
  sheets: Record<Rarity, string[]>,
  rng: RngState,
  collection: Readonly<Counts>,
  misses: WildcardMisses,
): PackReward[] {
  // Replacements are rolled once per pack, before choosing identities.
  const common = wildcardHit(rng, misses, 'common');
  const uncommon = wildcardHit(rng, misses, 'uncommon');
  const high = wildcardHit(rng, misses, 'rareMythic');
  const highRarity: Rarity = high
    ? nextInt(rng, 2) === 0
      ? 'rare'
      : 'mythic'
    : nextInt(rng, 7) === 0
      ? 'mythic'
      : 'rare';
  const slots: { rarity: Rarity; wildcard: boolean }[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      rarity: 'common' as const,
      wildcard: i === 0 && common,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      rarity: 'uncommon' as const,
      wildcard: i === 0 && uncommon,
    })),
    { rarity: highRarity, wildcard: high },
  ];
  const quantities = { ...collection };
  return slots.map(({ rarity, wildcard }) => {
    if (wildcard) return { kind: 'wildcard', rarity };
    const id = protectedCard(rng, rarity, quantities, sheets);
    quantities[id] = (quantities[id] ?? 0) + 1;
    return { kind: 'card', cardId: id };
  });
}
