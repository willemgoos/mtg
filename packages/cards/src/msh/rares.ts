import type { AbilityDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew, draw, mana, onEnter, t0, yourCreature } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) rares not in our decks. Printed characteristics
 * come from Scryfall; only rules text lives here.
 */

const hero = { subtype: 'Hero' };

/** "{T}: Add {C}. {T}: Add {a} or {b}. Activate only if this land entered this turn or if you control a basic land." */
const fastLand = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [
    { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
    ...[a, b].map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true },
      produces,
      condition: {
        kind: 'any',
        of: [{ kind: 'sourceEnteredThisTurn' }, { kind: 'controlsBasicLand' }],
      },
    })),
  ],
});

export const MSH_RARES: Record<string, Behavior> = {
  'Dark Fortress': fastLand('B', 'R'),
  'Gathering Place': fastLand('G', 'W'),
  'Gleaming Bastion': fastLand('W', 'U'),
  'Hidden Lair': fastLand('U', 'B'),
  'Training Compound': fastLand('R', 'G'),
  'Castle Doom': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        onlyFor: 'Artifact',
      })),
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: {
          mana: mana('{3}'),
          tapSelf: true,
          sacrificePermanent: { types: ['Artifact'] },
        },
        targets: [],
        effects: [{ kind: 'createToken', token: 'doombot-token', count: 1 }],
      },
    ],
  },
  'Agent Phil Coulson': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { ...hero, other: true } },
            amount: 1,
          },
        ],
      },
    ],
  },
  'Captain America, Wings of Freedom': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { ...hero, other: true } },
            power: { toughnessOf: 'self' },
            toughness: { toughnessOf: 'self' },
          },
        ],
      },
    ],
  },
  'Mole Man, Moloid Master': {
    abilities: [
      { kind: 'static', effect: { kind: 'playLandsFromGraveyard' } },
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'moloid-token', count: 1 }],
      },
    ],
  },
  // "Base power and toughness become 6/6": +4/+4 on the printed 2/2.
  'Moon Girl and Devil Dinosaur': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 4, toughness: 4, keywords: ['trample'] }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Artifact'] } },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Super-Skrull': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'createToken', token: 'wall-token', count: 1 }],
        label: '{2}{W}: Create a 0/4 Wall',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 4, toughness: 4 }],
        label: '{3}{G}: +4/+4',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}') },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
        label: '{4}{R}: 4 damage to a creature',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}{U}') },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'draw', who: t0, amount: 4 }],
        label: '{5}{U}: A player draws four',
      },
    ],
  },
  'The Mighty Thor, Jane Foster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [
          {
            what: 'permanent',
            filter: {
              nontoken: true,
              anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }],
            },
            optional: true,
          },
        ],
        effects: [{ kind: 'blink', what: t0, tapped: true }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { subtype: 'Equipment' } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'The Unbeatable Squirrel Girl': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'squirrel-token', count: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'squirrel-token', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}{G}{G}') },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'squirrel-token',
            count: { count: 'creaturesYouControl', subtype: 'Squirrel' },
          },
        ],
      },
    ],
  },
  'S.H.I.E.L.D. Flying Car': {
    abilities: [
      crew(1),
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ ...yourCreature, optional: true }],
        effects: [{ kind: 'exileUntilEndStep', what: t0 }],
      },
    ],
  },
  // "Its controller may search for a basic land" is not modelled.
  'Avengers Disassembled': {
    modes: [
      {
        targets: [],
        effects: [{ kind: 'damage', amount: 3, to: { each: 'creature' } }],
        label: '3 damage to each creature',
      },
      {
        targets: [{ what: 'permanent', filter: { types: ['Land'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
        label: 'Destroy target land',
      },
      {
        targets: [{ what: 'permanent', filter: { types: ['Land'] } }],
        effects: [
          { kind: 'damage', amount: 3, to: { each: 'creature' } },
          { kind: 'destroy', what: t0 },
        ],
        label: 'Both',
      },
    ],
  },
  'The Sentry, Golden Guardian': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'the-void-token', count: 1, forOpponent: true }),
    ],
  },
};
