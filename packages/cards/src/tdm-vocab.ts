import { variantIdOf } from '@mtg/engine';
import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardDefId,
  CardFilter,
  CostDef,
  EffectDef,
  ManaCost,
  TargetSpec,
} from '@mtg/engine';

// Tarkir: Dragonstorm (19a): small builders for the new engine vocabulary. See "19a vocabulary" in docs/tarkir-dragonstorm-plan.md.

const NO_COST: ManaCost = { generic: 0, colored: {} };

// ---------------------------------------------------------------------------
// Tokens: the Spirit that endure makes (a 0/0 definition; endure sets its size) and the Warrior of mobilize.
// ---------------------------------------------------------------------------

export const TDM_SPIRIT = 'tdm-spirit-token';
export const TDM_WARRIOR = 'tdm-warrior-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  power: number,
  toughness: number,
): CardDefinition => ({
  id,
  name,
  manaCost: NO_COST,
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords: [],
  abilities: [],
  isToken: true,
});

/** Register these in the Tarkir: Dragonstorm card set: the tokens endure and mobilize create. */
export const TDM_VOCAB_TOKENS: CardDefinition[] = [
  // "An N/N white Spirit creature token" (endure): the size is set as it is created.
  token(TDM_SPIRIT, 'Spirit', ['W'], ['Spirit'], 0, 0),
  // "A 1/1 red Warrior creature token" (mobilize).
  token(TDM_WARRIOR, 'Warrior', ['R'], ['Warrior'], 1, 1),
];

// ---------------------------------------------------------------------------
// Flurry, Renew, Endure, Mobilize, Harmonize
// ---------------------------------------------------------------------------

/** Flurry — Whenever you cast your second spell each turn, <effects>. */
export const flurry = (effects: EffectDef[], targets: TargetSpec[] = []): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'second' },
  targets,
  effects,
});

/**
 * Renew — <cost>, Exile this card from your graveyard: <effects>. Activate only as a sorcery. `targets` and `effects` as for any
 * activated ability (`{ target: 0 }` is the first target).
 */
export const renew = (
  cost: ManaCost,
  targets: TargetSpec[],
  effects: EffectDef[],
  extraCost: CostDef = {},
): AbilityDef => ({
  kind: 'activated',
  fromGraveyard: true,
  sorcerySpeed: true,
  cost: { ...extraCost, mana: cost, exileSelf: true },
  targets,
  effects,
});

/**
 * "<It> endures N": N +1/+1 counters on it or an N/N white Spirit token, the controller's choice (just the token if it isn't on the
 * battlefield). `what` is the creature: 'self' (default) or 'subject' for "the creature that entered" (Warden of the Grove).
 */
export const endure = (amount: Amount, what: 'self' | 'subject' = 'self'): EffectDef => ({
  kind: 'endure',
  amount,
  ...(what === 'self' ? {} : { what }),
});

/**
 * Mobilize N (N: a number, or an Amount for "mobilize X"): whenever this creature attacks, create N tapped and attacking 1/1 red
 * Warrior tokens; sacrifice them at the beginning of the next end step.
 */
export const mobilize = (n: Amount): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets: [],
  effects: [
    {
      kind: 'createToken',
      token: TDM_WARRIOR,
      count: n,
      tapped: true,
      attacking: true,
      sacrificeAt: 'nextEndStep',
    },
  ],
});

/**
 * Harmonize <cost>: may be cast from your graveyard for this cost, tapping an untapped creature you control to reduce the generic
 * part by its power (the cast action's `harmonizeTap`), then exiled.
 */
export const harmonize = (cost: ManaCost): Pick<CardDefinition, 'flashback' | 'harmonize'> => ({
  flashback: cost,
  harmonize: true,
});

/** Songcrafter Mage: "target instant or sorcery card in your graveyard gains harmonize until end of turn" (its harmonize cost is its mana cost). */
export const grantHarmonize: EffectDef = { kind: 'custom', handler: 'grantHarmonize' };

// ---------------------------------------------------------------------------
// Behold a Dragon
// ---------------------------------------------------------------------------

/** The filter for "a Dragon": a Dragon you control or a Dragon card in your hand. */
export const DRAGON: CardFilter = { subtype: 'Dragon' };

/** "As an additional cost to cast this spell, behold a Dragon or pay {1}" (Caustic Exhale). */
export const beholdDragonOrPay = (pay: ManaCost): Pick<CardDefinition, 'beholdOrPay'> => ({
  beholdOrPay: { filter: DRAGON, pay },
});

/**
 * "As an additional cost to cast this spell, you may behold a Dragon" (Dispelling Exhale, Osseous Exhale, Piercing Exhale): "if a
 * Dragon was beheld" is `{ kind: 'wasKicked' }`. With `flash`: "you may cast this spell as though it had flash if you behold a Dragon
 * as an additional cost" (Molten Exhale).
 */
export const mayBeholdDragon = (flash = false): Pick<CardDefinition, 'kicker'> => ({
  kicker: { cost: NO_COST, behold: DRAGON, ...(flash ? { flash: true } : {}) },
});

/** "If a Dragon was beheld" (an optional behold as an additional cost). */
export const dragonWasBeheld = { kind: 'wasKicked' } as const;

/** "You control a Dragon". */
export const controlsDragon = { kind: 'controlsCreature', filter: DRAGON } as const;

/** "When <this> enters, you may behold a Dragon. If you do, <then>" (Sarkhan, Dragon Ascendant): the player picks the card or declines. */
export const mayBeholdDragonThen = (then: EffectDef[]): EffectDef => ({
  kind: 'chooseCustom',
  handler: 'beholdThen',
  params: { filter: DRAGON, then },
});

/** "When a Dragon you control enters, return this enchantment to its owner's hand" (the Dragonstorm enchantments). */
export const returnWhenDragonEnters: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'otherCreatureEtb', controller: 'you', filter: DRAGON },
  targets: [],
  effects: [{ kind: 'bounce', what: 'self' }],
};

/** Omen: nothing to add. A card with an Omen back face is an adventure-layout record (`adventure: true` front, the Omen spell as its `back`). */
export const OMEN_NOTE =
  'Omen cards need no builder: the fetch script links the Omen spell as the back face.';

// ---------------------------------------------------------------------------
// Smaller helpers
// ---------------------------------------------------------------------------

/**
 * "{1}: Add {U}, {R}, or {W}. Activate only once each turn." (the Devotees; the colors are the clan's three). A mana ability: it
 * resolves at once, and the mana (of one of the three colors, chosen as it is spent) waits in your pool.
 */
export const devoteeMana = (colors: ('W' | 'U' | 'B' | 'R' | 'G')[]): AbilityDef => ({
  kind: 'activated',
  manaAbility: true,
  oncePerTurn: true,
  cost: { mana: { generic: 1, colored: {} } },
  targets: [],
  effects: [{ kind: 'addMana', mana: [colors] }],
});

// ---------------------------------------------------------------------------
// The Sieges: "As this enchantment enters, choose Abzan or Mardu."
// ---------------------------------------------------------------------------

/**
 * A card with `enterChoices: [{ label: 'Abzan', abilities: [...] }, { label: 'Mardu', abilities: [...] }]`: the card itself gets an
 * enters trigger that asks (the player picks a label), and `enterChoiceVariants` makes one hidden definition for each option.
 * Called for every card in the pool (index.ts); a card without `enterChoices` is returned as it is.
 */
export function withEnterChoice(c: CardDefinition): CardDefinition {
  if (!c.enterChoices?.length) return c;
  return {
    ...c,
    abilities: [
      ...c.abilities,
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'choose',
            options: c.enterChoices.map((ch) => ({
              label: ch.label,
              effects: [{ kind: 'custom', handler: 'becomeVariant', params: { label: ch.label } }],
            })),
          },
        ],
      },
    ],
  };
}

/** The hidden definitions of a card with `enterChoices`: the card (and its abilities) with the abilities of one option. */
export function enterChoiceVariants(c: CardDefinition): CardDefinition[] {
  const { enterChoices, ...rest } = c;
  return (enterChoices ?? []).map((ch) => ({
    ...rest,
    id: variantIdOf(c.id, ch.label),
    abilities: [...c.abilities, ...ch.abilities],
    variantOf: c.id,
  }));
}

/** The id of a card definition, for typed token references. */
export type TdmToken = CardDefId;
