import type {
  AbilityDef,
  Amount,
  CardDefinition,
  ConditionDef,
  CostDef,
  EffectDef,
  ManaCost,
  SpellDef,
  TargetSpec,
  TriggerDef,
  Color,
} from '@mtg/engine';

// Lorwyn Eclipsed (18a): small builders for the new engine vocabulary. See "18a vocabulary" in docs/lorwyn-eclipsed-plan.md.

const FREE: ManaCost = { generic: 0, colored: {} };

/** Vivid: the number of colors among permanents you control (cost reductions, "where X is ...", draws, life, power). */
export const VIVID: Amount = { count: 'vivid' };

/** "The blighted creature": the creature a `blight` effect chose, inside its `then`. */
export const BLIGHTED = 'chosen' as const;

/**
 * Blight N as an effect: the player picks a creature they control and it gets N -1/-1 counters. `then` happens if they blighted
 * (use `BLIGHTED` for "the blighted creature"), `otherwise` if they didn't or couldn't. `who`: 'eachOpponent' or `{ target: n }`.
 */
export const blight = (
  amount: Amount,
  extra: {
    who?: 'controller' | 'eachOpponent' | { target: number };
    optional?: boolean;
    then?: EffectDef[];
    otherwise?: EffectDef[];
  } = {},
): EffectDef => ({ kind: 'blight', amount, ...extra });

/** "You may blight N. If you do, <then>." (`otherwise`: "If you don't, ...") */
export const mayBlight = (
  amount: Amount,
  then: EffectDef[] = [],
  otherwise: EffectDef[] = [],
): EffectDef => ({
  kind: 'blight',
  amount,
  optional: true,
  then,
  ...(otherwise.length ? { otherwise } : {}),
});

/** "<cost>, Blight N: ..." as the cost of an activated ability. */
export const withBlight = (n: number, cost: CostDef = {}): CostDef => ({ ...cost, blight: n });

/**
 * "As an additional cost to cast this spell, you may blight N": the optional cost. Paid, the spell was cast "kicked" (check it with
 * `{ kind: 'wasKicked' }` in an `if`), or does `spell` instead (Pyrrhic Strike: `combineSpells` of its modes).
 */
export const optionalBlight = (n: number, spell?: SpellDef): Pick<CardDefinition, 'kicker'> => ({
  kicker: { cost: FREE, blight: n, ...(spell ? { spell } : {}) },
});

/** "If this spell's additional cost was paid" (an optional blight, behold or kicker). */
export const additionalCostPaid: ConditionDef = { kind: 'wasKicked' };

/** "At the beginning of your first main phase, you may pay <cost>. If you do, transform this." (both faces of the two-faced legends) */
export const firstMainTransform = (cost: ManaCost): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfMain', which: 1 },
  targets: [],
  cost,
  effects: [{ kind: 'transform', what: 'self' }],
});

/** "Whenever this creature enters or transforms into <this face>" (the front faces). */
export const entersOrTransforms = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etbOrTransforms' },
  targets,
  effects,
});

/** "Whenever this creature transforms into <this face>" (the back faces). */
export const transformsInto = (effects: EffectDef[], targets: TargetSpec[] = []): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'transforms' },
  targets,
  effects,
});

/** "When this creature enters, if {W}{W} was spent to cast it, ..." (the Elemental Incarnations). */
export const enterIfSpent = (
  colors: Partial<Record<Color, number>>,
  effects: EffectDef[],
  targets: TargetSpec[] = [],
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' } satisfies TriggerDef,
  condition: { kind: 'manaSpentColors', colors },
  targets,
  effects,
});

/** Evoke {cost}: `evoke: <cost>` on the card; "if it was evoked" is `{ kind: 'wasEvoked' }`. */
export const evoke = (cost: ManaCost): Pick<CardDefinition, 'evoke'> => ({ evoke: cost });

/** "When this creature leaves the battlefield, return the exiled card to its owner's hand" (the Champions, after `beholdExile`). */
export const returnBeheldWhenLeaves: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'leavesBattlefield' },
  targets: [],
  effects: [{ kind: 'returnBeholdExiled' }],
};

/** "Remove a counter from this creature" (or N) as part of an activated ability's cost: `withRemovedCounters(1, { mana })`. */
export const withRemovedCounters = (n: number, cost: CostDef = {}): CostDef => ({
  ...cost,
  removeAnyCounters: n,
});

/** "This creature enters with N -1/-1 counters on it." */
export const entersWithMinusCounters = (
  n: number,
): Pick<CardDefinition, 'entersWithNamedCounters'> => ({
  entersWithNamedCounters: { '-1/-1': n },
});

/** "While this creature has a -1/-1 counter on it" (a condition for triggers and statics). */
export const hasMinusCounter: ConditionDef = {
  kind: 'sourceNamedCounters',
  name: '-1/-1',
  min: 1,
};
