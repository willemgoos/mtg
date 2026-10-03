/**
 * Foundations cards that Arena's Foundations draft trophy decks play, the
 * ones Arena's Foundations Jump In packets list that foundations-jumpin.ts
 * didn't cover, and three reprints the Final Fantasy trophy decks need.
 */
import type { AbilityDef, EffectDef, TargetSpec, TriggerDef } from '@mtg/engine';
import { parseManaCost, type Behavior } from './build.ts';

const t0 = { target: 0 } as const;
const mana = parseManaCost;
const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const when = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Extract<AbilityDef, { kind: 'triggered' }> => ({ kind: 'triggered', trigger, targets, effects });
const draw = (amount: number): EffectDef => ({ kind: 'draw', who: 'controller', amount });
const yours = { each: 'creature', controller: 'you' } as const;
const anthem = (subtype: string): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'anthem',
    affects: 'otherCreaturesYouControl',
    filter: { subtype },
    power: 1,
    toughness: 1,
  },
});
const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

export const FOUNDATIONS_DRAFT_BEHAVIORS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ white
  'Squad Rallier': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'lookAndTake', count: 4, filter: { types: ['Creature'], maxPower: 2 } }],
      },
    ],
  },
  'Exemplar of Light': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'counters', to: 'self', amount: 1 }),
      { ...when({ on: 'youPutCounters', self: true }, [], draw(1)), oncePerTurn: true },
    ],
  },
  'Luminous Rebuke': {
    costReductionIfTarget: { filter: { tapped: true }, amount: 3 },
    spell: { targets: [creature], effects: [{ kind: 'destroy', what: t0 }] },
  },

  // ------------------------------------------------------------------- blue
  'Self-Reflection': {
    spell: { targets: [yourCreature], effects: [{ kind: 'tokenCopy', of: t0 }] },
    flashback: mana('{3}{U}'),
  },
  'Time Stop': {
    // Simplified: every other spell is exiled, abilities on the stack are dropped, combat ends.
    spell: { targets: [], effects: [{ kind: 'endTheTurn' }] },
  },
  'Homunculus Horde': {
    abilities: [when({ on: 'drawSecondCard' }, [], { kind: 'tokenCopy', of: 'self' })],
  },

  // ------------------------------------------------------------------ black
  Pilfer: {
    spell: {
      targets: [],
      effects: [{ kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' }],
    },
  },
  'Blasphemous Edict': {
    // Each player sacrifices every creature (thirteen is more than a game has); the {B} cost isn't offered.
    spell: { targets: [], effects: [{ kind: 'sacrifice', what: { each: 'creature' } }] },
  },
  'Gutless Plunderer': {
    // Raid: surveil 3 (any number may stay on top, not just one).
    abilities: [
      {
        ...when({ on: 'etb' }, [], { kind: 'surveil', amount: 3 }),
        condition: { kind: 'attackedThisTurn' },
      },
    ],
  },
  'Zul Ashur, Lich Lord': {
    wardCost: { mana: mana(''), life: 2 },
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], subtype: 'Zombie' },
          },
        ],
        effects: [{ kind: 'castFromGraveyardThisTurn', what: t0 }],
      },
    ],
  },
  'Deadly Plot': {
    modes: [
      {
        targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], subtype: 'Zombie' },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0, tapped: true }],
      },
    ],
  },

  // -------------------------------------------------------------------- red
  'Firespitter Whelp': {
    abilities: [
      when(
        {
          on: 'castSpell',
          filter: 'any',
          spell: { anyOf: [{ notTypes: ['Creature'] }, { subtype: 'Dragon' }] },
        },
        [],
        { kind: 'damage', amount: 1, to: 'eachOpponent' },
      ),
    ],
  },
  'Thrill of Possibility': { discardToCast: true, spell: { targets: [], effects: [draw(2)] } },
  'Bolt Bend': {
    costReductionIf: {
      condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
      amount: 3,
    },
    // Spells only, not abilities.
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'changeTarget', what: t0 }] },
  },
  'Dropkick Bomber': {
    abilities: [
      anthem('Goblin'),
      {
        kind: 'activated',
        cost: { mana: mana('{R}') },
        targets: [
          { what: 'creature', controller: 'you', filter: { subtype: 'Goblin', other: true } },
        ],
        effects: [
          {
            kind: 'pump',
            to: t0,
            power: 0,
            toughness: 0,
            keywords: ['flying'],
            sacrificeOnCombatDamage: true,
          },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ green
  'Vivien Reid': {
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [
          {
            kind: 'lookAndTake',
            count: 4,
            filter: { anyOf: [{ types: ['Creature'] }, { types: ['Land'] }] },
          },
        ],
        label: '+1: look at four',
      },
      {
        kind: 'activated',
        cost: { loyalty: -3 },
        targets: [
          {
            what: 'permanent',
            filter: {
              anyOf: [
                { types: ['Artifact', 'Enchantment'] },
                { types: ['Creature'], hasKeyword: 'flying' },
              ],
            },
          },
        ],
        effects: [{ kind: 'destroy', what: t0 }],
        label: '−3: destroy',
      },
      {
        kind: 'activated',
        cost: { loyalty: -8 },
        targets: [],
        effects: [
          {
            kind: 'emblem',
            until: 'permanent',
            // The emblem's anthem applies from the start of each of your combats.
            ability: when({ on: 'beginningOfCombat', whose: 'yours' }, [], {
              kind: 'pump',
              to: yours,
              power: 2,
              toughness: 2,
              keywords: ['vigilance', 'trample', 'indestructible'],
            }),
          },
        ],
        label: '−8: emblem',
      },
    ],
  },
  'Ordeal of Nylea': {
    enchant: creature,
    abilities: [
      when(
        { on: 'equippedAttacks' },
        [],
        { kind: 'counters', to: 'attached', amount: 1 },
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { countersOn: 'attached' }, min: 3 },
          then: [{ kind: 'sacrifice', what: 'self' }],
        },
      ),
      when(
        { on: 'sacrificed' },
        [],
        { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' },
        { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' },
      ),
    ],
  },
  'Elvish Archdruid': {
    abilities: [
      anthem('Elf'),
      // An activated ability rather than a mana ability.
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'addMana',
            mana: [['G']],
            count: { count: 'creaturesYouControl', subtype: 'Elf' },
          },
        ],
      },
    ],
  },

  // ------------------------------------------------- multicolour and others
  'Koma, World-Eater': {
    uncounterable: true,
    wardCost: { mana: mana('{4}') },
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'createToken',
        token: 'komas-coil-token',
        count: 4,
      }),
    ],
  },
  'Leyline Axe': {
    beginsOnBattlefield: true,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['doubleStrike', 'trample'] },
      },
      equip('{3}'),
    ],
  },

  // Final Fantasy draft trophy decks: reprints from Through the Ages and older sets.
  Counterspell: {
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: t0 }] },
  },
  'Captain Lannery Storm': {
    abilities: [
      when({ on: 'attacks' }, [], { kind: 'createToken', token: 'treasure-token', count: 1 }),
      when({ on: 'youSacrifice', filter: { subtype: 'Treasure' } }, [], {
        kind: 'pump',
        to: 'self',
        power: 1,
        toughness: 0,
      }),
    ],
  },
  'Vial Smasher the Fierce': {
    // Two players: the opponent, never a planeswalker of theirs.
    abilities: [
      when({ on: 'castSpell', filter: 'first' }, [], {
        kind: 'damage',
        amount: { manaValueOfSubject: true },
        to: 'eachOpponent',
      }),
    ],
  },
};
