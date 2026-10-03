import type {
  AbilityDef,
  CardDefinition,
  CardFilter,
  EffectDef,
  Keyword,
  ManaType,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';

/** Shared shapes for the Final Fantasy (FIN) card files. */

export { mana };
export {
  creature,
  draw,
  gain,
  onEnter,
  t0,
  t1,
  theirCreature,
  yourCreature,
  yours,
} from '../blb/helpers.ts';
export { combos, equip } from '../msc/helpers.ts';

export const t2 = { target: 2 } as const;

/** An instant or sorcery. */
export const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});

/** A labelled mode ("Cure", "Attack"). */
export const mode = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});

/**
 * Tiered: "choose one additional cost". Each mode comes with the extra cost
 * paid for it ({0} for the first).
 */
export const tiered = (...tiers: [cost: string, mode: SpellDef][]): Behavior => ({
  modes: tiers.map(([, m]) => m),
  tiered: tiers.map(([cost]) => mana(cost)),
});

/** The 1/1 colourless Hero creature token (job select and the set's Hero makers). */
export const HERO = 'fin-hero-token';
export const hero = (count = 1): EffectDef => ({ kind: 'createToken', token: HERO, count });

/**
 * Job select: "When this Equipment enters, create a 1/1 colorless Hero
 * creature token, then attach this to it."
 */
export const jobSelect: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects: [{ kind: 'jobSelect', token: HERO }],
};

/** "Equipped creature gets +P/+T (and has ...), and is a <Job> in addition to its other types." */
export const equipped = (
  power: number,
  toughness: number,
  job: string,
  keywords: Keyword[] = [],
  extra: { yourTurnKeywords?: Keyword[] } = {},
): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'attached',
    power,
    toughness,
    addSubtypes: [job],
    ...(keywords.length ? { keywords } : {}),
    ...extra,
  },
});

/** A Saga chapter: "I, II — ...". */
export const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

/** "Exile this, then return it to the battlefield transformed" (an activated ability, as a sorcery). */
export const returnTransformed = (cost: string, tapSelf = false): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), ...(tapSelf ? { tapSelf: true } : {}) },
  sorcerySpeed: true,
  targets: [],
  effects: [{ kind: 'blink', what: 'self', transformed: true }],
  label: 'Transform',
});

/** "<Land type>cycling {cost}": discard it to search for a card of that land type. */
export const landcycling = (type: string, cost = '{2}'): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: { subtype: type }, to: 'hand' }],
  label: `${type}cycling ${cost}`,
});

/** "Cycling {cost}": discard it to draw a card. */
export const cycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
  label: `Cycling ${cost}`,
});

/** "{T}: Add {X}." for each colour. */
export const tapFor = (...colors: ManaType[]): AbilityDef[] =>
  colors.map((produces) => ({ kind: 'mana', cost: { tapSelf: true }, produces }));

// Town (Final Fantasy, 11a)

/** "A basic land card or Town card". */
export const basicOrTown: CardFilter = {
  types: ['Land'],
  anyOf: [{ supertypes: ['Basic'] }, { subtype: 'Town' }],
};
/** "For each Town you control" / "Affinity for Towns". */
export const townsYouControl = {
  count: 'permanentsYouControl',
  filter: { types: ['Land'], subtype: 'Town' },
} as const;

/** "You may discard a card. If you do, draw a card." */
export const mayRummage: EffectDef = {
  kind: 'may',
  effects: [
    {
      kind: 'if',
      condition: { kind: 'handSize', min: 1 },
      then: [
        { kind: 'discard', count: 1 },
        { kind: 'draw', who: 'controller', amount: 1 },
      ],
    },
  ],
};

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  power: number,
  toughness: number,
  abilities: AbilityDef[] = [],
  keywords: Keyword[] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords,
  abilities,
  isToken: true,
});

/** "Whenever a land you control enters, this token gets +1/+0 until end of turn." */
const birdLandfall: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'landfall' },
  targets: [],
  effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
};

export const FINAL_FANTASY_TOKENS: CardDefinition[] = [
  token(HERO, 'Hero', [], ['Hero'], 1, 1),
  token('fin-knight-token', 'Knight', ['W'], ['Knight'], 2, 2),
  token('fin-bird-token', 'Bird', ['G'], ['Bird'], 2, 2, [birdLandfall]),
  token('fin-wizard-token', 'Wizard', ['B'], ['Wizard'], 0, 1, [
    {
      kind: 'triggered',
      trigger: { on: 'castSpell', filter: 'noncreature' },
      targets: [],
      effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
    },
  ]),
  { ...token('angelo-token', 'Angelo', ['G', 'W'], ['Dog'], 1, 1), supertypes: ['Legendary'] },
];
