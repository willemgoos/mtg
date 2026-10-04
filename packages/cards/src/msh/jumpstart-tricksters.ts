import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, t0, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Tricksters (U, copies and Illusions).

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

export const MSH_JUMPSTART_TRICKSTERS: Record<string, Behavior> = {
  'Living Lies of Loki': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'permanentsYouControl', filter: { subtypes: ['Illusion'] }, other: true },
          toughness: 0,
        },
      },
      { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [draw(1)] },
    ],
  },
  'Impossible Man': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}') },
        targets: [{ what: 'permanent', filter: { other: true } }],
        effects: [{ kind: 'becomeCopy', of: t0, keepName: true }],
      },
    ],
  },
  'Loki, Lord of Misrule': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: mana('{U}'), tapSelf: true },
        targets: [yourCreature],
        effects: [
          {
            kind: 'becomeCopy',
            of: t0,
            what: { each: 'creature', controller: 'you' },
            each: true,
            nonlegendary: true,
          },
        ],
      },
    ],
  },
  'Multiversal Recruitment': {
    flashback: mana('{5}{U}{U}'),
    spell: {
      targets: [yourCreature],
      effects: [{ kind: 'tokenCopy', of: t0, notLegendary: true }],
    },
  },
  // Chapter III names a creature you control (targeted) rather than any card name.
  'The Clone Saga': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'surveil', amount: 3 }),
      chapter([2], [], {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: {
          kind: 'triggered',
          trigger: { on: 'castSpell', filter: 'creature' },
          targets: [],
          effects: [{ kind: 'copySpell', what: 'subject', nonlegendary: true }],
        },
      }),
      chapter([3], [{ ...yourCreature, optional: true }], {
        kind: 'emblem',
        until: 'endOfTurn',
        namedLike: t0,
        ability: {
          kind: 'triggered',
          trigger: { on: 'creatureYouControlDealsCombatDamage', toPlayer: true },
          targets: [],
          effects: [draw(1)],
        },
      }),
    ],
  },
};
