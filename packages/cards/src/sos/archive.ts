import type { AbilityDef, CardDefinition, EffectDef, ManaCost, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { when } from '../blb/helpers.ts';
import {
  combos,
  cycling,
  draw,
  mana,
  mode,
  spell,
  t0,
  t1,
  theirCreature,
  yourCreature,
} from '../fin/helpers.ts';
import { storm } from '../stx/archive.ts';

/**
 * Mystical Archive (16, SOA): the Secrets of Strixhaven Mystical Archive cards no
 * other set file implements. Printed characteristics come from Scryfall; only
 * rules text lives here. One-offs are `custom` handlers in
 * packages/engine/src/archive-16-effects.ts.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const aPlayer: TargetSpec = { what: 'player' };
const aCreature: TargetSpec = { what: 'creature' };
const yours: Ref = { each: 'creature', controller: 'you' };
const free: ManaCost = { generic: 0, colored: {} };
const youControlCommander = {
  kind: 'controlsPermanents',
  filter: { commander: true },
  min: 1,
} as const;

const ROYAL_ROLE = 'archive-royal-role-token';
const MONSTER_ROLE = 'archive-monster-role-token';
const APE = 'archive-ape-token';
const LIZARD_8 = 'archive-lizard-8-token';

const role = (
  id: string,
  name: string,
  color: 'W' | 'R',
  keywords: CardDefinition['keywords'],
): CardDefinition => ({
  id,
  name,
  manaCost: free,
  colors: [color],
  types: ['Enchantment'],
  supertypes: [],
  subtypes: ['Aura', 'Role'],
  keywords: [],
  abilities: [{ kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1, keywords } }],
  isToken: true,
});
const creatureToken = (
  id: string,
  name: string,
  color: 'G' | 'R',
  subtype: string,
  p: number,
  t: number,
): CardDefinition => ({
  id,
  name,
  manaCost: free,
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes: [subtype],
  power: p,
  toughness: t,
  keywords: [],
  abilities: [],
  isToken: true,
});

/** Tokens made by the Mystical Archive's cards. */
export const SOS_ARCHIVE_TOKENS: CardDefinition[] = [
  // "Enchanted creature gets +1/+1 and has ward {1}."
  role(ROYAL_ROLE, 'Royal Role', 'W', ['wardOne']),
  // "Enchanted creature gets +1/+1 and has trample."
  role(MONSTER_ROLE, 'Monster Role', 'R', ['trample']),
  creatureToken(APE, 'Ape', 'G', 'Ape', 3, 3),
  creatureToken(LIZARD_8, 'Lizard', 'R', 'Lizard', 8, 8),
];

const spreeMode = (
  cost: string,
  label: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
) => ({
  paws: 1,
  cost: mana(cost),
  spell: { label: `+ ${cost}: ${label}`, targets, effects },
});

export const SOS_ARCHIVE: Record<string, Behavior> = {
  // ------------------------------------------------------------ white
  Armageddon: spell([], { kind: 'destroyAll', permanents: true, filter: { types: ['Land'] } }),
  Reprieve: spell([{ what: 'spell' }], { kind: 'returnSpellToHand', what: t0 }, draw(1)),
  "Angel's Grace": { ...spell([], custom('angelsGraceLock')), splitSecond: true },
  'Duty Beyond Death': {
    sacrificeCreatureToCast: true,
    ...spell(
      [],
      { kind: 'pump', to: yours, power: 0, toughness: 0, keywords: ['indestructible'] },
      { kind: 'counters', to: yours, amount: 1 },
    ),
  },
  'Requisition Raid': {
    spree: [mana('{1}'), mana('{1}'), mana('{1}')],
    pawprints: [
      spreeMode(
        '{1}',
        'Destroy target artifact',
        [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        {
          kind: 'destroy',
          what: t0,
        },
      ),
      spreeMode(
        '{1}',
        'Destroy target enchantment',
        [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        { kind: 'destroy', what: t0 },
      ),
      spreeMode(
        '{1}',
        'Put a +1/+1 counter on each creature target player controls',
        [aPlayer],
        custom('counterOnEachOfPlayer', { target: 0 }),
      ),
    ].map(({ paws, spell: s }) => ({ paws, spell: s })),
  },
  'Return to the Ranks': {
    convoke: true,
    // Simplified: no targets; up to X creature cards with mana value 2 or less come back (the strongest first).
    ...spell([], custom('returnToRanks')),
  },
  'Winds of Abandon': {
    ...spell(
      [theirCreature],
      { kind: 'exile', what: t0 },
      {
        kind: 'searchLibrary',
        filter: 'basicLand',
        to: 'battlefieldTapped',
        forControllerOf: 0,
      },
    ),
    kicker: {
      cost: mana('{4}{W}{W}'),
      as: 'overload',
      replacesCost: true,
      altLabel: 'overload',
      spell: { targets: [], effects: [custom('windsOverload')] },
    },
  },
  "Akroma's Will": (() => {
    const modes = [
      mode('Flying, vigilance and double strike', [], {
        kind: 'pump',
        to: yours,
        power: 0,
        toughness: 0,
        keywords: ['flying', 'vigilance', 'doubleStrike'],
      }),
      mode(
        'Lifelink, indestructible and protection from each color',
        [],
        {
          kind: 'pump',
          to: yours,
          power: 0,
          toughness: 0,
          keywords: ['lifelink', 'indestructible'],
        },
        custom('protectionFromEachColor'),
      ),
    ];
    return {
      modes,
      // "If you control a commander as you cast this spell, you may choose both instead."
      kicker: { cost: free, spell: combos(modes, [2])[0]!, onlyIf: youControlCommander },
    };
  })(),
  // ------------------------------------------------------------ blue
  'Brain Freeze': {
    ...spell([aPlayer], { kind: 'mill', count: 3, who: t0 }),
    abilities: [storm],
  },
  'Bring to Light': spell([], {
    kind: 'searchLibrary',
    filter: { types: ['Creature', 'Instant', 'Sorcery'], maxManaValue: 'colorsSpent' },
    to: 'castFree',
  }),
  Daze: {
    ...spell([{ what: 'spell' }], { kind: 'counterUnlessPays', what: t0, cost: mana('{1}') }),
    kicker: {
      cost: free,
      replacesCost: true,
      returnLand: true,
      returnLandFilter: { subtype: 'Island' },
      altLabel: 'return an Island',
    },
  },
  'Disdainful Stroke': spell([{ what: 'spell', filter: { minManaValue: 4 } }], {
    kind: 'counter',
    what: t0,
  }),
  Flusterstorm: {
    ...spell([{ what: 'spell', filter: { types: ['Instant', 'Sorcery'] } }], {
      kind: 'counterUnlessPays',
      what: t0,
      cost: mana('{1}'),
    }),
    abilities: [storm],
  },
  'Force of Will': {
    ...spell([{ what: 'spell' }], { kind: 'counter', what: t0 }),
    kicker: {
      cost: free,
      replacesCost: true,
      life: 1,
      exileFromHand: { colors: ['U'] },
      altLabel: 'pay 1 life, exile a blue card',
    },
  },
  'Prismatic Ending': spell(
    [{ what: 'permanent', filter: { nonland: true } }],
    custom('prismaticEnding'),
  ),
  'Sleight of Hand': spell([], { kind: 'lookAndTake', count: 2, filter: {} }),
  // ------------------------------------------------------------ black
  'Ad Nauseam': spell([], { kind: 'chooseCustom', handler: 'adNauseam' }),
  'Culling the Weak': {
    sacrificeCreatureToCast: true,
    ...spell([], { kind: 'addMana', mana: [['B'], ['B'], ['B'], ['B']] }),
  },
  Dismember: {
    ...spell([aCreature], { kind: 'pump', to: t0, power: -5, toughness: -5 }),
    // {1}{B/P}{B/P}: the Phyrexian pips are paid with black; the alternative pays 4 life instead.
    kicker: {
      cost: mana('{1}'),
      replacesCost: true,
      life: 4,
      altLabel: 'pay 4 life',
    },
  },
  'Feed the Swarm': spell(
    [{ what: 'permanent', controller: 'opponent', filter: { types: ['Creature', 'Enchantment'] } }],
    custom('feedTheSwarm'),
  ),
  'Living End': {
    ...spell([], custom('livingEnd')),
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}{B}'), suspendSelf: 3 },
        fromHand: true,
        sorcerySpeed: true,
        targets: [],
        effects: [],
        label: 'Suspend 3—{2}{B}{B}',
      },
    ],
  },
  'Locust Spray': {
    ...spell([aCreature], { kind: 'pump', to: t0, power: -1, toughness: -1 }),
    abilities: [cycling('{B}')],
  },
  "Sheoldred's Edict": {
    modes: [
      mode('Each opponent sacrifices a nontoken creature', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Creature'], nontoken: true },
      }),
      mode('Each opponent sacrifices a creature token', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Creature'], token: true },
      }),
      mode('Each opponent sacrifices a planeswalker', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Planeswalker'] },
      }),
    ],
  },
  Smallpox: spell(
    [],
    { kind: 'loseLife', who: 'eachPlayer', amount: 1 },
    { kind: 'discard', count: 1, who: 'controller' },
    { kind: 'discard', count: 1, who: 'eachOpponent' },
    { kind: 'eachPlayerSacrifices' },
    { kind: 'opponentSacrifices', you: true, filter: { types: ['Land'] } },
    { kind: 'opponentSacrifices', filter: { types: ['Land'] } },
  ),
  'Vampiric Tutor': spell(
    [],
    { kind: 'searchLibrary', filter: {}, to: 'libraryTop' },
    { kind: 'loseLife', who: 'controller', amount: 2 },
  ),
  // ------------------------------------------------------------ red
  Berserk: {
    castOnlyIf: { kind: 'beforeCombatDamage' },
    ...spell(
      [aCreature],
      { kind: 'pump', to: t0, power: { powerOf: t0 }, toughness: 0, keywords: ['trample'] },
      custom('berserkDelay'),
    ),
  },
  "Brotherhood's End": {
    modes: [
      mode('3 damage to each creature and each planeswalker', [], {
        kind: 'damage',
        amount: 3,
        to: { each: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } },
      }),
      mode('Destroy all artifacts with mana value 3 or less', [], {
        kind: 'destroyAll',
        permanents: true,
        filter: { types: ['Artifact'], maxManaValue: 3 },
      }),
    ],
  },
  'Deflecting Palm': spell([], custom('deflectingPalm')),
  'Empty the Warrens': {
    ...spell([], { kind: 'createToken', token: 'goblin-token', count: 2 }),
    abilities: [storm],
  },
  "Jeska's Will": (() => {
    const modes = [
      mode("Add {R} for each card in target opponent's hand", [], custom('jeskasMana')),
      mode('Exile the top three cards of your library; you may play them this turn', [], {
        kind: 'exileTopPlayable',
        count: 3,
        until: 'endOfTurn',
      }),
    ];
    return {
      modes,
      kicker: { cost: free, spell: combos(modes, [2])[0]!, onlyIf: youControlCommander },
    };
  })(),
  'Monstrous Rage': spell(
    [yourCreature],
    { kind: 'pump', to: t0, power: 2, toughness: 0 },
    custom('archiveRole', { role: MONSTER_ROLE }),
  ),
  'Pyretic Ritual': spell([], { kind: 'addMana', mana: [['R'], ['R'], ['R']] }),
  'Subterranean Tremors': spell(
    [],
    {
      kind: 'damage',
      amount: { x: true },
      to: { each: 'creature', filter: { lacksKeyword: 'flying' } },
    },
    {
      kind: 'if',
      condition: { kind: 'amountAtLeast', amount: { x: true }, min: 4 },
      then: [{ kind: 'destroyAll', permanents: true, filter: { types: ['Artifact'] } }],
    },
    {
      kind: 'if',
      condition: { kind: 'amountAtLeast', amount: { x: true }, min: 8 },
      then: [{ kind: 'createToken', token: LIZARD_8, count: 1 }],
    },
  ),
  // ------------------------------------------------------------ green
  'Crop Rotation': {
    sacrificeCreatureToCast: true,
    sacrificeToCastFilter: { types: ['Land'] },
    ...spell([], { kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'battlefield' }),
  },
  'Glimpse of Nature': spell([], {
    kind: 'emblem',
    until: 'thisTurn',
    ability: when({ on: 'castSpell', filter: 'creature' }, [], draw(1)) as AbilityDef,
  }),
  'Knockout Maneuver': spell(
    [yourCreature, theirCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
  ),
  'Pick Your Poison': {
    modes: [
      mode('Each opponent sacrifices an artifact', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Artifact'] },
      }),
      mode('Each opponent sacrifices an enchantment', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Enchantment'] },
      }),
      mode('Each opponent sacrifices a creature with flying', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Creature'], hasKeyword: 'flying' },
      }),
    ],
  },
  Pongify: spell(
    [aCreature],
    { kind: 'destroy', what: t0 },
    { kind: 'createToken', token: APE, count: 1, forControllerOf: 0 },
  ),
  'Royal Treatment': spell(
    [yourCreature],
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['hexproof'] },
    custom('archiveRole', { role: ROYAL_ROLE }),
  ),
  'Shamanic Revelation': spell(
    [],
    { kind: 'draw', who: 'controller', amount: { count: 'creaturesYouControl' } },
    {
      // Ferocious: 4 life for each creature you control with power 4 or greater.
      kind: 'gainLife',
      who: 'controller',
      amount: {
        multiply: 4,
        amount: { count: 'permanentsYouControl', filter: { types: ['Creature'], minPower: 4 } },
      },
    },
  ),
  'Shared Roots': spell([], {
    kind: 'searchLibrary',
    filter: 'basicLand',
    to: 'battlefieldTapped',
  }),
  // Infect isn't modelled: the +1/+1 and trample are.
  'Triumph of the Hordes': spell([], {
    kind: 'pump',
    to: yours,
    power: 1,
    toughness: 1,
    keywords: ['trample'],
  }),
  'Veil of Summer': spell(
    [],
    {
      kind: 'if',
      condition: { kind: 'opponentCastColoredSpell', colors: ['U', 'B'] },
      then: [draw(1)],
    },
    custom('uncounterableThisTurn'),
    { kind: 'playerHexproof' },
    // Simplified: hexproof rather than hexproof from blue and from black, and only for creatures.
    { kind: 'pump', to: yours, power: 0, toughness: 0, keywords: ['hexproof'] },
  ),
};
