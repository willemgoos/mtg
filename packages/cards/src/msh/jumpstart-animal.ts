import type { CardFilter, EffectDef, SpellDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, creature, when } from '../blb/helpers.ts';
import { draw, t0, teamwork } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Animal packet (docs/marvel-jumpstart.md):
// the cards it was missing. Tippy-Toe and Beast Mode are in other packets too.

const gainedLife = { kind: 'lifeThisTurn', who: 'you', gained: true } as const;
const food: EffectDef = { kind: 'createToken', token: 'food-token', count: 1 };
const permanentCard: CardFilter = { notTypes: ['Instant', 'Sorcery'] };

/** Beast Mode: "+2/+2 and trample until end of turn" (with teamwork, also a +1/+1 counter). */
const beastMode: SpellDef = {
  targets: [creature],
  effects: [{ kind: 'pump', to: t0, power: 2, toughness: 2, keywords: ['trample'] }],
};

export const MSH_JUMPSTART_ANIMAL: Record<string, Behavior> = {
  'Lucky the Pizza Dog': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'any', spell: { subtypes: ['Cat', 'Dog', 'Hero'] } },
        [],
        food,
      ),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: gainedLife,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Wakandan Tusker': {
    abilities: [
      when(
        { on: 'becomesTapped' },
        [],
        { kind: 'gainLife', who: 'controller', amount: 1 },
        { kind: 'scry', amount: 1 },
      ),
    ],
  },
  'Tippy-Toe, Terrific Partner': {
    abilities: [
      { kind: 'static', effect: { kind: 'plusFoodToken' } },
      atYourEndStep(gainedLife, [], draw(1)),
    ],
  },
  'Scout the City': {
    modes: [
      {
        label: 'Look Around',
        targets: [],
        effects: [
          { kind: 'millThenTake', count: 3, filter: permanentCard },
          { kind: 'gainLife', who: 'controller', amount: 3 },
        ],
      },
      {
        label: 'Bring Down',
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Beast Mode': teamwork(1, beastMode, {
    ...beastMode,
    effects: [...beastMode.effects, { kind: 'counters', to: t0, amount: 1 }],
  }),
};
