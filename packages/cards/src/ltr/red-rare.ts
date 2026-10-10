import type { CardDefinition, CardFilter, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { creature, t0, when } from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';
import { amassOrcs, historic, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): red rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_RED_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const LTR_SMAUG = 'ltr-smaug-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const goblinOrOrc: CardFilter = { subtypes: ['Goblin', 'Orc'] };
const instantOrSorcery: CardFilter = { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }] };

export const LTR_RED_RARE: Record<string, Behavior> = {
  // "This spell can't be copied." "Copy any number of target instant and/or sorcery spells. You may choose new targets for the
  // copies." (One copy for each target, each with its own choice of new targets.)
  'Display of Power': {
    cantBeCopied: true,
    spell: {
      targets: [{ what: 'spell', anyNumber: true, filter: instantOrSorcery }],
      effects: [custom('ltrDisplayOfPower')],
    },
  },

  // "Whenever a creature an opponent controls is dealt excess noncombat damage, amass Orcs X, where X is that excess damage."
  // "{7}{R}: This enchantment deals 7 damage to target creature."
  'Fall of Cair Andros': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'opponentCreaturesDealtExcessNoncombat' },
        targets: [],
        effects: [amassOrcs({ event: 'amount' })],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{7}{R}') },
        targets: [creature],
        effects: [{ kind: 'damage', amount: 7, to: t0 }],
      },
    ],
  },

  // "Whenever you cast a historic spell, create a Treasure token. This ability triggers only once each turn." "{T}, Sacrifice a
  // Treasure: Goad target creature."
  'Glóin, Dwarf Emissary': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: historic },
        targets: [],
        oncePerTurn: true,
        effects: [treasure],
      },
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificePermanent: { subtype: 'Treasure' } },
        targets: [creature],
        effects: [{ kind: 'mustAttack', what: t0 }],
      },
    ],
  },

  // "Sacrifice any number of lands. Reveal the top X cards of your library, where X is the number of lands sacrificed this way.
  // Choose any number of artifact and/or land cards revealed this way. Put all nonland cards chosen this way onto the battlefield,
  // then put all land cards chosen this way onto the battlefield tapped, then put the rest on the bottom of your library in a random
  // order." (The lands and the cards are chosen one at a time.)
  'Hew the Entwood': spell([], custom('ltrHewSacrificeStep', { n: 0 })),

  // "Double strike" "Whenever a Goblin or Orc you control deals combat damage to a player, exile the top card of your library. You
  // may play that card this turn."
  'Moria Marauder': {
    abilities: [
      when(
        { on: 'creatureYouControlDealsCombatDamage', toPlayer: true, filter: goblinOrOrc },
        [],
        { kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' },
      ),
    ],
  },

  // "When this enchantment enters, it deals X damage to each creature." "Whenever one or more creatures your opponents control die,
  // you create a Treasure token. This ability triggers only once each turn."
  'Spiteful Banditry': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'damage', amount: { x: true }, to: { each: 'creature' } }),
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'opponent' },
        targets: [],
        oncePerTurn: true,
        effects: [treasure],
      },
    ],
  },

  // "I — Up to one target creature can't block for as long as you control this Saga. The Ring tempts you. II — Search your library
  // for a Mountain card, put it onto the battlefield, then shuffle. III — Create Smaug, a legendary 6/6 red Dragon creature token
  // with flying, haste, and 'When Smaug dies, create fourteen Treasure tokens.'"
  'There and Back Again': {
    saga: 3,
    abilities: [
      chapter(
        [1],
        [{ what: 'creature', optional: true }],
        custom('ltrCantBlockWhileSaga'),
        ringTempts,
      ),
      chapter([2], [], {
        kind: 'searchLibrary',
        filter: { subtype: 'Mountain' },
        to: 'battlefield',
      }),
      chapter([3], [], { kind: 'createToken', token: LTR_SMAUG, count: 1 }),
    ],
  },

  // "Haste" "Whenever one or more other attacking legendary creatures you control die, untap all creatures you control. After this
  // phase, there is an additional combat phase. This ability triggers only once each turn."
  'Éomer, Marshal of Rohan': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'ltrAttackingLegendaryDies' },
        targets: [],
        oncePerTurn: true,
        effects: [
          { kind: 'untap', what: { each: 'creature', controller: 'you' } },
          { kind: 'extraCombat' },
        ],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_RED_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_RED_RARE_TOKENS: CardDefinition[] = [
  // Smaug (There and Back Again): a legendary 6/6 red Dragon creature token with flying and haste.
  {
    id: LTR_SMAUG,
    name: 'Smaug',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: ['Legendary'],
    subtypes: ['Dragon'],
    power: 6,
    toughness: 6,
    keywords: ['flying', 'haste'],
    abilities: [when({ on: 'dies' }, [], { kind: 'createToken', token: 'treasure-token', count: 14 })],
    isToken: true,
  },
];
