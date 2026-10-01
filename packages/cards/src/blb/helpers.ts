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
      spell: { ...promised, effects: [GIFTS[present], { kind: 'giftGiven' }, ...promised.effects] },
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

/** "{T}: Add one mana of any color." */
export const anyColor = (): AbilityDef[] =>
  (['W', 'U', 'B', 'R', 'G'] as const).map((produces) => ({
    kind: 'mana',
    cost: { tapSelf: true },
    produces,
  }));

/** Static abilities that take a condition (so a Class level can switch them on). */
const CONDITIONAL_STATICS = new Set([
  'anthem',
  'while',
  'damageBonus',
  'spellsCostLessIf',
  'doubleCounters',
  'othersEnterWithCounter',
]);

/** Gates an ability behind a Class level (merged with its own condition). */
function atLevel(a: AbilityDef, min: number): AbilityDef {
  const level: ConditionDef = { kind: 'classLevel', min };
  const and = (c: ConditionDef | undefined): ConditionDef =>
    c ? { kind: 'all', of: [c, level] } : level;
  if (a.kind === 'triggered') {
    // "When this Class becomes level N" only fires as it does.
    if (a.trigger.on === 'becomesLevel') return a;
    return { ...a, condition: and(a.condition) };
  }
  if (a.kind === 'activated') return { ...a, condition: and(a.condition) };
  if (a.kind === 'static' && CONDITIONAL_STATICS.has(a.effect.kind)) {
    const own = (a.effect as { condition?: ConditionDef }).condition;
    return { ...a, effect: { ...a.effect, condition: and(own) } } as AbilityDef;
  }
  throw new Error(`Can't gate ${a.kind} ${a.kind === 'static' ? a.effect.kind : ''} by level`);
}

/**
 * A Class: its level 1 abilities, then levels 2 and 3, each with the cost to
 * gain it (as a sorcery) and the abilities it adds.
 */
export function classCard(
  level1: AbilityDef[],
  level2: { cost: string; abilities: AbilityDef[] },
  level3: { cost: string; abilities: AbilityDef[] },
): Behavior {
  const levelUp = (to: number, cost: string): AbilityDef => ({
    kind: 'activated',
    cost: { mana: mana(cost) },
    sorcerySpeed: true,
    condition: { kind: 'classLevel', exactly: to - 1 },
    targets: [],
    effects: [{ kind: 'levelUp' }],
    label: `Level ${to}`,
  });
  return {
    abilities: [
      ...level1,
      levelUp(2, level2.cost),
      ...level2.abilities.map((a) => atLevel(a, 2)),
      levelUp(3, level3.cost),
      ...level3.abilities.map((a) => atLevel(a, 3)),
    ],
  };
}
