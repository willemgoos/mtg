import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, mana, onEnter, pump, t0, when, yourCreature } from '../blb/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { grantHarmonize, harmonize, mobilize } from '../tdm-vocab.ts';
import { TDM_ELEPHANT } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): the Mardu and Temur cards (the other clans and the five-colour one are in clans.ts). Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_CLANS_B_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

/** The 4/4 red Dragon with flying that Dragonback Assault makes. */
const DRAGON_TOKEN = 'tdm-clans-b-dragon-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });
const opponentCreature: TargetSpec = { what: 'creature', controller: 'opponent' };

/** "Whenever a creature you control enters this turn, each opponent loses 1 life and you gain 1 life." */
const drainOnCreatureEntering: EffectDef = {
  kind: 'emblem',
  until: 'endOfTurn',
  label: 'Whenever a creature you control enters this turn, each opponent loses 1 life and you gain 1 life.',
  ability: when(
    { on: 'otherCreatureEtb', controller: 'you' },
    [],
    { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
    gain(1),
  ),
};

export const TDM_CLANS_B: Record<string, Behavior> = {
  // ------------------------------------------------------------------ Mardu (R/W/B)
  // "... there is an additional combat phase after this phase followed by an additional main phase. When you next attack this
  // turn, untap each creature you control."
  'All-Out Assault': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 1,
          toughness: 1,
          keywords: ['deathtouch'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'yourStep', steps: ['main1', 'main2'] },
        targets: [],
        effects: [
          { kind: 'extraCombatThenMain' },
          {
            kind: 'emblem',
            until: 'endOfTurn',
            once: true,
            label: 'When you next attack this turn, untap each creature you control.',
            ability: when({ on: 'youAttack' }, [], {
              kind: 'untap',
              what: { each: 'creature', controller: 'you' },
            }),
          },
        ],
      },
    ],
  },

  'Bone-Cairn Butcher': {
    abilities: [
      mobilize(2),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { attacking: true, token: true },
          power: 0,
          toughness: 0,
          keywords: ['deathtouch'],
        },
      },
    ],
  },

  'Defibrillating Current': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [{ kind: 'damage', amount: 4, to: t0 }, gain(2)],
    },
  },

  // "This spell can't be countered."
  'Inevitable Defeat': {
    uncounterable: true,
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'loseLife', who: { controllerOf: 0 }, amount: 3 },
        gain(3),
      ],
    },
  },

  // "If a creature you control that entered this turn would deal damage, it deals twice that much damage instead."
  'Neriv, Heart of the Storm': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'doubleDamage', source: { types: ['Creature'], enteredThisTurn: true } },
      },
    ],
  },

  // "When this creature enters, target creature gets +1/+0 and gains indestructible until end of turn."
  'Reigning Victor': {
    abilities: [
      mobilize(1),
      when({ on: 'etb' }, [{ what: 'creature' }], pump(t0, 1, 0, ['indestructible'])),
    ],
  },

  // "... it deals 2 damage to any target and you gain 2 life. If a player is dealt damage this way, they discard a card."
  'Sonic Shrieker': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'any' }],
        { kind: 'damage', amount: 2, to: t0, from: 'self' },
        gain(2),
        {
          kind: 'if',
          condition: { kind: 'targetPlayerDamagedBySource', target: 0 },
          then: [{ kind: 'discard', count: 1, of: t0 }],
        },
      ),
    ],
  },

  'Thunder of Unity': {
    saga: 3,
    abilities: [
      chapter([1], [], draw(2), { kind: 'loseLife', who: 'controller', amount: 2 }),
      chapter([2, 3], [], drainOnCreatureEntering),
    ],
  },

  // "When this creature enters, exile up to one other target creature you control until this creature leaves the battlefield.
  // Whenever this creature attacks, for each opponent, create a tapped token that's a copy of the exiled card attacking that
  // opponent. At the beginning of your next end step, sacrifice those tokens."
  'Mardu Siegebreaker': {
    abilities: [
      when(
        { on: 'etb' },
        [{ ...yourCreature, filter: { other: true }, optional: true }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      when({ on: 'attacks' }, [], custom('tdmSiegebreakerCopy')),
    ],
  },

  // "During your end step, Warrior tokens you control have 'This token can't be sacrificed.'"
  "Zurgo, Thunder's Decree": {
    abilities: [
      mobilize(2),
      {
        kind: 'static',
        effect: {
          kind: 'cantBeSacrificed',
          filter: { token: true, subtype: 'Warrior' },
          duringYourEndStep: true,
        },
      },
    ],
  },

  // ------------------------------------------------------------------ Temur (G/U/R)
  // "When this enchantment enters, it deals 3 damage to each creature and each planeswalker.
  // Landfall — Whenever a land you control enters, create a 4/4 red Dragon creature token with flying."
  'Dragonback Assault': {
    abilities: [
      onEnter(
        { kind: 'damage', amount: 3, to: { each: 'creature' } },
        { kind: 'damage', amount: 3, to: { each: 'permanent', filter: { types: ['Planeswalker'] } } },
      ),
      when({ on: 'landfall' }, [], token(DRAGON_TOKEN)),
    ],
  },

  // "Double the power and toughness of target creature you control until end of turn. Then it fights up to one target creature
  // an opponent controls."
  'Dragonclaw Strike': {
    spell: {
      targets: [yourCreature, { ...opponentCreature, optional: true }],
      effects: [
        {
          kind: 'pump',
          to: t0,
          power: { powerOf: t0 },
          toughness: { toughnessOf: t0 },
        },
        { kind: 'fight', a: t0, b: { target: 1 } },
      ],
    },
  },

  // "At the beginning of combat on your turn, if you've cast both a creature spell and a noncreature spell this turn, draw a
  // card and put two +1/+1 counters on Eshki Dragonclaw."
  'Eshki Dragonclaw': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [draw(1), { kind: 'counters', to: 'self', amount: 2 }],
        condition: {
          kind: 'all',
          of: [
            { kind: 'spellsCastThisTurn', min: 1, filter: { types: ['Creature'] } },
            { kind: 'spellsCastThisTurn', min: 1, filter: { notTypes: ['Creature'] } },
          ],
        },
      },
    ],
  },

  // "This creature has hexproof as long as it hasn't dealt damage yet."
  'Karakyk Guardian': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'not', condition: { kind: 'sourceDealtDamage' } },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },

  'Mammoth Bellow': {
    spell: { targets: [], effects: [token(TDM_ELEPHANT)] },
    ...harmonize(mana('{5}{G}{U}{R}')),
  },

  'Roar of Endless Song': {
    saga: 3,
    abilities: [
      chapter([1, 2], [], token(TDM_ELEPHANT)),
      chapter([3], [], custom('tdmDoubleYourCreatures')),
    ],
  },

  // "When this creature enters, target instant or sorcery card in your graveyard gains harmonize until end of turn. Its harmonize
  // cost is equal to its mana cost."
  'Songcrafter Mage': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Instant', 'Sorcery'] },
          },
        ],
        grantHarmonize,
      ),
    ],
  },

  // "During your turn, spells you cast cost {1} less to cast for each creature you control with power 4 or greater."
  'Temur Battlecrier': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: {},
          amount: { count: 'permanentsYouControl', filter: { types: ['Creature'], minPower: 4 } },
          condition: { kind: 'yourTurn' },
        },
      },
    ],
  },

  // "When this creature enters, draw a card, then discard a card."
  'Temur Tawnyback': {
    abilities: [onEnter(draw(1), { kind: 'discard', count: 1 })],
  },

  // "When Ureni enters, it deals X damage divided as you choose among any number of target creatures and/or planeswalkers your
  // opponents control, where X is the number of lands you control." Chosen one target at a time as it resolves, like Iron Fist.
  'Ureni, the Song Unending': {
    abilities: [
      onEnter({
        kind: 'divide',
        amount: { count: 'landsYouControl' },
        maxTargets: 99,
        spec: {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'] },
        },
        give: 'damage',
      }),
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_CLANS_B_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_CLANS_B_TOKENS: CardDefinition[] = [
  // A 4/4 red Dragon creature token with flying (Dragonback Assault).
  {
    id: DRAGON_TOKEN,
    name: 'Dragon',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Dragon'],
    power: 4,
    toughness: 4,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
