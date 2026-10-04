import type { Behavior } from '../build.ts';
import { connive, mana, secondDraw, t0, t1, theirCreature, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Atlantis (U Merfolk).

export const MSH_JUMPSTART_ATLANTIS: Record<string, Behavior> = {
  'Mist-Cloaked Herald': {
    abilities: [{ kind: 'static', effect: { kind: 'cantBeBlocked' } }],
  },
  'Daughter of the Deep': {
    abilities: [
      secondDraw([], { kind: 'createToken', token: 'merfolk-token', count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { subtype: 'Merfolk' } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Atlantean Skirmisher': {
    abilities: [{ kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: [connive] }],
  },
  // Also in Blink.
  'Shipwreck Patrol': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [
          { kind: 'tap', what: t0 },
          { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
        ],
      },
    ],
  },
  // Flying comes from Scryfall.
  'Namor, Scourge of the Seas': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Merfolk', minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [yourCreature],
        effects: [{ kind: 'connive', what: t0 }],
      },
    ],
  },
  // Also in Conniving.
  'Unstable Experiment': {
    spell: {
      targets: [{ what: 'player' }, { ...yourCreature, optional: true }],
      effects: [
        { kind: 'draw', who: t0, amount: 1 },
        { kind: 'connive', what: t1 },
      ],
    },
  },
};
