import type {
  CardDefinition,
  CardType,
  Color,
  Keyword,
  ManaCost,
  ManaType,
  Supertype,
} from '@mtg/engine';
import type { ScryfallCard } from './scryfall-types.ts';

/** Behavior added on top of the printed characteristics. */
export type Behavior = Pick<Partial<CardDefinition>, 'abilities' | 'spell' | 'entersWithCounters'>;

export const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const KEYWORDS: Record<string, Keyword> = {
  Flying: 'flying',
  Reach: 'reach',
  Trample: 'trample',
  Haste: 'haste',
  'First strike': 'firstStrike',
  'Double strike': 'doubleStrike',
  Vigilance: 'vigilance',
  Deathtouch: 'deathtouch',
  Lifelink: 'lifelink',
  Menace: 'menace',
  Hexproof: 'hexproof',
  Defender: 'defender',
};

/** Scryfall "keywords" that are really ability words or triggers we model as abilities. */
export const KEYWORDS_AS_ABILITIES = new Set(['Prowess', 'Landfall', 'Raid', 'Fight']);

const BASIC_MANA: Record<string, ManaType> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

export function parseManaCost(s: string): ManaCost {
  const cost: ManaCost = { generic: 0, colored: {} };
  for (const [, sym] of s.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(sym!)) cost.generic += Number(sym);
    else if (/^[WUBRGC]$/.test(sym!)) {
      const t = sym as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else throw new Error(`Unsupported mana symbol {${sym}}`);
  }
  return cost;
}

export function parseTypeLine(line: string) {
  const [left, right = ''] = line.split(' — ');
  const supertypes: Supertype[] = [];
  const types: CardType[] = [];
  for (const w of left!.trim().split(/\s+/)) {
    if (w === 'Basic' || w === 'Legendary') supertypes.push(w);
    else types.push(w as CardType);
  }
  const subtypes = right.trim() ? right.trim().split(/\s+/) : [];
  return { supertypes, types, subtypes };
}

export function mapKeywords(scryfall: readonly string[]): Keyword[] {
  const out: Keyword[] = [];
  for (const k of scryfall) {
    const mapped = KEYWORDS[k];
    if (mapped) out.push(mapped);
    else if (!KEYWORDS_AS_ABILITIES.has(k)) throw new Error(`Unsupported keyword "${k}"`);
  }
  return out;
}

/** Printed characteristics from Scryfall + hand-written behavior = engine definition. */
export function buildCard(sc: ScryfallCard, behavior: Behavior = {}): CardDefinition {
  const { supertypes, types, subtypes } = parseTypeLine(sc.typeLine);
  const abilities = [...(behavior.abilities ?? [])];
  if (supertypes.includes('Basic') && types.includes('Land')) {
    for (const st of subtypes) {
      const produces = BASIC_MANA[st];
      if (produces) abilities.unshift({ kind: 'mana', cost: { tapSelf: true }, produces });
    }
  }
  return {
    id: slug(sc.name),
    name: sc.name,
    scryfallId: sc.scryfallId,
    manaCost: parseManaCost(sc.manaCost),
    colors: sc.colors as Color[],
    types,
    supertypes,
    subtypes,
    ...(sc.power !== undefined ? { power: Number(sc.power), toughness: Number(sc.toughness) } : {}),
    keywords: mapKeywords(sc.keywords),
    abilities,
    ...(behavior.spell ? { spell: behavior.spell } : {}),
    ...(behavior.entersWithCounters ? { entersWithCounters: behavior.entersWithCounters } : {}),
  };
}
