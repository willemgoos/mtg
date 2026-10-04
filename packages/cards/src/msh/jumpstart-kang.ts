import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { connive, draw, powerUp, t0, teamwork } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Kang Dynasty packet (docs/marvel-jumpstart.md): the cards it
// was missing. TVA Bureaucrat and Timeline Inquiry are shared with Analyzed, Victor Timely with Blink.

/** "Whenever you cast a noncreature spell, ..." */
const onNoncreature = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'noncreature' },
  targets: [],
  effects,
});

export const MSH_JUMPSTART_KANG: Record<string, Behavior> = {
  'TVA Bureaucrat': {
    abilities: [
      onNoncreature({ kind: 'pump', to: 'self', power: 1, toughness: 0, cantBeBlocked: true }),
    ],
  },
  'Immortus, Master of Eternity': {
    abilities: [
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'U',
        amountOf: { count: 'cardsDrawnThisTurn' },
        // No cards drawn: no mana (a mana ability otherwise makes at least one).
        condition: { kind: 'cardsDrawnThisTurn', min: 1 },
        onlyFor: 'Noncreature',
      },
      powerUp(
        '{5}{U}{U}',
        { kind: 'shuffleHandAndGraveyardIntoLibrary', who: 'eachPlayer' },
        { kind: 'draw', who: 'eachPlayer', amount: 7 },
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
  'Victor Timely, Wily Tycoon': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Artifact', 'Instant', 'Sorcery'], maxManaValue: 4 },
            optional: true,
          },
        ],
        effects: [{ kind: 'castFree', what: t0, exileAfter: true }],
      },
    ],
  },
  // Ward {2} comes from Scryfall.
  'Pharaoh Rama-Tut': { abilities: [onNoncreature(connive)] },
  'Timeline Inquiry': teamwork(
    2,
    { targets: [], effects: [draw(3), { kind: 'discard', count: 1 }] },
    { targets: [], effects: [draw(3)] },
  ),
};
