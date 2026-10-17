import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, pump, t0, t1, when, yours } from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';
import {
  bargain,
  celebration,
  celebrationAtCombat,
  celebrationBoost,
  createRole,
  creaturesAttackedThisTurn,
  ifBargained,
  HAS_ADVENTURE,
  whenEntersIfBargained,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23b): red cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_RED_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const RAT = 'woe-rat-token'; // black.ts makes it
const KNIGHT = 'woe-w-knight-token'; // white.ts makes it

const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const upToOne = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
/** A later "target" of the same spell: it may be the same creature as an earlier target (rule 115.3). */
const sameAllowed = (spec: TargetSpec, index: number): TargetSpec => ({
  ...spec,
  modeStart: index,
});

const rat: EffectDef = { kind: 'createToken', token: RAT, count: 1 };
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const everyColor = ['W', 'U', 'B', 'R', 'G'] as const;

/** "You may discard a card. If you do, draw N cards." */
const mayDiscardToDraw = (n: number): EffectDef => ({
  kind: 'may',
  effects: [{ kind: 'discard', count: 1, then: [draw(n)] }],
});

const fiveColours = [...everyColor];

export const WOE_RED: Record<string, Behavior> = {
  // Celebration — "At the beginning of combat on your turn, if two or more nonland permanents entered the battlefield under your
  // control this turn, target creature you control gets +1/+0 and gains menace until end of turn."
  'Belligerent of the Ball': {
    abilities: [celebrationAtCombat([pump(t0, 1, 0, ['menace'])], [yourCreature])],
  },

  // "Haste". Adventure: Beat a Path.
  'Bellowing Bruiser': {},

  // "Equipped creature gets +2/+0." "Celebration — At the beginning of combat on your turn, if two or more nonland permanents
  // entered the battlefield under your control this turn, attach this Equipment to up to one target creature you control."
  // "Equip {2}"
  'Bespoke Battlegarb': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 0 } },
      celebrationAtCombat([{ kind: 'attach', to: t0 }], [upToOne(yourCreature)]),
      equip('{2}'),
    ],
  },

  // "At the beginning of combat on your turn, if you control a creature with power 4 or greater, you may discard a card. If you
  // do, draw a card."
  'Boundary Lands Ranger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [mayDiscardToDraw(1)],
      },
    ],
  },

  // "Haste". "When this creature enters, choose one — • Discard a card, then draw a card. • Create a Treasure token. • Create a
  // Wicked Role token attached to target creature you control."
  'Charming Scoundrel': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Discard a card, then draw a card',
            targets: [],
            effects: [{ kind: 'discard', count: 1 }, draw(1)],
          },
          { label: 'Create a Treasure token', targets: [], effects: [treasure] },
          {
            label: 'Create a Wicked Role token attached to target creature you control',
            targets: [yourCreature],
            effects: [createRole('Wicked')],
          },
        ],
      },
    ],
  },

  // "Cut In deals 4 damage to target creature. Create a Young Hero Role token attached to up to one target creature you control."
  'Cut In': {
    spell: {
      targets: [creature, sameAllowed(upToOne(yourCreature), 1)],
      effects: [{ kind: 'damage', amount: 4, to: t0 }, createRole('Young Hero', t1)],
    },
  },

  // "Menace". "When this creature enters, create a 1/1 black Rat creature token with 'This token can't block.'"
  'Edgewall Pack': {
    abilities: [when({ on: 'etb' }, [], rat)],
  },

  // "{1}, Sacrifice this creature: Create a Young Hero Role token attached to another target creature."
  'Embereth Veteran': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [{ ...creature, filter: { other: true } }],
        effects: [createRole('Young Hero')],
      },
    ],
  },

  // "Artifacts you control have '{2}, Sacrifice this artifact: It deals damage to any target equal to 1 plus the number of
  // permanents named Food Fight you control.'"
  'Food Fight': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'artifactsYouControlHave',
          ability: {
            kind: 'activated',
            cost: { mana: mana('{2}'), sacrificeSelf: true },
            targets: [{ what: 'any' }],
            effects: [
              {
                kind: 'damage',
                amount: {
                  sum: [1, { count: 'permanentsYouControl', filter: { named: 'food-fight' } }],
                },
                to: t0,
              },
            ],
            label: '{2}, Sacrifice this artifact: damage to any target',
          },
        },
      },
    ],
  },

  // "Frantic Firebolt deals X damage to target creature, where X is 2 plus the number of cards in your graveyard that are instant
  // cards, sorcery cards, and/or have an Adventure."
  'Frantic Firebolt': {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'damage',
          amount: {
            count: 'cardsInGraveyard',
            plus: 2,
            filter: { anyOf: [{ types: ['Instant', 'Sorcery'] }, HAS_ADVENTURE] },
          },
          to: t0,
        },
      ],
    },
  },

  // "Creatures you control get +2/+0 until end of turn. Whenever a nontoken creature you control dies this turn, create a 1/1
  // black Rat creature token with 'This token can't block.'"
  'Gnawing Crescendo': {
    spell: {
      targets: [],
      effects: [
        pump(yours, 2, 0),
        {
          kind: 'emblem',
          until: 'endOfTurn',
          label:
            'Whenever a nontoken creature you control dies this turn, create a 1/1 black Rat creature token.',
          ability: {
            kind: 'triggered',
            trigger: { on: 'otherCreatureDies', controller: 'you', nontoken: true },
            targets: [],
            effects: [rat],
          },
        },
      ],
    },
  },

  // "Haste". Celebration — "As long as two or more nonland permanents entered the battlefield under your control this turn,
  // Goddric is a Dragon with base power and toughness 4/4, flying, and '{R}: Dragons you control get +1/+0 until end of turn.'
  // (He loses all other creature types.)"
  'Goddric, Cloaked Reveler': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: celebration,
          power: 0,
          toughness: 0,
          basePT: [4, 4],
          keywords: ['flying'],
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'becomesWhileCelebrating',
          subtypes: ['Dragon'],
          abilities: [
            {
              kind: 'activated',
              cost: { mana: mana('{R}') },
              targets: [],
              effects: [
                pump({ each: 'creature', controller: 'you', filter: { subtype: 'Dragon' } }, 1, 0),
              ],
              label: '{R}: Dragons you control get +1/+0 until end of turn',
            },
          ],
        },
      },
    ],
  },

  // "Reach". "{2}{R}, Sacrifice an artifact or land: Draw a card." Adventure: That's Mine.
  'Grabby Giant': {
    abilities: [
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}{R}'),
          sacrificePermanent: { anyOf: [{ types: ['Artifact'] }, { types: ['Land'] }] },
        },
        targets: [],
        effects: [draw(1)],
        label: '{2}{R}, Sacrifice an artifact or land: Draw a card',
      },
    ],
  },

  // Celebration — "This creature gets +1/+1 and has trample as long as two or more nonland permanents entered the battlefield
  // under your control this turn."
  'Grand Ball Guest': { abilities: [celebrationBoost(1, 1, ['trample'])] },

  // "Haste". "When this creature dies, create a 1/1 black Rat creature token with 'This token can't block.'"
  'Harried Spearguard': {
    abilities: [when({ on: 'dies' }, [], rat)],
  },

  // "When this creature enters, creatures you control get +1/+0 and gain haste until end of turn." Adventure: Train Troops.
  "Imodane's Recruiter": {
    abilities: [when({ on: 'etb' }, [], pump(yours, 1, 0, ['haste']))],
  },

  // "Whenever an instant or sorcery spell you control that targets only a single creature deals damage to that creature, Imodane
  // deals that much damage to each opponent."
  'Imodane, the Pyrohammer': {
    abilities: [
      when({ on: 'yourSpellDamagesItsSingleTarget' }, [], {
        kind: 'damage',
        amount: { event: 'amount' },
        to: 'eachOpponent',
      }),
    ],
  },

  // "Double strike". "Other creatures you control get +1/+0 for each Aura and Equipment attached to Kellan." Adventure:
  // Birthright Boon.
  'Kellan, the Fae-Blooded': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          power: {
            count: 'attachedToSource',
            filter: { anyOf: [{ subtype: 'Aura' }, { subtype: 'Equipment' }] },
          },
          toughness: 0,
        },
      },
    ],
  },

  // "Target creature gets +1/+0 and gains first strike until end of turn. Scry 1."
  'Kindled Heroism': {
    spell: {
      targets: [creature],
      effects: [pump(t0, 1, 0, ['firstStrike']), { kind: 'scry', amount: 1 }],
    },
  },

  // "I, II — Create a Treasure token." "III — Exile the top three cards of target opponent's library. You may play those cards
  // this turn."
  'Korvold and the Noble Thief': {
    saga: 3,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'chapter', chapters: [1, 2] },
        targets: [],
        effects: [treasure],
      },
      {
        kind: 'triggered',
        trigger: { on: 'chapter', chapters: [3] },
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'custom', handler: 'woeKorvoldExile' }],
      },
    ],
  },

  // "When this creature enters, you may pay {1}. When you do, create a Young Hero Role token attached to target creature you
  // control."
  'Merry Bards': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'may',
        cost: mana('{1}'),
        effects: [{ kind: 'reflexiveTrigger', ability: 1 }],
      }),
      when({ on: 'reflexive' }, [yourCreature], createRole('Young Hero')),
    ],
  },

  // Adventure: Ride the Rails.
  'Minecart Daredevil': {},

  // "Whenever this creature attacks while you control a creature with power 4 or greater, this creature gains double strike until
  // end of turn." Adventure: Stolen Goodies.
  'Picnic Ruiner': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [pump('self', 0, 0, ['doubleStrike'])],
      },
    ],
  },

  // "The second spell you cast each turn costs {1} less to cast." Celebration — "At the beginning of combat on your turn, if two
  // or more nonland permanents entered the battlefield under your control this turn, target creature you control gets +1/+1 until
  // end of turn."
  'Raging Battle Mouse': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLessIf',
          filter: {},
          amount: 1,
          condition: { kind: 'spellsCastThisTurn', min: 1, max: 1 },
        },
      },
      celebrationAtCombat([pump(t0, 1, 1)], [yourCreature]),
    ],
  },

  // "During your turn, this creature has first strike." Adventure: Pest Problem.
  'Ratcatcher Trainee': {
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
    ],
  },

  // "Bargain". "Flying, haste". "When this creature enters, if it was bargained, add four mana in any combination of colors."
  // "{1}{R}: This creature deals 1 damage to any target."
  'Realm-Scorcher Hellkite': {
    ...bargain(),
    abilities: [
      whenEntersIfBargained([
        {
          kind: 'addMana',
          mana: [fiveColours, fiveColours, fiveColours, fiveColours],
        },
      ]),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
    ],
  },

  // "Menace". "When this creature enters, create two 1/1 black Rat creature tokens with 'This token can't block.'" "At the
  // beginning of your upkeep, you may sacrifice another creature. If you do, put a +1/+1 counter on this creature and exile the
  // top card of your library. You may play that card this turn."
  'Redcap Gutter-Dweller': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'createToken', token: RAT, count: 2 }),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        optional: true,
        targets: [],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { types: ['Creature'], other: true },
            then: [
              { kind: 'counters', to: 'self', amount: 1 },
              { kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' },
            ],
          },
        ],
      },
    ],
  },

  // "When this creature enters, create a Treasure token."
  'Redcap Thief': {
    abilities: [when({ on: 'etb' }, [], treasure)],
  },

  // "Whenever an opponent casts a spell with mana value 3 or less, this creature deals 1 damage to that player." Adventure: Steam
  // Clean.
  'Scalding Viper': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', caster: 'opponent', spell: { maxManaValue: 3 } }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },

  // "Reach". "Whenever this creature blocks or becomes blocked by a creature, this creature deals 1 damage to that creature."
  'Skewer Slinger': {
    abilities: [
      when({ on: 'blocksOrBecomesBlocked' }, [], { kind: 'damage', amount: 1, to: 'subject' }),
    ],
  },

  // "Create X 1/1 black Rat creature tokens with 'This token can't block.' Creatures you control gain haste until end of turn."
  'Song of Totentanz': {
    spell: {
      targets: [],
      effects: [
        { kind: 'createToken', token: RAT, count: { x: true } },
        pump(yours, 0, 0, ['haste']),
      ],
    },
  },

  // "Bargain". "Stonesplitter Bolt deals X damage to target creature or planeswalker. If this spell was bargained, it deals twice X
  // damage to that permanent instead."
  'Stonesplitter Bolt': {
    ...bargain(),
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [
        ifBargained(
          [{ kind: 'damage', amount: { x: true, times: 2 }, to: t0 }],
          [{ kind: 'damage', amount: { x: true }, to: t0 }],
        ),
      ],
    },
  },

  // "Whenever a Rat you control becomes blocked, it gets +2/+0 until end of turn."
  'Tattered Ratter': {
    abilities: [
      when(
        { on: 'creatureYouControlBecomesBlocked', filter: { subtype: 'Rat' } },
        [],
        pump('subject', 2, 0),
      ),
    ],
  },

  // "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. Create a Wicked
  // Role token attached to up to one target creature."
  'Twisted Fealty': {
    spell: {
      targets: [creature, sameAllowed(upToOne(creature), 1)],
      effects: [
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        pump(t0, 0, 0, ['haste']),
        createRole('Wicked', t1),
      ],
    },
  },

  // "Menace". Adventure: Twice the Rage.
  'Two-Headed Hunter': {},

  // "You may discard a card. If you do, draw two cards. Create a Wicked Role token attached to up to one target creature you
  // control."
  "Witch's Mark": {
    spell: {
      targets: [upToOne(yourCreature)],
      effects: [mayDiscardToDraw(2), createRole('Wicked')],
    },
  },

  // "This spell costs {1} less to cast for each creature that attacked this turn." "Witchstalker Frenzy deals 5 damage to target
  // creature."
  'Witchstalker Frenzy': {
    costReduction: creaturesAttackedThisTurn,
    spell: { targets: [creature], effects: [{ kind: 'damage', amount: 5, to: t0 }] },
  },
};

/** Back faces: keyed by their own names. */
export const WOE_RED_BACKS: Record<string, Behavior> = {
  // Bellowing Bruiser: "Up to two target creatures can't block this turn."
  'Beat a Path': {
    spell: {
      targets: [upToOne(creature), upToOne(creature)],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, cantBlock: true },
        { kind: 'pump', to: t1, power: 0, toughness: 0, cantBlock: true },
      ],
    },
  },
  // Grabby Giant: "Create a Treasure token."
  "That's Mine": { spell: { targets: [], effects: [treasure] } },
  // Imodane's Recruiter: "Create two 2/2 white Knight creature tokens with vigilance."
  'Train Troops': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: KNIGHT, count: 2 }] },
  },
  // Kellan, the Fae-Blooded: "Search your library for an Aura or Equipment card, reveal it, put it into your hand, then shuffle."
  'Birthright Boon': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { anyOf: [{ subtype: 'Aura' }, { subtype: 'Equipment' }] },
          to: 'hand',
          reveal: true,
        },
      ],
    },
  },
  // Minecart Daredevil: "Target creature gets +2/+1 until end of turn."
  'Ride the Rails': { spell: { targets: [creature], effects: [pump(t0, 2, 1)] } },
  // Picnic Ruiner: "Distribute three +1/+1 counters among any number of target creatures you control."
  'Stolen Goodies': {
    spell: {
      targets: [],
      effects: [{ kind: 'divide', amount: 3, maxTargets: 3, spec: yourCreature, give: 'counters' }],
    },
  },
  // Ratcatcher Trainee: "Create two 1/1 black Rat creature tokens with 'This token can't block.'"
  'Pest Problem': {
    spell: { targets: [], effects: [{ kind: 'createToken', token: RAT, count: 2 }] },
  },
  // Scalding Viper: "Return target nonland permanent to its owner's hand."
  'Steam Clean': {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }],
    },
  },
  // Two-Headed Hunter: "Target creature gains double strike until end of turn."
  'Twice the Rage': {
    spell: { targets: [creature], effects: [pump(t0, 0, 0, ['doubleStrike'])] },
  },
};

/** Tokens only this group's cards make (the Rat is black.ts's, the Knight white.ts's). */
export const WOE_RED_TOKENS: CardDefinition[] = [];
