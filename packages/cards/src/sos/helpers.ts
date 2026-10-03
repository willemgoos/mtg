import type { AbilityDef, EffectDef, TargetSpec, TriggerDef } from '@mtg/engine';

/** Shared shapes for the Secrets of Strixhaven card files. */

/** Opus: "Whenever you cast an instant or sorcery spell, <small>. If five or more mana was spent to cast it, <big> instead." */
export const opus = (small: EffectDef[], big: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
  targets: [],
  effects: [
    {
      kind: 'if',
      condition: { kind: 'amountAtLeast', amount: { manaSpentOnSubject: true }, min: 5 },
      then: big,
      else: small,
    },
  ],
});

/** Repartee: "Whenever you cast an instant or sorcery spell that targets a creature, ...". */
export const repartee = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorceryTargetingCreature' },
  targets,
  effects,
});

/** Increment: "Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on it." */
export const increment: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'any' },
  condition: { kind: 'manaSpentExceedsLowestStat' },
  targets: [],
  effects: [{ kind: 'counters', to: 'self', amount: 1 }],
};

/** "Whenever <trigger>, this creature becomes prepared." */
export const becomesPrepared = (trigger: TriggerDef): AbilityDef => ({
  kind: 'triggered',
  trigger,
  targets: [],
  effects: [{ kind: 'prepare', what: 'self' }],
});
