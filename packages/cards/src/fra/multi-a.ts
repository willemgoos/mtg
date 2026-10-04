import type {
  AbilityDef,
  Amount,
  CardDefinition,
  ConditionDef,
  EffectDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  prowess,
  pump,
  t0,
  t1,
  when,
  yourCreature,
  yours,
} from '../blb/helpers.ts';
import { combos } from '../msc/helpers.ts';
import { FRA_CADET, FRA_HEARTWOOD } from './tokens.ts';

/**
 * Reality Fracture (17a): gold cards of W/U, U/B, B/R, R/G and G/W. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_MULTI_A_BACKS. See docs/reality-fracture-plan.md.
 */

export const FRA_LOTUS = 'fra-lotus-token';

const opponentPlayer: TargetSpec = { what: 'player', controller: 'opponent' };
const heartwood = (count = 1, tapped = false): EffectDef => ({
  kind: 'createToken',
  token: FRA_HEARTWOOD,
  count,
  ...(tapped ? { tapped: true } : {}),
});
const cadet: EffectDef = { kind: 'createToken', token: FRA_CADET, count: 1 };
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const artifactsYouControl: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Artifact'] },
};

/** "At the beginning of your upkeep, if this creature isn't prepared, it becomes prepared." */
const preparesAtUpkeep: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
  condition: { kind: 'notPrepared' },
  targets: [],
  effects: [{ kind: 'prepare', what: 'self' }],
};

/** "{cost}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if <condition>." */
const returnWithFinality = (cost: string, condition: ConditionDef): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  fromGraveyard: true,
  condition,
  targets: [],
  effects: [{ kind: 'returnSource', to: 'battlefield', named: 'finality' }],
  label: `${cost}: Return this card from your graveyard to the battlefield with a finality counter on it`,
});

/** Peer Review, the spell of both Fatehold Chronologist and Prudent Fateseer. */
const peerReview: Behavior = { spell: { targets: [], effects: [cadet, surveil(1)] } };
/** Soul Tether (Konstrari Improviser, Woodwork Prodigy). */
const soulTether: Behavior = { spell: { targets: [], effects: [heartwood()] } };
/** Vicious Verse (Whiplash Wordsmith, Stingerquill Voxmancer). */
const viciousVerse: Behavior = {
  spell: { targets: [opponentPlayer], effects: [{ kind: 'damage', amount: 1, to: t0 }] },
};
/** Seed Suture (Vigorbloom Vanguard, Emergency Phytomedic). */
const seedSuture: Behavior = {
  spell: {
    targets: [creature],
    effects: [{ kind: 'counters', to: t0, amount: 1 }, gain(1)],
  },
};
/** Omit Variables (Paradox Shaper, Theorix Metamage). */
const omitVariables: Behavior = {
  spell: { targets: [], effects: [{ kind: 'mill', count: 3 }] },
};

export const FRA_MULTI_A: Record<string, Behavior> = {
  // ---- W/U: scry and surveil ----
  'Prudent Fateseer': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youScryOrSurveil' },
        oncePerTurn: true,
        targets: [],
        effects: [pump(yours, 1, 0)],
      },
    ],
  },
  'Desperate Futurescribe': {
    abilities: [
      atYourCombat([{ what: 'creature', controller: 'you', filter: { other: true } }], {
        kind: 'if',
        condition: { kind: 'scriedOrSurveilledThisTurn' },
        then: [{ kind: 'counters', to: t0, amount: 1 }],
        else: [pump(t0, 1, 1)],
      }),
    ],
  },
  'Denzilore Fatehold': {
    abilities: [when({ on: 'youScryOrSurveil' }, [], { kind: 'counters', to: yours, amount: 1 })],
  },
  'Fatehold Chronologist': { entersPrepared: true },
  'Proctor of Potential': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: {} }, [], surveil(1)),
      returnWithFinality('{W}{U}', { kind: 'scriedOrSurveilledThisTurn' }),
    ],
  },

  // ---- U/B: mill and threshold ----
  'Paradox Shaper': {
    abilities: [
      preparesAtUpkeep,
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [{ what: 'graveyardCard', controller: 'you' }],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
        label: '{2}: Put target card from your graveyard on the bottom of your library',
      },
    ],
  },
  'Theorix Metamage': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'graveyardCount', min: 7 },
          power: 1,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  'Null Summoner': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [opponentPlayer],
        effects: [
          {
            kind: 'chooseFromOpponentHand',
            filter: { nonland: true },
            then: 'exile',
            castable: true,
            castableIf: { kind: 'graveyardCount', min: 7 },
          },
        ],
      },
    ],
  },
  'Theorix Charm': {
    modes: [
      {
        label: 'Counter target noncreature spell unless its controller pays {2}',
        targets: [{ what: 'spell', filter: { notTypes: ['Creature'] } }],
        effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
      },
      {
        label: 'Target creature gets -2/-2 until end of turn',
        targets: [creature],
        effects: [pump(t0, -2, -2)],
      },
      {
        label: 'Mill three cards, then draw a card',
        targets: [],
        effects: [{ kind: 'mill', count: 3 }, draw(1)],
      },
    ],
  },
  'Recursive Recruitment': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: FRA_CADET, count: 2 }] },
    // "If this spell was cast from a graveyard, put a +1/+1 counter on each of them for every three cards in your graveyard."
    flashbackSpell: {
      targets: [],
      effects: [
        {
          kind: 'createToken',
          token: FRA_CADET,
          count: 2,
          counters: { floorDiv: 3, amount: { count: 'cardsInGraveyard' } },
        },
      ],
    },
    flashback: mana('{6}{U}{B}'),
  },
  'Uldaros Theorix': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { nonland: true },
            anyNumber: true,
            onePerType: true,
          },
        ],
        effects: [{ kind: 'exileCopyCastFree', from: 0, budget: 6 }],
      },
    ],
  },

  // ---- B/R: noncombat damage ----
  'Grim Repriser': {
    abilities: [
      prowess,
      returnWithFinality('{B}{R}', { kind: 'opponentDealtNoncombatDamageThisTurn' }),
    ],
  },
  'Whiplash Wordsmith': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'opponentDealtNoncombatDamageThisTurn' },
          power: 0,
          toughness: 0,
          keywords: ['flying', 'haste'],
        },
      },
    ],
  },
  'Stingerquill Voxmancer': { abilities: [preparesAtUpkeep] },
  'Ingris Stingerquill': {
    abilities: [
      when({ on: 'creatureYouControlAttacks' }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
        from: 'subject',
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}') },
        targets: [],
        effects: [cadet, pump(yours, 0, 0, ['haste'])],
        label: '{4}: Create a Cadet token, then creatures you control gain haste until end of turn',
      },
    ],
  },
  'Stinging Vitriol': {
    spell: {
      targets: [opponentPlayer],
      effects: [
        { kind: 'damage', amount: 2, to: t0 },
        { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' },
      ],
    },
  },
  'Stingerquill Charm': {
    modes: [
      {
        label: 'Stingerquill Charm deals 3 damage to any target',
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 3, to: t0 }],
      },
      {
        label: 'Target creature gains first strike and deathtouch until end of turn',
        targets: [creature],
        effects: [pump(t0, 0, 0, ['firstStrike', 'deathtouch'])],
      },
      {
        label: 'Create a Cadet token. It gains haste until end of turn',
        targets: [],
        effects: [{ kind: 'createToken', token: FRA_CADET, count: 1, hasteThisTurn: true }],
      },
    ],
  },

  // ---- R/G: Heartwood and artifacts ----
  'Aerid Konstrari': {
    abilities: [
      onEnter(heartwood()),
      when({ on: 'dies' }, [], heartwood()),
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [],
        effects: [heartwood(), pump('self', artifactsYouControl, 0)],
        label: '{6}: Create a Heartwood token. Then Aerid Konstrari gets +X/+0 until end of turn',
      },
    ],
  },
  'Woodwork Prodigy': { abilities: [preparesAtUpkeep] },
  'Konstrari Improviser': { entersPrepared: true },
  'Tenured Tethermage': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { types: ['Land'] },
            then: [heartwood(2, true)],
          },
        ],
      }),
      {
        kind: 'activated',
        cost: { tapArtifacts: 2 },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 2 }],
        label: 'Tap two untapped artifacts you control: Put two +1/+1 counters on this creature',
      },
    ],
  },
  'Konstrari Charm': {
    modes: [
      {
        label: 'Konstrari Charm deals 6 damage to target creature with flying',
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'damage', amount: 6, to: t0 }],
      },
      {
        label: 'Put two +1/+1 counters on target creature. It gains trample until end of turn',
        targets: [creature],
        effects: [{ kind: 'counters', to: t0, amount: 2 }, pump(t0, 0, 0, ['trample'])],
      },
      {
        label: 'Add {C}{C}{C}',
        targets: [],
        effects: [{ kind: 'addMana', mana: [['C'], ['C'], ['C']] }],
      },
    ],
  },
  'Craftwork Crusher': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: combos(
          [
            {
              label: 'This creature deals 4 damage to target creature or planeswalker',
              targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
              effects: [{ kind: 'damage', amount: 4, to: t0 }],
            },
            { label: 'Create a Cadet token', targets: [], effects: [cadet] },
            { label: 'Draw a card', targets: [], effects: [draw(1)] },
          ],
          [2],
        ),
      },
    ],
  },

  // ---- G/W: lifegain and +1/+1 counters ----
  Bloombrute: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{W}') },
        targets: [creature],
        effects: [pump(t0, 0, 0, ['trample', 'lifelink'])],
        label: '{4}{G}{W}: Target creature gains trample and lifelink until end of turn',
      },
    ],
  },
  'Vigorbloom Vanguard': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
    ],
  },
  'Emergency Phytomedic': { entersPrepared: true },
  'Kwia Vigorbloom': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'createToken', token: FRA_LOTUS, count: 1 }],
      },
    ],
  },
  'Solarium Sentry': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'any', caster: 'opponent', spell: { maxManaValue: 2 } },
        [],
        gain(2),
      ),
    ],
  },
  'Vigorbloom Charm': {
    modes: [
      {
        label: 'Target permanent you control gains hexproof and indestructible until end of turn',
        targets: [{ what: 'permanent', controller: 'you' }],
        effects: [pump(t0, 0, 0, ['hexproof', 'indestructible'])],
      },
      {
        label: 'You draw a card and gain 3 life',
        targets: [],
        effects: [draw(1), gain(3)],
      },
      {
        label:
          'Put a +1/+1 counter on target creature you control. Then it fights target creature an opponent controls',
        targets: [yourCreature, { what: 'creature', controller: 'opponent' }],
        effects: [
          { kind: 'counters', to: t0, amount: 1 },
          { kind: 'fight', a: t0, b: t1 },
        ],
      },
    ],
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_MULTI_A_BACKS: Record<string, Behavior> = {
  'Peer Review (Fatehold Chronologist)': peerReview,
  'Peer Review (Prudent Fateseer)': peerReview,
  'Soul Tether (Konstrari Improviser)': soulTether,
  'Soul Tether (Woodwork Prodigy)': soulTether,
  'Vicious Verse (Whiplash Wordsmith)': viciousVerse,
  'Vicious Verse (Stingerquill Voxmancer)': viciousVerse,
  'Seed Suture (Vigorbloom Vanguard)': seedSuture,
  'Seed Suture (Emergency Phytomedic)': seedSuture,
  'Omit Variables (Paradox Shaper)': omitVariables,
  'Omit Variables (Theorix Metamage)': omitVariables,
};

/** Tokens only this group's cards make. */
export const FRA_MULTI_A_TOKENS: CardDefinition[] = [
  // "A colorless artifact token named Lotus with '{T}, Sacrifice this token: Add three mana of any one color.'"
  {
    id: FRA_LOTUS,
    name: 'Lotus',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: (['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true, sacrificeSelf: true },
      produces,
      amount: 3,
    })),
    isToken: true,
  },
];
