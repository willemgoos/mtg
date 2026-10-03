import type { Behavior } from '../build.ts';
import { activated, batch, custom, oncePerTurn, staticAbility, when } from './helpers.ts';

/**
 * Brawl Emet-Selch of the Third Seat (12f), the Arena Store Brawl deck (U/B):
 * spells from the graveyard. Its cards that aren't Final Fantasy booster
 * cards or shared lands.
 */

export const EMET_SELCH: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Emet-Selch of the Third Seat': {
    abilities: [
      staticAbility({ kind: 'graveyardSpellsCostLess', amount: 2 }),
      // "You may cast target instant or sorcery card from your graveyard": castable for the rest of the
      // turn (a simplification); its "exile it instead" isn't built.
      oncePerTurn(
        batch({
          ...when(
            { on: 'opponentLosesLife' },
            [
              {
                what: 'graveyardCard',
                controller: 'you',
                filter: { types: ['Instant', 'Sorcery'] },
                optional: true,
              },
            ],
            custom('castLaterFromGraveyard'),
          ),
        }),
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Lulu, Stern Guardian': {
    abilities: [
      when(
        { on: 'opponentAttacks', min: 1 },
        [{ what: 'creature', controller: 'opponent', filter: { attacking: true } }],
        { kind: 'namedCounters', name: 'stun', amount: 1, to: { target: 0 } },
      ),
      activated('{3}{U}', {}, [], [custom('proliferate')]),
    ],
  },
  'Rikku, Resourceful Guardian': {
    abilities: [
      when({ on: 'youPutCounters' }, [], {
        kind: 'pump',
        to: 'subject',
        power: 0,
        toughness: 0,
        cantBeBlocked: true,
      }),
      activated(
        '{1}',
        { tapSelf: true },
        [
          { what: 'creature', controller: 'opponent', filter: { hasCounters: true } },
          { what: 'creature', controller: 'you' },
        ],
        [custom('moveCounter')],
        { sorcerySpeed: true, label: 'Steal' },
      ),
    ],
  },
};
