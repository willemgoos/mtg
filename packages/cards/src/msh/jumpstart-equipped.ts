import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, mana, onEnter, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Equipped (W, Equipment and Soldiers).

const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

/** "Equip {cost}". */
const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

/** Create a Sturdy Shield; the token is then 'chosen' (for "attach it to ..."). */
const sturdyShield: EffectDef = { kind: 'createToken', token: 'sturdy-shield-token', count: 1 };

export const MSH_JUMPSTART_EQUIPPED_TOKENS: CardDefinition[] = [
  {
    // "Equipped creature gets +1/+2", equip {2} (U.S.Agent, Origin of Captain America).
    id: 'sturdy-shield-token',
    name: 'Sturdy Shield',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Equipment'],
    keywords: [],
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
      equip('{2}'),
    ],
    isToken: true,
  },
];

export const MSH_JUMPSTART_EQUIPPED: Record<string, Behavior> = {
  // Vigilance comes from Scryfall.
  'Bucky Barnes, Eager Ally': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [
          {
            kind: 'lookAndTake',
            count: 4,
            filter: {
              anyOf: [{ subtype: 'Equipment' }, { subtype: 'Hero' }, { subtype: 'Soldier' }],
            },
          },
        ],
      },
    ],
  },
  'The Howling Commandos': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{5}') },
        targets: [],
        effects: [
          { kind: 'pump', to: { each: 'creature', controller: 'you' }, power: 1, toughness: 1 },
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { subtype: 'Soldier' } },
            power: 0,
            toughness: 0,
            keywords: ['vigilance'],
          },
        ],
      },
    ],
  },
  'U.S.Agent, John Walker': {
    abilities: [onEnter(sturdyShield, { kind: 'attach', what: 'chosen', to: 'self' })],
  },
  'Captain America, Liberator': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'searchLibrary',
            filter: { subtype: 'Equipment', maxManaValue: 3 },
            to: 'battlefield',
          },
        ],
      }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'soldier-token',
            count: {
              count: 'permanentsYouControl',
              filter: { subtype: 'Equipment', attachedToSource: true },
            },
          },
        ],
      },
    ],
  },
  // The attack trigger is the Equipment's ("whenever equipped creature attacks"), not granted to the creature.
  'Infinity Formula': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
      {
        kind: 'triggered',
        trigger: { on: 'equippedAttacks' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
      },
      equip('{2}'),
    ],
  },
  'Origin of Captain America': {
    saga: 3,
    abilities: [
      chapter(
        [1],
        [yourCreature],
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['firstStrike', 'vigilance'] },
      ),
      chapter([2], [], sturdyShield),
      chapter(
        [3],
        [{ ...creature, optional: true }],
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
      ),
    ],
  },
};
