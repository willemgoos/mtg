import type { AbilityDef, ConditionDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, powerUp, spell, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Soaring (U fliers).

/** "Basic landcycling {cost}": discard it to search for a basic land card. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

/** Another creature with flying entered under your control this turn (and is still there). */
const flyerEntered: ConditionDef = {
  kind: 'controlsPermanents',
  filter: { types: ['Creature'], hasKeyword: 'flying', enteredThisTurn: true, other: true },
  min: 1,
};

const loot: EffectDef[] = [draw(1), { kind: 'discard', count: 1 }];

export const MSH_JUMPSTART_SOARING: Record<string, Behavior> = {
  // Flying and vigilance come from Scryfall. The discount is a second, free ability that is
  // only available once another flyer entered (it must still be on the battlefield).
  'Flying Drone': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}'), tapSelf: true },
        condition: { kind: 'not', condition: flyerEntered },
        targets: [],
        effects: loot,
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: flyerEntered,
        targets: [],
        effects: loot,
        label: 'Draw, then discard (free)',
      },
    ],
  },
  // Flying comes from Scryfall.
  'Namora, the Sea Queen': {
    abilities: [
      powerUp(
        '{5}{U}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'createToken', token: 'merfolk-token', count: 2 },
      ),
    ],
  },
  // Flying comes from Scryfall. Two triggers: a counter on each flyer that connected, then one draw.
  'Vulture, Feathered Fiend': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'creatureYouControlDealsCombatDamage',
          toPlayer: true,
          filter: { hasKeyword: 'flying' },
        },
        targets: [],
        effects: [{ kind: 'counters', to: 'subject', amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: {
          on: 'creaturesYouControlDealCombatDamageToPlayer',
          filter: { hasKeyword: 'flying' },
        },
        batch: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Whoosh!': {
    ...spell([{ what: 'permanent', filter: { nonland: true } }], { kind: 'bounce', what: t0 }),
    kicker: {
      cost: mana('{1}{U}'),
      spell: {
        targets: [{ what: 'permanent', filter: { nonland: true } }],
        effects: [{ kind: 'bounce', what: t0 }, draw(1)],
      },
    },
  },
  "Falcon's Wing Harness": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['flying', 'wardOne'] },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}') },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
    ],
  },
  'Dismissive Denial': {
    ...spell([{ what: 'spell' }], { kind: 'counter', what: t0 }),
    abilities: [basicLandcycling('{2}')],
  },
};
