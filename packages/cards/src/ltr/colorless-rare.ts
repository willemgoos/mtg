import type { Amount, CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { anyColor, atYourEndStep, draw, food, mana, t0, when } from '../blb/helpers.ts';
import { equip, tapFor } from '../msc/helpers.ts';
import { amassOrcs, entersTappedUnlessLegendary, legendaryCreature } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): colorless rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_COLORLESS_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const humanSoldier = (count: Amount): EffectDef => ({
  kind: 'createToken',
  token: 'hob-human-soldier-token',
  count,
});

export const LTR_COLORLESS_RARE: Record<string, Behavior> = {
  'Andúril, Flame of the West': {
    abilities: [
      // "Equipped creature gets +3/+1."
      { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 1 } },
      // "Whenever equipped creature attacks, create two tapped 1/1 white Spirit creature tokens with flying. If that creature is
      // legendary, instead create two of those tokens that are tapped and attacking."
      when({ on: 'equippedAttacks' }, [], {
        kind: 'if',
        condition: { kind: 'subjectMatches', filter: legendaryCreature },
        then: [
          {
            kind: 'createToken',
            token: 'ltr-spirit-token',
            count: 2,
            tapped: true,
            attacking: true,
          },
        ],
        else: [{ kind: 'createToken', token: 'ltr-spirit-token', count: 2, tapped: true }],
      }),
      // "Equip {2}"
      equip('{2}'),
    ],
  },
  'Barad-dûr': {
    ...entersTappedUnlessLegendary,
    abilities: [
      // "{T}: Add {B}."
      tapFor('B'),
      // "{X}{X}{B}, {T}: Amass Orcs X. Activate only if a creature died this turn."
      {
        kind: 'activated',
        cost: { mana: mana('{X}{X}{B}'), tapSelf: true },
        condition: { kind: 'creatureDiedThisTurn' },
        targets: [],
        effects: [amassOrcs({ x: true })],
      },
    ],
  },
  Glamdring: {
    abilities: [
      // "Equipped creature has first strike and gets +1/+0 for each instant and sorcery card in your graveyard."
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: { count: 'cardsInGraveyard', types: ['Instant', 'Sorcery'] },
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
      // "Whenever equipped creature deals combat damage to a player, you may cast an instant or sorcery spell from your hand with
      // mana value less than or equal to that damage without paying its mana cost."
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], {
        kind: 'castFree',
        what: 'self',
        from: 'hand',
        filter: { types: ['Instant', 'Sorcery'] },
        maxManaValue: { event: 'amount' },
      }),
      // "Equip {3}"
      equip('{3}'),
    ],
  },
  'Horn of Gondor': {
    abilities: [
      // "When Horn of Gondor enters, create a 1/1 white Human Soldier creature token."
      when({ on: 'etb' }, [], humanSoldier(1)),
      // "{3}, {T}: Create X 1/1 white Human Soldier creature tokens, where X is the number of Humans you control."
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        targets: [],
        effects: [humanSoldier({ count: 'permanentsYouControl', filter: { subtype: 'Human' } })],
      },
    ],
  },
  'Horn of the Mark': {
    abilities: [
      // "Whenever two or more creatures you control attack a player, look at the top five cards of your library. You may reveal a
      // creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order."
      when({ on: 'youAttackWithAtLeast', min: 2 }, [], {
        kind: 'lookAndTake',
        count: 5,
        filter: { types: ['Creature'] },
        reveal: true,
      }),
    ],
  },
  'Minas Tirith': {
    ...entersTappedUnlessLegendary,
    abilities: [
      // "{T}: Add {W}."
      tapFor('W'),
      // "{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more creatures this turn."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true },
        condition: { kind: 'ltrAttackedWith', count: 2 },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Mines of Moria': {
    ...entersTappedUnlessLegendary,
    abilities: [
      // "{T}: Add {R}."
      tapFor('R'),
      // "{3}{R}, {T}, Exile three cards from your graveyard: Create two Treasure tokens."
      {
        kind: 'activated',
        cost: { mana: mana('{3}{R}'), tapSelf: true, exileGraveyardCards: 3 },
        targets: [],
        effects: [{ kind: 'createToken', token: 'treasure-token', count: 2 }],
      },
    ],
  },
  'Mithril Coat': {
    abilities: [
      // Flash, indestructible.
      // "When Mithril Coat enters, attach it to target legendary creature you control."
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'you', filter: { supertypes: ['Legendary'] } }],
        {
          kind: 'attach',
          to: t0,
        },
      ),
      // "Equipped creature has indestructible."
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, keywords: ['indestructible'] },
      },
      // "Equip {3}"
      equip('{3}'),
    ],
  },
  'Mount Doom': {
    abilities: [
      // "{T}, Pay 1 life: Add {B} or {R}."
      tapFor('B', { cost: { tapSelf: true, life: 1 } }),
      tapFor('R', { cost: { tapSelf: true, life: 1 } }),
      // "{1}{B}{R}, {T}: Mount Doom deals 1 damage to each opponent."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}{R}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
      // "{5}{B}{R}, {T}, Sacrifice Mount Doom and a legendary artifact: Choose up to two creatures, then destroy the rest. Activate
      // only as a sorcery."
      {
        kind: 'activated',
        cost: {
          mana: mana('{5}{B}{R}'),
          tapSelf: true,
          sacrificeSelf: true,
          sacrificePermanent: { types: ['Artifact'], supertypes: ['Legendary'] },
        },
        sorcerySpeed: true,
        targets: [],
        effects: [custom('ltrMountDoom')],
      },
    ],
  },
  'Palantír of Orthanc': {
    abilities: [
      // "At the beginning of your end step, put an influence counter on Palantír of Orthanc and scry 2. Then target opponent may have
      // you draw a card. If that player doesn't, you mill X cards, where X is the number of influence counters on Palantír of Orthanc,
      // and that player loses life equal to the total mana value of those cards."
      atYourEndStep(
        undefined,
        [{ what: 'player', controller: 'opponent' }],
        { kind: 'namedCounters', name: 'influence', amount: 1 },
        { kind: 'scry', amount: 2 },
        {
          kind: 'choose',
          opponent: true,
          title: 'Palantír of Orthanc',
          options: [
            { label: 'Have them draw a card', effects: [draw(1)] },
            {
              label: "Don't: they mill cards and you lose life equal to their total mana value",
              effects: [custom('ltrPalantirMill')],
            },
          ],
        },
      ),
    ],
  },
  'Phial of Galadriel': {
    abilities: [
      // "If you would draw a card while you have no cards in hand, draw two cards instead."
      { kind: 'static', effect: { kind: 'ltrDrawTwiceEmptyHand' } },
      // "If you would gain life while you have 5 or less life, you gain twice that much life instead."
      { kind: 'static', effect: { kind: 'doubleLifeGain', maxLife: 5 } },
      // "{T}: Add one mana of any color."
      ...anyColor(),
    ],
  },
  Rivendell: {
    ...entersTappedUnlessLegendary,
    abilities: [
      // "{T}: Add {U}."
      tapFor('U'),
      // "{1}{U}, {T}: Scry 2. Activate only if you control a legendary creature."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}'), tapSelf: true },
        condition: { kind: 'controlsCreature', filter: { supertypes: ['Legendary'] } },
        targets: [],
        effects: [{ kind: 'scry', amount: 2 }],
      },
    ],
  },
  'Sting, the Glinting Dagger': {
    abilities: [
      // "Equipped creature gets +1/+1 and has haste." "Equipped creature has first strike as long as it's blocking or blocked by a
      // Goblin or Orc."
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 1,
          toughness: 1,
          keywords: ['haste'],
          combatKeywords: { filter: { subtypes: ['Goblin', 'Orc'] }, keywords: ['firstStrike'] },
        },
      },
      // "At the beginning of each combat, untap equipped creature."
      when({ on: 'beginningOfCombat', whose: 'each' }, [], { kind: 'untap', what: 'attached' }),
      // "Equip {2}"
      equip('{2}'),
    ],
  },
  'The One Ring': {
    abilities: [
      // Indestructible.
      // "When The One Ring enters, if you cast it, you gain protection from everything until your next turn."
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [],
        effects: [custom('ltrProtection')],
      },
      // "At the beginning of your upkeep, you lose 1 life for each burden counter on The One Ring."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [
          { kind: 'loseLife', who: 'controller', amount: { namedCountersOnSource: 'burden' } },
        ],
      },
      // "{T}: Put a burden counter on The One Ring, then draw a card for each burden counter on The One Ring."
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          { kind: 'namedCounters', name: 'burden', amount: 1 },
          { kind: 'draw', who: 'controller', amount: { namedCountersOnSource: 'burden' } },
        ],
      },
    ],
  },
  'The Shire': {
    ...entersTappedUnlessLegendary,
    abilities: [
      // "{T}: Add {G}."
      tapFor('G'),
      // "{1}{G}, {T}, Tap an untapped creature you control: Create a Food token."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}'), tapSelf: true, tapCreatures: 1 },
        targets: [],
        effects: [food],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_COLORLESS_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_COLORLESS_RARE_TOKENS: CardDefinition[] = [];
