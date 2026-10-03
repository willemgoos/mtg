import type {
  AbilityDef,
  Amount,
  CardFilter,
  ConditionDef,
  EffectDef,
  ManaType,
  Ref,
  SpellDef,
  TargetSpec,
  TriggerDef,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { tapFor, tapForEither, unlessReveal, unlessYouControlType } from '../msc/helpers.ts';

/** Shared shapes for the Final Fantasy Commander (Brawl) card files. */

export { mana };
export type Triggered = Extract<AbilityDef, { kind: 'triggered' }>;
export const self = 'self' as const;
export const t0 = { target: 0 } as const;
export const t1 = { target: 1 } as const;

// ------------------------------------------------------------------ abilities

export const when = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Triggered => ({ kind: 'triggered', trigger, targets, effects });
export const onEnter = (targets: TargetSpec[], ...effects: EffectDef[]): Triggered =>
  when({ on: 'etb' }, targets, ...effects);
export const atCombat = (targets: TargetSpec[], ...effects: EffectDef[]): Triggered =>
  when({ on: 'beginningOfCombat', whose: 'yours' }, targets, ...effects);
export const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Triggered => when({ on: 'chapter', chapters }, targets, ...effects);
/** "{cost}, ...: effects" (cost written like "{2}{W}"; extra cost parts merged in). */
export const activated = (
  cost: string | null,
  extra: Omit<Extract<AbilityDef, { kind: 'activated' }>['cost'], 'mana'>,
  targets: TargetSpec[],
  effects: EffectDef[],
  more: Partial<Extract<AbilityDef, { kind: 'activated' }>> = {},
): AbilityDef => ({
  kind: 'activated',
  cost: { ...(cost ? { mana: mana(cost) } : {}), ...extra },
  targets,
  effects,
  ...more,
});
export const staticAbility = (effect: Extract<AbilityDef, { kind: 'static' }>['effect']) =>
  ({ kind: 'static', effect }) as AbilityDef;
export const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
export const condition = (handler: string): ConditionDef => ({ kind: 'custom', handler });
export const optional = (a: Triggered): Triggered => ({ ...a, optional: true });
export const oncePerTurn = (a: Triggered): Triggered => ({ ...a, oncePerTurn: true });
export const batch = (a: Triggered): Triggered => ({ ...a, batch: true });

// ------------------------------------------------------------------ effects

export const draw = (amount: Amount = 1): EffectDef => ({
  kind: 'draw',
  who: 'controller',
  amount,
});
export const gain = (amount: Amount): EffectDef => ({
  kind: 'gainLife',
  who: 'controller',
  amount,
});
export const lose = (amount: Amount): EffectDef => ({
  kind: 'loseLife',
  who: 'controller',
  amount,
});
export const drain = (amount: Amount): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];
export const damage = (amount: Amount, to: Ref): EffectDef => ({ kind: 'damage', amount, to });
export const counters = (to: Ref, amount: Amount = 1): EffectDef => ({
  kind: 'counters',
  to,
  amount,
});
export const token = (id: string, count: Amount = 1, extra: Partial<EffectDef> = {}): EffectDef =>
  ({ kind: 'createToken', token: id, count, ...extra }) as EffectDef;
export const treasure = (count: Amount = 1, extra: Partial<EffectDef> = {}) =>
  token('treasure-token', count, extra);
export const pump = (
  to: Ref,
  power: Amount,
  toughness: Amount,
  keywords: Extract<EffectDef, { kind: 'pump' }>['keywords'] = [],
  extra: Partial<Extract<EffectDef, { kind: 'pump' }>> = {},
): EffectDef => ({
  kind: 'pump',
  to,
  power,
  toughness,
  ...(keywords?.length ? { keywords } : {}),
  ...extra,
});
export const may = (...effects: EffectDef[]): EffectDef => ({ kind: 'may', effects });
export const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
export const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
export const mill = (count: number): EffectDef => ({ kind: 'mill', count });
export const destroy = (what: Ref): EffectDef => ({ kind: 'destroy', what });
export const exile = (what: Ref): EffectDef => ({ kind: 'exile', what });
/** "You may discard a card. If you do, draw a card." */
export const loot = (): EffectDef => may({ kind: 'discard', count: 1 }, draw(1));
/** Return the target card from a graveyard to the battlefield (tapped, with counters). */
export const reanimate = (target = 0, opts: { tapped?: boolean; counters?: number } = {}) =>
  [
    { kind: 'returnToBattlefield', what: { target } },
    ...(opts.tapped ? [{ kind: 'tap', what: 'chosen' }] : []),
    ...(opts.counters ? [{ kind: 'counters', to: 'chosen', amount: opts.counters }] : []),
  ] as EffectDef[];

// ------------------------------------------------------------------ targets

export const creature: TargetSpec = { what: 'creature' };
export const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
export const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
export const permanent = (
  filter: CardFilter = {},
  extra: Partial<TargetSpec> = {},
): TargetSpec => ({
  what: 'permanent',
  filter,
  ...extra,
});
export const graveyardCard = (
  filter: CardFilter = {},
  extra: Partial<TargetSpec> = {},
): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
  ...extra,
});
export const creatureCard = (filter: CardFilter = {}, extra: Partial<TargetSpec> = {}) =>
  graveyardCard({ types: ['Creature'], ...filter }, extra);
/** A permanent card ("target permanent card with mana value 3 or less"). */
export const permanentCard: CardFilter = { notTypes: ['Instant', 'Sorcery'] };
export const yours = (filter?: CardFilter): Ref => ({
  each: 'creature',
  controller: 'you',
  ...(filter ? { filter } : {}),
});
export const creatureOrArtifact: CardFilter = { types: ['Creature', 'Artifact'] };

// ------------------------------------------------------------------ spells

export const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
export const mode = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});
/** Tiered: each mode with its own additional cost, shown with it as Arena does. */
export const tier = (
  label: string,
  cost: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): SpellDef => ({ label: `${label} â€” ${cost}`, targets, effects, extraCost: mana(cost) });

// ------------------------------------------------------------------ lands

const BASIC: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** "This land enters tapped." with two or three colours. */
export const tapland = (...colors: ManaType[]): Behavior => ({
  entersTapped: true,
  abilities: tapForEither(...colors),
});
/** Pain land: "{T}: Add {C}. {T}: Add {A} or {B}. This land deals 1 damage to you." */
export const painland = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [tapFor('C'), tapFor(a, { pain: true }), tapFor(b, { pain: true })],
});
/** Slow land: "enters tapped unless you control two or more other lands". */
export const slowland = (a: ManaType, b: ManaType): Behavior => ({
  entersTappedIf: {
    kind: 'not',
    condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 2 },
  },
  abilities: tapForEither(a, b),
});
export const checkland = (a: ManaType, b: ManaType): Behavior => ({
  entersTappedIf: unlessYouControlType(a, b),
  abilities: tapForEither(a, b),
});
export const snarl = (a: ManaType, b: ManaType): Behavior => ({
  entersTappedIf: unlessReveal(a, b),
  abilities: tapForEither(a, b),
});
/** Surveil land (Murders at Karlov Manor): enters tapped, surveil 1. */
export const surveilland = (a: ManaType, b: ManaType): Behavior => ({
  entersTapped: true,
  abilities: [...tapForEither(a, b), onEnter([], surveil(1))],
});
/** Verge (Duskmourn): "{T}: Add {A}. {T}: Add {B}. Activate only if you control a [A or B basic type]." */
export const verge = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [
    tapFor(a),
    tapFor(b, {
      condition: {
        kind: 'controlsPermanents',
        filter: { types: ['Land'], subtypes: [BASIC[a]!, BASIC[b]!] },
        min: 1,
      },
    }),
  ],
});
/**
 * Pathway: Arena asks which face to play. Here the face is chosen as the
 * land enters (a simplification): it then taps for that face's colour only.
 */
export const pathway = (front: [string, ManaType], back: [string, ManaType]): Behavior => ({
  abilities: [
    onEnter([], {
      kind: 'choose',
      options: [front, back].map(([name, color]) => ({
        label: `${name} ({${color}})`,
        effects: [custom('setChosen', { color })],
      })),
    }),
    tapFor(front[1], { ifChosen: true }),
    tapFor(back[1], { ifChosen: true }),
  ],
});

/** "Basic landcycling {cost}" / "Plainscycling {cost}". */
export const landcycling = (cost: string, subtype?: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [
    {
      kind: 'searchLibrary',
      filter: subtype ? { types: ['Land'], subtype } : 'basicLand',
      to: 'hand',
    },
  ],
  label: `${subtype ? `${subtype}cycling` : 'Basic landcycling'} ${cost}`,
});

/** Unearth {cost}. */
export const unearth = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  fromGraveyard: true,
  sorcerySpeed: true,
  targets: [],
  effects: [{ kind: 'unearth' }],
  label: `Unearth ${cost}`,
});

// ------------------------------------------------------------------ Equipment

export { equip } from '../msc/helpers.ts';
type Attached = Extract<Extract<AbilityDef, { kind: 'static' }>['effect'], { kind: 'attached' }>;
/** "Equipped creature gets +P/+T (and has ...)". */
export const equipped = (
  power: Amount,
  toughness: Amount,
  keywords: Attached['keywords'] = [],
  extra: Partial<Attached> = {},
): AbilityDef =>
  staticAbility({
    kind: 'attached',
    power,
    toughness,
    ...(keywords?.length ? { keywords } : {}),
    ...extra,
  });
/** Job select: "When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it." */
export const jobSelect: AbilityDef = onEnter([], custom('jobSelect'));
export const equipment: CardFilter = { subtype: 'Equipment' };
export const yourEquipment = (extra: Partial<TargetSpec> = {}): TargetSpec => ({
  what: 'permanent',
  controller: 'you',
  filter: equipment,
  ...extra,
});

/** A Saga creature ("Summon: X"): lore counters, chapter abilities, sacrificed after the last. */
export const summon = (chapters: number, ...abilities: AbilityDef[]): Behavior => ({
  saga: chapters,
  abilities,
});
