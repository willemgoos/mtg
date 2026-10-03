import type { Behavior } from '../build.ts';
import { combos } from '../msc/helpers.ts';
import {
  condition,
  creature,
  custom,
  draw,
  gain,
  mana,
  mode,
  onEnter,
  permanent,
  spell,
  staticAbility,
  t0,
  token,
  when,
  yourCreature,
} from './helpers.ts';

/**
 * Scions & Spellcraft (12d), the Arena Store Brawl deck led by Y'shtola,
 * Night's Blessed (W/U/B): noncreature spells. Its cards that aren't Final
 * Fantasy booster cards or shared lands.
 */

export const YSHTOLA: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  "Y'shtola, Night's Blessed": {
    abilities: [
      {
        ...when({ on: 'beginningOfEndStep', whose: 'each' }, [], draw(1)),
        condition: condition('someoneLostFour'),
      },
      when(
        { on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 3 } },
        [],
        { kind: 'damage', amount: 2, to: 'eachOpponent' },
        gain(2),
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  // Magecraft: copies of spells don't count (a simplification).
  'Archmage Emeritus': {
    abilities: [when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], draw(1))],
  },
  'Baleful Strix': { abilities: [onEnter([], draw(1))] },
  "G'raha Tia, Scion Reborn": {
    abilities: [
      {
        ...when({ on: 'castSpell', filter: 'noncreature' }, [], custom('grahaHero')),
        optional: true,
        oncePerTurn: true,
      },
    ],
  },
  'Hypnotic Sprite': {},
  'Murderous Rider': {
    abilities: [when({ on: 'dies' }, [], custom('sourceToLibraryBottom'))],
  },
  'Torrential Gearhulk': {
    abilities: [
      onEnter(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Instant'] },
            optional: true,
          },
        ],
        { kind: 'castFree', what: t0, exileAfter: true },
      ),
    ],
  },
  // ------------------------------------------------------------ other permanents
  'Authority of the Consuls': {
    abilities: [
      staticAbility({ kind: 'opponentCreaturesEnterTapped' }),
      {
        ...when({ on: 'otherCreatureEtb', controller: 'any' }, [], gain(1)),
        condition: condition('subjectIsOpponents'),
      },
    ],
  },
  // ------------------------------------------------------------ spells
  'Crux of Fate': {
    modes: [
      mode('Destroy all Dragons', [], { kind: 'destroyAll', filter: { subtype: 'Dragon' } }),
      mode('Destroy all non-Dragons', [], { kind: 'destroyAll', filter: { notSubtype: 'Dragon' } }),
    ],
  },
  'Dig Through Time': {
    delve: true,
    // The engine picks the two cards (a land if short of lands, then the most expensive).
    ...spell([], custom('lookTakeRestBottom', { count: 7, take: 2 })),
  },
  Exsanguinate: spell(
    [],
    { kind: 'loseLife', who: 'eachOpponent', amount: { x: true } },
    gain({ x: true }),
  ),
  'Into the Story': {
    costReductionIf: { condition: condition('opponentGraveyardSeven'), amount: 3 },
    ...spell([], draw(4)),
  },
  'Lingering Souls': {
    flashback: mana('{1}{B}'),
    ...spell([], token('spirit-flying-token', 2)),
  },
  'Rite of Replication': {
    ...spell([creature], { kind: 'tokenCopy', of: t0 }),
    kicker: {
      cost: mana('{5}'),
      spell: { targets: [creature], effects: [{ kind: 'tokenCopy', of: t0, count: 5 }] },
    },
  },
  'Sublime Epiphany': {
    // "Counter target activated or triggered ability" isn't offered (abilities aren't targets here).
    modes: combos(
      [
        mode('Counter target spell', [{ what: 'spell' }], { kind: 'counter', what: t0 }),
        mode('Return a nonland permanent', [permanent({ nonland: true })], {
          kind: 'bounce',
          what: t0,
        }),
        mode('Copy a creature you control', [yourCreature], { kind: 'tokenCopy', of: t0 }),
        mode('Draw a card', [], draw(1)),
      ],
      [1, 2, 3, 4],
    ),
  },
  'Void Rend': spell([permanent({ nonland: true })], { kind: 'destroy', what: t0 }),
};

/** Adventure halves (back faces). */
export const YSHTOLA_BACK_FACES: Record<string, Behavior> = {
  'Mesmeric Glare': spell([{ what: 'spell', filter: { maxManaValue: 3 } }], {
    kind: 'counter',
    what: t0,
  }),
  'Swift End': spell(
    [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
    { kind: 'destroy', what: t0 },
    { kind: 'loseLife', who: 'controller', amount: 2 },
  ),
};
