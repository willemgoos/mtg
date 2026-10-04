import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { storm } from '../stx/archive.ts';
import { t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart packet: Scarlet (R spells matter).

const onCast = (filter: 'any' | 'noncreature', ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter },
  targets: [],
  effects,
});

export const MSH_JUMPSTART_SCARLET: Record<string, Behavior> = {
  // Also in Young Avengers.
  'Wiccan, Young Avenger': {
    abilities: [
      onCast('noncreature', { kind: 'exileTopPlayable', count: 1, until: 'yourNextEndStep' }),
    ],
  },
  // Flying comes from Scryfall.
  'The Vision and Scarlet Witch': {
    abilities: [
      onCast(
        'any',
        { kind: 'addMana', mana: [['R']] },
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
  // Also a Mystical Archive card (stx/archive.ts, which shares this storm ability).
  Grapeshot: {
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 1, to: t0 }],
    },
    abilities: [storm],
  },
  // Also in Runaways.
  'Hex Magic': {
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'exileHandDrawPlayable' }] },
  },
  "Wanda's Vision": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'anyPlayerSecondSpell', yoursOnly: true },
        targets: [],
        effects: [{ kind: 'revealUntilCastable', max: 99, stayExiled: true }],
      },
    ],
  },
};
