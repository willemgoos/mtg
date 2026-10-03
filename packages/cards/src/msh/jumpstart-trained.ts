import type { AbilityDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  draw,
  mana,
  onEnter,
  powerUp,
  spell,
  t0,
  t1,
  theirCreature,
  yourCreature,
} from './helpers.ts';

// Marvel Super Heroes Jumpstart, Trained packet (docs/marvel-jumpstart.md):
// the cards it was missing. Colossal Collision is shared with four other packets.

/** "Basic landcycling {cost}": discard it to search for a basic land card. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

export const MSH_JUMPSTART_TRAINED: Record<string, Behavior> = {
  // Vigilance comes from Scryfall.
  'She-Hulk, Attorney-at-Law': {
    abilities: [
      powerUp(
        '{6}{G/W}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'custom', handler: 'doubleCountersOnYourCreatures' },
      ),
    ],
  },
  'Shang-Chi, Martial Mentor': {
    abilities: [
      { kind: 'static', effect: { kind: 'doubleCounters', plusOneOnCreatures: true } },
      powerUp('{5}{G}{G}', { kind: 'counters', to: 'self', amount: 3 }),
    ],
  },
  'Advancing the Spirit': {
    abilities: [onEnter(draw(1)), { kind: 'static', effect: { kind: 'firstPowerUpFree' } }],
  },
  'Colossal Collision': {
    ...spell(
      [yourCreature, theirCreature],
      { kind: 'counters', to: t0, amount: 1 },
      { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
    ),
    abilities: [basicLandcycling('{2}')],
  },
};
