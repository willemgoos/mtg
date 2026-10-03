import type { Behavior } from '../build.ts';
import { equip, spell, t0, yourCreature } from './helpers.ts';

/**
 * Final Fantasy (FIN) 11d: the Starter Kit exclusives (Cloud vs Sephiroth)
 * not already implemented for the Brawl decks (Beatrix, Rosa, Ultima Weapon,
 * Sephiroth, Xande and Deadly Embrace live in from-brawl.ts). Printed
 * characteristics come from Scryfall (their starter deck printings); only
 * rules text lives here.
 */
export const STARTER_KIT: Record<string, Behavior> = {
  "Cloud, Planet's Champion": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'all',
            of: [{ kind: 'yourTurn' }, { kind: 'custom', handler: 'sourceEquipped' }],
          },
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike', 'indestructible'],
        },
      },
      { kind: 'static', effect: { kind: 'equipCostsLess', amount: 2, targetSelf: true } },
    ],
  },
  'Judgment Bolt': spell(
    [{ what: 'creature' }],
    { kind: 'damage', amount: 5, to: t0 },
    {
      kind: 'damage',
      amount: { count: 'permanentsYouControl', filter: { subtype: 'Equipment' } },
      to: { controllerOf: 0 },
    },
  ),
  'Lightning, Security Sergeant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'custom', handler: 'exileTopPlayableWhileExiled' }],
      },
    ],
  },
  'Magitek Scythe': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        optional: true,
        effects: [
          { kind: 'attach', to: t0 },
          {
            kind: 'pump',
            to: t0,
            power: 0,
            toughness: 0,
            keywords: ['firstStrike'],
            mustBeBlocked: true,
          },
        ],
      },
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 1 } },
      equip('{2}'),
    ],
  },
  'Seymour Flux': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'may',
            // "Pay 1 life" as losing 1 life.
            effects: [
              { kind: 'loseLife', who: 'controller', amount: 1 },
              { kind: 'draw', who: 'controller', amount: 1 },
              { kind: 'counters', to: 'self', amount: 1 },
            ],
          },
        ],
      },
    ],
  },
  'Ultimecia, Temporal Threat': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'tap', what: { each: 'creature', controller: 'opponent' } }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDealsCombatDamage', toPlayer: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
};
