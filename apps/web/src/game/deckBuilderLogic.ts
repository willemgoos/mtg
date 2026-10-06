import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { costSymbols, type DeckEntry, isCreature, isLand, total } from './deckView.ts';

export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
export const BASICS: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
export const basicColor = new Map<string, Color>(COLORS.map((c) => [BASICS[c], c]));

/** Colours of a card (basics by name). */
export function colorsOf(name: string): Color[] {
  const basic = basicColor.get(name);
  if (basic) return [basic];
  const cs = scryfallById.get(slug(name))?.colors ?? [];
  return COLORS.filter((c) => cs.includes(c));
}

/* --------------------------------------------------------------- rarity, set */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];
const RARITY_RANK: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

export const rarityOf = (name: string): Rarity | null => {
  const r = scryfallById.get(slug(name))?.rarity;
  return r === 'common' || r === 'uncommon' || r === 'rare' || r === 'mythic' ? r : null;
};
export const setOf = (name: string): string => scryfallById.get(slug(name))?.set ?? '';

/* -------------------------------------------------------------------- types */

/** Card types a collection can be filtered by. Lands have their own colour-row filter. */
export type TypeKind =
  'Creature' | 'Instant' | 'Sorcery' | 'Enchantment' | 'Artifact' | 'Planeswalker';
export const TYPE_KINDS: readonly TypeKind[] = [
  'Creature',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Planeswalker',
];
export const hasType = (e: Pick<DeckEntry, 'typeLine'>, kind: TypeKind) =>
  new RegExp(`\\b${kind}\\b`).test(e.typeLine);

/* ------------------------------------------------------------------ sorting */

export type SortKey = 'colour' | 'cost' | 'name' | 'rarity' | 'newest';
export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'colour', label: 'Colour' },
  { id: 'cost', label: 'Mana value' },
  { id: 'name', label: 'Name' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'newest', label: 'Newest' },
];

/** Arena's collection order: by colour (mono, then multicolour, colourless, lands). */
export function colourRank(e: DeckEntry): number {
  if (isLand(e)) return 8 + (basicColor.has(e.name) ? 0 : 1);
  const cs = colorsOf(e.name);
  return cs.length === 1 ? COLORS.indexOf(cs[0]!) : cs.length ? 5 : 6;
}

/** Sorts collection entries (a new array). Ties fall back to colour, mana value, name. */
export function sortEntries(
  entries: readonly DeckEntry[],
  key: SortKey,
  fresh?: ReadonlySet<string>,
): DeckEntry[] {
  const byName = (a: DeckEntry, b: DeckEntry) => a.name.localeCompare(b.name);
  const byCost = (a: DeckEntry, b: DeckEntry) => a.manaValue - b.manaValue || byName(a, b);
  const byColour = (a: DeckEntry, b: DeckEntry) => colourRank(a) - colourRank(b) || byCost(a, b);
  const rank = (e: DeckEntry) => RARITY_RANK[rarityOf(e.name) ?? 'common']!;
  const cmp: Record<SortKey, (a: DeckEntry, b: DeckEntry) => number> = {
    colour: byColour,
    cost: (a, b) => Number(isLand(a)) - Number(isLand(b)) || byCost(a, b),
    name: byName,
    rarity: (a, b) => rank(a) - rank(b) || byColour(a, b),
    newest: (a, b) => Number(!!fresh?.has(b.name)) - Number(!!fresh?.has(a.name)) || byColour(a, b),
  };
  return [...entries].sort(cmp[key]);
}

/* -------------------------------------------------------------------- stats */

export interface DeckStats {
  cards: number;
  creatures: number;
  spells: number;
  lands: number;
  /** Nonland cards by mana value: 0-1, 2, 3, 4, 5, 6+. */
  curve: { creatures: number; others: number }[];
  /** Coloured mana symbols in the nonland cards' costs (hybrid split between its colours). */
  symbols: Record<Color, number>;
}

export const curveIndex = (mv: number) => Math.min(Math.max(mv, 1), 6) - 1;

export function colorSymbols(entries: readonly DeckEntry[]): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const e of entries) {
    if (isLand(e)) continue;
    for (const sym of costSymbols(e.manaCost)) {
      const cs = COLORS.filter((c) => sym.split('/').includes(c));
      for (const c of cs) out[c] += e.count / cs.length;
    }
  }
  return out;
}

export function deckStats(entries: readonly DeckEntry[]): DeckStats {
  const spells = entries.filter((e) => !isLand(e));
  const creatures = spells.filter(isCreature);
  const curve = [0, 1, 2, 3, 4, 5].map((i) => {
    const at = spells.filter((e) => curveIndex(e.manaValue) === i);
    return {
      creatures: total(at.filter(isCreature)),
      others: total(at.filter((e) => !isCreature(e))),
    };
  });
  return {
    cards: total([...entries]),
    creatures: total(creatures),
    spells: total(spells) - total(creatures),
    lands: total(entries.filter(isLand)),
    curve,
    symbols: colorSymbols(entries),
  };
}

/* --------------------------------------------------------------- auto lands */

/** Arena's land count for a deck size: 17 in 40 cards, 24 in 60. */
export function landTarget(deckSize: number): number {
  if (deckSize <= 40) return Math.round((17 * deckSize) / 40);
  if (deckSize >= 60) return Math.round((24 * deckSize) / 60);
  return Math.round(17 + ((deckSize - 40) * 7) / 20);
}

/**
 * Basic lands to fit a deck: the land target minus the nonbasic lands in it,
 * split between the colours by their mana symbols (largest remainder, with a
 * floor of 2 for a colour the deck uses). A deck with no coloured symbols
 * splits `fallback` evenly. Basics in `entries` are ignored.
 */
export function autoBasics(
  entries: readonly DeckEntry[],
  deckSize: number,
  fallback: readonly Color[] = [],
): Record<Color, number> {
  const out: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const rest = entries.filter((e) => !basicColor.has(e.name));
  const nonbasicLands = total(rest.filter(isLand));
  const slots = Math.max(0, landTarget(deckSize) - nonbasicLands);
  let weights = colorSymbols(rest);
  let used = COLORS.filter((c) => weights[c] > 0);
  if (!used.length) {
    used = COLORS.filter((c) => fallback.includes(c));
    weights = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const c of used) weights[c] = 1;
  }
  if (!used.length || !slots) return out;
  const sum = used.reduce((n, c) => n + weights[c], 0);
  const floor = slots >= used.length * 2 ? 2 : 0;
  let left = slots;
  const rem: [Color, number][] = [];
  for (const c of used) {
    const exact = (weights[c] / sum) * slots;
    out[c] = Math.max(floor, Math.floor(exact));
    left -= out[c];
    rem.push([c, exact - Math.floor(exact)]);
  }
  rem.sort((a, b) => b[1] - a[1]);
  for (let i = 0; left > 0; i = (i + 1) % rem.length, left--) out[rem[i]![0]]++;
  // The floor may have overshot: take from the biggest piles.
  while (left < 0) {
    const big = used.reduce((a, b) => (out[b] > out[a] ? b : a));
    out[big]--;
    left++;
  }
  return out;
}
