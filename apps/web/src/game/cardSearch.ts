import { SCRYFALL, type ScryfallCard } from '@mtg/cards';
import { manaValue } from './deckView.ts';

/** Card search: every card the game knows, filtered like Arena's collection (plus a few Scryfall-style search prefixes). */

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
/** Colour filters: the five colours, multicolour, colourless. */
export type ColorFilter = Color | 'M' | 'C';
export type ColorMode = 'any' | 'exact';

export const TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Land',
  'Battle',
] as const;
export type CardType = (typeof TYPES)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Mana value buckets: 0 to 6, then 7 and up. */
export const COSTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** The sets we build decks from; anything else is a reprint shown under "Other". */
export const SETS: { code: string; name: string }[] = [
  { code: 'fdn', name: 'Foundations' },
  { code: 'blb', name: 'Bloomburrow' },
  { code: 'fin', name: 'Final Fantasy' },
  { code: 'fic', name: 'Final Fantasy Commander' },
  { code: 'stx', name: 'Strixhaven' },
  { code: 'sos', name: 'Secrets of Strixhaven' },
  { code: 'soc', name: 'Secrets of Strixhaven Commander' },
  { code: 'ecl', name: 'Lorwyn Eclipsed' },
  { code: 'msh', name: 'Marvel Super Heroes' },
  { code: 'msc', name: 'Marvel Commander' },
];
export const OTHER_SET = 'other';
const MAIN_SETS = new Set(SETS.map((s) => s.code));
export const setGroup = (c: ScryfallCard) => (MAIN_SETS.has(c.set) ? c.set : OTHER_SET);

export type Sort = 'name' | 'cost' | 'color' | 'rarity';

/** One searchable card: a front face (back faces are folded into their front). */
export interface SearchCard {
  card: ScryfallCard;
  back?: ScryfallCard;
  name: string;
  manaValue: number;
  colors: Color[];
  types: Set<CardType>;
  /** Lower-case haystacks for the query. */
  nameText: string;
  typeText: string;
  oracleText: string;
  keywordText: string;
}

function build(): SearchCard[] {
  const byName = new Map(SCRYFALL.map((c) => [c.name, c]));
  const seen = new Set<string>();
  const out: SearchCard[] = [];
  for (const card of SCRYFALL) {
    if (card.front || seen.has(card.name)) continue;
    seen.add(card.name);
    const back = card.back ? byName.get(card.back) : undefined;
    const faces = back ? [card, back] : [card];
    const typeLine = faces.map((f) => f.typeLine).join(' // ');
    out.push({
      card,
      back,
      name: card.flavorName ? `${card.flavorName} (${card.name})` : card.name,
      manaValue: manaValue(card.manaCost),
      colors: COLORS.filter((c) => faces.some((f) => f.colors.includes(c))),
      types: new Set(TYPES.filter((t) => typeLine.includes(t))),
      nameText: faces
        .flatMap((f) => [f.name, f.flavorName ?? ''])
        .join('\n')
        .toLowerCase(),
      typeText: typeLine.toLowerCase(),
      oracleText: faces
        .map((f) => f.oracleText)
        .join('\n')
        .toLowerCase(),
      keywordText: [...new Set(faces.flatMap((f) => f.keywords))].join('\n').toLowerCase(),
    });
  }
  return out;
}

let all: SearchCard[] | undefined;
export const allCards = (): SearchCard[] => (all ??= build());

/** Every keyword in the pool, for the keyword picker. */
export const allKeywords = (): string[] =>
  [...new Set(allCards().flatMap((c) => [...c.card.keywords, ...(c.back?.keywords ?? [])]))].sort();

export interface Filters {
  query: string;
  colors: ReadonlySet<ColorFilter>;
  colorMode: ColorMode;
  costs: ReadonlySet<number>;
  types: ReadonlySet<CardType>;
  rarities: ReadonlySet<Rarity>;
  set: string;
  keyword: string;
}

export const NO_FILTERS: Filters = {
  query: '',
  colors: new Set(),
  colorMode: 'any',
  costs: new Set(),
  types: new Set(),
  rarities: new Set(),
  set: '',
  keyword: '',
};

type Field = 'any' | 'name' | 'type' | 'text' | 'keyword';
const PREFIXES: Record<string, Field> = {
  n: 'name',
  name: 'name',
  t: 'type',
  type: 'type',
  o: 'text',
  text: 'text',
  k: 'keyword',
  kw: 'keyword',
  keyword: 'keyword',
};

/** A query term: words or "quoted phrases", optionally `t:`, `o:`, `k:`, `n:` prefixed and `-` negated. */
interface Term {
  field: Field;
  text: string;
  negate: boolean;
}

export function parseQuery(q: string): Term[] {
  const terms: Term[] = [];
  for (const m of q.toLowerCase().matchAll(/(-?)(?:(\w+):)?(?:"([^"]*)"?|(\S+))/g)) {
    const [, neg, prefix, quoted, word] = m;
    const field = prefix ? PREFIXES[prefix] : 'any';
    // An unknown prefix ("foo:bar") is just text.
    const text = field ? (quoted ?? word ?? '') : `${prefix}:${quoted ?? word ?? ''}`;
    if (text) terms.push({ field: field ?? 'any', text, negate: neg === '-' });
  }
  return terms;
}

function termHits(c: SearchCard, { field, text }: Term): boolean {
  switch (field) {
    case 'name':
      return c.nameText.includes(text);
    case 'type':
      return c.typeText.includes(text);
    case 'text':
      return c.oracleText.includes(text);
    case 'keyword':
      return c.keywordText.includes(text);
    default:
      return (
        c.nameText.includes(text) ||
        c.typeText.includes(text) ||
        c.oracleText.includes(text) ||
        c.keywordText.includes(text)
      );
  }
}

function colorHits(c: SearchCard, colors: ReadonlySet<ColorFilter>, mode: ColorMode): boolean {
  if (!colors.size) return true;
  const multi = c.colors.length > 1;
  const colorless = c.colors.length === 0;
  if (mode === 'exact') {
    // Exactly these colours: every card colour picked, every picked colour on the card.
    if (colorless) return colors.has('C');
    if (colors.has('M') && !multi) return false;
    const picked = COLORS.filter((x) => colors.has(x));
    if (!picked.length) return colors.has('M') && multi;
    return picked.length === c.colors.length && picked.every((x) => c.colors.includes(x));
  }
  return (
    (colorless && colors.has('C')) ||
    (multi && colors.has('M')) ||
    c.colors.some((x) => colors.has(x))
  );
}

export function matches(c: SearchCard, f: Filters, terms = parseQuery(f.query)): boolean {
  if (!colorHits(c, f.colors, f.colorMode)) return false;
  if (f.costs.size && (c.types.has('Land') || !f.costs.has(Math.min(c.manaValue, 7))))
    return false;
  if (f.types.size && ![...f.types].some((t) => c.types.has(t))) return false;
  if (f.rarities.size && !f.rarities.has(c.card.rarity as Rarity)) return false;
  if (f.set && setGroup(c.card) !== f.set) return false;
  if (f.keyword && !c.keywordText.split('\n').includes(f.keyword.toLowerCase())) return false;
  return terms.every((t) => termHits(c, t) !== t.negate);
}

/** Arena's collection order: mono colours W→G, multicolour, colourless, lands. */
const colorRank = (c: SearchCard) =>
  c.types.has('Land') && !c.types.has('Creature')
    ? 7
    : c.colors.length === 1
      ? COLORS.indexOf(c.colors[0]!)
      : c.colors.length
        ? 5
        : 6;

const byName = (a: SearchCard, b: SearchCard) => a.name.localeCompare(b.name);
const SORTS: Record<Sort, (a: SearchCard, b: SearchCard) => number> = {
  name: byName,
  cost: (a, b) => a.manaValue - b.manaValue || byName(a, b),
  color: (a, b) => colorRank(a) - colorRank(b) || a.manaValue - b.manaValue || byName(a, b),
  rarity: (a, b) =>
    RARITIES.indexOf(b.card.rarity as Rarity) - RARITIES.indexOf(a.card.rarity as Rarity) ||
    byName(a, b),
};

export function search(f: Filters, sort: Sort, cards = allCards()): SearchCard[] {
  const terms = parseQuery(f.query);
  return cards.filter((c) => matches(c, f, terms)).sort(SORTS[sort]);
}
