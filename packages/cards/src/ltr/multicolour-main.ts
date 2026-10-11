import type { Amount, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { food, pump, t0, t1, theirCreature, when, yourCreature } from '../blb/helpers.ts';
import { HOB_HUMAN_SOLDIER } from '../hob/tokens.ts';
import { secondDraw } from '../msh/helpers.ts';
import {
  amassOrcs,
  isRingBearer,
  legendaryCreature,
  ringTempts,
  whenYouScry,
} from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): multicolour main-set uncommons outside the Jumpstart packets.
 * Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const creature: TargetSpec = { what: 'creature' };
const humanSoldier: EffectDef = { kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 1 };
const instantsAndSorceries = (ofTarget?: number): Amount => ({
  count: 'cardsInGraveyard',
  types: ['Instant', 'Sorcery'],
  ...(ofTarget !== undefined ? { ofTarget } : {}),
});
/** A spell's targets and effects. */
const spell = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });

export const LTR_MULTICOLOUR_MAIN: Record<string, Behavior> = {
  'Arwen Undómiel': {
    abilities: [
      // "Whenever you scry, put a +1/+1 counter on target creature."
      whenYouScry([{ kind: 'counters', to: t0, amount: 1 }], { targets: [creature] }),
      // "{4}{G}{U}: Scry 2."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{U}') },
        targets: [],
        effects: [{ kind: 'scry', amount: 2 }],
      },
    ],
  },
  'Bilbo, Retired Burglar': {
    abilities: [
      // "When Bilbo enters or leaves the battlefield, the Ring tempts you."
      when({ on: 'etb' }, [], ringTempts),
      when({ on: 'leavesBattlefield' }, [], ringTempts),
      // "Whenever Bilbo deals combat damage to a player, create a Treasure token."
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: 1,
      }),
    ],
  },
  'Butterbur, Bree Innkeeper': {
    abilities: [
      // "At the beginning of your end step, if you don't control a Food, create a Food token."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: {
          kind: 'not',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Food' }, min: 1 },
        },
        targets: [],
        effects: [food],
      },
    ],
  },
  'Denethor, Ruling Steward': {
    abilities: [
      // "At the beginning of your end step, if a creature died under your control this turn, create a 1/1 white Human Soldier
      // creature token."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'amountAtLeast', amount: { count: 'creaturesYouLostThisTurn' }, min: 1 },
        targets: [],
        effects: [humanSoldier],
      },
      // "{2}, Sacrifice another creature: Each opponent loses 1 life and you gain 1 life."
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificePermanent: { types: ['Creature'], other: true } },
        targets: [],
        effects: [
          { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
          { kind: 'gainLife', who: 'controller', amount: 1 },
        ],
      },
    ],
  },
  // "Target creature you control and up to one other target legendary creature you control each deal damage equal to their
  // power to target creature you don't control."
  'Friendly Rivalry': {
    spell: spell(
      [yourCreature, { ...yourCreature, optional: true, filter: legendaryCreature }, theirCreature],
      { kind: 'damage', amount: { powerOf: t0 }, to: { target: 2 }, from: t0 },
      { kind: 'damage', amount: { powerOf: t1 }, to: { target: 2 }, from: t1 },
    ),
  },
  'Frodo Baggins': {
    abilities: [
      // "Whenever Frodo Baggins or another legendary creature you control enters, the Ring tempts you."
      when({ on: 'selfOrCreatureEtb', filter: legendaryCreature }, [], ringTempts),
      // "As long as Frodo Baggins is your Ring-bearer, it must be blocked if able."
      { kind: 'static', effect: { kind: 'mustBeBlockedIfAble', condition: isRingBearer } },
    ],
  },
  // "Gandalf's Sanction deals X damage to target creature, where X is the number of instant and sorcery cards in your graveyard.
  // Excess damage is dealt to that creature's controller instead."
  "Gandalf's Sanction": {
    spell: spell([creature], {
      kind: 'damage',
      amount: instantsAndSorceries(),
      to: t0,
      excessToController: true,
    }),
  },
  // Flying, vigilance are printed.
  'Gwaihir the Windlord': {
    // "This spell costs {2} less to cast as long as you've drawn two or more cards this turn."
    costReductionIf: { condition: { kind: 'cardsDrawnThisTurn', min: 2 }, amount: 2 },
    abilities: [
      // "Other Birds you control have vigilance."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Bird' },
          power: 0,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
    ],
  },
  // Reach is printed.
  'Legolas, Counter of Kills': {
    abilities: [
      // "Whenever you scry, if Legolas is tapped, you may untap it. Do this only once each turn."
      whenYouScry([{ kind: 'untap', what: 'self' }], {
        condition: { kind: 'sourceTapped' },
        optional: true,
        oncePerTurn: true,
      }),
      // "Whenever a creature an opponent controls dies, put a +1/+1 counter on Legolas."
      when({ on: 'otherCreatureDies', controller: 'opponent' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  // Menace is printed.
  'Mauhúr, Uruk-hai Captain': {
    abilities: [
      // "If one or more +1/+1 counters would be put on an Army, Goblin, or Orc you control, that many plus one +1/+1 counters are
      // put on it instead."
      {
        kind: 'static',
        effect: {
          kind: 'extraCounters',
          amount: 1,
          filter: { anyOf: [{ subtype: 'Army' }, { subtype: 'Goblin' }, { subtype: 'Orc' }] },
        },
      },
    ],
  },
  'The Mouth of Sauron': {
    abilities: [
      // "When The Mouth of Sauron enters, target player mills three cards. Then amass Orcs X, where X is the number of instant and
      // sorcery cards in that player's graveyard."
      when(
        { on: 'etb' },
        [{ what: 'player' }],
        { kind: 'mill', count: 3, who: t0 },
        amassOrcs(instantsAndSorceries(0)),
      ),
    ],
  },
  'Old Man Willow': {
    // "Old Man Willow's power and toughness are each equal to the number of lands you control."
    ptEquals: { count: 'landsYouControl' },
    abilities: [
      // "Whenever Old Man Willow attacks, you may sacrifice another creature or a token. When you do, target creature an opponent
      // controls gets -2/-2 until end of turn."
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        optional: true,
        targets: [],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { anyOf: [{ types: ['Creature'], other: true }, { token: true }] },
            then: [{ kind: 'reflexiveTrigger', ability: 1 }],
          },
        ],
      },
      when({ on: 'reflexive' }, [theirCreature], pump(t0, -2, -2)),
    ],
  },
  'Prince Imrahil the Fair': {
    // "Whenever you draw your second card each turn, create a 1/1 white Human Soldier creature token."
    abilities: [secondDraw([], humanSoldier)],
  },
  // "The Ring tempts you. Search your library for a card that shares a color with a legendary creature you control, reveal it,
  // put it into your hand, then shuffle."
  Ringsight: {
    spell: spell([], ringTempts, {
      kind: 'searchLibrary',
      filter: { ltrSharesColorWithYourLegendary: true },
      to: 'hand',
    }),
  },
  // "Each player sacrifices a creature of their choice. If you sacrificed a creature this way, you may return another permanent
  // card from your graveyard to the battlefield."
  'Rise of the Witch-king': {
    spell: spell(
      [],
      {
        kind: 'opponentSacrifices',
        you: true,
        then: [
          {
            kind: 'returnFromGraveyard',
            types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'],
            exceptChosen: true,
            toBattlefield: true,
          },
        ],
      },
      { kind: 'opponentSacrifices' },
    ),
  },
  // "Create two tapped 1/1 white Spirit creature tokens with flying."
  'Shadow Summoning': {
    spell: spell([], { kind: 'createToken', token: 'ltr-spirit-token', count: 2, tapped: true }),
  },
  'Shadowfax, Lord of Horses': {
    abilities: [
      // "Horses you control have haste."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Horse' },
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      // "Whenever Shadowfax attacks, you may put a creature card with lesser power from your hand onto the battlefield tapped and
      // attacking."
      when({ on: 'attacks' }, [], { kind: 'chooseCustom', handler: 'ltrShadowfaxPut' }),
    ],
  },
  'Strider, Ranger of the North': {
    abilities: [
      // "Landfall — Whenever a land you control enters, target creature gets +1/+1 until end of turn. Then if that creature has
      // power 4 or greater, it gains first strike until end of turn."
      when({ on: 'landfall' }, [creature], pump(t0, 1, 1), {
        kind: 'if',
        condition: { kind: 'targetMatches', target: 0, filter: { minPower: 4 } },
        then: [pump(t0, 0, 0, ['firstStrike'])],
      }),
    ],
  },
  'Théoden, King of Rohan': {
    abilities: [
      // "Whenever Théoden or another Human you control enters, target creature gains double strike until end of turn."
      when(
        { on: 'selfOrCreatureEtb', filter: { subtype: 'Human' } },
        [creature],
        pump(t0, 0, 0, ['doubleStrike']),
      ),
    ],
  },
  'Uglúk of the White Hand': {
    abilities: [
      // "Whenever another creature you control dies, put a +1/+1 counter on Uglúk. If that creature was a Goblin or Orc, put two
      // +1/+1 counters on Uglúk instead."
      when({ on: 'otherCreatureDies', controller: 'you' }, [], {
        kind: 'if',
        condition: { kind: 'subjectHadSubtype', subtypes: ['Goblin', 'Orc'] },
        then: [{ kind: 'counters', to: 'self', amount: 2 }],
        else: [{ kind: 'counters', to: 'self', amount: 1 }],
      }),
    ],
  },
};

export const LTR_MULTICOLOUR_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_MULTICOLOUR_MAIN_TOKENS: CardDefinition[] = [];
