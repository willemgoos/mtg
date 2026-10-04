import type {
  AbilityDef,
  CardDefinition,
  ConditionDef,
  EffectDef,
  ManaType,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { atYourEndStep, draw, onEnter, t0, t1, when } from '../blb/helpers.ts';
import { cycling, tapFor } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b, green): the green and colourless cards of the other
 * seven Brawl decks. Printed characteristics come from Scryfall; only rules
 * text lives here. One-offs are `custom` handlers in
 * packages/engine/src/brawl-15b-g-effects.ts.
 */

export const SPAWN = 'soc-15b-g-eldrazi-spawn';
export const SCION = 'soc-15b-g-eldrazi-scion';
export const DRYAD = 'soc-15b-g-forest-dryad';
export const INSECT = 'soc-15b-g-insect';
export const ELEMENTAL = 'soc-15b-g-elemental';
export const TREEFOLK = 'soc-15b-g-treefolk';
export const OOZE_2 = 'soc-15b-g-ooze-2';
export const OOZE_1 = 'soc-15b-g-ooze-1';
const PEST = 'stx-pest-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  types: CardDefinition['types'],
  subtypes: string[],
  p: number,
  t: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types,
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords: [],
  abilities: [],
  isToken: true,
  ...extra,
});

/** "Sacrifice this token: Add {C}." */
const sacForC: AbilityDef = {
  kind: 'mana',
  cost: { sacrificeSelf: true },
  produces: 'C',
};

export const BRAWL_15B_G_TOKENS: CardDefinition[] = [
  token(SPAWN, 'Eldrazi Spawn', [], ['Creature'], ['Eldrazi', 'Spawn'], 0, 1, {
    abilities: [sacForC],
  }),
  token(SCION, 'Eldrazi Scion', [], ['Creature'], ['Eldrazi', 'Scion'], 1, 1, {
    abilities: [sacForC],
  }),
  token(DRYAD, 'Forest Dryad', ['G'], ['Land', 'Creature'], ['Forest', 'Dryad'], 1, 1, {
    abilities: [tapFor('G')],
  }),
  token(INSECT, 'Insect', ['B', 'G'], ['Creature'], ['Insect'], 1, 1),
  token(ELEMENTAL, 'Elemental', ['G'], ['Creature'], ['Elemental'], 0, 0),
  token(TREEFOLK, 'Treefolk', ['G'], ['Creature'], ['Treefolk'], 3, 4, { keywords: ['reach'] }),
  token(OOZE_1, 'Ooze', ['G'], ['Creature'], ['Ooze'], 1, 1),
  token(OOZE_2, 'Ooze', ['G'], ['Creature'], ['Ooze'], 2, 2, {
    abilities: [when({ on: 'dies' }, [], { kind: 'createToken', token: OOZE_1, count: 2 })],
  }),
];

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const counters = (to: Ref, amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const noCounters: ConditionDef = { kind: 'sourceNoCounters' };
const proliferate = custom('proliferate');

/** "{cost}: Adapt N" (only worth doing without +1/+1 counters). */
const adapt = (cost: string, n: number): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  condition: noCounters,
  targets: [],
  effects: [custom('adapt', { n })],
  label: `Adapt ${n}`,
});

/** "Whenever one or more +1/+1 counters are put on this creature, ...". */
const onCountersOnSelf = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'youPutCounters', onlySelf: true }, targets, ...effects);

const ALL_COLOURS: ManaType[] = ['W', 'U', 'B', 'R', 'G'];

/** A creature with {X} in its cost that enters with X +1/+1 counters. */
const xCreature = (...abilities: AbilityDef[]): Behavior => ({
  entersWithXCounters: true,
  abilities,
});

/** Search for basic lands: `n` of them onto the battlefield tapped. */
const basicsTapped = (n: number): EffectDef[] =>
  Array.from({ length: n }, () => ({
    kind: 'searchLibrary',
    filter: 'basicLand',
    to: 'battlefieldTapped',
  }));

/** Alchemy Gates: "{3}{c}, {T}: Seek a nonland card. Activate only once." */
const gate = (colour: ManaType): Behavior => ({
  entersTapped: true,
  abilities: [
    tapFor(colour),
    {
      kind: 'activated',
      cost: { mana: mana(`{3}{${colour}}`), tapSelf: true },
      once: true,
      targets: [],
      effects: [custom('seekNonland')],
      label: `{3}{${colour}}, {T}: seek a nonland card (once)`,
    },
  ],
});

export const BRAWL_15B_G: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Basking Broodscale': {
    abilities: [
      adapt('{1}{G}', 1),
      onCountersOnSelf([], {
        kind: 'may',
        effects: [{ kind: 'createToken', token: SPAWN, count: 1 }],
      }),
    ],
  },
  'Bassara Tower Archer': {},
  'Broodguard Elite': {
    entersWithXCounters: true,
    // Warp {X}{G}: an alternative cost; it's exiled at the next end step and may be cast from exile later.
    kicker: { cost: mana('{X}{G}'), replacesCost: true, altLabel: 'Warp' },
    abilities: [
      {
        ...when({ on: 'etb' }, [], custom('warpSchedule')),
        condition: { kind: 'wasKicked' },
      } as AbilityDef,
      when({ on: 'dies' }, [yourCreature], {
        kind: 'counters',
        to: t0,
        amount: { countersOn: 'self' },
      }),
      when({ on: 'leavesWithoutDying', who: 'selfOrOther' }, [yourCreature], {
        kind: 'counters',
        to: t0,
        amount: { countersOn: 'self' },
      }),
    ],
  },
  Cankerbloom: {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
        label: '{1}, Sacrifice: destroy target artifact',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
        label: '{1}, Sacrifice: destroy target enchantment',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [],
        effects: [proliferate],
        label: '{1}, Sacrifice: proliferate',
      },
    ],
  },
  'Contortionist Troupe': xCreature(
    // Coven: three or more creatures with different powers.
    atYourEndStep(
      { kind: 'amountAtLeast', amount: { count: 'differentPowersYouControl' }, min: 3 },
      [yourCreature],
      counters(t0),
    ),
  ),
  'Disciple of Freyalise': {
    back: 'garden-of-freyalise',
    abilities: [onEnter({ kind: 'chooseCustom', handler: 'discipleSacrifice' })],
  },
  'Elvish Mystic': { abilities: [tapFor('G')] },
  'Evolution Sage': { abilities: [when({ on: 'landfall' }, [], proliferate)] },
  'Evolution Witness': {
    abilities: [
      adapt('{1}{G}', 2),
      onCountersOnSelf(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { notTypes: ['Instant', 'Sorcery'] },
          },
        ],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Goldvein Hydra': xCreature(
    when({ on: 'dies' }, [], {
      kind: 'createToken',
      token: 'treasure-token',
      count: { powerOf: 'self' },
      tapped: true,
    }),
  ),
  'Incubation Druid': {
    abilities: [
      // Any type of mana a land you control could produce (three of it with a +1/+1 counter).
      ...([...ALL_COLOURS, 'C'] as ManaType[]).map((c) =>
        tapFor(c, { colorFrom: 'yourLands', tripleIf: { kind: 'sourceCounters', min: 1 } }),
      ),
      adapt('{3}{G}{G}', 3),
    ],
  },
  'Kami of Whispered Hopes': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraCounters', amount: 1 } },
      ...ALL_COLOURS.map((c) => tapFor(c, { perPower: true })),
    ],
  },
  'Mistcutter Hydra': xCreature(),
  'Orochi Merge-Keeper': {
    // {T}: Add {G}; while modified, {G}{G} instead.
    abilities: [tapFor('G', { doubleIf: { kind: 'sourceModified' } })],
  },
  'Pollenbright Druid': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Put a +1/+1 counter on target creature',
            targets: [{ what: 'creature' }],
            effects: [counters(t0)],
          },
          { label: 'Proliferate', targets: [], effects: [proliferate] },
        ],
      },
    ],
  },
  "Wren's Run Hydra": xCreature({
    // Reinforce X: {X}{G}{G}, discard this card: put X +1/+1 counters on target creature.
    kind: 'activated',
    cost: { mana: mana('{X}{G}{G}'), discardSelf: true },
    fromHand: true,
    targets: [{ what: 'creature' }],
    effects: [{ kind: 'counters', to: t0, amount: { x: true } }],
    label: 'Reinforce X',
  }),
  'Mitotic Ultimus': {
    costReduction: { count: 'greatestPowerYouControl' },
    abilities: [
      when(
        { on: 'dies' },
        [],
        custom('conjureOnBattlefield', { defId: 'mitotic-slime', count: 2 }),
      ),
    ],
  },
  'Mitotic Slime': {
    abilities: [when({ on: 'dies' }, [], { kind: 'createToken', token: OOZE_2, count: 2 })],
  },
  'Seed Guardian': {
    abilities: [
      when({ on: 'dies' }, [], {
        kind: 'createToken',
        token: ELEMENTAL,
        count: 1,
        counters: { count: 'cardsInGraveyard', types: ['Creature'] },
      }),
    ],
  },
  'Wary Watchdog': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      when({ on: 'dies' }, [], { kind: 'surveil', amount: 1 }),
    ],
  },
  'Academy Manufactor': { abilities: [{ kind: 'static', effect: { kind: 'clueFoodTreasure' } }] },
  // ------------------------------------------------------------ instants, sorceries
  'Signature Slam': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [counters(t0), custom('signatureSlam')],
    },
  },
  'Awaken the Woods': {
    spell: {
      targets: [],
      effects: [{ kind: 'createToken', token: DRYAD, count: { x: true } }],
    },
  },
  'Pest Infestation': {
    // Simplified: up to three targets, however large X is.
    upToXTargets: true,
    spell: {
      targets: [0, 1, 2].map((): TargetSpec => ({
        what: 'permanent',
        filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }] },
        optional: true,
      })),
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'destroy', what: t1 },
        { kind: 'destroy', what: { target: 2 } },
        { kind: 'createToken', token: PEST, count: { x: true, times: 2 } },
      ],
    },
  },
  'Spinning Wheel Kick': {
    // Simplified: at most three targets, however large X is.
    upToXTargets: true,
    upToXOffset: 1,
    spell: {
      targets: [
        yourCreature,
        ...[0, 1, 2].map((): TargetSpec => ({
          what: 'permanent',
          filter: { types: ['Creature', 'Planeswalker'] },
          optional: true,
        })),
      ],
      effects: [1, 2, 3].map((i): EffectDef => ({
        kind: 'damage',
        amount: { powerOf: t0 },
        to: { target: i },
        from: t0,
      })),
    },
  },
  Explore: { spell: { targets: [], effects: [custom('extraLandThisTurn'), draw(1)] } },
  'Follow the Tracks': {
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'followTheTracks' }] },
  },
  'Into the North': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { supertypes: ['Snow'], types: ['Land'] },
          to: 'battlefieldTapped',
        },
      ],
    },
  },
  'Migration Path': {
    spell: { targets: [], effects: basicsTapped(2) },
    abilities: [cycling('{2}')],
  },
  'Rampant Growth': { spell: { targets: [], effects: basicsTapped(1) } },
  Regrowth: {
    spell: {
      targets: [{ what: 'graveyardCard', controller: 'you' }],
      effects: [{ kind: 'returnToHand', what: t0 }],
    },
  },
  'Sylvan Scrying': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'hand' }],
    },
  },
  'Tend the Sprigs': {
    spell: {
      targets: [],
      effects: [
        ...basicsTapped(1),
        {
          kind: 'if',
          condition: {
            kind: 'controlsPermanents',
            filter: { anyOf: [{ types: ['Land'] }, { subtype: 'Treefolk' }] },
            min: 7,
          },
          then: [{ kind: 'createToken', token: TREEFOLK, count: 1 }],
        },
      ],
    },
  },
  // ------------------------------------------------------------ enchantments
  'Hardened Scales': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraCounters', amount: 1, creaturesOnly: true } },
    ],
  },
  'Ordeal of Nylea': {
    enchant: { what: 'creature' },
    abilities: [
      when({ on: 'equippedAttacks' }, [], counters('attached'), {
        // Then if it has three or more +1/+1 counters on it, sacrifice this Aura; when you do, two basic lands.
        kind: 'if',
        condition: { kind: 'amountAtLeast', amount: { countersOn: 'attached' }, min: 3 },
        then: [{ kind: 'sacrifice', what: 'self' }, ...basicsTapped(2)],
      }),
    ],
  },
  'Utopia Sprawl': {
    enchant: { what: 'permanent', filter: { types: ['Land'], subtype: 'Forest' } },
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      { kind: 'static', effect: { kind: 'landBonusMana' } },
    ],
  },
  'Squirrel Sanctuary': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'squirrel-token', count: 1 }),
      {
        kind: 'triggered',
        trigger: {
          on: 'permanentYouControlDies',
          filter: { types: ['Creature'], nontoken: true },
        },
        cost: mana('{1}'),
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
      },
    ],
  },
  Terrasymbiosis: {
    abilities: [
      {
        ...when({ on: 'youPutCounters' }, [], {
          kind: 'may',
          effects: [{ kind: 'draw', who: 'controller', amount: { event: 'amount' } }],
        }),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'The Hunger Tide Rises': {
    saga: 4,
    abilities: [
      when({ on: 'chapter', chapters: [1, 2, 3] }, [], {
        kind: 'createToken',
        token: INSECT,
        count: 1,
      }),
      when({ on: 'chapter', chapters: [4] }, [], {
        kind: 'chooseCustom',
        handler: 'hungerSacrifice',
      }),
    ],
  },
  // ------------------------------------------------------------ artifacts, lands
  'Astral Cornucopia': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'namedCounters', name: 'charge', amount: { x: true } }),
      // "Choose a color. Add one mana of that color for each charge counter."
      ...ALL_COLOURS.map((c) => tapFor(c, { perNamedCounters: 'charge' })),
    ],
  },
  'Snow-Covered Forest': {},
  'Reliquary Tower': {
    abilities: [{ kind: 'static', effect: { kind: 'noMaxHandSize' } }, tapFor('C')],
  },
  'Roadside Reliquary': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'controlsPermanents', filter: { types: ['Artifact'] }, min: 1 },
            then: [draw(1)],
          },
          {
            kind: 'if',
            condition: { kind: 'controlsPermanents', filter: { types: ['Enchantment'] }, min: 1 },
            then: [draw(1)],
          },
        ],
        label: '{2}, {T}, Sacrifice: draw a card for an artifact and for an enchantment',
      },
    ],
  },
  "Bonders' Enclave": {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [draw(1)],
        label: '{3}, {T}: draw a card',
      },
    ],
  },
  "Karn's Bastion": {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [proliferate],
        label: '{4}, {T}: proliferate',
      },
    ],
  },
  'Spawning Bed': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{6}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'createToken', token: SCION, count: 3 }],
        label: '{6}, {T}, Sacrifice: three 1/1 Eldrazi Scions',
      },
    ],
  },
  // Simplified: the life is "damage" to you (pain), not paid as a cost.
  'Mana Confluence': { abilities: ALL_COLOURS.map((c) => tapFor(c, { pain: true })) },
  // The Gates of Follow the Tracks's spellbook (Gate to the Citadel is in cards-15a-w.ts).
  'Gate to Manorborn': gate('G'),
};

/** Garden of Freyalise: a shock land (it enters tapped; paying 3 life untaps it). */
export const BRAWL_15B_G_BACKS: Record<string, Behavior> = {
  'Garden of Freyalise': {
    entersTapped: true,
    abilities: [
      tapFor('G'),
      when({ on: 'etb' }, [], {
        kind: 'may',
        effects: [
          { kind: 'loseLife', who: 'controller', amount: 3 },
          { kind: 'untap', what: 'self' },
        ],
      }),
    ],
  },
};
