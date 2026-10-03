import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, t0, t1 } from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';

/**
 * Strixhaven (13b): the Dimir Tide deck (U/B, no college). Mono-blue and
 * mono-black cards: card draw, removal, flyers and Learn. Reused cards live in
 * the other stx files; its Lessons are all shared with other STX decks.
 */

export const DIMIR_TOKENS: CardDefinition[] = [];

const learn: EffectDef = { kind: 'learn' };
const stun = (to: typeof t0 | typeof t1): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});

export const DIMIR: Record<string, Behavior> = {
  'Promising Duskmage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'amountAtLeast', amount: { countersOn: 'self' }, min: 1 },
            then: [draw(1)],
          },
        ],
      },
    ],
  },
  'Campus Guide': {
    abilities: [onEnter({ kind: 'searchLibrary', filter: 'basicLand', to: 'libraryTop' })],
  },
  // Simplified: always targets the opponent.
  'Go Blank': {
    spell: {
      targets: [],
      effects: [
        { kind: 'discard', count: 2, who: 'eachOpponent' },
        { kind: 'exileGraveyard', who: 'eachOpponent' },
      ],
    },
  },
  'Snow Day': {
    spell: {
      targets: [
        { what: 'creature', optional: true },
        { what: 'creature', optional: true },
      ],
      effects: [
        { kind: 'tap', what: t0 },
        { kind: 'tap', what: t1 },
        stun(t0),
        stun(t1),
        draw(2),
        { kind: 'discard', count: 1 },
      ],
    },
  },
  'Ingenious Mastery': {
    spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: { x: true } }] },
    kicker: {
      cost: mana('{2}{U}'),
      replacesCost: true,
      spell: {
        targets: [],
        effects: [
          draw(3),
          { kind: 'createToken', token: 'treasure-token', count: 2, forOpponent: true },
          { kind: 'scry', amount: 2, forOpponent: true },
        ],
      },
    },
  },
  "Poet's Quill": {
    abilities: [
      onEnter(learn),
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['lifelink'] },
      },
      equip('{1}{B}'),
    ],
  },
};
