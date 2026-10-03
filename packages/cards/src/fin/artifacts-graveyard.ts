import type { Amount, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { cycling, draw, mana, theirCreature, t0 } from './helpers.ts';

/**
 * Final Fantasy (FIN) 11b, group A: the gold cards of Highwind Workshop (W/U
 * artifacts and Heroes) and Time Compression (U/B surveil and big graveyard
 * turns). Their mono-coloured cards are in shared-a.ts.
 */

/** "+1/+1 for each Artificer you control and each Artificer card in your graveyard." */
const artificers: Amount = {
  sum: [
    { count: 'permanentsYouControl', filter: { subtype: 'Artificer' } },
    { count: 'cardsInGraveyard', subtype: 'Artificer' },
  ],
};
const surveil2: EffectDef = { kind: 'surveil', amount: 2 };

// ------------------------------------------------------- W/U: Highwind Workshop

export const HIGHWIND_WORKSHOP: Record<string, Behavior> = {
  // "A deck can have any number of cards named Cid" (the deck runs three).
  'Cid, Timeless Artificer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { anyOf: [{ types: ['Artifact'] }, { subtype: 'Hero' }] },
          power: artificers,
          toughness: artificers,
        },
      },
      cycling('{W}{U}'),
    ],
  },
  'Tidus, Blitzball Star': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Artifact'] } },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
};

// --------------------------------------------------------- U/B: Time Compression

export const TIME_COMPRESSION_BACKS: Record<string, Behavior> = {
  // Menace (from Scryfall); its extra turn is part of the front's transform trigger.
  'Ultimecia, Omnipotent': {},
};

export const TIME_COMPRESSION: Record<string, Behavior> = {
  // The eight cards exiled are the oldest in the graveyard.
  'Ultimecia, Time Sorceress': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'etb' }, targets: [], effects: [surveil2] },
      { kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: [surveil2] },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'graveyardCount', min: 8 },
        cost: mana('{4}{U}{U}{B}{B}'),
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'graveyardCount', min: 8 },
            then: [
              { kind: 'custom', handler: 'exileEightFromGraveyard' },
              { kind: 'transform', what: 'self' },
              // Time Compression: "When this creature transforms into Ultimecia, Omnipotent, take an extra turn."
              { kind: 'extraTurn' },
            ],
          },
        ],
      },
    ],
  },
  'Locke Cole': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
    ],
  },
};
