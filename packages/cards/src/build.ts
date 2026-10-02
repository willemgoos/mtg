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
export type Behavior = Partial<
  Omit<
    CardDefinition,
    | 'id'
    | 'name'
    | 'scryfallId'
    | 'manaCost'
    | 'colors'
    | 'types'
    | 'supertypes'
    | 'subtypes'
    | 'power'
    | 'toughness'
    | 'keywords'
    | 'isToken'
  >
>;

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
  Flash: 'flash',
  Indestructible: 'indestructible',
  Changeling: 'changeling',
};

/** Scryfall "keywords" that are really ability words or triggers we model as abilities. */
export const KEYWORDS_AS_ABILITIES = new Set([
  'Prowess',
  'Landfall',
  'Raid',
  'Fight',
  'Scry',
  'Kicker',
  'Flashback',
  'Equip',
  'Treasure',
  'Food',
  'Double',
  'Enchant',
  'Affinity',
  'Surveil',
  'Morbid',
  'Threshold',
  'Mill',
  // Bloomburrow.
  'Offspring',
  'Forage',
  'Gift',
  'Expend',
  'Valiant',
  // Marvel Super Heroes.
  'Power-up',
  'Teamwork',
  'Connive',
  'Transform',
]);

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
    } else if (/^[WUBRG]\/[WUBRG]$/.test(sym!))
      (cost.hybrid ??= []).push(sym!.split('/') as [ManaType, ManaType]);
    else if (sym === 'X') cost.x = (cost.x ?? 0) + 1;
    else throw new Error(`Unsupported mana symbol {${sym}}`);
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

export function mapKeywords(scryfall: readonly string[], oracle = ''): Keyword[] {
  const out: Keyword[] = [];
  // "Hexproof from instants" shows up as both "Hexproof from" and "Hexproof".
  if (scryfall.includes('Hexproof from')) {
    if (!/hexproof from instants/i.test(oracle)) throw new Error('Unsupported "Hexproof from"');
    out.push('hexproofFromInstants');
    scryfall = scryfall.filter((k) => k !== 'Hexproof from' && k !== 'Hexproof');
  }
  for (const k of scryfall) {
    if (k === 'Ward') {
      // The cost comes from wardCostOf (below).
      out.push('ward');
      continue;
    }
    const mapped = KEYWORDS[k];
    if (mapped) out.push(mapped);
    // Named abilities ("Street Justice — ...") are labels with no rules of their own.
    else if (oracle.includes(`${k} —`)) continue;
    else if (!KEYWORDS_AS_ABILITIES.has(k)) throw new Error(`Unsupported keyword "${k}"`);
  }
  return out;
}

/** "Ward {2}" or "Ward—{3}, Pay 3 life." */
export function wardCostOf(oracle: string): CardDefinition['wardCost'] | undefined {
  const none = { generic: 0, colored: {} };
  const life = /Ward—Pay (\d+) life\./.exec(oracle);
  if (life) return { mana: none, life: Number(life[1]) };
  if (/Ward—Discard a card\./.test(oracle)) return { mana: none, discard: true };
  if (/Ward—Sacrifice a Food\./.test(oracle)) return { mana: none, sacrificeFood: true };
  const m = /Ward(?: |—)\{(\d+)\}(?:, Pay (\d+) life)?/.exec(oracle);
  if (!m) return undefined;
  return {
    mana: { generic: Number(m[1]), colored: {} },
    ...(m[2] ? { life: Number(m[2]) } : {}),
  };
}

/** Printed characteristics from Scryfall + hand-written behavior = engine definition. */
export function buildCard(sc: ScryfallCard, behavior: Behavior = {}): CardDefinition {
  const { supertypes, types, subtypes } = parseTypeLine(sc.typeLine);
  const { abilities: own = [], ...rest } = behavior;
  const abilities = [...own];
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
    // "*" (set by a characteristic-defining ability) counts as 0 printed.
    ...(sc.power !== undefined
      ? { power: Number(sc.power) || 0, toughness: Number(sc.toughness) || 0 }
      : {}),
    keywords: mapKeywords(sc.keywords, sc.oracleText),
    ...(sc.loyalty !== undefined ? { loyalty: Number(sc.loyalty) } : {}),
    abilities,
    ...(sc.back ? { back: slug(sc.back) } : {}),
    ...(/can't be countered/.test(sc.oracleText) ? { uncounterable: true } : {}),
    ...(wardCostOf(sc.oracleText) ? { wardCost: wardCostOf(sc.oracleText)! } : {}),
    // Everything else the behaviour sets (spell, modes, kicker, costs, ...).
    ...rest,
  };
}
