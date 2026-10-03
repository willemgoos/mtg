import type { Behavior } from '../build.ts';
import {
  activated,
  atCombat,
  batch,
  creatureCard,
  custom,
  draw,
  drain,
  graveyardCard,
  landcycling,
  mill,
  oncePerTurn,
  onEnter,
  optional,
  permanent,
  permanentCard,
  pump,
  reanimate,
  self,
  spell,
  t0,
  token,
  treasure,
  unearth,
  when,
} from './helpers.ts';

/**
 * Revival Trance (12a), the Arena Store Brawl deck led by Terra, Herald of
 * Hope (R/W/B): its cards that aren't Final Fantasy booster cards or shared lands.
 */

const sunTitanReturn = [graveyardCard({ ...permanentCard, maxManaValue: 3 }, { optional: true })];

export const TERRA: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Terra, Herald of Hope': {
    abilities: [
      // Trance — mill two, then flying until end of turn.
      atCombat([], mill(2), pump(self, 0, 0, ['flying'])),
      // "You may pay {2}. When you do, return target creature card with power 3 or less ... tapped."
      {
        ...when(
          { on: 'combatDamageToPlayer' },
          [creatureCard({ maxPower: 3 })],
          ...reanimate(0, { tapped: true }),
        ),
        cost: { generic: 2, colored: {} },
      },
    ],
  },
  // ------------------------------------------------------------ creatures
  'Angel of the Ruins': {
    abilities: [
      onEnter(
        [
          permanent({ types: ['Artifact', 'Enchantment'] }, { optional: true }),
          permanent({ types: ['Artifact', 'Enchantment'] }, { optional: true }),
        ],
        { kind: 'exile', what: { target: 0 } },
        { kind: 'exile', what: { target: 1 } },
      ),
      landcycling('{2}', 'Plains'),
    ],
  },
  'Celes, Rune Knight': {
    abilities: [
      onEnter([], custom('celesRummage')),
      // Cast from a graveyard isn't tracked: only creatures entering from a graveyard (a simplification).
      batch(
        when({ on: 'creaturesEnterFromGraveyard' }, [], {
          kind: 'counters',
          to: { each: 'creature', controller: 'you' },
          amount: 1,
        }),
      ),
    ],
  },
  'Combustible Gearhulk': {
    abilities: [
      onEnter([], {
        kind: 'choose',
        opponent: true,
        options: [
          { label: 'They draw three cards', effects: [draw(3)] },
          { label: 'They mill three and you take damage', effects: [custom('gearhulkMill')] },
        ],
      }),
    ],
  },
  'Morbid Opportunist': {
    abilities: [oncePerTurn(when({ on: 'otherCreatureDies', controller: 'any' }, [], draw(1)))],
  },
  'Pitiless Plunderer': {
    abilities: [when({ on: 'otherCreatureDies', controller: 'you' }, [], treasure())],
  },
  'Priest of Fell Rites': {
    abilities: [
      activated(
        null,
        { tapSelf: true, life: 3, sacrificeSelf: true },
        [creatureCard()],
        reanimate(0),
        { sorcerySpeed: true },
      ),
      unearth('{3}{W}{B}'),
    ],
  },
  'Sun Titan': {
    abilities: [
      optional(when({ on: 'etb' }, sunTitanReturn, ...reanimate(0))),
      optional(when({ on: 'attacks' }, sunTitanReturn, ...reanimate(0))),
    ],
  },
  // ------------------------------------------------------------ other permanents
  'Bastion of Remembrance': {
    abilities: [
      onEnter([], token('human-soldier-token')),
      when({ on: 'creatureYouControlDies' }, [], ...drain(1)),
    ],
  },
  'Key to the City': {
    abilities: [
      activated(
        null,
        { tapSelf: true, discard: true },
        [{ what: 'creature', optional: true }],
        [pump(t0, 0, 0, [], { cantBeBlocked: true })],
      ),
      {
        ...when({ on: 'becomesUntapped' }, [], draw(1)),
        cost: { generic: 2, colored: {} },
      },
    ],
  },
  // ------------------------------------------------------------ spells
  'Big Score': {
    discardToCast: true,
    ...spell([], draw(2), treasure(2)),
  },
  'Crackling Doom': spell(
    [],
    { kind: 'damage', amount: 2, to: 'eachOpponent' },
    { kind: 'opponentSacrifices', greatestPower: true },
  ),
  'Legions to Ashes': spell(
    [permanent({ nonland: true }, { controller: 'opponent' })],
    custom('legionsToAshes'),
  ),
  Reanimate: spell(
    [{ what: 'graveyardCard', filter: { types: ['Creature'] } }],
    ...reanimate(0),
    custom('loseLifeChosenManaValue'),
  ),
  'Ruinous Ultimatum': spell([], {
    kind: 'destroy',
    what: { each: 'permanent', controller: 'opponent', filter: { nonland: true } },
  }),
  'Village Rites': { sacrificeCreatureToCast: true, ...spell([], draw(2)) },
};
