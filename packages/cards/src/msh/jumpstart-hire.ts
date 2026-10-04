import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  mana,
  onEnter,
  powerUpTargeting,
  prowess,
  spell,
  t0,
  t1,
  yourCreature,
} from './helpers.ts';

// Marvel Super Heroes Jumpstart, Heroes for Hire packet (docs/marvel-jumpstart.md):
// the cards it was missing. Marvelous Melee is shared with four other packets.

const treasure = (count = 1): EffectDef => ({
  kind: 'createToken',
  token: 'treasure-token',
  count,
});

/** "Basic landcycling {cost}": discard it to search for a basic land card. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

const upToAny: TargetSpec = { what: 'any', optional: true };
const hit = (amount: number, to: typeof t0 | typeof t1): EffectDef => ({
  kind: 'damage',
  amount,
  to,
  from: 'self',
});

export const MSH_JUMPSTART_HIRE: Record<string, Behavior> = {
  // Trample comes from Scryfall.
  /**
   * "5 damage divided as you choose among up to five targets", simplified to up
   * to two targets: with two, choose 4/1 or 3/2 (order the targets to choose
   * which gets more).
   */
  'Iron Fist, Hero for Hire': {
    abilities: [
      prowess,
      powerUpTargeting(
        '{7}{R}',
        [upToAny, upToAny],
        {
          kind: 'if',
          condition: { kind: 'targetChosen', target: 1 },
          then: [
            {
              kind: 'choose',
              options: [
                {
                  label: '4 damage to the first target, 1 to the second',
                  effects: [hit(4, t0), hit(1, t1)],
                },
                {
                  label: '3 damage to the first target, 2 to the second',
                  effects: [hit(3, t0), hit(2, t1)],
                },
              ],
            },
          ],
          else: [hit(5, t0)],
        },
        { kind: 'counters', to: 'self', amount: 5 },
      ),
    ],
  },
  'Contract Hero': {
    abilities: [
      onEnter(treasure()),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'choose',
            options: [
              {
                label: 'Sacrifice an artifact: +2/+0',
                effects: [
                  {
                    kind: 'sacrificeSeveral',
                    count: 1,
                    filter: { types: ['Artifact'] },
                    then: [{ kind: 'pump', to: 'self', power: 2, toughness: 0 }],
                  },
                ],
              },
              {
                label: 'Discard a card: +2/+0',
                effects: [
                  {
                    kind: 'if',
                    condition: { kind: 'handHas', filter: {} },
                    then: [
                      { kind: 'discard', count: 1 },
                      { kind: 'pump', to: 'self', power: 2, toughness: 0 },
                    ],
                  },
                ],
              },
              { label: "Don't", effects: [] },
            ],
          },
        ],
      },
    ],
  },
  // Trample comes from Scryfall.
  'Luke Cage, Hero for Hire': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [treasure()],
      },
    ],
  },
  'Bionic Blow': spell(
    [yourCreature, { what: 'creature', optional: true }],
    { kind: 'pump', to: t0, power: { x: true }, toughness: 0 },
    { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
  ),
  'Heroes for Hire': {
    abilities: [
      onEnter(treasure(3)),
      {
        kind: 'activated',
        cost: { sacrificePermanent: { subtype: 'Treasure' } },
        targets: [],
        effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' }],
        label: 'Sacrifice a Treasure: Exile the top card',
      },
    ],
  },
  'Marvelous Melee': {
    ...spell([{ what: 'creature' }], { kind: 'damage', amount: 6, to: t0 }),
    abilities: [basicLandcycling('{2}')],
  },
};
