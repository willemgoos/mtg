import type { AbilityDef, Amount, CardFilter, ConditionDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';

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
 * "You couldn't behold a Jace": you control no Jace and hold no Jace card. Superseded for Theorist's Sanctum by
 * `beholdToEnterUntapped` (the player picks which Jace to behold and a card from hand is revealed); this only says whether
 * there is anything to behold. For "behold a Jace or pay {N}" use `beholdOrPay: { filter: JACE, pay }` on the card.
 */
export const noJaceToBehold: ConditionDef = {
  kind: 'all',
  of: [
    { kind: 'not', condition: controlsJace },
    { kind: 'not', condition: { kind: 'handHas', filter: JACE } },
  ],
};

/**
 * "As this land enters, you may behold a Jace. If you don't, it enters tapped" (Theorist's Sanctum): `beholdToEnterUntapped(JACE,
 * ...otherAbilities)`. It enters tapped (like the shock lands) and an enters trigger lets the player pick which Jace to behold
 * (one they control, or a Jace card in hand, which is revealed with a `cardsRevealed` event); beholding untaps it.
 */
export const beholdToEnterUntapped = (
  filter: CardFilter,
  ...abilities: AbilityDef[]
): Behavior => ({
  entersTapped: true,
  abilities: [
    {
      kind: 'triggered',
      trigger: { on: 'etb' },
      targets: [],
      effects: [{ kind: 'chooseCustom', handler: 'beholdToEnterUntapped', params: { filter } }],
    },
    ...abilities,
  ],
});

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
