import type { AbilityDef, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
} from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import {
  entersWithMinusCounters,
  returnBeheldWhenLeaves,
  VIVID,
  withRemovedCounters,
} from '../ecl-vocab.ts';
import { ECL_FAERIE, ECL_MERFOLK } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): blue. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_BLUE_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

const stunCounter = (to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});
const tapAndStun = (to: Ref): EffectDef[] => [{ kind: 'tap', what: to }, stunCounter(to)];
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const loot: EffectDef[] = [draw(1), { kind: 'discard', count: 1 }];
const anotherCreature: TargetSpec = { what: 'creature', filter: { other: true } };
const upToOne = (t: TargetSpec): TargetSpec => ({ ...t, optional: true });
const controlsMerfolk = {
  kind: 'controlsPermanents',
  filter: { subtype: 'Merfolk' },
  min: 1,
} as const;

/** "Basic landcycling {cost}": discard it to search for a basic land card. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

/** An Aura: it enchants a creature (`enchant`), and these abilities. */
const aura = (enchant: TargetSpec, ...abilities: AbilityDef[]): Behavior => ({
  enchant,
  abilities,
});

export const ECL_BLUE: Record<string, Behavior> = {
  "Aquitect's Defenses": {
    ...aura(
      { what: 'creature', controller: 'you' },
      // "When this Aura enters, enchanted creature gains hexproof until end of turn."
      onEnter(pump('attached', 0, 0, ['hexproof'])),
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
    ),
  },
  Blossombind: aura(creature, onEnter({ kind: 'tap', what: 'attached' }), {
    kind: 'static',
    effect: {
      kind: 'attached',
      power: 0,
      toughness: 0,
      cantBecomeUntapped: true,
      noCounters: true,
    },
  }),
  'Champions of the Shoal': {
    beholdExile: { subtype: 'Merfolk' },
    abilities: [
      when({ on: 'etb' }, [upToOne(creature)], ...tapAndStun(t0)),
      when({ on: 'becomesTapped' }, [upToOne(creature)], ...tapAndStun(t0)),
      returnBeheldWhenLeaves,
    ],
  },
  'Disruptor of Currents': {
    convoke: true,
    abilities: [
      when(
        { on: 'etb' },
        [upToOne({ what: 'permanent', filter: { nonland: true, other: true } })],
        { kind: 'bounce', what: t0 },
      ),
    ],
  },
  'Flitterwing Nuisance': {
    ...entersWithMinusCounters(1),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{2}{U}') }),
        targets: [],
        effects: [
          {
            kind: 'emblem',
            until: 'endOfTurn',
            ability: when(
              { on: 'creatureYouControlDealsCombatDamage', toPlayerOrPlaneswalker: true },
              [],
              draw(1),
            ),
          },
        ],
      },
    ],
  },
  'Glamer Gifter': {
    abilities: [
      when(
        { on: 'etb' },
        [upToOne(anotherCreature)],
        { kind: 'pump', to: t0, power: 4, toughness: 4, setBase: true },
        { kind: 'allCreatureTypes', what: t0, duration: 'endOfTurn' },
      ),
    ],
  },
  Glamermite: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          mode('Tap target creature', [creature], { kind: 'tap', what: t0 }),
          mode('Untap target creature', [creature], { kind: 'untap', what: t0 }),
        ],
      },
    ],
  },
  'Glen Elendra Guardian': {
    ...entersWithMinusCounters(1),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{1}{U}') }),
        targets: [{ what: 'spell', filter: { notTypes: ['Creature'] } }],
        effects: [
          { kind: 'counter', what: t0 },
          { kind: 'draw', who: { controllerOf: 0 }, amount: 1 },
        ],
      },
    ],
  },
  "Glen Elendra's Answer": {
    spell: {
      targets: [],
      effects: [
        custom('eclCounterAllOpponents'),
        { kind: 'createToken', token: ECL_FAERIE, count: { affectedThisWay: true } },
      ],
    },
  },
  'Gravelgill Scoundrel': {
    abilities: [
      when({ on: 'attacks' }, [], { kind: 'chooseCustom', handler: 'eclTapForUnblockable' }),
    ],
  },
  'Harmonized Crescendo': {
    convoke: true,
    spell: {
      targets: [],
      // Choose a creature type; draw a card for each permanent you control of that type.
      effects: [{ kind: 'chooseCreatureType' }, custom('u15bDrawPerChosenType')],
    },
  },
  'Illusion Spinners': {
    flashIf: { kind: 'controlsPermanents', filter: { subtype: 'Faerie' }, min: 1 },
    abilities: [
      // "This creature has hexproof as long as it's untapped."
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'not', condition: { kind: 'sourceTapped' } },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },
  'Kulrath Mystic': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'any', spell: { minManaValue: 4 } },
        [],
        pump('self', 2, 0, ['vigilance']),
      ),
    ],
  },
  'Loch Mare': {
    ...entersWithMinusCounters(3),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{1}{U}') }),
        targets: [],
        effects: [draw(1)],
      },
      {
        kind: 'activated',
        cost: withRemovedCounters(2, { mana: mana('{2}{U}') }),
        targets: [creature],
        effects: tapAndStun(t0),
      },
    ],
  },
  'Lofty Dreams': {
    convoke: true,
    ...aura(creature, onEnter(draw(1)), {
      kind: 'static',
      effect: { kind: 'attached', power: 2, toughness: 2, keywords: ['flying'] },
    }),
  },
  Mirrorform: {
    spell: {
      targets: [{ what: 'permanent', filter: { notSubtypes: ['Aura'] } }],
      // Each nonland permanent you control becomes a copy of the target (for good).
      effects: [
        {
          kind: 'becomeCopy',
          what: { each: 'permanent', controller: 'you', filter: { nonland: true } },
          of: t0,
          permanent: true,
        },
      ],
    },
  },
  'Noggle the Mind': aura(creature, {
    kind: 'static',
    effect: {
      kind: 'attached',
      power: 0,
      toughness: 0,
      loseAbilities: true,
      basePT: [1, 1],
      colorlessSubtype: 'Noggle',
    },
  }),
  'Omni-Changeling': {
    convoke: true,
    // "You may have this creature enter as a copy of any creature on the battlefield, except it has changeling."
    entersAsCopy: { anyManaValue: true, addKeyword: 'changeling' },
  },
  'Pestered Wellguard': {
    abilities: [
      when({ on: 'becomesTapped' }, [], { kind: 'createToken', token: ECL_FAERIE, count: 1 }),
    ],
  },
  'Rime Chill': {
    costReduction: VIVID,
    spell: {
      targets: [upToOne(creature), upToOne(creature)],
      effects: [...tapAndStun(t0), ...tapAndStun(t1), draw(1)],
    },
  },
  'Rimefire Torque': {
    abilities: [
      onEnter({ kind: 'chooseCreatureType' }),
      when({ on: 'otherPermanentEtb', filter: { chosenTypeOfSource: true } }, [], {
        kind: 'namedCounters',
        name: 'charge',
        amount: 1,
        to: 'self',
      }),
      {
        kind: 'activated',
        cost: { tapSelf: true, removeCounters: { name: 'charge', count: 3 } },
        targets: [],
        effects: [
          {
            // "When you next cast an instant or sorcery spell this turn, copy it. You may choose new targets for the copy."
            kind: 'emblem',
            until: 'nextSpellThisTurn',
            ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
              kind: 'copySpell',
              what: 'subject',
              newTargets: true,
            }),
          },
        ],
      },
    ],
  },
  'Rimekin Recluse': {
    abilities: [when({ on: 'etb' }, [upToOne(anotherCreature)], { kind: 'bounce', what: t0 })],
  },
  Shinestriker: {
    abilities: [onEnter({ kind: 'draw', who: 'controller', amount: VIVID })],
  },
  'Silvergill Mentor': {
    beholdOrPay: { filter: { subtype: 'Merfolk' }, pay: mana('{2}') },
    abilities: [onEnter({ kind: 'createToken', token: ECL_MERFOLK, count: 1 })],
  },
  'Silvergill Peddler': {
    abilities: [when({ on: 'becomesTapped' }, [], ...loot)],
  },
  'Spell Snare': {
    spell: {
      targets: [{ what: 'spell', filter: { manaValue: 2 } }],
      effects: [{ kind: 'counter', what: t0 }],
    },
  },
  Stratosoarer: {
    abilities: [
      when({ on: 'etb' }, [creature], pump(t0, 0, 0, ['flying'])),
      basicLandcycling('{1}{U}'),
    ],
  },
  'Summit Sentinel': {
    abilities: [when({ on: 'dies' }, [], draw(1))],
  },
  Sunderflock: {
    // "This spell costs {X} less to cast, where X is the greatest mana value among Elementals you control."
    costReduction: { greatestManaValueYouControl: { subtype: 'Elemental' } },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [],
        effects: [
          {
            kind: 'bounce',
            what: { each: 'creature', filter: { notSubtypes: ['Elemental'] } },
          },
        ],
      },
    ],
  },
  'Swat Away': {
    costReductionIf: { condition: { kind: 'beingAttacked' }, amount: 2 },
    spell: {
      targets: [{ what: 'spell', orCreature: true }],
      effects: [{ kind: 'chooseCustom', handler: 'eclLibraryChoice' }],
    },
  },
  'Tanufel Rimespeaker': {
    abilities: [when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 4 } }, [], draw(1))],
  },
  'Temporal Cleansing': {
    convoke: true,
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'chooseCustom', handler: 'eclLibraryChoice', params: { second: true } }],
    },
  },
  'Thirst for Identity': {
    spell: {
      targets: [],
      effects: [
        draw(3),
        // "Then discard two cards unless you discard a creature card."
        {
          kind: 'if',
          condition: { kind: 'handHas', filter: { types: ['Creature'] } },
          then: [{ kind: 'chooseCustom', handler: 'eclDiscardCreatureOrTwo' }],
          else: [{ kind: 'discard', count: 2 }],
        },
      ],
    },
  },
  'Unwelcome Sprite': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'opponentsTurn' },
        targets: [],
        effects: [surveil(2)],
      },
    ],
  },
  'Wanderwine Distracter': {
    abilities: [when({ on: 'becomesTapped' }, [theirCreature], pump(t0, -3, 0))],
  },
  'Wanderwine Farewell': {
    convoke: true,
    spell: {
      targets: [
        { what: 'permanent', filter: { nonland: true } },
        upToOne({ what: 'permanent', filter: { nonland: true } }),
      ],
      effects: [
        { kind: 'bounce', what: { targetsFrom: 0 } },
        // "Then if you control a Merfolk, create a 1/1 white and blue Merfolk creature token for each permanent returned."
        {
          kind: 'if',
          condition: controlsMerfolk,
          then: [{ kind: 'createToken', token: ECL_MERFOLK, count: { affectedThisWay: true } }],
        },
      ],
    },
  },
  'Wild Unraveling': {
    blightOrPay: { amount: 2, pay: mana('{1}') },
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: t0 }] },
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_BLUE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_BLUE_TOKENS: CardDefinition[] = [];
