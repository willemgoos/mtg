import type { AbilityDef, CardDefinition, ConditionDef, EffectDef, SpellDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { anyColor, mana, t0, t1, when } from '../blb/helpers.ts';
import { tapFor } from '../msc/helpers.ts';
import { INKLING } from './silverquill.ts';
import { SPIRIT } from './lorehold.ts';

/**
 * Strixhaven (13c, group D): the remaining red, colourless and land cards of the
 * set (rares and mythics included). Printed characteristics come from Scryfall;
 * only rules text lives here. No deck changes.
 */

const ELEMENTAL = 'stx-elemental-ur-token';

/** No tokens of its own: the Spirit, Inkling and Elemental come from the college files. */
export const RARES_D_TOKENS: CardDefinition[] = [];

const token = (id: string): EffectDef => ({ kind: 'createToken', token: id, count: 1 });
const instantOrSorcery = { types: ['Instant' as const, 'Sorcery' as const] };
const nonDragons = { each: 'creature', filter: { notSubtype: 'Dragon' } } as const;

/** Magecraft: "whenever you cast or copy an instant or sorcery spell". */
const magecraft = (...effects: EffectDef[]): AbilityDef =>
  when({ on: 'castSpell', filter: 'instantOrSorcery', orCopy: true }, [], ...effects);

/** "Search your library for up to three cards, put them into your hand, shuffle." */
const searchThree: EffectDef[] = [
  { kind: 'searchLibrary', filter: {}, to: 'hand', shuffle: false },
  { kind: 'searchLibrary', filter: {}, to: 'hand', shuffle: false },
  { kind: 'searchLibrary', filter: {}, to: 'hand' },
  { kind: 'custom', handler: 'discardAtRandom', params: { count: 3 } },
];

/** Exactly zero or exactly seven cards in hand (The Biblioplex). */
const zeroOrSeven: ConditionDef = {
  kind: 'any',
  of: [
    { kind: 'not', condition: { kind: 'handSize', min: 1 } },
    {
      kind: 'all',
      of: [
        { kind: 'handSize', min: 7 },
        { kind: 'not', condition: { kind: 'handSize', min: 8 } },
      ],
    },
  ],
};

const fervent: SpellDef = { targets: [], effects: searchThree };

export const RARES_D: Record<string, Behavior> = {
  'Ardent Dustspeaker': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'graveyardCardToLibraryBottom',
        filter: instantOrSorcery,
        then: [{ kind: 'exileTopPlayable', count: 2, until: 'endOfTurn' }],
      }),
    ],
  },
  'Blood Age General': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', filter: { subtype: 'Spirit', attacking: true } },
            power: 1,
            toughness: 0,
          },
        ],
      },
    ],
  },
  'Conspiracy Theorist': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'may',
        cost: mana('{1}'),
        effects: [
          { kind: 'discard', count: 1 },
          { kind: 'draw', who: 'controller', amount: 1 },
        ],
      }),
      // Simplified: it asks once for each nonland card discarded, not once for a batch.
      when({ on: 'youDiscard', filter: { nonland: true } }, [], {
        kind: 'may',
        effects: [{ kind: 'exileDiscarded', playable: true }],
      }),
    ],
  },
  'Crackle with Power': {
    upToXTargets: true,
    spell: {
      targets: [{ what: 'any' }, { what: 'any', optional: true }, { what: 'any', optional: true }],
      effects: [
        { kind: 'damage', amount: { x: true, times: 5 }, to: t0 },
        { kind: 'damage', amount: { x: true, times: 5 }, to: t1 },
        { kind: 'damage', amount: { x: true, times: 5 }, to: { target: 2 } },
      ],
    },
  },
  'Draconic Intervention': {
    exileFromGraveyardToCast: instantOrSorcery,
    afterResolving: 'exile',
    spell: {
      targets: [],
      effects: [
        { kind: 'pump', to: nonDragons, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: { x: true }, to: nonDragons },
      ],
    },
  },
  "Dragon's Approach": {
    spell: {
      targets: [],
      effects: [
        { kind: 'damage', amount: 3, to: 'eachOpponent' },
        {
          kind: 'if',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'cardsInGraveyard', named: 'dragons-approach' },
            min: 4,
          },
          then: [
            {
              kind: 'may',
              effects: [
                { kind: 'custom', handler: 'dragonsApproachExile' },
                {
                  kind: 'searchLibrary',
                  filter: { types: ['Creature'], subtype: 'Dragon' },
                  to: 'battlefield',
                },
              ],
            },
          ],
        },
      ],
    },
  },
  'Explosive Welcome': {
    spell: {
      targets: [{ what: 'any' }, { what: 'any' }],
      effects: [
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'damage', amount: 3, to: t1 },
        { kind: 'addMana', mana: [['R'], ['R'], ['R']] },
      ],
    },
  },
  'Fervent Mastery': {
    spell: fervent,
    kicker: {
      cost: mana('{2}{R}{R}'),
      replacesCost: true,
      spell: {
        targets: [],
        effects: [{ kind: 'discardAnyThenDraw', who: 'eachOpponent' }, ...searchThree],
      },
    },
  },
  'First Day of Class': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'emblem',
          until: 'thisTurn',
          ability: when(
            { on: 'otherCreatureEtb', controller: 'you' },
            [],
            { kind: 'counters', to: 'subject', amount: 1 },
            { kind: 'pump', to: 'subject', power: 0, toughness: 0, keywords: ['haste'] },
          ),
        },
        { kind: 'learn' },
      ],
    },
  },
  'Grinning Ignus': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{R}'), returnSelfToHand: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'addMana', mana: [['C'], ['C'], ['R']] }],
      },
    ],
  },
  'Illuminate History': {
    spell: {
      targets: [],
      effects: [
        { kind: 'discardAnyThenDraw', who: 'controller' },
        {
          kind: 'if',
          condition: { kind: 'graveyardCount', min: 7 },
          then: [token(SPIRIT)],
        },
      ],
    },
  },
  'Access Tunnel': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { maxPower: 3 } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Archway Commons': {
    entersTapped: true,
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'payOrElse',
        who: 'controller',
        cost: mana('{1}'),
        otherwise: [{ kind: 'sacrifice', what: 'self' }],
      }),
      ...anyColor(),
    ],
  },
  'Hall of Oracles': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']] }],
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        condition: { kind: 'castInstantOrSorceryThisTurn' },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Letter of Acceptance': {
    abilities: [
      ...anyColor(),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Mascot Exhibition': {
    spell: { targets: [], effects: [token(INKLING), token(SPIRIT), token(ELEMENTAL)] },
  },
  'Reflective Golem': {
    abilities: [
      // Simplified: the copy keeps the original targets (no new targets for the copy).
      when({ on: 'castSpell', filter: 'targetsOnlySelf', spell: instantOrSorcery }, [], {
        kind: 'may',
        cost: mana('{2}'),
        effects: [{ kind: 'copySpell', what: 'subject' }],
      }),
    ],
  },
  'Spell Satchel': {
    abilities: [
      magecraft({ kind: 'namedCounters', name: 'book', amount: 1 }),
      {
        kind: 'mana',
        cost: { tapSelf: true, removeCounters: { name: 'book', count: 1 } },
        produces: 'C',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, removeCounters: { name: 'book', count: 3 } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Strixhaven Stadium': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C', addCounter: 'point' },
      when({ on: 'combatDamageToYou' }, [], { kind: 'custom', handler: 'stadiumRemove' }),
      when({ on: 'creatureYouControlDealsCombatDamage', toPlayer: true }, [], {
        kind: 'custom',
        handler: 'stadiumPoint',
      }),
    ],
  },
  'The Biblioplex': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        condition: zeroOrSeven,
        targets: [],
        effects: [
          {
            kind: 'lookAndTake',
            count: 1,
            filter: instantOrSorcery,
            restOnTop: true,
            canBin: true,
          },
        ],
      },
    ],
  },
  'Wandering Archaic': {
    abilities: [
      // Simplified: the copy keeps the original spell's targets.
      when({ on: 'castSpell', filter: 'instantOrSorcery', caster: 'opponent' }, [], {
        kind: 'payOrElse',
        who: 'eachOpponent',
        cost: mana('{2}'),
        otherwise: [{ kind: 'may', effects: [{ kind: 'copySpell', what: 'subject' }] }],
      }),
    ],
  },
};

/** Back faces of the modal double-faced cards of this group. */
export const RARES_D_BACKS: Record<string, Behavior> = {
  // Wandering Archaic // Explore the Vastlands
  'Explore the Vastlands': {
    spell: {
      targets: [],
      effects: [
        { kind: 'lookTakeLandAndSpell', who: 'controller' },
        { kind: 'lookTakeLandAndSpell', who: 'eachOpponent' },
        { kind: 'gainLife', who: 'eachPlayer', amount: 3 },
      ],
    },
  },
};
