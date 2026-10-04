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
  // Only matters for commanders: two partners may lead one deck (Vial Smasher).
  'Partner',
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
  'Crew',
  'Heal',
  'Enchant',
  'Affinity',
  'Surveil',
  'Morbid',
  'Threshold',
  'Mill',
  // Strixhaven (13a).
  'Learn',
  'Magecraft',
  // Strixhaven Brawl (15a, white): rules text lives in the behaviour.
  'Escape',
  'Disturb',
  'Unearth',
  'Seek',
  // Secrets of Strixhaven (14a): keywords that are only labels or reminder text (rules text lives in the behaviour).
  'Prepared',
  'Opus',
  'Repartee',
  'Infusion',
  'Increment',
  'Converge',
  'Paradigm',
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
  'Investigate',
  'Enrage',
  'Landcycling',
  'Basic landcycling',
  // Marvel Super Heroes Jumpstart (Incredible): Hulk's Thunderclap.
  'Behold',
  'Typecycling',
  // Marvel Super Heroes Jumpstart (Scarlet): Grapeshot.
  'Storm',
  'Extort',
  'Improvise',
  'Sneak',
  'Boast',
  'Double',
  'Crew',
  'Heal',
  // Marvel Super Heroes Commander.
  'Cycling',
  'Crew',
  'Heal',
  'Cosmic Awareness',
  'Metalcraft',
  'Monstrosity',
  'Lieutenant',
  'AV Bead',
  'Communication Bead',
  'Prime Bead',
  'Cascade',
  'Convoke',
  'Discover',
  'Escalate',
  'Explore',
  'Goad',
  'Rebound',
  'Insatiable Hunger',
  'Lethal Voice',
  'Sense the Good',
  'Mayhem',
  'Melee',
  'Multikicker',
  'Overload',
  'Unearth',
  'Mary',
  'Typhoid Mary',
  'Bloody Mary',
  'Sell Contraband',
  'Buy Information',
  'Hire a Mercenary',
  // Strixhaven (13a).
  'Magecraft',
  // Strixhaven Brawl (15a, white): rules text lives in the behaviour.
  'Escape',
  'Disturb',
  'Unearth',
  'Seek',
  // Secrets of Strixhaven (14a): keywords that are only labels or reminder text (rules text lives in the behaviour).
  'Prepared',
  'Opus',
  'Repartee',
  'Infusion',
  'Increment',
  'Converge',
  'Paradigm',
  'Learn',
  // Strixhaven Brawl (15a): Alchemy conjure.
  'Conjure',
  // Strixhaven Brawl (15b, b): rules text lives in the behaviour.
  'Draft from a spellbook',
  'Double team',
  'Fabricate',
  'Blight',
  'Role token',
  // Strixhaven Brawl (15b, multi): Call the Crash.
  'Suspend',
  // Strixhaven Brawl (15b, white): rules text lives in the behaviour.
  'Bestow',
  'Heroic',
  'Constellation',
  'Eerie',
  'Mentor',
  'Afterlife',
  'Populate',
  'Protection',
  'Room',
  // Strixhaven Brawl (15b, g): labels and reminder text (rules text lives in the behaviour).
  'Devoid',
  'Adapt',
  'Proliferate',
  'Warp',
  'Reinforce',
  'Coven',
  'Modified',
  'Cycling',
  'Landfall',
  // Strixhaven Brawl (15b, r): spree and bargain (modelled by spree/pawprints and a sacrifice kicker), myriad (no effect with one opponent), boon.
  'Spree',
  'Bargain',
  'Myriad',
  'Boon',
  // Strixhaven Brawl (15b, pair): rules text lives in the behaviour.
  'Plot',
  'Revolt',
  // Final Fantasy (11a).
  'Job select',
  'Tiered',
  'Plainscycling',
  'Islandcycling',
  'Swampcycling',
  'Mountaincycling',
  'Forestcycling',
  'Hideaway',
  'Meld',
  'Triple',
  // Strixhaven Brawl (15b, u): keywords that are labels or reminder text (rules text lives in the behaviour).
  'Plot',
  'Delve',
  'Skulk',
  'Spree',
  'Cleave',
  'Awaken',
  'Proliferate',
  'Amass',
  'Boon',
  'Perpetually',
  'Phasing',
  // Mystical Archive (16): rules text lives in the behaviour (storm is a cast trigger, split second a card field).
  'Storm',
  'Split second',
  // Final Fantasy Commander (12).
  'Draft from a spellbook',
  'Spree',
  'Proliferate',
  'Saddle',
  'Adapt',
  'Delve',
  'Ninjutsu',
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
    // Strixhaven Brawl (15b, u): Phyrexian mana is paid with its colour (the 2-life option is a kicker alternative on the card).
    else if (/^[WUBRG]\/P$/.test(sym!)) {
      const t = sym!.split('/')[0] as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else if (/^2\/[WUBRG]$/.test(sym!))
      (cost.twoHybrid ??= []).push(sym!.split('/')[1] as ManaType);
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
    if (w === 'Basic' || w === 'Legendary' || w === 'Snow')
      supertypes.push(w); // Strixhaven Brawl (15b, g): Snow
    else types.push(w as CardType);
  }
  const subtypes = right.trim() ? right.trim().split(/\s+/) : [];
  return { supertypes, types, subtypes };
}

export function mapKeywords(scryfall: readonly string[], oracle = ''): Keyword[] {
  const out: Keyword[] = [];
  // "Hexproof from instants" shows up as both "Hexproof from" and "Hexproof".
  if (scryfall.includes('Hexproof from')) {
    if (/hexproof from instants/i.test(oracle)) out.push('hexproofFromInstants');
    else if (/hexproof from white/i.test(oracle)) out.push('hexproofFromWhite');
    else throw new Error('Unsupported "Hexproof from"');
    scryfall = scryfall.filter((k) => k !== 'Hexproof from' && k !== 'Hexproof');
  }
  for (const k of scryfall) {
    // Strixhaven Brawl (15b, g): Mistcutter Hydra.
    if (k === 'Protection') {
      // Alseid of Life's Bounty (15b, w) only grants it: the keyword is in its rules text, not a printed one.
      if (/protection from blue/i.test(oracle)) out.push('protectionBlue');
      continue;
    }
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
  // Strixhaven Brawl (15b, b): Vein Ripper.
  if (/Ward—Sacrifice a creature\./.test(oracle)) return { mana: none, sacrificeCreature: true };
  if (/Ward—Sacrifice a Food\./.test(oracle)) return { mana: none, sacrificeFood: true };
  const m = /Ward(?: |—)\{(\d+)\}(?:, Pay (\d+) life)?/.exec(oracle);
  if (!m) return undefined;
  return {
    mana: { generic: Number(m[1]), colored: {} },
    ...(m[2] ? { life: Number(m[2]) } : {}),
  };
}

/**
 * Colour identity (rule 903.4): the colours of the mana symbols in its cost and
 * rules text (not reminder text), its colour indicator, and its basic land types.
 */
export function colorIdentityOf(sc: ScryfallCard): Color[] {
  if (sc.colorIdentity) return sc.colorIdentity as Color[];
  const found = new Set<string>(sc.colors);
  const text = sc.manaCost + sc.oracleText.replace(/\([^)]*\)/g, '');
  for (const [, sym] of text.matchAll(/\{([^}]+)\}/g))
    for (const c of sym!.split('/')) if (/^[WUBRG]$/.test(c)) found.add(c);
  const { subtypes } = parseTypeLine(sc.typeLine);
  for (const st of subtypes) if (BASIC_MANA[st]) found.add(BASIC_MANA[st]);
  return (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => found.has(c));
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
    colorIdentity: colorIdentityOf(sc),
    ...(sc.flavorName ? { flavorName: sc.flavorName } : {}),
    // Final Fantasy (11a): adventure lands, and transforming back faces (no mana cost: not castable).
    ...(sc.adventure ? { adventure: true } : {}),
    // Secrets of Strixhaven (14a): prepare creatures (their `back` is the prepare spell).
    ...(sc.prepare ? { prepare: true } : {}),
    ...(sc.front && sc.manaCost === '' && !types.includes('Land') ? { noManaCost: true } : {}),
    // Everything else the behaviour sets (spell, modes, kicker, costs, ...).
    ...rest,
  };
}
