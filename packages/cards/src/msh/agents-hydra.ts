import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, drain, mana, onEnter, t0, villain, yourCreature } from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) cards for Lone Agents (W/B, creatures attacking
 * alone) and HYDRA Rising (B/R Villains).
 */

const villainCard = { subtype: 'Villain' };
const anyTarget = { what: 'any' } as const;

/** "Whenever a creature you control attacks alone, ..." (effects on 'subject', the attacker). */
const attacksAlone = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'creatureYouControlAttacks', alone: true },
  targets: [],
  effects,
});

const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

export const AGENTS_HYDRA: Record<string, Behavior> = {
  // ------------------------------------------------------------ Lone Agents (W/B)
  'Agents of S.H.I.E.L.D.': {
    abilities: [attacksAlone({ kind: 'pump', to: 'subject', power: 1, toughness: 1 })],
  },
  'Black Widow, Double Agent': {
    abilities: [
      attacksAlone({
        kind: 'pump',
        to: 'subject',
        power: 0,
        toughness: 0,
        keywords: ['firstStrike', 'menace'],
      }),
    ],
  },
  'Luke Cage, Power Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks', alone: true },
        targets: [],
        effects: [
          { kind: 'pump', to: 'self', power: 2, toughness: 0, keywords: ['indestructible'] },
        ],
      },
    ],
  },
  'HYDRA Infiltration': {
    abilities: [
      onEnter({ kind: 'discard', count: 2, who: 'eachOpponent' }),
      attacksAlone(...drain(1)),
    ],
  },
  'Stolen Stark Tech': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [
          { kind: 'attach', to: t0 },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['indestructible'] },
        ],
      },
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 0 } },
      equip('{1}'),
    ],
  },

  // ----------------------------------------------------------- HYDRA Rising (B/R)
  'HYDRA Assault Robot': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'otherPermanentEtb',
          filter: { anyOf: [villainCard, { types: ['Artifact'] }] },
        },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Madame Hydra': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: villainCard },
        targets: [],
        effects: [villain()],
      },
    ],
  },
  // "Sacrifice an artifact or discard a nonland card. When you do": only the discard, and the
  // target is chosen up front. The activated ability's discard may be any card.
  'Bullseye, Death Dealer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [anyTarget],
        effects: [
          { kind: 'discard', count: 1, filter: { nonland: true } },
          { kind: 'damage', amount: 2, to: t0 },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, discard: true },
        targets: [anyTarget],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  // "Sacrifice an artifact or discard a card": only the discard.
  'Vision of Love': {
    spell: {
      targets: [],
      effects: [{ kind: 'may', effects: [{ kind: 'discard', count: 1 }, draw(2)] }],
    },
  },
};
