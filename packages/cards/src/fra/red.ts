import type { AbilityDef, Amount, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, onEnter, prowess, pump, t0, when, yours } from '../blb/helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17a): red. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_RED_BACKS. See docs/reality-fracture-plan.md.
 */

/** "A 5/5 red Dragon creature token with flying." */
export const FRA_DRAGON = 'fra-dragon-token';
/** "A 1/1 colorless Thopter artifact creature token with flying." */
export const FRA_THOPTER = 'fra-thopter-token';

const creatureOrPlaneswalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const artifactsYouControl: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Artifact'] },
};
const dragon = (): EffectDef => ({ kind: 'createToken', token: FRA_DRAGON, count: 1 });

/** "Basic landcycling {cost}". */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

/** "Creatures you control have <keyword>." */
const creaturesHave = (keyword: 'trample' | 'haste'): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'anthem',
    affects: 'creaturesYouControl',
    power: 0,
    toughness: 0,
    keywords: [keyword],
  },
});

/** Face Yourself: "At the beginning of the end step, if you don't control a planeswalker, sacrifice this creature." */
const faceYourselfSacrifice: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'beginningOfEndStep', whose: 'each' },
  condition: {
    kind: 'not',
    condition: { kind: 'controlsPermanents', filter: { types: ['Planeswalker'] }, min: 1 },
  },
  targets: [],
  effects: [{ kind: 'sacrifice', what: 'self' }],
};

export const FRA_RED: Record<string, Behavior> = {
  "Ajani's Anguish": {
    abilities: [
      when({ on: 'etb' }, [{ what: 'any' }], { kind: 'damage', amount: { x: true }, to: t0 }),
      creaturesHave('trample'),
    ],
  },
  'Arni, Renowned Champion': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you' },
        [],
        pump('self', { powerOf: 'subject' }, 0),
      ),
    ],
  },
  'Artifist Acumen': {
    spell: {
      targets: [],
      effects: [pump(yours, 0, 0, ['firstStrike']), { kind: 'draw', who: 'controller', amount: 1 }],
    },
  },
  'Awaken the Inferno': {
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'] },
        },
        { what: 'creature', controller: 'you', optional: true },
      ],
      effects: [
        { kind: 'damage', amount: 6, to: t0 },
        { kind: 'counters', to: { target: 1 }, amount: 1 },
      ],
    },
    abilities: [basicLandcycling('{2}')],
  },
  "Chandra's Emberling": {
    abilities: [
      when({ on: 'castSpell', filter: 'noncreature' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  'Command the Stage': {
    spell: {
      targets: [],
      effects: [
        { kind: 'createToken', token: FRA_CADET, count: 1 },
        {
          kind: 'counters',
          to: {
            each: 'creature',
            controller: 'you',
            filter: { subtype: 'Wizard', token: true },
            exceptChosen: true,
          },
          amount: 1,
        },
      ],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'each' },
        fromGraveyard: true,
        condition: { kind: 'opponentDealtNoncombatDamageLastTurn' },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Craterclaw Colossus': {
    abilities: [onEnter(pump(yours, artifactsYouControl, 0, ['trample']))],
  },
  'Curse-Marred Demon': {
    abilities: [
      onEnter(
        { kind: 'searchLibrary', filter: {}, to: 'hand', required: true },
        { kind: 'custom', handler: 'discardAtRandom', params: { count: 1 } },
      ),
    ],
  },
  'Draconic Visitor': {
    abilities: [{ kind: 'static', effect: { kind: 'artifactTokensBecome', token: FRA_DRAGON } }],
  },
  'Eardrum Rattler': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true, maxPower: 2 } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
        label:
          "{1}, {T}: Another target creature you control with power 2 or less can't be blocked",
      },
    ],
  },
  'Essence Burn': {
    spell: {
      targets: [
        { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'], colors: ['B', 'G'] } },
      ],
      effects: [
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
      ],
    },
  },
  'Face Yourself': {
    spell: {
      targets: [{ what: 'player' }],
      effects: [
        {
          kind: 'tokenCopy',
          of: { each: 'creature', controllerTarget: 0 },
          haste: true,
          grantAbilities: [faceYourselfSacrifice],
        },
      ],
    },
  },
  'Fulminous Forte': {
    modes: [
      {
        label: '1 damage to each creature and planeswalker your opponents control',
        targets: [],
        effects: [
          {
            kind: 'damage',
            amount: 1,
            to: {
              each: 'permanent',
              controller: 'opponent',
              filter: { types: ['Creature', 'Planeswalker'] },
            },
          },
        ],
      },
      {
        label: '5 damage to target creature or planeswalker',
        targets: [creatureOrPlaneswalker],
        effects: [{ kind: 'damage', amount: 5, to: t0 }],
      },
    ],
  },
  'Gallia, the Merrymaker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { enteredThisTurn: true } }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
        label: '{1}{R}, {T}: Put a +1/+1 counter on target creature that entered this turn',
      },
    ],
  },
  'Hallway Heckler': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, discard: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        label: '{T}, Discard a card: Draw a card',
      },
    ],
  },
  'Heartstring Puller': {
    abilities: [onEnter({ kind: 'createToken', token: FRA_CADET, count: 1 })],
  },
  'Identity Echo': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{R}') },
        sorcerySpeed: true,
        targets: [
          { what: 'permanent', controller: 'you', filter: { types: ['Creature', 'Planeswalker'] } },
        ],
        effects: [
          { kind: 'exile', what: t0 },
          {
            kind: 'revealUntil',
            filter: { types: ['Creature', 'Planeswalker'] },
            to: 'battlefield',
          },
        ],
        label:
          '{3}{R}: Exile target creature or planeswalker you control, then reveal cards until a creature or planeswalker card and put it onto the battlefield',
      },
    ],
  },
  'Jiang Yanggu, Alone': {
    abilities: [
      when(
        { on: 'creatureYouControlAttacks', alone: true, aPlayer: true },
        [],
        { kind: 'discard', count: 1 },
        { kind: 'draw', who: 'controller', amount: 1 },
        { kind: 'counters', to: 'subject', amount: { count: 'cardsDiscardedThisTurn' } },
      ),
    ],
  },
  'Kiora of Fire and Ashes': {
    abilities: [
      onEnter(dragon()),
      {
        kind: 'activated',
        cost: { mana: mana('{8}') },
        targets: [],
        effects: [dragon()],
        label: '{8}: Create a 5/5 red Dragon creature token with flying',
      },
    ],
  },
  'Koth, the Geomancer': {
    abilities: [
      when(
        { on: 'landfall' },
        [],
        { kind: 'damage', amount: 1, to: 'eachOpponent' },
        {
          kind: 'if',
          condition: { kind: 'subjectMatches', filter: { subtype: 'Mountain' } },
          then: [{ kind: 'addMana', mana: [['R']] }],
        },
      ),
    ],
  },
  'Marwyn, the Clearcutter': {
    abilities: [
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}'),
          tapSelf: true,
          sacrificePermanent: { anyOf: [{ types: ['Artifact'] }, { types: ['Land'] }] },
        },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        label: '{2}, {T}, Sacrifice an artifact or land: Draw a card',
      },
    ],
  },
  'Master of Barbs': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'opponentDealtNoncombatDamage' },
        batch: true,
        targets: [],
        effects: [pump(yours, 1, 0)],
      },
    ],
  },
  'Pia, Determined Rebuilder': {
    abilities: [
      onEnter({ kind: 'createToken', token: FRA_THOPTER, count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{5}{R}') },
        targets: [{ what: 'creature' }],
        effects: [pump(t0, artifactsYouControl, 0)],
        label:
          '{5}{R}: Target creature gets +X/+0 until end of turn, where X is the number of artifacts you control',
      },
    ],
  },
  'Pompous Battlemage': {
    entersPrepared: true,
    abilities: [prowess],
  },
  'Pyre Rhymer': {
    entersPrepared: true,
    abilities: [prowess],
  },
  "Samut, Hazoret's Champion": {
    abilities: [creaturesHave('haste')],
  },
  'Skilled Battlecarver': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        effects: [pump('self', 1, 0)],
        label: '{1}{R}: +1/+0 until end of turn',
      },
    ],
  },
  'Stingcaster Mage': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
        { kind: 'custom', handler: 'grantFlashback' },
      ),
    ],
  },
  'Tether Technician': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'discard', count: 1, then: [{ kind: 'reflexiveTrigger', ability: 1 }] }],
      }),
      when({ on: 'reflexive' }, [{ what: 'any' }], { kind: 'damage', amount: 2, to: t0 }),
    ],
  },
  'Tetsuko Umezawa, Pursuer': {
    abilities: [
      prowess,
      when({ on: 'opponentCreatureBlocks', filter: { maxPowerOrToughness: 1 } }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },
  'Tomik, Izzet Sparkmage': {
    abilities: [
      prowess,
      {
        kind: 'static',
        effect: { kind: 'damageBonus', amount: 1, noncombat: true, toOpponents: true },
      },
    ],
  },
  'Winter, Team Player': {
    convoke: true,
    abilities: [when({ on: 'castSpell', filter: 'noncreature' }, [], pump(yours, 1, 0))],
  },
  'Wrath of the Bloodmane': {
    costReductionIf: {
      condition: { kind: 'controlsCreature', filter: { supertypes: ['Legendary'] } },
      amount: 1,
    },
    spell: {
      targets: [creatureOrPlaneswalker],
      effects: [{ kind: 'damage', amount: 4, to: t0 }],
    },
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_RED_BACKS: Record<string, Behavior> = {
  'Vicious Verse (Hallway Heckler)': {
    spell: { targets: [opponent], effects: [{ kind: 'damage', amount: 1, to: t0 }] },
  },
  'Improvised Act (Pompous Battlemage)': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'may',
          effects: [
            { kind: 'discard', count: 1, then: [{ kind: 'draw', who: 'controller', amount: 1 }] },
          ],
        },
      ],
    },
  },
  'Molten Tide (Pyre Rhymer)': {
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'moltenTide' }] },
  },
};

/** Tokens only this group's cards make. */
export const FRA_RED_TOKENS: CardDefinition[] = [
  // "A 5/5 red Dragon creature token with flying."
  {
    id: FRA_DRAGON,
    name: 'Dragon',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Dragon'],
    power: 5,
    toughness: 5,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
  // "A 1/1 colorless Thopter artifact creature token with flying."
  {
    id: FRA_THOPTER,
    name: 'Thopter',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Thopter'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
