import type { CardDefinition, CardFilter, ConditionDef, EffectDef, Ref } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  atYourCombat,
  atYourEndStep,
  food,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';
import { cardsLookedAt, noRingBearer, ringTempts, whenYouScry } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): green cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_GREEN_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
const counter = (to: Ref, amount = 1): EffectDef => ({ kind: 'counters', to, amount });
/** "If you control a creature with power 4 or greater." */
const ferocious: ConditionDef = { kind: 'controlsCreature', filter: { minPower: 4 } };
const permanentCard: CardFilter = {
  types: ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'],
};
const stat = (power: number, toughness: number, keywords: ('reach' | 'trample')[] = []) =>
  ({
    kind: 'static',
    effect: {
      kind: 'attached',
      power,
      toughness,
      ...(keywords.length ? { keywords } : {}),
    },
  }) as const;

export const LTR_GREEN: Record<string, Behavior> = {
  // "Target creature you control gets +1/+1 and gains hexproof until end of turn. The Ring tempts you."
  "Bombadil's Song": {
    spell: {
      targets: [yourCreature],
      effects: [pump(t0, 1, 1, ['hexproof']), ringTempts],
    },
  },
  // "When this creature enters or leaves the battlefield, create a Food token."
  'Brandywine Farmer': {
    abilities: [onEnter(food), when({ on: 'leavesBattlefield' }, [], food)],
  },
  // "Whenever you attack with one or more Elves, scry 1. Whenever you scry, Celeborn gets +1/+1 until end of turn for each card
  // looked at while scrying this way."
  'Celeborn the Wise': {
    abilities: [
      when({ on: 'youAttack', filter: { subtype: 'Elf' } }, [], scry(1)),
      whenYouScry([pump('self', cardsLookedAt, cardsLookedAt)]),
    ],
  },
  // "Whenever you scry, put a +1/+1 counter on this creature. This ability triggers only once each turn."
  'Chance-Met Elves': {
    abilities: [whenYouScry([counter('self')], { oncePerTurn: true })],
  },
  // "Landfall - Whenever a land you control enters, if you don't control a Ring-bearer, the Ring tempts you."
  'Dúnedain Rangers': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        condition: noRingBearer,
        targets: [],
        effects: [ringTempts],
      },
    ],
  },
  // "When Elanor enters, create a Food token. At the beginning of your end step, if you sacrificed a Food this turn, you may
  // search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."
  'Elanor Gardner': {
    abilities: [
      onEnter(food),
      atYourEndStep({ kind: 'sacrificedFoodThisTurn' }, [], {
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      }),
    ],
  },
  // Trample. "When this creature enters, the Ring tempts you."
  'Enraged Huorn': { abilities: [onEnter(ringTempts)] },
  // "Put a +1/+1 counter on target creature you control if its power is 4 or greater. Then that creature gets +1/+1 until end of
  // turn and fights target creature you don't control."
  "Ent's Fury": {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { minPower: 4 } },
          then: [counter(t0)],
        },
        pump(t0, 1, 1),
        { kind: 'fight', a: t0, b: t1 },
      ],
    },
  },
  // "Sacrifice a land. Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. If
  // you control a creature with power 4 or greater, instead search your library for up to three basic land cards, put them onto
  // the battlefield tapped, then shuffle."
  'Entish Restoration': {
    spell: {
      targets: [],
      effects: [
        { kind: 'sacrificeSeveral', count: 1, filter: { types: ['Land'] }, then: [] },
        {
          kind: 'if',
          condition: ferocious,
          then: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', upTo: 3 }],
          else: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', upTo: 2 }],
        },
      ],
    },
  },
  // Flash. "When this Equipment enters, attach it to target creature you control. Untap that creature. Equipped creature gets
  // +1/+2 and has reach. Equip {2}"
  'Galadhrim Bow': {
    abilities: [
      when({ on: 'etb' }, [yourCreature], { kind: 'attach', to: t0 }, { kind: 'untap', what: t0 }),
      stat(1, 2, ['reach']),
      equip('{2}'),
    ],
  },
  // "When this creature enters, scry 2."
  'Galadhrim Guide': { abilities: [onEnter(scry(2))] },
  // Flash. Enchant creature. "When this Aura enters, scry 2. Enchanted creature gets +3/+3."
  'Gift of Strands': {
    enchant: { what: 'creature' },
    abilities: [onEnter(scry(2)), stat(3, 3)],
  },
  // "Whenever you scry, choose one and Glorfindel gets +1/+1 until end of turn. - Glorfindel must be blocked this turn if able.
  // - Glorfindel can't be blocked by more than one creature each combat this turn."
  'Glorfindel, Dauntless Rescuer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youScry' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Glorfindel must be blocked this turn if able',
            targets: [],
            effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1, mustBeBlocked: true }],
          },
          {
            label: "Glorfindel can't be blocked by more than one creature each combat this turn",
            targets: [],
            effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1, maxBlockers: 1 }],
          },
        ],
      },
    ],
  },
  // "Whenever this creature attacks, scry 1."
  'Lothlórien Lookout': { abilities: [when({ on: 'attacks' }, [], scry(1))] },
  // "Whenever one or more Halflings you control attack a player, create a Food token."
  'Meriadoc Brandybuck': {
    abilities: [
      when({ on: 'youAttack', filter: { subtype: 'Halfling' }, aPlayer: true }, [], food),
    ],
  },
  // "At the beginning of combat on your turn, target Elf you control gains trample and gets +X/+X until end of turn, where X is
  // the number of Forests you control."
  'Mirkwood Channeler': {
    abilities: [
      atYourCombat(
        [{ what: 'creature', controller: 'you', filter: { subtype: 'Elf' } }],
        pump(
          t0,
          { count: 'permanentsYouControl', filter: { subtype: 'Forest' } },
          { count: 'permanentsYouControl', filter: { subtype: 'Forest' } },
          ['trample'],
        ),
      ),
    ],
  },
  // Deathtouch. "Whenever this creature attacks, target legendary creature you control gains deathtouch until end of turn."
  'Mirkwood Spider': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'creature', controller: 'you', filter: { supertypes: ['Legendary'] } }],
        pump(t0, 0, 0, ['deathtouch']),
      ),
    ],
  },
  // "When this creature dies, the Ring tempts you."
  'Mirrormere Guardian': { abilities: [when({ on: 'dies' }, [], ringTempts)] },
  // "If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead.
  // Sacrifice three Foods: Draw a card."
  'Peregrin Took': {
    abilities: [
      { kind: 'static', effect: { kind: 'plusFoodToken' } },
      {
        kind: 'activated',
        cost: { sacrificeArtifacts: 3, sacrificeArtifactsFilter: { subtype: 'Food' } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  // "You may sacrifice a Food. If you do, target creature gets +4/+4 until end of turn. Otherwise, that creature gets +2/+2 until
  // end of turn."
  "Pippin's Bravery": {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'custom', handler: 'ltrPippinsBravery' }],
    },
  },
  // "Whenever Quickbeam or another Treefolk you control enters, up to two target creatures each get +2/+2 and gain trample until
  // end of turn."
  'Quickbeam, Upstart Ent': {
    abilities: [
      when(
        { on: 'etb' },
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        pump(t0, 2, 2, ['trample']),
        pump(t1, 2, 2, ['trample']),
      ),
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Treefolk' } },
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        pump(t0, 2, 2, ['trample']),
        pump(t1, 2, 2, ['trample']),
      ),
    ],
  },
  // "Return target permanent card from your graveyard to your hand. Create a Food token."
  'Revive the Shire': {
    spell: {
      targets: [{ what: 'graveyardCard', controller: 'you', filter: permanentCard }],
      effects: [{ kind: 'returnToHand', what: t0 }, food],
    },
  },
  // "Destroy target artifact, enchantment, or creature with flying. Scry 1."
  'Shower of Arrows': {
    spell: {
      targets: [
        {
          what: 'permanent',
          filter: {
            anyOf: [
              { types: ['Artifact'] },
              { types: ['Enchantment'] },
              { types: ['Creature'], hasKeyword: 'flying' },
            ],
          },
        },
      ],
      effects: [{ kind: 'destroy', what: t0 }, scry(1)],
    },
  },
  // "Target creature you control deals damage equal to its power to target creature you don't control. Create a Food token."
  'Stew the Coneys': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [{ kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 }, food],
    },
  },
  // "{T}: Add one mana of any color. {6}{G}, {T}: Another target creature gets +3/+3 and gains trample until end of turn."
  'Wose Pathfinder': {
    abilities: [
      ...anyColor(),
      {
        kind: 'activated',
        cost: { mana: mana('{6}{G}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { other: true } }],
        effects: [pump(t0, 3, 3, ['trample'])],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_GREEN_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_GREEN_TOKENS: CardDefinition[] = [];
