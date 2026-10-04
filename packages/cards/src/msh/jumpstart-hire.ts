import type { AbilityDef, ConditionDef, EffectDef } from '@mtg/engine';
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

// Contract Hero's attack trigger.
const hasArtifact: ConditionDef = {
  kind: 'controlsPermanents',
  filter: { types: ['Artifact'] },
  min: 1,
};
const hasCard: ConditionDef = { kind: 'handHas', filter: {} };
const plusTwo: EffectDef = { kind: 'pump', to: 'self', power: 2, toughness: 0 };
const sacArtifact = {
  label: 'Sacrifice an artifact: +2/+0',
  effects: [
    {
      kind: 'sacrificeSeveral',
      count: 1,
      filter: { types: ['Artifact'] },
      then: [plusTwo],
    } satisfies EffectDef,
  ],
};
const discardCard = {
  label: 'Discard a card: +2/+0',
  effects: [{ kind: 'discard', count: 1 } satisfies EffectDef, plusTwo],
};
const contractChoice = (...options: { label: string; effects: EffectDef[] }[]): EffectDef => ({
  kind: 'choose',
  options: [...options, { label: "Don't", effects: [] }],
});

export const MSH_JUMPSTART_HIRE: Record<string, Behavior> = {
  // Trample comes from Scryfall. "5 damage divided as you choose among up to five targets": the
  // targets and the split are chosen as the power-up resolves.
  'Iron Fist, Hero for Hire': {
    abilities: [
      prowess,
      powerUpTargeting(
        '{7}{R}',
        [],
        { kind: 'divide', amount: 5, maxTargets: 5, spec: { what: 'any' }, give: 'damage' },
        { kind: 'counters', to: 'self', amount: 5 },
      ),
    ],
  },
  // "You may sacrifice an artifact or discard a card": only the ones you can do are offered.
  'Contract Hero': {
    abilities: [
      onEnter(treasure()),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: hasArtifact,
            then: [
              {
                kind: 'if',
                condition: hasCard,
                then: [contractChoice(sacArtifact, discardCard)],
                else: [contractChoice(sacArtifact)],
              },
            ],
            else: [{ kind: 'if', condition: hasCard, then: [contractChoice(discardCard)] }],
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
