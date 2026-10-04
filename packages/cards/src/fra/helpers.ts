import type { AbilityDef, Amount, CardFilter, ConditionDef, EffectDef } from '@mtg/engine';

/**
 * Reality Fracture (17c): small builders for the planeswalker cards (Empower Jace, loyalty abilities, "a Jace").
 * The engine side is described in docs/reality-fracture-plan.md (phase 17c) and the report of the planeswalker core.
 */

/** "Empower Jace N" (N may be any Amount: `{ count: 'landsYouControl', basicOnly: true }` for "X, where X is ..."). */
export const empowerJace = (amount: Amount): EffectDef => ({
  kind: 'empowerJace',
  amount,
});

/** A Jace planeswalker (a nontoken card or a token): for filters, counts and conditions. */
export const JACE: CardFilter = { types: ['Planeswalker'], subtype: 'Jace' };

/** "If you control a Jace planeswalker." */
export const controlsJace: ConditionDef = { kind: 'controlsPermanents', filter: JACE, min: 1 };

/**
 * "You couldn't behold a Jace": you control no Jace and hold no Jace card. For "as this land enters, you may behold a Jace.
 * If you don't, it enters tapped" (Theorist's Sanctum): `entersTappedIf: noJaceToBehold` (beholding costs nothing, so a
 * player who can always does). For "behold a Jace or pay {N}" use `beholdOrPay: { filter: JACE, pay }` on the card.
 */
export const noJaceToBehold: ConditionDef = {
  kind: 'all',
  of: [
    { kind: 'not', condition: controlsJace },
    { kind: 'not', condition: { kind: 'handHas', filter: JACE } },
  ],
};

/** A loyalty ability: `loyaltyAbility(-2, '−2: Create a Cadet', ...effects)`; add `targets` for targeted ones. */
export const loyaltyAbility = (
  cost: number,
  label: string,
  effects: EffectDef[],
  extra: Partial<Extract<AbilityDef, { kind: 'activated' }>> = {},
): AbilityDef => ({
  kind: 'activated',
  cost: { loyalty: cost },
  targets: [],
  effects,
  label,
  ...extra,
});

/** `Planeswalkers you control have "<ability>"` as a static ability. */
export const planeswalkersHave = (ability: AbilityDef): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'planeswalkersHave', ability },
});
