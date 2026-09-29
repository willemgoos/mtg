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
export type Behavior = Pick<
  Partial<CardDefinition>,
  | 'abilities'
  | 'spell'
  | 'modes'
  | 'kicker'
  | 'flashback'
  | 'ptEquals'
  | 'enchant'
  | 'costReduction'
  | 'entersWithCountersIf'
  | 'sacrificeOrPay'
  | 'castFromGraveyardRemovingCounters'
  | 'sacrificeCreatureToCast'
  | 'uncounterable'
  | 'powerEquals'
  | 'castOnlyIf'
  | 'entersWithCounters'
  | 'entersTapped'
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
    else if (!KEYWORDS_AS_ABILITIES.has(k)) throw new Error(`Unsupported keyword "${k}"`);
  }
  return out;
}

/** "Ward {2}" or "Ward—{3}, Pay 3 life." */
export function wardCostOf(oracle: string): CardDefinition['wardCost'] | undefined {
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
    // "*" (set by a characteristic-defining ability) counts as 0 printed.
    ...(sc.power !== undefined
      ? { power: Number(sc.power) || 0, toughness: Number(sc.toughness) || 0 }
      : {}),
    keywords: mapKeywords(sc.keywords, sc.oracleText),
    abilities,
    ...(behavior.spell ? { spell: behavior.spell } : {}),
    ...(behavior.modes ? { modes: behavior.modes } : {}),
    ...(behavior.kicker ? { kicker: behavior.kicker } : {}),
    ...(behavior.flashback ? { flashback: behavior.flashback } : {}),
    ...(behavior.ptEquals !== undefined ? { ptEquals: behavior.ptEquals } : {}),
    ...(behavior.enchant ? { enchant: behavior.enchant } : {}),
    ...(behavior.costReduction !== undefined ? { costReduction: behavior.costReduction } : {}),
    ...(behavior.entersWithCountersIf
      ? { entersWithCountersIf: behavior.entersWithCountersIf }
      : {}),
    ...(behavior.sacrificeOrPay ? { sacrificeOrPay: behavior.sacrificeOrPay } : {}),
    ...(behavior.sacrificeCreatureToCast ? { sacrificeCreatureToCast: true } : {}),
    ...(behavior.powerEquals !== undefined ? { powerEquals: behavior.powerEquals } : {}),
    ...(behavior.castOnlyIf ? { castOnlyIf: behavior.castOnlyIf } : {}),
    ...(/can't be countered/.test(sc.oracleText) ? { uncounterable: true } : {}),
    ...(wardCostOf(sc.oracleText) ? { wardCost: wardCostOf(sc.oracleText)! } : {}),
    ...(behavior.castFromGraveyardRemovingCounters
      ? { castFromGraveyardRemovingCounters: behavior.castFromGraveyardRemovingCounters }
      : {}),
    ...(behavior.entersWithCounters ? { entersWithCounters: behavior.entersWithCounters } : {}),
    ...(behavior.entersTapped ? { entersTapped: true } : {}),
  };
}
