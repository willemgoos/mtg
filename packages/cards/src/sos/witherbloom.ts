import type {
  AbilityDef,
  CardDefinition,
  CardFilter,
  ConditionDef,
  EffectDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourEndStep,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
  yourCreaturesOf,
} from '../blb/helpers.ts';
import { tapFor } from '../fin/helpers.ts';

/**
 * Secrets of Strixhaven (14a): the Witherbloom Pest Control deck (B/G): Pests,
 * life gain and infusion (docs/strixhaven-14a-decks.md). The five cards shared
 * with the Silverquill deck are in shared-14a.ts.
 */

const PEST = 'sos-pest-token';
const pest: EffectDef = { kind: 'createToken', token: PEST, count: 1 };
const gainedLife: ConditionDef = { kind: 'lifeThisTurn', who: 'you', gained: true };
const gainOne = when({ on: 'attacks' }, [], gain(1));

/** "1/1 black and green Pest creature token with 'Whenever this token attacks, you gain 1 life.'" */
export const SOS_WITHERBLOOM_TOKENS: CardDefinition[] = [
  {
    id: PEST,
    name: 'Pest',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Pest'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [gainOne],
    isToken: true,
  },
];

const permanentMv2: TargetSpec = { what: 'permanent', filter: { nonland: true, maxManaValue: 2 } };
const lumaretSubtypes = yourCreaturesOf('Pest', 'Bat', 'Insect', 'Snake', 'Spider');
const creatureOrLand: CardFilter = { types: ['Creature', 'Land'] };
const yourTeam = { each: 'creature', controller: 'you' } as const;

export const SOS_WITHERBLOOM: Record<string, Behavior> = {
  // ---------------------------------------------------------------- creatures
  'Bogwater Lumaret': { abilities: [when({ on: 'selfOrCreatureEtb', filter: {} }, [], gain(1))] },
  'Essenceknit Scholar': {
    abilities: [
      onEnter(pest),
      atYourEndStep(
        { kind: 'amountAtLeast', amount: { count: 'creaturesYouLostThisTurn' }, min: 1 },
        [],
        draw(1),
      ),
    ],
  },
  'Old-Growth Educator': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: gainedLife,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 2 }],
      },
    ],
  },
  'Pest Mascot': {
    abilities: [when({ on: 'youGainLife' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  },
  "Teacher's Pest": {
    abilities: [
      gainOne,
      {
        kind: 'activated',
        cost: { mana: mana('{B}{G}') },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true }],
        fromGraveyard: true,
        label: '{B}{G}: Return this card from your graveyard to the battlefield tapped',
      },
    ],
  },
  'Lluwen, Exchange Student': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'activated',
        cost: { exileFromGraveyard: { types: ['Creature'] } },
        targets: [],
        sorcerySpeed: true,
        condition: { kind: 'notPrepared' },
        effects: [{ kind: 'prepare', what: 'self' }],
        label: 'Exile a creature card from your graveyard: Lluwen becomes prepared',
      },
    ],
  },
  'Pestbrood Sloth': {
    abilities: [when({ on: 'dies' }, [], { kind: 'createToken', token: PEST, count: 2 })],
  },
  "Shopkeeper's Bane": {
    abilities: [when({ on: 'attacks' }, [], gain(2))],
  },
  'Mindful Biomancer': {
    abilities: [
      onEnter(gain(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        targets: [],
        oncePerTurn: true,
        effects: [pump('self', 2, 2)],
        label: '{2}{G}: +2/+2 until end of turn (once each turn)',
      },
    ],
  },
  'Thornfist Striker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          condition: gainedLife,
          power: 1,
          toughness: 0,
          keywords: ['trample'],
        },
      },
    ],
  },
  'Ulna Alley Shopkeep': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'while', condition: gainedLife, power: 2, toughness: 0 },
      },
    ],
  },
  'Leech Collector': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        condition: { kind: 'firstLifeGainThisTurn', anyTurn: true },
        targets: [],
        effects: [{ kind: 'prepare', what: 'self' }],
      },
    ],
  },
  "Poisoner's Apprentice": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: gainedLife,
        targets: [theirCreature],
        effects: [pump(t0, -4, -4)],
      },
    ],
  },
  'Blech, Loafing Pest': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'counters', to: lumaretSubtypes, amount: 1 }),
    ],
  },
  "Moseo, Vein's New Dean": {
    abilities: [
      onEnter(pest),
      atYourEndStep(
        gainedLife,
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 'lifeGainedThisTurn' },
            optional: true,
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
    ],
  },
  // ------------------------------------------------------------------- spells
  'Grapple with Death': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
      effects: [{ kind: 'destroy', what: t0 }, gain(1)],
    },
  },
  'Witherbloom Charm': {
    modes: [
      {
        label: 'You may sacrifice a permanent. If you do, draw two cards',
        targets: [],
        effects: [
          {
            kind: 'chooseYourPermanent',
            then: [{ kind: 'sacrifice', what: 'chosen' }, draw(2)],
          },
        ],
      },
      { label: 'You gain 5 life', targets: [], effects: [gain(5)] },
      {
        label: 'Destroy target nonland permanent with mana value 2 or less',
        targets: [permanentMv2],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  Efflorescence: {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'counters', to: t0, amount: 2 },
        {
          kind: 'if',
          condition: gainedLife,
          then: [pump(t0, 0, 0, ['trample', 'indestructible'])],
        },
      ],
    },
  },
  'Send in the Pest': {
    spell: {
      targets: [],
      effects: [{ kind: 'discard', count: 1, who: 'eachOpponent' }, pest],
    },
  },
  'Cost of Brilliance': {
    spell: {
      targets: [{ what: 'player' }, { ...creature, optional: true }],
      effects: [
        { kind: 'draw', who: t0, amount: 2 },
        { kind: 'loseLife', who: t0, amount: 2 },
        { kind: 'counters', to: t1, amount: 1 },
      ],
    },
  },
  'Root Manipulation': {
    spell: {
      targets: [],
      effects: [
        pump(yourTeam, 2, 2, ['menace']),
        { kind: 'grantAbility', to: yourTeam, ability: gainOne },
      ],
    },
  },
  'Follow the Lumarets': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: gainedLife,
          then: [
            { kind: 'lookAndTake', count: 4, filter: creatureOrLand, followUp: creatureOrLand },
          ],
          else: [{ kind: 'lookAndTake', count: 4, filter: creatureOrLand }],
        },
      ],
    },
  },
  "Oracle's Restoration": {
    spell: {
      targets: [yourCreature],
      effects: [pump(t0, 1, 1), draw(1), gain(1)],
    },
  },
  "Lumaret's Favor": {
    spell: { targets: [creature], effects: [pump(t0, 2, 4)] },
    abilities: [
      {
        ...when({ on: 'castSelf' }, [], { kind: 'copySpell', what: 'subject', retarget: true }),
        condition: gainedLife,
      } as AbilityDef,
    ],
  },
  // -------------------------------------------------------------------- lands
  "Titan's Grave": {
    entersTapped: true,
    abilities: [
      ...tapFor('B', 'G'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
        label: '{2}{B}{G}, {T}: Surveil 1',
      },
    ],
  },
  'Deathcap Glade': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 2 },
    },
    abilities: tapFor('B', 'G'),
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const SOS_WITHERBLOOM_BACKS: Record<string, Behavior> = {
  'Pest Friend (Lluwen, Exchange Student)': { spell: { targets: [], effects: [pest] } },
  'Bloodletting (Leech Collector)': {
    spell: { targets: [], effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 2 }] },
  },
};
