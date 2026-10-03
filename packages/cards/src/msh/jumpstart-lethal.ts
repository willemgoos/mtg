import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, t0 } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Lethal packet (docs/marvel-jumpstart.md):
// the cards it was missing. Deathtouch on the creatures comes from Scryfall.

/** "Whenever a creature you control with deathtouch deals combat damage to a player, ..." */
const deathtouchHits = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: {
    on: 'creatureYouControlDealsCombatDamage',
    toPlayer: true,
    filter: { hasKeyword: 'deathtouch' },
  },
  targets: [],
  effects,
});

const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

export const MSH_JUMPSTART_LETHAL: Record<string, Behavior> = {
  'White Widow, Yelena Belova': {
    abilities: [deathtouchHits({ kind: 'counters', to: 'subject', amount: 1 })],
  },
  'Venomized Cat': {
    abilities: [onEnter({ kind: 'mill', count: 2 })],
  },
  'Black Widow, Deadly Hunter': {
    abilities: [deathtouchHits(draw(1), { kind: 'loseLife', who: 'controller', amount: 1 })],
  },
  'Titanium Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Gains flying until end of turn',
            targets: [],
            effects: [
              { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['flying'] },
            ],
          },
          {
            label: '1 damage to any target',
            targets: [{ what: 'any' }],
            effects: [{ kind: 'damage', amount: 1, to: t0, from: 'self' }],
          },
        ],
      },
    ],
  },
  'Venom, Evil Unleashed': {
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        sorcerySpeed: true,
        cost: { mana: mana('{2}{B}'), exileSelf: true },
        targets: [{ what: 'creature' }],
        effects: [
          { kind: 'counters', to: t0, amount: 2 },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['deathtouch'] },
        ],
        label: 'Two +1/+1 counters and deathtouch',
      },
    ],
  },
  'Origin of Black Widow': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'opponentSacrifices' }),
      chapter([2], [], {
        kind: 'pump',
        to: { each: 'creature', controller: 'you' },
        power: 0,
        toughness: 0,
        keywords: ['deathtouch'],
      }),
      chapter([3], [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: { count: 'opponentCreatureCardsInGraveyard' },
      }),
    ],
  },
};
