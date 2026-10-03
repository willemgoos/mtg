import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { connive, mana, onEnter, villain } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Masters of Evil packet (docs/marvel-jumpstart.md):
// the cards it was missing. Tiger Shark is shared with the Conniving packet.

const onAttack = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets: [],
  effects,
});

export const MSH_JUMPSTART_MASTERS: Record<string, Behavior> = {
  'Boomerang, Blade Flinger': {
    abilities: [
      onAttack(
        { kind: 'damage', amount: 1, to: 'eachOpponent', from: 'self' },
        { kind: 'gainLife', who: 'controller', amount: 1 },
      ),
    ],
  },
  'Crimson Cowl, Master of Evil': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack', filter: { subtype: 'Villain', nontoken: true } },
        targets: [],
        effects: [villain()],
      },
    ],
  },
  'Tiger Shark, Abyssal Hunter': {
    abilities: [
      onEnter(connive),
      onAttack(connive),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{U/B}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true }],
        label: "Can't be blocked this turn",
      },
    ],
  },
  // Deathtouch comes from Scryfall.
  'Radioactive Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        // Two players: "that player" is the opponent.
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: { count: 'opponentLifeHalf' } }],
      },
    ],
  },
  'The Masters of Evil': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Villain' },
          power: 2,
          toughness: 1,
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), discardSelf: true },
        fromHand: true,
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: { subtype: 'Plan' }, to: 'hand' }],
        label: 'Search for a Plan card',
      },
    ],
  },
  /**
   * The fourth counter's reflexive "return target creature card" is folded into
   * the ability: the creature card is chosen (untargeted) as it resolves.
   */
  'Villainous Syndication': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapCreature: { subtype: 'Villain' } },
        sorcerySpeed: true,
        targets: [],
        effects: [
          { kind: 'mill', count: 1 },
          { kind: 'namedCounters', name: 'plan', amount: 1, to: 'self' },
          {
            kind: 'if',
            condition: {
              kind: 'amountAtLeast',
              amount: { namedCountersOnSource: 'plan' },
              min: 4,
            },
            then: [
              { kind: 'sacrifice', what: 'self' },
              {
                kind: 'putFromHandOrGraveyard',
                filter: { types: ['Creature'] },
                graveyardOnly: true,
              },
            ],
          },
        ],
        label: 'Tap a Villain: Mill a card, plan counter',
      },
    ],
  },
};
