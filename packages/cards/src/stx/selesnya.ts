import type { AbilityDef, CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, mana, onEnter, t0, yourCreature } from '../blb/helpers.ts';

/**
 * Strixhaven (13b): the Selesnya Overgrowth deck (G/W, no college). Mono-coloured
 * +1/+1 counters, life gain and Learn; the Lessons it fetches are the shared ones.
 */

export const SELESNYA_TOKENS: CardDefinition[] = [];

/** "When this dies, put its counters on target creature you control." */
const dyingCounters: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'dies' },
  targets: [yourCreature],
  effects: [{ kind: 'counters', to: t0, amount: { countersOn: 'self' } }],
};

export const SELESNYA: Record<string, Behavior> = {
  'Star Pupil': { entersWithCounters: 1, abilities: [dyingCounters] },
  'Pilgrim of the Ages': {
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: { subtype: 'Plains', supertypes: ['Basic'] },
        to: 'hand',
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
        label: '{6}: Return this card from your graveyard to your hand',
      },
    ],
  },
  'Spined Karok': {},
  // Strixhaven (13b): Bookwurm.
  Bookwurm: {
    abilities: [
      onEnter(gain(3), draw(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'libraryThird' }],
        label: '{2}{G}: Put this card from your graveyard into your library third from the top',
      },
    ],
  },
};
