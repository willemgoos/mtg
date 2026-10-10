import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, t0, when, yourCreature } from '../blb/helpers.ts';
import { COLORS, tapFor } from '../msc/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): green rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_GREEN_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Radagast: look at the top X cards (X the entered creature's mana value), maybe take a creature that shares no type with yours. */
const radagastLook = (of: 'self' | 'subject'): EffectDef => ({
  kind: 'lookAndTake',
  count: { manaValueOf: of },
  filter: { types: ['Creature'], ltrNoSharedType: true },
  reveal: true,
});

export const LTR_GREEN_RARE: Record<string, Behavior> = {
  'Delighted Halfling': {
    // The printed "can't be countered" is about the spell the mana is spent on, not this card.
    uncounterable: false,
    abilities: [
      // "{T}: Add {C}."
      tapFor('C'),
      // "{T}: Add one mana of any color. Spend this mana only to cast a legendary spell, and that spell can't be countered."
      ...COLORS.map((c) => tapFor(c, { onlyFor: 'Legendary', uncounterableSpell: true })),
    ],
  },
  'Elven Chorus': {
    abilities: [
      // "You may look at the top card of your library any time. You may cast creature spells from the top of your library."
      { kind: 'static', effect: { kind: 'playFromTop', filter: { types: ['Creature'] } } },
      // "Creatures you control have '{T}: Add one mana of any color.'"
      {
        kind: 'static',
        effect: { kind: 'grantMana', filter: {}, produces: ['W', 'U', 'B', 'R', 'G'] },
      },
    ],
  },
  'Fall of Gil-galad': {
    saga: 3,
    abilities: [
      // "I - Scry 2."
      chapter([1], [], { kind: 'scry', amount: 2 }),
      // "II - Put two +1/+1 counters on target creature you control."
      chapter([2], [yourCreature], { kind: 'counters', to: t0, amount: 2 }),
      // "III - Until end of turn, target creature you control gains 'When this creature dies, draw two cards.' Then that creature
      // fights up to one other target creature."
      chapter(
        [3],
        [yourCreature, { what: 'creature', optional: true }],
        { kind: 'whenDiesThisTurn', what: t0, effects: [draw(2)], byLastController: true },
        { kind: 'fight', a: t0, b: { target: 1 } },
      ),
    ],
  },
  'Fangorn, Tree Shepherd': {
    abilities: [
      // "Treefolk you control have vigilance."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Treefolk' },
          power: 0,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
      // "Whenever one or more Treefolk you control attack, add twice that much {G}."
      when({ on: 'youAttackCounted', filter: { subtype: 'Treefolk' } }, [], {
        kind: 'addMana',
        mana: [['G']],
        count: { multiply: 2, amount: { event: 'amount' } },
      }),
      // "You don't lose unspent green mana as steps and phases end."
      { kind: 'static', effect: { kind: 'ltrKeepGreenMana' } },
    ],
  },
  'Last March of the Ents': {
    // "This spell can't be countered." (also set from the text)
    uncounterable: true,
    spell: {
      targets: [],
      effects: [
        // "Draw cards equal to the greatest toughness among creatures you control,"
        { kind: 'draw', who: 'controller', amount: { count: 'greatestToughnessYouControl' } },
        // "then put any number of creature cards from your hand onto the battlefield."
        custom('ltrLastMarch'),
      ],
    },
  },
  'Legolas, Master Archer': {
    abilities: [
      // "Whenever you cast a spell that targets Legolas, put a +1/+1 counter on Legolas."
      when({ on: 'castSpell', filter: 'targetsSelf' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
      // "Whenever you cast a spell that targets a creature you don't control, Legolas deals damage equal to its power to up to one
      // target creature."
      when(
        { on: 'castSpell', filter: 'ltrTargetsOtherCreature' },
        [{ what: 'creature', optional: true }],
        {
          kind: 'damage',
          amount: { powerOf: 'self' },
          to: t0,
          from: 'self',
        },
      ),
    ],
  },
  'Radagast the Brown': {
    abilities: [
      // "Whenever Radagast or another nontoken creature you control enters, look at the top X cards of your library, where X is that
      // creature's mana value. You may reveal a creature card that doesn't share a creature type with a creature you control from
      // among those cards and put it into your hand. Put the rest on the bottom of your library in a random order."
      when({ on: 'etb' }, [], radagastLook('self')),
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { nontoken: true } },
        [],
        radagastLook('subject'),
      ),
    ],
  },
  'The Ring Goes South': {
    spell: {
      targets: [],
      // "The Ring tempts you. Then reveal cards from the top of your library until you reveal X land cards, where X is the number of
      // legendary creatures you control. Put those land cards onto the battlefield tapped and the rest on the bottom of your library
      // in a random order."
      effects: [ringTempts, custom('ltrRingGoesSouth')],
    },
  },
};

/** Back faces: keyed by their own names. */
export const LTR_GREEN_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_GREEN_RARE_TOKENS: CardDefinition[] = [];
