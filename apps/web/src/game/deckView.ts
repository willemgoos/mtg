import { type Decklist, scryfallById, slug } from '@mtg/cards';
import type { CardDefId } from '@mtg/engine';
import { useEffect, useState } from 'react';

/** One distinct card in a decklist, with what the deck viewer needs to show it. */
export interface DeckEntry {
  name: string;
  count: number;
  /** Set when the card is implemented (then it has bundled Scryfall data). */
  defId: CardDefId | null;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  image: string | null;
  art: string | null;
  /** The name to show (the Marvel name of a Marvel reprint). */
  label: string;
  /** A Brawl deck's commander. */
  commander?: boolean;
}

export type Section = 'Commander' | 'Creatures' | 'Spells' | 'Lands';

export const isLand = (e: DeckEntry) => /\bLand\b/.test(e.typeLine);
export const isCreature = (e: DeckEntry) => /\bCreature\b/.test(e.typeLine);
export const sectionOf = (e: DeckEntry): Section =>
  e.commander ? 'Commander' : isLand(e) ? 'Lands' : isCreature(e) ? 'Creatures' : 'Spells';

/** Mana value of a Scryfall cost like "{2}{W}{W}" (X counts as 0). */
export function manaValue(cost: string): number {
  let n = 0;
  for (const [, sym] of cost.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(sym!)) n += Number(sym);
    else if (sym !== 'X') n += 1;
  }
  return n;
}

/** Scryfall's symbol image for one cost symbol, e.g. "W/U" -> WU.svg. */
export const symbolUrl = (sym: string) =>
  `https://svgs.scryfall.io/card-symbols/${sym.replace('/', '')}.svg`;

export const costSymbols = (cost: string) => [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);

/** Entries from bundled data; cards we haven't implemented come back with no cost or type. */
export function deckEntries(deck: Decklist): DeckEntry[] {
  const commander = deck.commander
    ? cardEntries([[deck.commander, 1]]).map((e) => ({ ...e, commander: true }))
    : [];
  return [...commander, ...cardEntries(deck.cards)];
}

export function cardEntries(
  cards: readonly (readonly [name: string, count: number])[],
): DeckEntry[] {
  return cards.map(([name, count]) => {
    const sc = scryfallById.get(slug(name));
    return {
      name,
      count,
      defId: sc ? slug(name) : null,
      manaCost: sc?.manaCost ?? '',
      manaValue: manaValue(sc?.manaCost ?? ''),
      typeLine: sc?.typeLine ?? '',
      image: sc?.image?.normal ?? null,
      art: sc?.image?.artCrop ?? null,
      label: sc?.flavorName ?? name,
    };
  });
}

/** Card types for a 100-card deck's columns, in Arena's order. */
const TYPE_COLUMNS: [label: string, test: (e: DeckEntry) => boolean][] = [
  ['Commander', (e) => !!e.commander],
  ['Creatures', isCreature],
  ['Planeswalkers', (e) => /\bPlaneswalker\b/.test(e.typeLine)],
  ['Instants & Sorceries', (e) => /\b(Instant|Sorcery)\b/.test(e.typeLine)],
  ['Artifacts', (e) => /\bArtifact\b/.test(e.typeLine) && !isLand(e)],
  ['Enchantments', (e) => /\bEnchantment\b/.test(e.typeLine)],
  ['Lands', isLand],
  ['Other', () => true],
];

/**
 * A Brawl deck's columns: grouped by card type with the commander first
 * (by mana value there are too many cards per column).
 */
export function deckTypeColumns(entries: DeckEntry[]): { label: string; cards: DeckEntry[] }[] {
  const cols = TYPE_COLUMNS.map(([label]) => ({ label, cards: [] as DeckEntry[] }));
  for (const e of entries) cols[TYPE_COLUMNS.findIndex(([, test]) => test(e))]!.cards.push(e);
  for (const c of cols)
    c.cards.sort((a, b) => a.manaValue - b.manaValue || a.name.localeCompare(b.name));
  return cols.filter((c) => c.cards.length);
}

/**
 * Arena's column view: nonland cards in columns by mana value (1 or less, 2,
 * ..., 6+), lands last. Empty columns are dropped; creatures sort first.
 */
export function deckColumns(entries: DeckEntry[]): { label: string; cards: DeckEntry[] }[] {
  const cols = [
    { label: '0–1', cards: [] as DeckEntry[] },
    ...[2, 3, 4, 5].map((n) => ({ label: String(n), cards: [] as DeckEntry[] })),
    { label: '6+', cards: [] as DeckEntry[] },
    { label: 'Lands', cards: [] as DeckEntry[] },
  ];
  for (const e of entries) {
    const i = isLand(e) ? 6 : Math.min(Math.max(e.manaValue, 1), 6) - 1;
    cols[i]!.cards.push(e);
  }
  for (const c of cols)
    c.cards.sort(
      (a, b) =>
        Number(isCreature(b)) - Number(isCreature(a)) ||
        a.manaValue - b.manaValue ||
        a.name.localeCompare(b.name),
    );
  return cols.filter((c) => c.cards.length);
}

/** Deck list sections in Arena's order, sorted by mana value then name. */
export function deckSections(entries: DeckEntry[]): { title: Section; cards: DeckEntry[] }[] {
  return (['Commander', 'Creatures', 'Spells', 'Lands'] as const)
    .map((title) => ({
      title,
      cards: entries
        .filter((e) => sectionOf(e) === title)
        .sort((a, b) => a.manaValue - b.manaValue || a.name.localeCompare(b.name)),
    }))
    .filter((s) => s.cards.length);
}

export const total = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.count, 0);

interface ScryfallApiCard {
  name: string;
  mana_cost?: string;
  type_line: string;
  image_uris?: { normal: string; art_crop: string };
  card_faces?: { mana_cost?: string; image_uris?: { normal: string; art_crop: string } }[];
}

/**
 * The deck's entries. Cards not in the bundled data yet (unimplemented decks)
 * are filled in from Scryfall's collection API once it answers.
 */
export function useDeckEntries(deck: Decklist): DeckEntry[] {
  const [entries, setEntries] = useState(() => deckEntries(deck));
  useEffect(() => {
    const base = deckEntries(deck);
    setEntries(base);
    const missing = base.filter((e) => !e.defId);
    if (!missing.length) return;
    let live = true;
    fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: missing.map((e) => ({ name: e.name })) }),
    })
      .then((r) => r.json() as Promise<{ data: ScryfallApiCard[] }>)
      .then(({ data }) => {
        if (!live) return;
        const byName = new Map(data.map((c) => [c.name.split(' // ')[0]!, c]));
        setEntries(
          base.map((e) => {
            const c = e.defId ? undefined : byName.get(e.name);
            if (!c) return e;
            const face = c.card_faces?.[0];
            const img = c.image_uris ?? face?.image_uris;
            const cost = c.mana_cost ?? face?.mana_cost ?? '';
            return {
              ...e,
              manaCost: cost,
              manaValue: manaValue(cost),
              typeLine: c.type_line,
              image: img?.normal ?? null,
              art: img?.art_crop ?? null,
            };
          }),
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [deck]);
  return entries;
}
