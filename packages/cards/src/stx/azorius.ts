import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, t0, theirCreature, yourCreature } from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';

/**
 * Strixhaven (13b): the Azorius Skies deck (W/U, no college). Mono-coloured
 * flyers, tempo and spells-matter cards; its Lessons are in lessons-azorius.ts.
 */

export const AZORIUS_TOKENS: CardDefinition[] = [];

/** "Magecraft: whenever you cast or copy an instant or sorcery spell, ...". */
const magecraft = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets,
  effects,
});

const yours = { each: 'creature', controller: 'you' } as const;
const learn: EffectDef = { kind: 'learn' };

export const AZORIUS: Record<string, Behavior> = {
  'Clever Lumimancer': {
    abilities: [magecraft([], { kind: 'pump', to: 'self', power: 2, toughness: 2 })],
  },
  'Leonin Lightscribe': {
    abilities: [magecraft([], { kind: 'pump', to: yours, power: 1, toughness: 1 })],
  },
  'Symmetry Sage': {
    // Simplified: sets the creature's total power to 2 (counters and pumps included).
    abilities: [
      magecraft([yourCreature], {
        kind: 'pump',
        to: t0,
        power: { sum: [2, { multiply: -1, amount: { powerOf: t0 } }] },
        toughness: 0,
      }),
    ],
  },
  'Ageless Guardian': {},
  'Thunderous Orator': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: (
          [
            'flying',
            'firstStrike',
            'doubleStrike',
            'deathtouch',
            'indestructible',
            'lifelink',
            'menace',
            'trample',
          ] as const
        ).map((keyword): EffectDef => ({
          kind: 'if',
          condition: {
            kind: 'controlsCreature',
            filter: { hasKeyword: keyword },
          },
          then: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: [keyword] }],
        })),
      },
    ],
  },
  'Excavated Wall': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'mill', count: 1, who: 'controller' }],
        label: '{1}, {T}: Mill a card',
      },
    ],
  },
  // Simplified: only an opponent's spells or abilities targeting it make it sacrifice itself.
  'Dream Strix': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'targetedByOpponent' },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
      },
      { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [learn] },
    ],
  },
  'Vortex Runner': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'amountAtLeast', amount: { count: 'landsYouControl' }, min: 8 },
          power: 1,
          toughness: 0,
          cantBeBlocked: true,
        },
      },
    ],
  },
  'Burrog Befuddler': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'pump', to: t0, power: -1, toughness: 0 }],
      },
    ],
  },
  'Soothsayer Adept': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}'), tapSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
        label: '{1}{U}, {T}: Draw a card, then discard a card',
      },
    ],
  },
  'Biblioplex Assistant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            optional: true,
            filter: { types: ['Instant', 'Sorcery'] },
          },
        ],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'top' }],
      },
    ],
  },
  'Wormhole Serpent': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}') },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
        label: '{3}{U}: Target creature can’t be blocked this turn',
      },
    ],
  },
  'Defend the Campus': {
    modes: [
      {
        label: 'Creatures you control get +1/+1 until end of turn',
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 1, toughness: 1 }],
      },
      {
        label: 'Destroy target creature with power 4 or greater',
        targets: [{ what: 'creature', filter: { minPower: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // Simplified: no "{3}: opponent destroys it" and its activated abilities still work.
  'Detention Vortex': {
    enchant: { what: 'permanent', filter: { nonland: true } },
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, cantAttackOrBlock: true },
      },
    ],
  },
  'Cogwork Archivist': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
        label: '{2}, {T}: Put target card from a graveyard on the bottom of its owner’s library',
      },
    ],
  },
  'Zephyr Boots': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, keywords: ['flying'] },
      },
      {
        kind: 'triggered',
        trigger: { on: 'equippedDealsCombatDamageToPlayer' },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
      equip('{2}'),
    ],
  },
  'Sparring Regimen': {
    abilities: [
      onEnter(learn),
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
        effects: [
          { kind: 'counters', to: t0, amount: 1 },
          { kind: 'untap', what: t0 },
        ],
      },
    ],
  },
};
