import type { AbilityDef, CardFilter, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { mana, spell, t0, t1, t2, theirCreature, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart packets: Tenacious (Voracious Brood, Return of the Mole
// Man) and Rampaging (Bushmaster, Powerful Broker, Atlas, Rhino, Rhino's Rampage).
// Atlas is also in Thunderbolts and Towering.

/** One of Rhino's three counters: "up to one other target creature" gets it and trample. */
const rhinoCounter: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [{ what: 'creature', optional: true, filter: { other: true } }],
  effects: [
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['trample'] },
  ],
};

/** "You gain 1 life for each creature you control with power 4 or greater." */
const atlasLife: EffectDef = {
  kind: 'gainLife',
  who: 'controller',
  amount: { count: 'permanentsYouControl', filter: { types: ['Creature'], minPower: 4 } },
};

const atlasTrigger = (on: 'attacks' | 'blocks'): AbilityDef => ({
  kind: 'triggered',
  trigger: { on },
  targets: [],
  effects: [atlasLife],
});

const smallNoncreatureArtifact: CardFilter = {
  types: ['Artifact'],
  notTypes: ['Creature'],
  maxManaValue: 3,
};

export const MSH_JUMPSTART_RAMPAGING: Record<string, Behavior> = {
  // Tenacious
  'Voracious Brood': {
    entersWithCountersAmount: { count: 'cardsInGraveyard', types: ['Creature'] },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureCardsToYourGraveyard' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: { event: 'amount' } }],
      },
    ],
  },
  'Return of the Mole Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'may', effects: [{ kind: 'mill', count: 2 }] }],
      },
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: mana('{5}{G}'), sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'moloid-token',
            count: { count: 'cardsInGraveyard', notTypes: ['Instant', 'Sorcery'] },
          },
        ],
        label: 'Create a Moloid for each permanent card in your graveyard',
      },
    ],
  },

  // Rampaging
  // Deathtouch comes from Scryfall.
  'Bushmaster, Coiled Henchman': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['deathtouch'],
        },
      },
    ],
  },
  // Players never have counters here, so it targets a permanent.
  'Powerful Broker': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { tapSelf: true },
        targets: [{ what: 'permanent' }],
        effects: [{ kind: 'custom', handler: 'counterOfEachKind' }],
        label: 'Another counter of each kind',
      },
    ],
  },
  // Reach comes from Scryfall.
  'Atlas, Sizable Stooge': {
    abilities: [atlasTrigger('attacks'), atlasTrigger('blocks')],
  },
  // Trample comes from Scryfall. The ETB is split into separate triggers so the bots don't weigh
  // every ordered triple of creatures: destroy, then three times "a +1/+1 counter on up to one
  // other target creature; it gains trample" (the same creature may be chosen more than once,
  // which covers every way to distribute the three counters).
  'Rhino, Terrible Trampler': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Land'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      rhinoCounter,
      rhinoCounter,
      rhinoCounter,
    ],
  },
  // The artifact is chosen as the spell is cast, not when the excess damage is dealt.
  "Rhino's Rampage": spell(
    [
      yourCreature,
      theirCreature,
      { what: 'permanent', filter: smallNoncreatureArtifact, optional: true },
    ],
    { kind: 'pump', to: t0, power: 1, toughness: 0 },
    { kind: 'fight', a: t0, b: t1, ifExcess: [{ kind: 'destroy', what: t2 }] },
  ),
};
