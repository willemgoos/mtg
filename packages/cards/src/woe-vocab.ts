import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardDefId,
  CardFilter,
  Color,
  ConditionDef,
  CostDef,
  EffectDef,
  Keyword,
  ManaCost,
  Ref,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';

// Wilds of Eldraine (23a): builders for the new engine vocabulary. See "Phase 23a: engine groundwork" in
// docs/wilds-of-eldraine-plan.md.

const NO_COST: ManaCost = { generic: 0, colored: {} };

// ---------------------------------------------------------------------------
// Role tokens (rule 303.7): "Create a <role> Role token attached to <it>."
// ---------------------------------------------------------------------------

export type RoleName =
  'Cursed' | 'Monster' | 'Royal' | 'Sorcerer' | 'Virtuous' | 'Wicked' | 'Young Hero';

/** The definition ids of the seven Role tokens (register `WOE_ROLE_TOKENS` in the set). */
export const ROLE: Record<RoleName, CardDefId> = {
  Cursed: 'woe-cursed-role',
  Monster: 'woe-monster-role',
  Royal: 'woe-royal-role',
  Sorcerer: 'woe-sorcerer-role',
  Virtuous: 'woe-virtuous-role',
  Wicked: 'woe-wicked-role',
  'Young Hero': 'woe-young-hero-role',
};

const attached = (
  power: Amount,
  toughness: Amount,
  extra: Partial<Extract<AbilityDef, { kind: 'static' }>['effect']> = {},
): AbilityDef =>
  ({
    kind: 'static',
    effect: { kind: 'attached', power, toughness, ...extra },
  }) as AbilityDef;

/** "Whenever this creature attacks, ..." as an ability the enchanted creature has (its controller controls it). */
const creatureAttacks = (effects: EffectDef[], condition?: ConditionDef): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets: [],
  effects,
  ...(condition ? { condition } : {}),
});

/** What each Role's text says (Scryfall's token oracle text, "Enchant creature" aside). */
function roleAbilities(role: RoleName): AbilityDef[] {
  switch (role) {
    // "Enchanted creature has base power and toughness 1/1."
    case 'Cursed':
      return [attached(0, 0, { basePT: [1, 1] })];
    // "Enchanted creature gets +1/+1 and has trample."
    case 'Monster':
      return [attached(1, 1, { keywords: ['trample'] })];
    // "Enchanted creature gets +1/+1 and has ward {1}."
    case 'Royal':
      return [attached(1, 1, { keywords: ['wardOne'] })];
    // "Enchanted creature gets +1/+1 and has 'Whenever this creature attacks, scry 1.'"
    case 'Sorcerer':
      return [attached(1, 1, { grantAbilities: [creatureAttacks([{ kind: 'scry', amount: 1 }])] })];
    // "Enchanted creature gets +1/+1 for each enchantment you control."
    case 'Virtuous': {
      const n: Amount = { count: 'permanentsYouControl', filter: { types: ['Enchantment'] } };
      return [attached(n, n)];
    }
    // "Enchanted creature gets +1/+1. When this Aura is put into a graveyard from the battlefield, each opponent loses 1 life."
    case 'Wicked':
      return [
        attached(1, 1),
        {
          kind: 'triggered',
          trigger: { on: 'tokenToGraveyard' },
          targets: [],
          effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
        },
      ];
    // "Enchanted creature has 'Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.'"
    case 'Young Hero':
      return [
        attached(0, 0, {
          grantAbilities: [
            creatureAttacks([{ kind: 'counters', to: 'self', amount: 1 }], {
              kind: 'not',
              condition: { kind: 'amountAtLeast', amount: { toughnessOf: 'self' }, min: 4 },
            }),
          ],
        }),
      ];
  }
}

/**
 * The token definition of a Role: a colorless Aura enchantment token, "Enchant creature", subtypes Aura and Role. `id` defaults to
 * the shared Wilds of Eldraine id (`ROLE[role]`); older sets pass their own token ids (Strixhaven Brawl, the Mystical Archive).
 */
export function roleToken(role: RoleName, id: CardDefId = ROLE[role]): CardDefinition {
  return {
    id,
    name: `${role} Role`,
    manaCost: NO_COST,
    colors: [],
    types: ['Enchantment'],
    supertypes: [],
    subtypes: ['Aura', 'Role'],
    keywords: [],
    enchant: { what: 'creature' },
    abilities: roleAbilities(role),
    isToken: true,
  };
}

/** Register these in the Wilds of Eldraine card set: the seven Role tokens. */
export const WOE_ROLE_TOKENS: CardDefinition[] = (Object.keys(ROLE) as RoleName[]).map((r) =>
  roleToken(r),
);

/**
 * "Create a <role> Role token attached to <to>" (default: the first target). `to` may name several creatures ("for each creature your
 * opponents control, create a Cursed Role token attached to that creature": `{ each: 'creature', controller: 'opponent' }`), 'self'
 * ("attached to it": Cursed Courtier), 'chosen' (the card a `returnToBattlefield` just returned: Return Triumphant) or 'subject'.
 * Another Role you control on that creature is put into the graveyard by the engine (rule 303.7).
 */
export const createRole = (role: RoleName, to: Ref = { target: 0 }): EffectDef => ({
  kind: 'createRole',
  role: ROLE[role],
  to,
});

// ---------------------------------------------------------------------------
// Bargain: "You may sacrifice an artifact, enchantment, or token as you cast this spell."
// ---------------------------------------------------------------------------

/** "An artifact, enchantment, or token" (bargain, Devouring Sugarmaw, Lich-Knights' Conquest). */
export const ARTIFACT_ENCHANTMENT_OR_TOKEN: CardFilter = {
  anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }],
};

/**
 * Bargain on a card. The cast menu offers the bargained and the normal cast; bargained, the player picks the permanent to sacrifice.
 * `spell`: what an instant or sorcery does when bargained, if the whole text changes (otherwise use `ifBargained` inside `spell`).
 * `costReduction`: "This spell costs {N} less to cast if it's bargained."
 */
export const bargain = (
  opts: { spell?: SpellDef; costReduction?: number } = {},
): Pick<CardDefinition, 'kicker'> => ({
  kicker: {
    cost: NO_COST,
    as: 'bargain',
    sacrifice: ARTIFACT_ENCHANTMENT_OR_TOKEN,
    ...(opts.spell ? { spell: opts.spell } : {}),
    ...(opts.costReduction ? { costReduction: opts.costReduction } : {}),
  },
});

/** "If this spell was bargained" / "if it was bargained" (a resolving spell, or the permanent it became). */
export const wasBargained: ConditionDef = { kind: 'wasKicked' };

/** "If this spell was bargained, <then>[; otherwise <otherwise>]" as one effect of a spell. */
export const ifBargained = (then: EffectDef[], otherwise?: EffectDef[]): EffectDef => ({
  kind: 'if',
  condition: wasBargained,
  then,
  ...(otherwise ? { else: otherwise } : {}),
});

/** "When this creature enters, if it was bargained, <effects>" (Agatha's Champion, Troublemaker Ouphe). */
export const whenEntersIfBargained = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  condition: wasBargained,
  targets,
  effects,
});

// ---------------------------------------------------------------------------
// Celebration: "if two or more nonland permanents entered the battlefield under your control this turn"
// ---------------------------------------------------------------------------

export const celebration: ConditionDef = { kind: 'celebration' };

/**
 * "Celebration — This creature gets +P/+T [and has <keywords>] as long as two or more nonland permanents entered the battlefield under
 * your control this turn" (Armory Mice, Grand Ball Guest, Gallant Pie-Wielder, Tuinvale Guide).
 */
export const celebrationBoost = (
  power: number,
  toughness: number,
  keywords: Keyword[] = [],
): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'while',
    condition: celebration,
    power,
    toughness,
    ...(keywords.length ? { keywords } : {}),
  },
});

/**
 * "Celebration — At the beginning of combat on your turn, if two or more nonland permanents entered the battlefield under your control
 * this turn, <effects>" (Pests of Honor, Belligerent of the Ball, Raging Battle Mouse, Bespoke Battlegarb).
 */
export const celebrationAtCombat = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfCombat', whose: 'yours' },
  condition: celebration,
  targets,
  effects,
});

// ---------------------------------------------------------------------------
// The Restless lands, the Sphere lands
// ---------------------------------------------------------------------------

/**
 * "<cost>: [Until end of turn,] this land becomes a P/T <colors> <subtype> creature [with <keywords>] [and "<abilities>"] until end of
 * turn. It's still a land." (Restless Bivouac: `animateSelf(mana('{1}{R}{W}'), { power: 2, toughness: 2, colors: ['R', 'W'],
 * subtype: 'Ox' })`).
 */
export const animateSelf = (
  cost: ManaCost,
  spec: {
    power: number;
    toughness: number;
    colors: Color[];
    subtype: string;
    keywords?: Keyword[];
    abilities?: AbilityDef[];
  },
  label?: string,
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: cost },
  targets: [],
  effects: [{ kind: 'animate', what: 'self', ...spec }],
  ...(label ? { label } : {}),
});

/** "Whenever this land attacks, <effects>" (the Restless lands: the land is a creature while it attacks). */
export const whenThisAttacks = (effects: EffectDef[], targets: TargetSpec[] = []): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets,
  effects,
});

/**
 * A Phyrexia: All Will Be One Sphere land, "This land enters tapped. {T}: Add {W}. {1}{W}, {T}, Sacrifice this land: Draw a card." in its colour
 * (The Fair Basilica: `sphereLand('W')`; the card is `Land — Sphere`).
 */
export const sphereLand = (color: Color): Pick<CardDefinition, 'entersTapped' | 'abilities'> => {
  const cost: CostDef = {
    mana: { generic: 1, colored: { [color]: 1 } },
    tapSelf: true,
    sacrificeSelf: true,
  };
  return {
    entersTapped: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: color },
      {
        kind: 'activated',
        cost,
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        label: `{1}{${color}}, {T}, Sacrifice this land: Draw a card`,
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// Tapping the opponent's creatures
// ---------------------------------------------------------------------------

/**
 * "Whenever you tap an untapped creature an opponent controls, <effects>" (Icewrought Sentry, Solitary Sanctuary; the creature is the
 * subject). `oneOrMore`: "whenever you tap one or more untapped creatures your opponents control" (Sharae, with `oncePerTurn`).
 * `cost`: "you may pay {1}. When you do, ..." (Hylda: put the modes in `modes` of the result).
 */
export const whenYouTapOpponentCreature = (
  effects: EffectDef[],
  opts: {
    targets?: TargetSpec[];
    oneOrMore?: boolean;
    oncePerTurn?: boolean;
    cost?: ManaCost;
  } = {},
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'youTapOpponentCreature' },
  targets: opts.targets ?? [],
  effects,
  ...(opts.oneOrMore ? { batch: true } : {}),
  ...(opts.oncePerTurn ? { oncePerTurn: true } : {}),
  ...(opts.cost ? { cost: opts.cost } : {}),
});

/** "Tap target creature ... and put a stun counter on it" (Sharae, Freeze in Place: amount 3). */
export const tapAndStun = (to: Ref = { target: 0 }, amount = 1): EffectDef[] => [
  { kind: 'tap', what: to },
  { kind: 'namedCounters', name: 'stun', amount, to },
];

// ---------------------------------------------------------------------------
// Adventures, enchantments, Food, attackers
// ---------------------------------------------------------------------------

/** "A card that has an Adventure" (Edgewall Inn's target, Sentinel of Lost Lore, Seek Thrills). */
export const HAS_ADVENTURE: CardFilter = { hasAdventure: true };

/** "Whenever you cast an Adventure spell" (Chancellor of Tales, Storyteller Pixie: the spell is the subject). */
export const castAdventureSpell = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'any', spell: { subtype: 'Adventure' } },
  targets,
  effects,
});

/** "Instant cards, sorcery cards, and/or [cards that] have an Adventure" in your graveyard (Frantic Firebolt, Hearth Elemental). */
export const instantSorceryOrAdventureCardsInGraveyard: Amount = {
  count: 'cardsInGraveyard',
  filter: { anyOf: [{ types: ['Instant', 'Sorcery'] }, HAS_ADVENTURE] },
};

/** "As long as you own a card in exile that has an Adventure" (Howling Galefang). */
export const ownsAdventureInExile: ConditionDef = { kind: 'ownsInExile', filter: HAS_ADVENTURE };

/** "Permanent spells you cast that have an Adventure cost {1} less to cast" (Beluna Grandsquall). */
export const adventurePermanentsCostLess = (amount: number): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'spellsCostLess', filter: HAS_ADVENTURE, amount },
});

/** "Enchanted creatures you control get +P/+T" (A Tale for the Ages, Syr Armont): creatures with an Aura attached. */
export const enchantedCreaturesYouControlGet = (power: number, toughness: number): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'anthem',
    affects: 'creaturesYouControl',
    filter: { enchanted: true },
    power,
    toughness,
  },
});

/**
 * "Whenever an enchantment you control is put into a graveyard from the battlefield, <effects>" (Ashiok's Reaper, Knight of Doves,
 * Savior of the Sleeping, Wicked Visitor, Warehouse Tabby). Roles count (a token goes to the graveyard before it ceases to exist).
 */
export const whenEnchantmentYouControlToGraveyard = (effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'permanentYouControlDies', filter: { types: ['Enchantment'] } },
  targets: [],
  effects,
});

/** "Whenever an enchantment [an Aura] you control enters, <effects>" (Rimefur Reindeer; Tanglespan Lookout: `{ subtype: 'Aura' }`). */
export const whenEnchantmentYouControlEnters = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
  filter: CardFilter = { types: ['Enchantment'] },
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'otherPermanentEtb', filter },
  targets,
  effects,
});

/** "The number of Foods you control" (Night of the Sweets' Revenge, Welcome to Sweettooth). */
export const foodsYouControl: Amount = {
  count: 'permanentsYouControl',
  filter: { subtype: 'Food' },
};

/** "For each creature that attacked this turn" (Rowdy Research, Witchstalker Frenzy: `costReduction`). */
export const creaturesAttackedThisTurn: Amount = { count: 'creaturesAttackedThisTurn' };
