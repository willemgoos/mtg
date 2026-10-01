import type { AbilityDef, ConditionDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  gift,
  mana,
  offspring,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  youControl,
  yourCreature,
} from './helpers.ts';

// Rakdos Lizards (an opponent lost life this turn) and Dimir Rats (threshold).

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const anyPlayer: TargetSpec = { what: 'player' };
const opponentLostLife: ConditionDef = { kind: 'lifeThisTurn', who: 'opponent', lost: true };
const threshold: ConditionDef = { kind: 'graveyardCount', min: 7 };
const spell: TargetSpec = { what: 'spell' };

/** "This creature enters with a +1/+1 counter on it if an opponent lost life this turn." */
const lizardCounter: Behavior = { entersWithCounters: 1, entersWithCountersIf: opponentLostLife };

export const LIZARDS_RATS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ Rakdos Lizards
  'Iridescent Vinelasher': offspring(
    '{2}',
    when({ on: 'landfall' }, [opponent], { kind: 'damage', amount: 1, to: t0 }),
  ),
  'Ravine Raider': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [],
        effects: [pump('self', 1, 1)],
      },
    ],
  },
  'Hired Claw': {
    abilities: [
      when({ on: 'youAttack', filter: { subtype: 'Lizard' } }, [opponent], {
        kind: 'damage',
        amount: 1,
        to: t0,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        condition: opponentLostLife,
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Steampath Charger': offspring(
    '{2}',
    when({ on: 'dies' }, [anyPlayer], { kind: 'damage', amount: 1, to: t0 }),
  ),
  'Fireglass Mentor': {
    abilities: [
      {
        ...when({ on: 'beginningOfMain', which: 2 }, [], {
          kind: 'exileTopChooseOne',
          count: 2,
          until: 'endOfTurn',
        }),
        condition: opponentLostLife,
      } as AbilityDef,
    ],
  },
  'Gev, Scaled Scorch': {
    abilities: [
      { kind: 'static', effect: { kind: 'othersEnterWithCounter', condition: opponentLostLife } },
      when({ on: 'castSpell', filter: 'any', spell: { subtype: 'Lizard' } }, [opponent], {
        kind: 'damage',
        amount: 1,
        to: t0,
      }),
    ],
  },
  'Cindering Cutthroat': {
    ...lizardCounter,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B/R}') },
        targets: [],
        effects: [pump('self', 0, 0, ['menace'])],
      },
    ],
  },
  'Thought-Stalker Warlock': {
    abilities: [
      onEnter({
        kind: 'if',
        condition: opponentLostLife,
        then: [{ kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' }],
        else: [{ kind: 'discard', count: 1, who: 'eachOpponent' }],
      }),
    ],
  },
  'Hearthborn Battler': {
    abilities: [
      when({ on: 'anyPlayerSecondSpell' }, [opponent], { kind: 'damage', amount: 2, to: t0 }),
    ],
  },
  'Valley Flamecaller': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'damageBonus',
          amount: 1,
          source: { subtypes: ['Lizard', 'Mouse', 'Otter', 'Raccoon'] },
        },
      },
    ],
  },
  'Frilled Sparkshooter': lizardCounter,
  'Reptilian Recruiter': {
    abilities: [
      when({ on: 'etb' }, [creature], {
        kind: 'if',
        condition: {
          kind: 'any',
          of: [
            { kind: 'targetMatches', target: 0, filter: { maxPower: 2 } },
            { kind: 'controlsAnother', subtype: 'Lizard' },
          ],
        },
        then: [
          { kind: 'gainControl', what: t0 },
          { kind: 'untap', what: t0 },
          pump(t0, 0, 0, ['haste']),
        ],
      }),
    ],
  },
  'Scales of Shale': {
    costReduction: { count: 'creaturesYouControl', subtype: 'Lizard' },
    spell: {
      targets: [creature],
      effects: [pump(t0, 2, 0, ['lifelink', 'indestructible'])],
    },
  },
  'Agate Assault': {
    modes: [
      {
        label: '4 damage to a creature',
        targets: [creature],
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
          { kind: 'damage', amount: 4, to: t0 },
        ],
      },
      {
        label: 'Exile an artifact',
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'exile', what: t0 }],
      },
    ],
  },
  'Conduct Electricity': {
    spell: {
      targets: [creature, { what: 'creature', filter: { token: true }, optional: true }],
      effects: [
        { kind: 'damage', amount: 6, to: t0 },
        { kind: 'damage', amount: 2, to: t1 },
      ],
    },
  },

  // ------------------------------------------------------------------ Dimir Rats
  'Thought Shucker': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}') },
        condition: threshold,
        once: true,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }, draw(1)],
      },
    ],
  },
  'Shoreline Looter': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
      when({ on: 'combatDamageToPlayer' }, [], draw(1), {
        kind: 'if',
        condition: threshold,
        then: [],
        else: [{ kind: 'discard', count: 1 }],
      }),
    ],
  },
  'Persistent Marshstalker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'creaturesYouControl', subtype: 'Rat', other: true },
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'youAttack', filter: { subtype: 'Rat' } },
        fromGraveyard: true,
        condition: threshold,
        cost: mana('{2}{B}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true, attacking: true }],
      },
    ],
  },
  'Azure Beastbinder': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { minPower: 2 } } },
      when(
        { on: 'attacks' },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact', 'Creature'] },
            optional: true,
          },
        ],
        { kind: 'loseAbilities', what: t0, basePT: [2, 2] },
      ),
    ],
  },
  'Nightwhorl Hermit': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: threshold,
          power: 1,
          toughness: 0,
          cantBeBlocked: true,
        },
      },
    ],
  },
  Mindwhisker: {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'surveil', amount: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesOpponentsControl',
          condition: threshold,
          power: -1,
          toughness: 0,
        },
      },
    ],
  },
  'Mind Drill Assailant': {
    abilities: [
      { kind: 'static', effect: { kind: 'while', condition: threshold, power: 3, toughness: 0 } },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U/B}') },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
    ],
  },
  'Tidecaller Mentor': {
    abilities: [
      {
        ...when({ on: 'etb' }, [{ what: 'permanent', filter: { nonland: true }, optional: true }], {
          kind: 'bounce',
          what: t0,
        }),
        condition: threshold,
      } as AbilityDef,
    ],
  },
  'Wick, the Whorled Mind': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: { subtype: 'Rat' } }, [], {
        kind: 'if',
        condition: youControl('Snail'),
        then: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { subtype: 'Snail' } },
            amount: 1,
          },
        ],
        else: [{ kind: 'createToken', token: 'snail-token', count: 1 }],
      }),
      {
        kind: 'activated',
        cost: {
          mana: mana('{U}{B}{R}'),
          sacrificeCreature: true,
          sacrificeFilter: { subtype: 'Snail' },
        },
        targets: [],
        effects: [
          { kind: 'damage', amount: { sacrificedPower: true }, to: 'eachOpponent' },
          { kind: 'draw', who: 'controller', amount: { sacrificedPower: true } },
        ],
      },
    ],
  },
  'Vren, the Relentless': {
    abilities: [
      { kind: 'static', effect: { kind: 'exileOpponentCreaturesInstead' } },
      when({ on: 'beginningOfEndStep', whose: 'each' }, [], {
        kind: 'createToken',
        token: 'vren-rat-token',
        count: { count: 'opponentCreaturesExiledThisTurn' },
      }),
    ],
  },
  'Psychic Whorl': {
    spell: {
      targets: [],
      effects: [
        { kind: 'discard', count: 2, who: 'eachOpponent' },
        { kind: 'if', condition: youControl('Rat'), then: [{ kind: 'surveil', amount: 2 }] },
      ],
    },
  },
  Spellgyre: {
    modes: [
      { label: 'Counter target spell', targets: [spell], effects: [{ kind: 'counter', what: t0 }] },
      {
        label: 'Surveil 2, draw two',
        targets: [],
        effects: [{ kind: 'surveil', amount: 2 }, draw(2)],
      },
    ],
  },
  "Long River's Pull": gift(
    'card',
    {
      targets: [{ what: 'spell', filter: { types: ['Creature'] } }],
      effects: [{ kind: 'counter', what: t0 }],
    },
    { targets: [spell], effects: [{ kind: 'counter', what: t0 }] },
  ),
  'Dire Downdraft': {
    costReductionIfTarget: {
      filter: { anyOf: [{ attacking: true }, { tapped: true }] },
      amount: 1,
    },
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'choose',
          ownerOf: 0,
          options: [
            {
              label: 'Top of library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'top' }],
            },
            {
              label: 'Bottom of library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
            },
          ],
        },
      ],
    },
  },
  'Run Away Together': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [
        { kind: 'bounce', what: t0 },
        { kind: 'bounce', what: t1 },
      ],
    },
  },
  'Into the Flood Maw': gift(
    'fish',
    { targets: [theirCreature], effects: [{ kind: 'bounce', what: t0 }] },
    {
      targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }],
    },
  ),
  'Mind Spiral': gift(
    'fish',
    { targets: [anyPlayer], effects: [{ kind: 'draw', who: t0, amount: 3 }] },
    {
      targets: [anyPlayer, theirCreature],
      effects: [
        { kind: 'draw', who: t0, amount: 3 },
        { kind: 'tap', what: t1 },
        { kind: 'namedCounters', name: 'stun', amount: 1, to: t1 },
      ],
    },
  ),
};
