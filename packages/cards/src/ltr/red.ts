import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { draw, pump, t0, theirCreature, when, atYourCombat } from '../blb/helpers.ts';
import { equip, spell } from '../fin/helpers.ts';
import { HOB_HUMAN_SOLDIER } from '../hob/tokens.ts';
import { amassOrcs, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): red cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_RED_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const creature: TargetSpec = { what: 'creature' };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const humanSoldier: EffectDef = { kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 1 };
const yourCreatures = { each: 'creature', controller: 'you' } as const;
const goblinOrOrc = { subtypes: ['Goblin', 'Orc'] };

/** A Saga chapter: "I, II — ...". */
const chapter = (chapters: number[], targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'chapter', chapters }, targets, ...effects);

export const LTR_RED: Record<string, Behavior> = {
  // "Assault on Osgiliath" {X}{R}{R}{R}. "Amass Orcs X, then Goblins and Orcs you control gain double strike and haste until end of
  // turn."
  'Assault on Osgiliath': spell(
    [],
    amassOrcs({ x: true }),
    pump({ each: 'creature', controller: 'you', filter: goblinOrOrc }, 0, 0, [
      'doubleStrike',
      'haste',
    ]),
  ),

  // "Whenever this creature becomes blocked, it deals 1 damage to each creature blocking it."
  'Battle-Scarred Goblin': {
    abilities: [when({ on: 'becomesBlocked' }, [], custom('ltrDamageBlockers', { amount: 1 }))],
  },

  // "I — Amass Orcs 1. II — Amass Orcs 2. III — Creatures you control get +1/+0 and gain menace until end of turn."
  'Book of Mazarbul': {
    saga: 3,
    abilities: [
      chapter([1], [], amassOrcs(1)),
      chapter([2], [], amassOrcs(2)),
      chapter([3], [], pump(yourCreatures, 1, 0, ['menace'])),
    ],
  },

  // "Whenever you cast an instant or sorcery spell, this creature deals 1 damage to each opponent."
  'Erebor Flamesmith': {
    abilities: [
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },

  // "Whenever Erkenbrand or another Human you control enters, creatures you control get +1/+0 until end of turn."
  'Erkenbrand, Lord of Westfold': {
    abilities: [
      when(
        { on: 'selfOrCreatureEtb', filter: { subtype: 'Human' } },
        [],
        pump(yourCreatures, 1, 0),
      ),
    ],
  },

  // "Damage can't be prevented this turn. Fear, Fire, Foes! deals X damage to target creature and 1 damage to each other creature
  // with the same controller."
  'Fear, Fire, Foes!': spell(
    [creature],
    custom('ltrDamageUnpreventable'),
    { kind: 'damage', amount: { x: true }, to: t0 },
    custom('ltrDamageSameController', { amount: 1 }),
  ),

  // "Amass Orcs 2. When you do, Foray of Orcs deals X damage to target creature an opponent controls, where X is the amassed
  // Army's power."
  'Foray of Orcs': {
    spell: {
      targets: [],
      effects: [amassOrcs(2), { kind: 'reflexiveTrigger', ability: 0, subject: 'chosen' }],
    },
    abilities: [
      when({ on: 'reflexive' }, [theirCreature], {
        kind: 'damage',
        amount: { powerOf: 'subject' },
        to: t0,
      }),
    ],
  },

  // "Equipped creature gets +3/+0. As long as equipped creature is legendary, it has menace." Equip {2}.
  "Gimli's Axe": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 3, toughness: 0, legendaryKeywords: ['menace'] },
      },
      equip('{2}'),
    ],
  },

  // "Target creature gets +3/+2 until end of turn. If it's legendary, it also gains trample until end of turn."
  "Gimli's Fury": spell([creature], pump(t0, 3, 2), {
    kind: 'if',
    condition: { kind: 'targetMatches', target: 0, filter: { supertypes: ['Legendary'] } },
    then: [pump(t0, 0, 0, ['trample'])],
  }),

  // "Trample". "Whenever a creature an opponent controls dies, Gimli deals 1 damage to that creature's controller."
  // (That controller is the opponent: there are only two players.)
  'Gimli, Counter of Kills': {
    abilities: [
      when({ on: 'otherCreatureDies', controller: 'opponent' }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },

  // "{1}{R}: This creature gets +1/+0 until end of turn."
  // "When this creature dies, it deals damage equal to its power to target creature an opponent controls."
  'Goblin Fireleaper': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        effects: [pump('self', 1, 0)],
      },
      when({ on: 'dies' }, [theirCreature], {
        kind: 'damage',
        amount: { powerOf: 'self' },
        to: t0,
      }),
    ],
  },

  // "When Grishnákh enters, amass Orcs 2. When you do, until end of turn, gain control of target nonlegendary creature an opponent
  // controls with power less than or equal to the amassed Army's power. Untap that creature. It gains haste until end of turn."
  'Grishnákh, Brash Instigator': {
    abilities: [
      when({ on: 'etb' }, [], amassOrcs(2), {
        kind: 'reflexiveTrigger',
        ability: 1,
        subject: 'chosen',
      }),
      when(
        { on: 'reflexive' },
        [
          {
            what: 'creature',
            controller: 'opponent',
            filter: { nonlegendary: true, maxPowerOfSubject: true },
          },
        ],
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        pump(t0, 0, 0, ['haste']),
      ),
    ],
  },

  // "Reach". "At the beginning of combat on your turn, another target creature you control gets +1/+0 until end of turn."
  'Haradrim Spearmaster': {
    abilities: [
      atYourCombat(
        [{ what: 'creature', controller: 'you', filter: { other: true } }],
        pump(t0, 1, 0),
      ),
    ],
  },

  // "Trample". "This creature can't block unless you control a Goblin or Orc."
  'Olog-hai Crusher': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'cantBlockUnless',
          condition: { kind: 'controlsPermanents', filter: goblinOrOrc, min: 1 },
        },
      },
    ],
  },

  // "As an additional cost to cast this spell, discard a card. Draw two cards and create a 1/1 white Human Soldier creature token."
  "Quarrel's End": {
    discardToCast: true,
    ...spell([], draw(2), humanSoldier),
  },

  // "Create two 1/1 white Human Soldier creature tokens. Humans you control gain haste until end of turn."
  'Rally at the Hornburg': spell(
    [],
    { kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 2 },
    pump({ each: 'creature', controller: 'you', filter: { subtype: 'Human' } }, 0, 0, ['haste']),
  ),

  // "When this creature enters, the Ring tempts you."
  'Relentless Rohirrim': {
    abilities: [when({ on: 'etb' }, [], ringTempts)],
  },

  // "Affinity for Humans". "Trample, haste". "At the beginning of your end step, if this creature attacked this turn, return it to
  // its owner's hand. If you do, create a number of 1/1 white Human Soldier creature tokens equal to its toughness."
  'Riders of the Mark': {
    costReduction: { count: 'creaturesYouControl', subtype: 'Human' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'sourceAttackedThisTurn' },
        targets: [],
        effects: [custom('ltrRidersReturn', { token: HOB_HUMAN_SOLDIER })],
      },
    ],
  },

  // "Creatures you control have haste. Legendary creatures you control get +1/+0."
  'Rising of the Day': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { supertypes: ['Legendary'] },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },

  // "Menace". "When this creature dies, the Ring tempts you."
  'Rohirrim Lancer': {
    abilities: [when({ on: 'dies' }, [], ringTempts)],
  },

  // "Target creature gets +1/+0 and gains first strike until end of turn. If it's a Goblin or Orc, it also gains haste until end of
  // turn."
  'Rush the Room': spell([creature], pump(t0, 1, 0, ['firstStrike']), {
    kind: 'if',
    condition: { kind: 'targetMatches', target: 0, filter: goblinOrOrc },
    then: [pump(t0, 0, 0, ['haste'])],
  }),

  // "Smite the Deathless deals 3 damage to target creature. That creature loses indestructible until end of turn. If that creature
  // would die this turn, exile it instead."
  'Smite the Deathless': spell(
    [creature],
    { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
    { kind: 'damage', amount: 3, to: t0 },
    custom('ltrLoseIndestructible'),
  ),

  // "Create a Treasure token. Amass Orcs 2."
  'Swarming of Moria': spell(
    [],
    { kind: 'createToken', token: 'treasure-token', count: 1 },
    amassOrcs(2),
  ),

  // "Haste". "Whenever Éomer attacks, if you control a creature with the greatest power among creatures on the battlefield, create a
  // 1/1 white Human Soldier creature token."
  'Éomer of the Riddermark': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'custom', handler: 'ltrControlsGreatestPower' },
        targets: [],
        effects: [humanSoldier],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_RED_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_RED_TOKENS: CardDefinition[] = [];
