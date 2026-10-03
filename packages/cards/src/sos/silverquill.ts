import type { AbilityDef, CardDefinition, EffectDef } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  creature,
  draw,
  gain,
  mode,
  onEnter,
  spell,
  t0,
  tapFor,
  yourCreature,
} from '../fin/helpers.ts';
import { repartee } from './helpers.ts';

/**
 * Secrets of Strixhaven (14a): the Silverquill Debate Club (W/B) cards. Printed
 * characteristics come from Scryfall; only rules text lives here. Shared with
 * the Witherbloom deck: see shared-14a.ts.
 */

export const SOS_INKLING = 'sos-inkling-token';

/** The 1/1 white and black Inkling creature token with flying. */
export const SILVERQUILL_SOS_TOKENS: CardDefinition[] = [
  {
    id: SOS_INKLING,
    name: 'Inkling',
    manaCost: { generic: 0, colored: {} },
    colors: ['W', 'B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Inkling'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];

const inkling: EffectDef = { kind: 'createToken', token: SOS_INKLING, count: 1 };
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const pumpSelf = (
  power: number,
  toughness: number,
  extra: Partial<Extract<EffectDef, { kind: 'pump' }>> = {},
): EffectDef => ({ kind: 'pump', to: 'self', power, toughness, ...extra });
const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];
const reparteeSelf = (...effects: EffectDef[]): AbilityDef => repartee([], ...effects);

export const SILVERQUILL_SOS: Record<string, Behavior> = {
  // ------------------------------------------------------------ prepare cards
  'Elite Interceptor': { entersPrepared: true },
  'Honorbound Page': { entersPrepared: true },
  'Quill-Blade Laureate': { entersPrepared: true },

  // ---------------------------------------------------------------- creatures
  'Eager Glyphmage': { abilities: [onEnter(inkling)] },
  'Owlin Historian': {
    abilities: [
      onEnter(surveil(1)),
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        targets: [],
        effects: [pumpSelf(1, 1)],
        batch: true,
      },
    ],
  },
  'Rehearsed Debater': { abilities: [reparteeSelf(pumpSelf(1, 1))] },
  'Inkshape Demonstrator': {
    abilities: [reparteeSelf(pumpSelf(1, 0, { keywords: ['lifelink'] }))],
  },
  'Imperious Inkmage': { abilities: [onEnter(surveil(2))] },
  'Inkling Mascot': {
    abilities: [reparteeSelf(pumpSelf(0, 0, { keywords: ['flying'] }), surveil(1))],
  },
  'Scolding Administrator': {
    abilities: [
      reparteeSelf({ kind: 'counters', to: 'self', amount: 1 }),
      // "If it had counters on it": with none, zero counters are moved.
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [{ ...creature, optional: true }],
        effects: [{ kind: 'counters', to: t0, amount: { countersOn: 'self' } }],
      },
    ],
  },
  'Snooping Page': {
    abilities: [
      reparteeSelf(pumpSelf(0, 0, { cantBeBlocked: true })),
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Melancholic Poet': { abilities: [reparteeSelf(...drain(1))] },
  "Conciliator's Duelist": {
    abilities: [
      onEnter(draw(1), { kind: 'loseLife', who: 'eachPlayer', amount: 1 }),
      repartee([{ ...creature, optional: true }], { kind: 'exileUntilEndStep', what: t0 }),
    ],
  },
  'Stirring Hopesinger': {
    abilities: [
      reparteeSelf({
        kind: 'counters',
        to: { each: 'creature', controller: 'you' },
        amount: 1,
      }),
    ],
  },

  // ------------------------------------------------------------------- spells
  'Silverquill Charm': {
    modes: [
      mode('Put two +1/+1 counters on target creature', [creature], {
        kind: 'counters',
        to: t0,
        amount: 2,
      }),
      mode(
        'Exile target creature with power 2 or less',
        [{ what: 'creature', filter: { maxPower: 2 } }],
        { kind: 'exile', what: t0 },
      ),
      mode('Each opponent loses 3 life and you gain 3 life', [], ...drain(3)),
    ],
  },
  'Harsh Annotation': spell(
    [creature],
    { kind: 'destroy', what: t0 },
    {
      kind: 'createToken',
      token: SOS_INKLING,
      count: 1,
      forControllerOf: 0,
    },
  ),
  'Stand Up for Yourself': spell([{ what: 'creature', filter: { minPower: 3 } }], {
    kind: 'destroy',
    what: t0,
  }),
  Interjection: spell([creature], {
    kind: 'pump',
    to: t0,
    power: 2,
    toughness: 2,
    keywords: ['firstStrike'],
  }),
  // Stun counters: on your turn only.
  'Rapier Wit': spell(
    [creature],
    { kind: 'tap', what: t0 },
    {
      kind: 'if',
      condition: { kind: 'yourTurn' },
      then: [{ kind: 'namedCounters', name: 'stun', amount: 1, to: t0 }],
    },
    draw(1),
  ),
  "Killian's Confidence": {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 1, toughness: 1 }, draw(1)],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creaturesYouControlDealCombatDamageToPlayer' },
        fromGraveyard: true,
        cost: mana('{W/B}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
        batch: true,
      },
    ],
  },
  'Render Speechless': spell(
    [
      { what: 'player', controller: 'opponent' },
      { ...creature, controller: 'you', optional: true },
    ],
    { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' },
    { kind: 'counters', to: { target: 1 }, amount: 2 },
  ),
  'Graduation Day': {
    abilities: [repartee([yourCreature], { kind: 'counters', to: t0, amount: 1 })],
  },
  "Ajani's Response": {
    costReductionIfTarget: { filter: { tapped: true, types: ['Creature'] }, amount: 3 },
    spell: { targets: [creature], effects: [{ kind: 'destroy', what: t0 }] },
  },

  // -------------------------------------------------------------------- lands
  'Forum of Amity': {
    entersTapped: true,
    abilities: [
      ...tapFor('W', 'B'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}{B}'), tapSelf: true },
        targets: [],
        effects: [surveil(1)],
      },
    ],
  },
  // Tapped unless you control two or more other lands.
  'Shattered Sanctum': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 2 },
    },
    abilities: tapFor('W', 'B'),
  },
};

const rejoinder: Behavior = {
  spell: {
    targets: [creature],
    effects: [
      {
        kind: 'choose',
        options: [
          { label: 'Tap it', effects: [{ kind: 'tap', what: t0 }] },
          { label: 'Untap it', effects: [{ kind: 'untap', what: t0 }] },
          { label: 'Do nothing', effects: [] },
        ],
      },
      draw(1),
    ],
  },
};

/** Prepare spell faces, keyed `Spell (Creature)`. */
export const SILVERQUILL_SOS_BACKS: Record<string, Behavior> = {
  'Rejoinder (Elite Interceptor)': rejoinder,
  "Forum's Favor (Honorbound Page)": spell([creature], {
    kind: 'pump',
    to: t0,
    power: 1,
    toughness: 0,
    keywords: ['flying'],
  }),
  'Twofold Intent (Quill-Blade Laureate)': spell([creature], {
    kind: 'pump',
    to: t0,
    power: 1,
    toughness: 0,
    keywords: ['doubleStrike'],
  }),
};
