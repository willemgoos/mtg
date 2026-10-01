/** Compact per-card record written by scripts/fetch-scryfall.ts. */
export interface ScryfallCard {
  name: string;
  scryfallId: string;
  oracleId: string;
  set: string;
  collectorNumber: string;
  rarity: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  /** A planeswalker's starting loyalty. */
  loyalty?: string;
  toughness?: string;
  colors: string[];
  keywords: string[];
  /** Hotlinked, never bundled. */
  image: { small: string; normal: string; large: string; artCrop: string } | null;
}
