import type { AbilityDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, onEnter, powerUp, spell, t0, yourCreature } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) cards for Stark Tech (U/R artifacts) and Sky
 * Patrol (W/U fliers that tap blockers).
 */

const artifact = { types: ['Artifact' as const] };

const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

export const TECH_SKIES: Record<string, Behavior> = {
  // ------------------------------------------------------------- Stark Tech (U/R)
  'Iron Man, Master of Machines': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'permanentsYouControl', filter: artifact, other: true },
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: {
          kind: 'controlsPermanents',
          filter: { ...artifact, enteredThisTurn: true },
          min: 1,
        },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Machinesmith Automaton': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: artifact },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'A.I.M. Synthoids': { abilities: [onEnter({ kind: 'surveil', amount: 2 })] },
  'S.H.I.E.L.D. Deployment Drone': {
    abilities: [onEnter({ kind: 'createToken', token: 'soldier-token', count: 1 })],
  },
  // "Then you may put a land card from your hand onto the battlefield tapped" is not modelled.
  'H.E.R.B.I.E. Scout Unit': { abilities: [onEnter(draw(1))] },
  'Ultron Drone': {
    abilities: [
      powerUp(
        '{6}',
        { kind: 'counters', to: 'self', amount: 2 },
        { kind: 'createToken', token: 'robot-villain-token', count: 1 },
      ),
    ],
  },
  'Super Suit': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [
          { kind: 'attach', to: t0 },
          { kind: 'untap', what: t0 },
        ],
      },
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
      equip('{2}'),
    ],
  },
  'Vibranium Energy Daggers': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 2 } },
      equip('{3}'),
    ],
  },

  // ------------------------------------------------------------- Sky Patrol (W/U)
  // "Costs {1} less if it targets a creature with power 3 or less": two abilities.
  'Raft Security Officer': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { maxPower: 3 } }],
        effects: [{ kind: 'tap', what: t0 }],
        label: '{1}, {T}: Tap a creature with power 3 or less',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'tap', what: t0 }],
        label: '{2}, {T}: Tap target creature',
      },
    ],
  },
  'Falcon, Winged Wonder': {
    abilities: [onEnter({ kind: 'createToken', token: 'redwing-token', count: 1 })],
  },
  'Pym Particles': spell(
    [creature],
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['vigilance'], cantBeBlocked: true },
    draw(1),
  ),
};
