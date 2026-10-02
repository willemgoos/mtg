import type { AbilityDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { connive, mana, onEnter, secondDraw, spell, t0, yourCreature } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) commons and uncommons not in our decks. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */

/** "Basic landcycling {cost}": Stream A's cycling, searching for a basic land instead of drawing. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

export const MSH_OTHERS: Record<string, Behavior> = {
  'Savage Land Dinosaur': { abilities: [basicLandcycling('{2}')] },
  'Kree Sentinel': { abilities: [basicLandcycling('{2}')] },
  'A.I.M. Scientists': { abilities: [onEnter(connive), basicLandcycling('{2}')] },
  'Roxxon Brutes': {
    abilities: [
      secondDraw([yourCreature], { kind: 'counters', to: t0, amount: 1 }),
      basicLandcycling('{2}'),
    ],
  },
  'Borough Backup': {
    ...spell([], { kind: 'createToken', token: 'hero-token', count: 2 }),
    abilities: [basicLandcycling('{2}')],
  },
};
