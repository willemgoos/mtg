import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  atYourCombat,
  atYourEndStep,
  creature,
  draw,
  gain,
  pump,
  t0,
  t1,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { mode, spell, tapFor } from '../fin/helpers.ts';
import { becomesPrepared, repartee } from './helpers.ts';
import { SOS_INKLING } from './silverquill.ts';

/**
 * Secrets of Strixhaven (14b, group A): the remaining white, Silverquill (W/B)
 * and Lorehold (R/W) cards. Printed characteristics come from Scryfall; only
 * rules text lives here. One-offs are `custom` handlers in
 * packages/engine/src/sos-14b-a-effects.ts.
 */

export const SOS_SPIRIT = 'sos-spirit-token';

/** The 2/2 red and white Spirit creature token. */
export const SOS_A_TOKENS: CardDefinition[] = [
  {
    id: SOS_SPIRIT,
    name: 'Spirit',
    manaCost: { generic: 0, colored: {} },
    colors: ['R', 'W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Spirit'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

const spirit = (count = 1): EffectDef => ({ kind: 'createToken', token: SOS_SPIRIT, count });
const inkling: EffectDef = { kind: 'createToken', token: SOS_INKLING, count: 1 };
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const yours = { each: 'creature', controller: 'you' } as const;
const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const otherYourCreature: TargetSpec = { ...yourCreature, filter: { other: true } };
const mill = (n = 1): EffectDef => ({ kind: 'mill', count: n });
const nonlandPermanentCard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { nonland: true, notTypes: ['Instant', 'Sorcery'] },
};

/** "Whenever one or more cards leave your graveyard, ..." */
const cardsLeave = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  ({ ...when({ on: 'cardsLeaveYourGraveyard' }, targets, ...effects), batch: true }) as AbilityDef;

/** "At the beginning of combat on your turn, exile up to one target card from a graveyard." */
const combatExile = atYourCombat([{ what: 'graveyardCard', optional: true }], {
  kind: 'exileGraveyardCard',
  what: t0,
});

/** "{cost}, exile this card from your graveyard / return it: ... Activate only as a sorcery." */
const fromGraveyard = (
  cost: { mana: ReturnType<typeof mana>; exileSelf?: boolean },
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  cost,
  fromGraveyard: true,
  sorcerySpeed: true,
  targets: [],
  effects,
});

export const SOS_A: Record<string, Behavior> = {
  // ------------------------------------------------------------------- white
  'Antiquities on the Loose': {
    flashback: mana('{4}{W}{W}'),
    spell: { targets: [], effects: [spirit(2)] },
    // Cast from anywhere other than your hand: a +1/+1 counter on each Spirit you control.
    flashbackSpell: {
      targets: [],
      effects: [
        spirit(2),
        {
          kind: 'counters',
          to: { each: 'creature', controller: 'you', filter: { subtype: 'Spirit' } },
          amount: 1,
        },
      ],
    },
  },
  'Ascendant Dustspeaker': {
    abilities: [
      when({ on: 'etb' }, [otherYourCreature], { kind: 'counters', to: t0, amount: 1 }),
      combatExile,
    ],
  },
  Flashback: spell(
    [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
    custom('grantFlashback'),
  ),
  Daydream: {
    flashback: mana('{2}{W}'),
    spell: { targets: [yourCreature], effects: [{ kind: 'blink', what: t0, counters: 1 }] },
  },
  'Dig Site Inventory': {
    flashback: mana('{W}'),
    spell: {
      targets: [yourCreature],
      effects: [{ kind: 'counters', to: t0, amount: 1 }, pump(t0, 0, 0, ['vigilance'])],
    },
  },
  'Emeritus of Truce': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'player' }],
        { kind: 'createToken', token: SOS_INKLING, count: 1, forControllerOf: 0 },
        {
          kind: 'if',
          condition: { kind: 'opponentHasMore', what: 'creatures' },
          then: [{ kind: 'prepare', what: 'self' }],
        },
      ),
    ],
  },
  'Ennis, Debate Moderator': {
    abilities: [
      when({ on: 'etb' }, [{ ...otherYourCreature, optional: true }], {
        kind: 'exileUntilEndStep',
        what: t0,
      }),
      atYourEndStep({ kind: 'cardsExiledThisTurn' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  Erode: spell(
    [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
    { kind: 'destroy', what: t0 },
    { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', forControllerOf: 0 },
  ),
  // Flashback: tap three untapped creatures you control.
  'Group Project': {
    flashback: { generic: 0, colored: {} },
    flashbackTapCreatures: 3,
    spell: { targets: [], effects: [spirit()] },
  },
  'Informed Inkwright': { abilities: [repartee([], inkling)] },
  'Joined Researchers': {
    abilities: [
      {
        ...when({ on: 'beginningOfEndStep', whose: 'each' }, [], { kind: 'prepare', what: 'self' }),
        condition: { kind: 'opponentHasMore', what: 'cards' },
      } as AbilityDef,
    ],
  },
  'Practiced Offense': {
    flashback: mana('{1}{W}'),
    spell: {
      targets: [{ what: 'player' }, creature],
      effects: [
        custom('countersOnTargetPlayersCreatures'),
        {
          kind: 'choose',
          options: [
            { label: 'Double strike', effects: [pump(t1, 0, 0, ['doubleStrike'])] },
            { label: 'Lifelink', effects: [pump(t1, 0, 0, ['lifelink'])] },
          ],
        },
      ],
    },
  },
  'Primary Research': {
    abilities: [
      when(
        { on: 'etb' },
        [{ ...nonlandPermanentCard, filter: { ...nonlandPermanentCard.filter, maxManaValue: 3 } }],
        { kind: 'returnToBattlefield', what: t0 },
      ),
      atYourEndStep({ kind: 'cardsLeftGraveyardThisTurn' }, [], draw(1)),
    ],
  },
  'Restoration Seminar': {
    paradigm: true,
    spell: {
      targets: [nonlandPermanentCard],
      effects: [{ kind: 'returnToBattlefield', what: t0 }],
    },
  },
  'Shattered Acolyte': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // As an additional cost: exile two cards from your graveyard or pay {1}{W} (the kicker).
  'Soaring Stoneglider': {
    kicker: { cost: mana('{1}{W}') },
    unkickedExilesGraveyard: 2,
  },
  'Spiritcall Enthusiast': {
    abilities: [becomesPrepared({ on: 'otherPermanentEtb', filter: { token: true } })],
  },
  'Stone Docent': {
    abilities: [fromGraveyard({ mana: mana('{W}'), exileSelf: true }, gain(2), surveil(1))],
  },
  'Summoned Dromedary': {
    abilities: [fromGraveyard({ mana: mana('{1}{W}') }, { kind: 'returnSource', to: 'hand' })],
  },

  // ---------------------------------------------------------- Silverquill (W/B)
  'Abigale, Poet Laureate': {
    abilities: [becomesPrepared({ on: 'castSpell', filter: 'creature' })],
  },
  "Fix What's Broken": {
    payXLife: true,
    spell: { targets: [], effects: [custom('returnEachWithManaValueX')] },
  },
  // Choose up to four, the same mode more than once: pawprint modes worth one each.
  'Moment of Reckoning': {
    pawBudget: 4,
    pawprints: [
      {
        paws: 1,
        spell: {
          label: 'Destroy',
          targets: [{ what: 'permanent', filter: { nonland: true } }],
          effects: [{ kind: 'destroy', what: t0 }],
        },
      },
      {
        paws: 1,
        spell: {
          label: 'Return',
          targets: [nonlandPermanentCard],
          effects: [{ kind: 'returnToBattlefield', what: t0 }],
        },
      },
    ],
  },
  'Nita, Forum Conciliator': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', spell: { notOwnedByController: true } }, [], {
        kind: 'counters',
        to: yours,
        amount: 1,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        sorcerySpeed: true,
        targets: [
          {
            what: 'graveyardCard',
            controller: 'opponent',
            filter: { types: ['Instant', 'Sorcery'] },
          },
        ],
        effects: [custom('nitaExile')],
      },
    ],
  },
  // Casualty 1, as a trigger: you may sacrifice a creature with power 1 or greater to copy the spell.
  'Silverquill, the Disputant': {
    abilities: [
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { types: ['Creature'], minPower: 1 },
            includeSource: true,
            then: [{ kind: 'copySpell', what: 'subject' }],
          },
        ],
      }),
    ],
  },
  'Social Snub': {
    spell: {
      targets: [],
      effects: [
        { kind: 'eachPlayerSacrifices' },
        { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
        gain(1),
      ],
    },
    abilities: [
      {
        ...when({ on: 'castSelf' }, [], {
          kind: 'may',
          effects: [{ kind: 'copySpell', what: 'subject' }],
        }),
        condition: { kind: 'controlsCreature', filter: { types: ['Creature'] } },
      } as AbilityDef,
    ],
  },
  'Stirring Honormancer': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'lookTakeRestGraveyard',
        count: { count: 'creaturesYouControl' },
        take: 1,
      }),
    ],
  },

  // ------------------------------------------------------------- Lorehold (R/W)
  'Ark of Hunger': {
    abilities: [
      cardsLeave([], { kind: 'damage', amount: 1, to: 'eachOpponent' }, gain(1)),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [custom('millAndMayPlay')],
      },
    ],
  },
  // Simplified: the copy keeps the original targets.
  'Aziza, Mage Tower Captain': {
    abilities: [
      {
        ...when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
          kind: 'may',
          effects: [custom('tapThreeCreatures'), { kind: 'copySpell', what: 'subject' }],
        }),
        condition: { kind: 'controlsCreature', filter: { tapped: false }, count: 3 },
      } as AbilityDef,
    ],
  },
  'Borrowed Knowledge': {
    modes: [
      {
        label: "Discard your hand, then draw cards equal to target opponent's hand",
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [
          { kind: 'discardHand' },
          { kind: 'draw', who: 'controller', amount: { count: 'opponentHandSize' } },
        ],
      },
      {
        label: 'Discard your hand, then draw that many cards',
        targets: [],
        effects: [custom('discardHandDrawThatMany')],
      },
    ],
  },
  'Colossus of the Blood Age': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'damage', amount: 3, to: 'eachOpponent' }, gain(3)),
      when({ on: 'dies' }, [], { kind: 'discardAnyThenDraw', who: 'controller', plus: 1 }),
    ],
  },
  'Hardened Academic': {
    abilities: [
      {
        kind: 'activated',
        cost: { discard: true },
        targets: [],
        effects: [pump('self', 0, 0, ['lifelink'])],
      },
      cardsLeave([yourCreature], { kind: 'counters', to: t0, amount: 1 }),
    ],
  },
  'Kirol, History Buff': {
    abilities: [
      { ...becomesPrepared({ on: 'cardsLeaveYourGraveyard' }), batch: true } as AbilityDef,
    ],
  },
  'Lorehold Charm': {
    modes: [
      mode('Each opponent sacrifices a nontoken artifact', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Artifact'], nontoken: true },
      }),
      mode(
        'Return an artifact or creature card with mana value 2 or less from your graveyard',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Artifact', 'Creature'], maxManaValue: 2 },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
      mode('Creatures you control get +1/+1 and gain trample', [], pump(yours, 1, 1, ['trample'])),
    ],
  },
  // Miracle {2} for instants and sorceries.
  'Lorehold, the Historian': {
    abilities: [
      { kind: 'static', effect: { kind: 'miracleCost', cost: mana('{2}') } },
      {
        ...when({ on: 'beginningOfUpkeep', whose: 'opponents' }, [], {
          kind: 'may',
          effects: [{ kind: 'discard', count: 1 }, draw(1)],
        }),
        condition: { kind: 'handSize', min: 1 },
      } as AbilityDef,
    ],
  },
  'Molten Note': {
    flashback: mana('{6}{R}{W}'),
    spell: {
      targets: [creature],
      effects: [
        { kind: 'damage', amount: { manaSpentOnSource: true }, to: t0 },
        { kind: 'untap', what: yours },
      ],
    },
  },
  'Practiced Scrollsmith': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { nonland: true, notTypes: ['Creature'] },
          },
        ],
        custom('exileCastUntilNextTurn'),
      ),
    ],
  },
  'Pursue the Past': {
    flashback: mana('{2}{R}{W}'),
    spell: {
      targets: [],
      effects: [
        gain(2),
        {
          kind: 'if',
          condition: { kind: 'handSize', min: 1 },
          then: [{ kind: 'may', effects: [{ kind: 'discard', count: 1 }, draw(2)] }],
        },
      ],
    },
  },
  'Spirit Mascot': {
    abilities: [cardsLeave([], { kind: 'counters', to: 'self', amount: 1 })],
  },
  'Startled Relic Sloth': { abilities: [combatExile] },
  'Suspend Aggression': spell(
    [{ what: 'permanent', filter: { nonland: true } }],
    custom('suspendAggression'),
  ),
  'Wilt in the Heat': {
    costReductionIf: { condition: { kind: 'cardsLeftGraveyardThisTurn' }, amount: 2 },
    spell: {
      targets: [creature],
      effects: [
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 5, to: t0 },
      ],
    },
  },
  'Fields of Strife': {
    entersTapped: true,
    abilities: [
      ...tapFor('R', 'W'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}{W}'), tapSelf: true },
        targets: [],
        effects: [surveil(1)],
      },
    ],
  },
  'Sundown Pass': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 2 },
    },
    abilities: tapFor('R', 'W'),
  },
};

/** Prepare spell faces, keyed `Spell (Creature)`. */
export const SOS_A_BACKS: Record<string, Behavior> = {
  'Swords to Plowshares (Emeritus of Truce)': spell(
    [creature],
    { kind: 'gainLife', who: { controllerOf: 0 }, amount: { powerOf: t0 } },
    { kind: 'exile', what: t0 },
  ),
  'Secret Rendezvous (Joined Researchers)': spell(
    [{ what: 'player', controller: 'opponent' }],
    draw(3),
    { kind: 'draw', who: t0, amount: 3 },
  ),
  'Scrollboost (Spiritcall Enthusiast)': spell(
    [creature, { ...creature, optional: true }],
    pump(t0, 2, 2),
    pump(t1, 2, 2),
  ),
  'Heroic Stanza (Abigale, Poet Laureate)': spell([creature], {
    kind: 'counters',
    to: t0,
    amount: 1,
  }),
  'Pack a Punch (Kirol, History Buff)': spell(
    [creature],
    mill(1),
    { kind: 'counters', to: t0, amount: 2 },
    pump(t0, 0, 0, ['trample']),
  ),
};
