import type {
  AbilityDef,
  Amount,
  CardFilter,
  ConditionDef,
  EffectDef,
  Keyword,
  Ref,
  SpellDef,
  TargetSpec,
  TriggerDef,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';

/** Shared shapes for the Bloomburrow card files. */

export { mana };

export const t0 = { target: 0 } as const;
export const t1 = { target: 1 } as const;
export const creature: TargetSpec = { what: 'creature' };
export const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
export const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
export const yourCreatureCard = (optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'] },
  ...(optional ? { optional: true } : {}),
});
export const yours = { each: 'creature', controller: 'you' } as const;
export const draw = (amount: number): EffectDef => ({ kind: 'draw', who: 'controller', amount });
export const gain = (amount: number): EffectDef => ({
  kind: 'gainLife',
  who: 'controller',
  amount,
});
export const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];
export const food: EffectDef = { kind: 'createToken', token: 'food-token', count: 1 };
export const rabbit = (count = 1): EffectDef => ({
  kind: 'createToken',
  token: 'rabbit-token',
  count,
});

export const onEnter = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects,
});
/** "You may forage. If you do, ..." */
export const mayForage = (...then: EffectDef[]): EffectDef => ({
  kind: 'forage',
  optional: true,
  then,
});
export const squirrelOrFood: CardFilter = { anyOf: [{ subtype: 'Squirrel' }, { subtype: 'Food' }] };
export const youControlAToken = {
  kind: 'controlsPermanents',
  filter: { token: true },
  min: 1,
} as const;

/**
 * Offspring {cost}: an optional extra cost (kicker under another name); if it
 * was paid, the creature makes a 1/1 token copy of itself as it enters.
 */
export function offspring(cost: string, ...abilities: AbilityDef[]): Behavior {
  return {
    kicker: { cost: mana(cost), as: 'offspring' },
    abilities: [
      ...abilities,
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasKicked' },
        targets: [],
        effects: [{ kind: 'offspringCopy' }],
      },
    ],
  };
}

/** The gifts an opponent can be promised. */
export const GIFTS = {
  card: { kind: 'draw', who: 'eachOpponent', amount: 1 },
  food: { ...food, forOpponent: true },
  fish: { kind: 'createToken', token: 'fish-token', count: 1, tapped: true, forOpponent: true },
  treasure: { kind: 'createToken', token: 'treasure-token', count: 1, forOpponent: true },
} satisfies Record<string, EffectDef>;

/**
 * Gift: promising the gift is free (a zero-cost kicker). The opponent gets it
 * first as the spell resolves, then the spell does its promised version.
 */
export function gift(present: keyof typeof GIFTS, spell: SpellDef, promised: SpellDef): Behavior {
  return {
    spell,
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      spell: { ...promised, effects: [GIFTS[present], ...promised.effects] },
    },
  };
}

/** "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn." */
export const prowess: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'noncreature' },
  targets: [],
  effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
};

/** Valiant: the first time each turn this becomes the target of your spell or ability. */
export const valiant = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'valiant' },
  targets,
  effects,
});

/** "If you gained or lost life this turn." */
export const lifeChanged = { kind: 'lifeThisTurn', who: 'you', either: true } as const;

/** "At the beginning of your end step, if ..., ..." */
export const atYourEndStep = (
  condition: ConditionDef | undefined,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfEndStep', whose: 'yours' },
  ...(condition ? { condition } : {}),
  targets,
  effects,
});

/** "At the beginning of combat on your turn, ..." */
export const atYourCombat = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfCombat', whose: 'yours' },
  targets,
  effects,
});

/** A triggered ability with the given trigger, targets and effects. */
export const when = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

/** Until-end-of-turn power/toughness (and keywords) for a ref. */
export const pump = (
  to: Ref,
  power: Amount,
  toughness: Amount,
  keywords: Keyword[] = [],
): EffectDef => ({ kind: 'pump', to, power, toughness, ...(keywords.length ? { keywords } : {}) });

/** "You control a creature (permanent) with this subtype." */
export const youControl = (subtype: string) =>
  ({ kind: 'controlsPermanents', filter: { subtype }, min: 1 }) as const;

/** Creatures you control with one of these subtypes. */
export const yourCreaturesOf = (...subtypes: string[]): Ref => ({
  each: 'creature',
  controller: 'you',
  filter: subtypes.length === 1 ? { subtype: subtypes[0]! } : { subtypes },
});
