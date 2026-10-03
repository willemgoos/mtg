import type { AbilityDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, mayRummage, onEnter, t0 } from './helpers.ts';

/**
 * Final Fantasy (FIN) 11b, group A: the gold cards of Black Mages' Waltz (B/R
 * noncreature spells) and Chocobo Stampede (R/G landfall). Their mono-coloured
 * cards are in shared-a.ts.
 */

const noncreatureCast = { on: 'castSpell', filter: 'noncreature' } as const;
const anotherOfYours: TargetSpec = { what: 'creature', controller: 'you', filter: { other: true } };

/**
 * Rydia's "Summon — {X}, {T}: Return target Saga card with mana value X from
 * your graveyard to the battlefield with a finality counter on it. It gains
 * haste until end of turn." One ability per X (the Sagas in these decks cost
 * 1 to 6).
 */
const summon = (x: number): AbilityDef => ({
  kind: 'activated',
  cost: { mana: { generic: x, colored: {} }, tapSelf: true },
  sorcerySpeed: true,
  targets: [
    { what: 'graveyardCard', controller: 'you', filter: { subtype: 'Saga', manaValue: x } },
  ],
  effects: [
    { kind: 'returnToBattlefield', what: t0, counter: 'finality' },
    { kind: 'pump', to: 'chosen', power: 0, toughness: 0, keywords: ['haste'] },
  ],
  label: `Summon — {${x}}, {T}`,
});

// ----------------------------------------------------- B/R: Black Mages' Waltz

export const BLACK_MAGES_WALTZ: Record<string, Behavior> = {
  'Black Waltz No. 3': {
    abilities: [
      {
        kind: 'triggered',
        trigger: noncreatureCast,
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent' }],
      },
    ],
  },
  'Garland, Knight of Cornelia': {
    abilities: [
      {
        kind: 'triggered',
        trigger: noncreatureCast,
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{B}{B}{R}{R}') },
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', transformed: true }],
        label: 'Return transformed',
      },
    ],
  },
};

export const BLACK_MAGES_WALTZ_BACKS: Record<string, Behavior> = {
  'Chaos, the Endless': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'custom', handler: 'sourceToLibraryBottom' }],
      },
    ],
  },
};

// ------------------------------------------------------- R/G: Chocobo Stampede

export const CHOCOBO_STAMPEDE: Record<string, Behavior> = {
  'Gladiolus Amicitia': {
    abilities: [
      onEnter({ kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'battlefieldTapped' }),
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [anotherOfYours],
        effects: [{ kind: 'pump', to: t0, power: 2, toughness: 2, keywords: ['trample'] }],
      },
    ],
  },
  'Rydia, Summoner of Mist': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'landfall' }, targets: [], effects: [mayRummage] },
      ...[1, 2, 3, 4, 5, 6].map(summon),
    ],
  },
};
