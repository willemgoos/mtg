import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Marvelous packet (docs/marvel-jumpstart.md): the cards it was
// missing. Fall to Earth, Marvel Boy, Noh-Varr and Ms. Marvel, Elastic Ally are shared with
// other packets.

/** "Basic landcycling {cost}". */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

/** "Exile up to one target creature. That creature's controller gains life equal to its power." */
const shootingStar: Pick<Extract<AbilityDef, { kind: 'triggered' }>, 'targets' | 'effects'> = {
  targets: [{ ...creature, optional: true }],
  effects: [
    { kind: 'gainLife', who: { controllerOf: 0 }, amount: { powerOf: t0 } },
    { kind: 'exile', what: t0 },
  ],
};

/** "You may pay {1}{W}. When you do, exile target creature you control, then return that card." */
const entangle = (trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger']): AbilityDef => ({
  kind: 'triggered',
  trigger,
  optional: true,
  cost: mana('{1}{W}'),
  targets: [yourCreature],
  effects: [{ kind: 'blink', what: t0 }],
});

const counterOnSelf: EffectDef = { kind: 'counters', to: 'self', amount: 1 };
const otherOfYours: TargetSpec = { ...yourCreature, filter: { other: true }, optional: true };

export const MSH_JUMPSTART_MARVELOUS: Record<string, Behavior> = {
  'Marvel Boy, Noh-Varr': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        targets: [],
        effects: [counterOnSelf],
      },
      {
        kind: 'triggered',
        trigger: { on: 'youActivatePowerUp' },
        targets: [],
        effects: [counterOnSelf],
      },
    ],
  },
  // Reach comes from Scryfall.
  'Ms. Marvel, Elastic Ally': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 2, toughness: 0 }],
      },
      {
        kind: 'triggered',
        trigger: {
          on: 'creatureYouControlDealsCombatDamage',
          toPlayer: true,
          filter: { powerAboveBase: true },
        },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // Flying comes from Scryfall.
  'Photon, Lady of Light': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [otherOfYours],
        effects: [{ kind: 'blink', what: t0 }],
      },
    ],
  },
  'Captain Marvel, Shooting Star': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'etb' }, ...shootingStar },
      { kind: 'triggered', trigger: { on: 'attacks' }, ...shootingStar },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureExiled' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: { event: 'amount' } }],
      },
    ],
  },
  // Flash comes from Scryfall.
  'Quantum Entanglement': {
    abilities: [entangle({ on: 'etb' }), entangle({ on: 'beginningOfEndStep', whose: 'yours' })],
  },
  'Fall to Earth': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'gainLife', who: 'eachPlayer', amount: 3 },
      ],
    },
    abilities: [basicLandcycling('{2}')],
  },
};
