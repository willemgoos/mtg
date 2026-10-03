import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, t0, when } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';

/**
 * Strixhaven (13b): the Rakdos Ruin deck (B/R, off-college): cheap menace and
 * burn, sacrifice, and a few big threats. Only new cards live here; the rest
 * are reused from the other STX files.
 */

/** No tokens of its own. */
export const RAKDOS_TOKENS: CardDefinition[] = [];

const creatureOrWalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};
const instantOrSorceryInYard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Instant', 'Sorcery'] },
};
/** "Sacrifice a creature" (the source included) for Daemogoth Titan. */
const sacrificeACreature: EffectDef = {
  kind: 'sacrificeSeveral',
  count: 1,
  filter: { types: ['Creature'] },
  includeSource: true,
  then: [],
};

export const RAKDOS: Record<string, Behavior> = {
  // ---------------------------------------------------------------- creatures
  'Arrogant Poet': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          { kind: 'loseLife', who: 'controller', amount: 2 },
          { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['flying'] },
        ],
      }),
    ],
  },
  'Unwilling Ingredient': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}'), exileSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
        fromGraveyard: true,
        label: '{2}{B}, Exile this card from your graveyard: You draw a card and you lose 1 life',
      },
    ],
  },
  'Novice Dissector': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [creature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
        sorcerySpeed: true,
        label: '{1}, Sacrifice another creature: Put a +1/+1 counter on target creature',
      },
    ],
  },
  'Daemogoth Titan': {
    abilities: [
      when({ on: 'attacks' }, [], sacrificeACreature),
      when({ on: 'blocks' }, [], sacrificeACreature),
    ],
  },
  'Efreet Flamepainter': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [instantOrSorceryInYard], {
        kind: 'castFree',
        what: t0,
        exileAfter: true,
      }),
    ],
  },
  // ------------------------------------------------------------------- spells
  'Lash of Malice': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 2, toughness: -2 }],
    },
  },
  // Simplified: the additional cost sacrifices a creature instead of exiling it.
  'Necrotic Fumes': {
    sacrificeCreatureToCast: true,
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'exile', what: t0 }] },
  },
  Flunk: {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'pump',
          to: t0,
          power: { multiply: -1, amount: { handGapOfControllerOf: t0, size: 7 } },
          toughness: { multiply: -1, amount: { handGapOfControllerOf: t0, size: 7 } },
        },
      ],
    },
  },
  'Crushing Disappointment': {
    spell: {
      targets: [],
      effects: [{ kind: 'loseLife', who: 'eachPlayer', amount: 2 }, draw(2)],
    },
  },
  'Essence Infusion': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'counters', to: t0, amount: 2 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['lifelink'] },
      ],
    },
  },
  "Professor's Warning": {
    modes: [
      mode('Put a +1/+1 counter on target creature', [creature], {
        kind: 'counters',
        to: t0,
        amount: 1,
      }),
      mode('Target creature gains indestructible until end of turn', [creature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        keywords: ['indestructible'],
      }),
    ],
  },
};
