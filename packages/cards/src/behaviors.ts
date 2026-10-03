import type { AbilityDef, CardDefinition, EffectDef, ManaType, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost } from './build.ts';
import { BLOOMBURROW_BEHAVIORS } from './bloomburrow.ts';
import { MARVEL_BACK_FACES, MARVEL_BEHAVIORS, MARVEL_TOKENS } from './marvel.ts';
import {
  FINAL_FANTASY_BACK_FACES,
  FINAL_FANTASY_BEHAVIORS,
  FINAL_FANTASY_TOKENS,
} from './final-fantasy.ts';
import { MARVEL_BRAWL_BEHAVIORS, MARVEL_BRAWL_TOKENS } from './marvel-brawl.ts';
import { STRIXHAVEN_BACK_FACES, STRIXHAVEN_BEHAVIORS, STRIXHAVEN_TOKENS } from './strixhaven.ts';
import {
  SECRETS_OF_STRIXHAVEN_BACK_FACES,
  SECRETS_OF_STRIXHAVEN_BEHAVIORS,
} from './secrets-of-strixhaven.ts';
import { STRIXHAVEN_BRAWL_BEHAVIORS } from './strixhaven-brawl.ts';
import { FOUNDATIONS_BATCH_BEHAVIORS } from './foundations-batch.ts';

// Helpers for the common shapes.
const t0 = { target: 0 } as const;
const t1 = { target: 1 } as const;
const anyTarget: TargetSpec = { what: 'any' };
const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const cost = (generic: number, R = 0, G = 0) => ({
  generic,
  colored: { ...(R ? { R } : {}), ...(G ? { G } : {}) },
});

const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
const burn = (n: number, target: TargetSpec = anyTarget) =>
  spell([target], { kind: 'damage', amount: n, to: t0 });
const pump = (p: number, t: number, keywords: CardDefinition['keywords'] = []) =>
  spell([creature], { kind: 'pump', to: t0, power: p, toughness: t, keywords });
const mana = parseManaCost;
const damage = (amount: number): EffectDef => ({ kind: 'damage', amount, to: t0 });
const draw = (amount: number): EffectDef => ({ kind: 'draw', who: 'controller', amount });
/** "Creatures you control". */
const yours = { each: 'creature', controller: 'you' } as const;
const gain = (amount: number): EffectDef => ({ kind: 'gainLife', who: 'controller', amount });
/** Threshold: seven or more cards in your graveyard. */
const threshold = { kind: 'graveyardCount', min: 7 } as const;
/** Prowess: +1/+1 until end of turn whenever you cast a noncreature spell. */
const prowess: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'noncreature' },
  targets: [],
  effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
};
/** Morbid: "if a creature died this turn". */
const morbid = { kind: 'creatureDiedThisTurn' } as const;
/** "Another target creature you control" (optional: "up to"). */
const yourOther = (optional = false): TargetSpec => ({
  what: 'creature',
  controller: 'you',
  filter: { other: true },
  ...(optional ? { optional: true } : {}),
});
const onLifeGain = (...effects: EffectDef[]): AbilityDef & { kind: 'triggered' } => ({
  kind: 'triggered',
  trigger: { on: 'youGainLife' },
  targets: [],
  effects,
});
/** "Whenever another creature you control enters". */
const whenAnotherEnters = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'otherCreatureEtb', controller: 'you' },
  targets: [],
  effects,
});
/** Equip {cost}: attach to target creature you control, sorcery speed. */
const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

// ------------------------------------------------------------ two-colour lands
const tapFor = (produces: ManaType): AbilityDef => ({
  kind: 'mana',
  cost: { tapSelf: true },
  produces,
});
const onEnter = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects,
});

/** Guildgate, gain-land and Temple for each colour pair (all enter tapped). */
const DUAL_LANDS: [
  pair: [ManaType, ManaType],
  guildgate: string,
  gainLand: string,
  temple: string,
][] = [
  [['W', 'U'], 'Azorius Guildgate', 'Tranquil Cove', 'Temple of Enlightenment'],
  [['U', 'B'], 'Dimir Guildgate', 'Dismal Backwater', 'Temple of Deceit'],
  [['B', 'R'], 'Rakdos Guildgate', 'Bloodfell Caves', 'Temple of Malice'],
  [['R', 'G'], 'Gruul Guildgate', 'Rugged Highlands', 'Temple of Abandon'],
  [['G', 'W'], 'Selesnya Guildgate', 'Blossoming Sands', 'Temple of Plenty'],
  [['W', 'B'], 'Orzhov Guildgate', 'Scoured Barrens', 'Temple of Silence'],
  [['U', 'R'], 'Izzet Guildgate', 'Swiftwater Cliffs', 'Temple of Epiphany'],
  [['B', 'G'], 'Golgari Guildgate', 'Jungle Hollow', 'Temple of Malady'],
  [['R', 'W'], 'Boros Guildgate', 'Wind-Scarred Crag', 'Temple of Triumph'],
  [['G', 'U'], 'Simic Guildgate', 'Thornwood Falls', 'Temple of Mystery'],
];

const dualLandBehaviors = (): Record<string, Behavior> =>
  Object.fromEntries(
    DUAL_LANDS.flatMap(([[a, b], guildgate, gainLand, temple]) => {
      const mana = [tapFor(a), tapFor(b)];
      return [
        [guildgate, { entersTapped: true, abilities: mana }],
        [
          gainLand,
          {
            entersTapped: true,
            abilities: [onEnter({ kind: 'gainLife', who: 'controller', amount: 1 }), ...mana],
          },
        ],
        [
          temple,
          { entersTapped: true, abilities: [onEnter({ kind: 'scry', amount: 1 }), ...mana] },
        ],
      ];
    }),
  );

/**
 * Behavior for each card, keyed by exact card name. Printed characteristics
 * (cost, types, P/T, keywords) come from Scryfall; only rules text lives here.
 */
export const BEHAVIORS: Record<string, Behavior> = {
  ...FOUNDATIONS_BATCH_BEHAVIORS,
  ...BLOOMBURROW_BEHAVIORS,
  ...MARVEL_BEHAVIORS,
  ...MARVEL_BACK_FACES,
  ...MARVEL_BRAWL_BEHAVIORS,
  ...FINAL_FANTASY_BEHAVIORS,
  ...FINAL_FANTASY_BACK_FACES,
  ...STRIXHAVEN_BEHAVIORS,
  ...STRIXHAVEN_BACK_FACES,
  ...SECRETS_OF_STRIXHAVEN_BEHAVIORS,
  ...SECRETS_OF_STRIXHAVEN_BACK_FACES,
  ...STRIXHAVEN_BRAWL_BEHAVIORS,
  // ---------------------------------------------------------------- red
  Shock: burn(2),
  'Lightning Strike': burn(3),
  Boltwave: spell([], { kind: 'damage', amount: 3, to: 'eachOpponent' }),
  'Kindled Fury': pump(1, 0, ['firstStrike']),
  'Sure Strike': pump(3, 0, ['firstStrike']),
  'Crash Through': spell(
    [],
    {
      kind: 'pump',
      to: { each: 'creature', controller: 'you' },
      power: 0,
      toughness: 0,
      keywords: ['trample'],
    },
    { kind: 'draw', who: 'controller', amount: 1 },
  ),
  'Dragon Fodder': spell([], { kind: 'createToken', token: 'goblin-token', count: 2 }),
  'Seismic Rupture': spell([], {
    kind: 'damage',
    amount: 2,
    to: { each: 'creature', filter: { lacksKeyword: 'flying' } },
  }),
  'Fanatical Firebrand': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [anyTarget],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
    ],
  },
  'Viashino Pyromancer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  'Heartfire Immolator': {
    abilities: [
      // Prowess
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: cost(0, 1), sacrificeSelf: true },
        targets: [creature],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: t0 }],
      },
    ],
  },
  'Firebrand Archer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Searslicer Goblin': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'attackedThisTurn' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'goblin-token', count: 1 }],
      },
    ],
  },
  Guttersnipe: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent' }],
      },
    ],
  },
  'Giant Cindermaw': { abilities: [{ kind: 'static', effect: { kind: 'noLifeGain' } }] },
  'Spitfire Lagac': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Battlesong Berserker': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [yourCreature],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 0, keywords: ['menace'] }],
      },
    ],
  },
  'Ravenous Giant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'controller' }],
      },
    ],
  },
  'Ball Lightning': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
      },
    ],
  },
  'Gorehorn Raider': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'attackedThisTurn' },
        targets: [anyTarget],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  'Dragon Trainer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'dragon-token', count: 1 }],
      },
    ],
  },
  'Shivan Dragon': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(0, 1) },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },

  // -------------------------------------------------------------- green
  'Giant Growth': pump(3, 3),
  'Snakeskin Veil': spell(
    [yourCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['hexproof'] },
  ),
  'Bite Down': spell([yourCreature, theirCreature], {
    kind: 'damage',
    amount: { powerOf: t0 },
    from: t0,
    to: t1,
  }),
  // Printed: "artifact, enchantment, or creature with flying"; our pool has no artifacts/enchantments.
  'Broken Wings': spell([{ what: 'creature', filter: { hasKeyword: 'flying' } }], {
    kind: 'destroy',
    what: t0,
  }),
  'Felling Blow': spell(
    [yourCreature, theirCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'damage', amount: { powerOf: t0 }, from: t0, to: t1 },
  ),
  Overrun: spell([], {
    kind: 'pump',
    to: { each: 'creature', controller: 'you' },
    power: 3,
    toughness: 3,
    keywords: ['trample'],
  }),
  'Druid of the Cowl': { abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }] },
  "Dwynen's Elite": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'controlsAnother', subtype: 'Elf' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  'Imperious Perfect': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Elf' },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'activated',
        cost: { mana: cost(0, 0, 1), tapSelf: true },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  'Beast-Kin Ranger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },
  'Treetop Snarespinner': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(2, 0, 1) },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Gnarlback Rhino': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsSelf' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Wildheart Invoker': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(8) },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 5, toughness: 5, keywords: ['trample'] }],
      },
    ],
  },
  'Elfsworn Giant': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'elf-warrior-token', count: 1 }],
      },
    ],
  },
  "Heroes' Bane": {
    entersWithCounters: 4,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(2, 0, 2) },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: { powerOf: 'self' } }],
      },
    ],
  },
  'Rampaging Baloths': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'beast-token', count: 1 }],
      },
    ],
  },
  'Affectionate Indrik': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        optional: true,
        targets: [theirCreature],
        effects: [{ kind: 'fight', a: 'self', b: t0 }],
      },
    ],
  },
  'Pelakka Wurm': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 7 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },
  'Aggressive Mammoth': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
    ],
  },

  // ------------------------------------- Path of Power / Might of the Legion
  // red
  'Axgard Cavalry': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['haste'] }],
      },
    ],
  },
  'Frenzied Goblin': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        cost: mana('{R}'),
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBlock: true }],
      },
    ],
  },
  'Krenko, Mob Boss': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'goblin-token',
            count: { count: 'creaturesYouControl', subtype: 'Goblin' },
          },
        ],
      },
    ],
  },
  'Burst Lightning': {
    ...burn(2),
    kicker: { cost: mana('{4}'), spell: { targets: [anyTarget], effects: [damage(4)] } },
  },
  'Goblin Surprise': {
    modes: [
      {
        label: 'Creatures you control get +2/+0',
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 2, toughness: 0 }],
      },
      {
        label: 'Create two 1/1 Goblins',
        targets: [],
        effects: [{ kind: 'createToken', token: 'goblin-token', count: 2 }],
      },
    ],
  },
  'Courageous Goblin': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0, keywords: ['menace'] }],
      },
    ],
  },
  'Bulk Up': {
    ...spell([creature], { kind: 'pump', to: t0, power: { powerOf: t0 }, toughness: 0 }),
    flashback: mana('{4}{R}{R}'),
  },
  'Scorching Dragonfire': spell(
    [creature],
    { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
    damage(3),
  ),

  // green
  'Eager Trufflesnout': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'food-token', count: 1 }],
      },
    ],
  },
  'Llanowar Elves': { abilities: [tapFor('G')] },
  'Mild-Mannered Librarian': {
    // "Becomes a Werewolf" is not modelled: nothing in our pool cares about Werewolves.
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}') },
        once: true,
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 2 },
          { kind: 'draw', who: 'controller', amount: 1 },
        ],
      },
    ],
  },
  'Nessian Hornbeetle': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4, other: true } },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Spinner of Souls': {
    // "You may": always done (it only ever helps).
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'you', nontoken: true },
        targets: [],
        effects: [{ kind: 'revealUntilCreature' }],
      },
    ],
  },
  'Vizier of the Menagerie': {
    abilities: [{ kind: 'static', effect: { kind: 'creaturesFromTopOfLibrary' } }],
  },
  Bushwhack: {
    modes: [
      {
        label: 'Search for a basic land',
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
      },
      {
        label: 'Your creature fights one you don’t control',
        targets: [yourCreature, theirCreature],
        effects: [{ kind: 'fight', a: t0, b: t1 }],
      },
    ],
  },
  "Garruk's Uprising": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [draw(1)],
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: { minPower: 4 } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },

  // white
  'Crusader of Odric': { ptEquals: { count: 'creaturesYouControl' } },
  'Dauntless Veteran': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 1, toughness: 1 }],
      },
    ],
  },
  'Dawnwing Marshal': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}') },
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 1, toughness: 1 }],
      },
    ],
  },
  'Resolute Reinforcements': {
    abilities: [onEnter({ kind: 'createToken', token: 'soldier-token', count: 1 })],
  },
  'Valorous Stance': {
    modes: [
      {
        label: 'Indestructible until end of turn',
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['indestructible'] }],
      },
      {
        label: 'Destroy a creature with toughness 4 or greater',
        targets: [{ what: 'creature', filter: { minToughness: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Release the Dogs': spell([], { kind: 'createToken', token: 'dog-token', count: 4 }),
  'Celestial Armor': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourCreature],
        effects: [
          { kind: 'attach', to: t0 },
          {
            kind: 'pump',
            to: t0,
            power: 0,
            toughness: 0,
            keywords: ['hexproof', 'indestructible'],
          },
        ],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 0, keywords: ['flying'] },
      },
      equip('{3}{W}'),
    ],
  },

  // multicolour and colourless
  'Aurelia, the Warleader': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'firstAttackThisTurn' },
        targets: [],
        effects: [{ kind: 'untap', what: yours }, { kind: 'extraCombat' }],
      },
    ],
  },
  'Heroic Reinforcements': spell(
    [],
    { kind: 'createToken', token: 'soldier-token', count: 2 },
    { kind: 'pump', to: yours, power: 1, toughness: 1, keywords: ['haste'] },
  ),
  'Ashroot Animist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [
          {
            kind: 'pump',
            to: t0,
            power: { powerOf: 'self' },
            toughness: { powerOf: 'self' },
            keywords: ['trample'],
          },
        ],
      },
    ],
  },
  'Halana and Alena, Partners': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [
          { kind: 'counters', to: t0, amount: { powerOf: 'self' } },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['haste'] },
        ],
      },
    ],
  },
  'Ruby, Daring Tracker': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 2 }],
      },
      tapFor('R'),
      tapFor('G'),
    ],
  },
  'Goldvein Pick': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      {
        kind: 'triggered',
        trigger: { on: 'equippedDealsCombatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'treasure-token', count: 1 }],
      },
      equip('{1}'),
    ],
  },

  // ------------------------------------------ Cat Attack / Vampiric Hunger
  // white
  'Arahbo, the First Fang': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Cat' },
          power: 1,
          toughness: 1,
        },
      },
      onEnter({ kind: 'createToken', token: 'cat-token', count: 1 }),
      {
        kind: 'triggered',
        trigger: {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { subtype: 'Cat', nontoken: true },
        },
        targets: [],
        effects: [{ kind: 'createToken', token: 'cat-token', count: 1 }],
      },
    ],
  },
  'Felidar Savior': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [yourOther(true), yourOther(true)],
        effects: [
          { kind: 'counters', to: t0, amount: 1 },
          { kind: 'counters', to: t1, amount: 1 },
        ],
      },
    ],
  },
  'Helpful Hunter': { abilities: [onEnter(draw(1))] },
  'Leonin Vanguard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'controlsCreature', filter: {}, count: 3 },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 1 }, gain(1)],
      },
    ],
  },
  'Regal Caracal': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Cat' },
          power: 1,
          toughness: 1,
          keywords: ['lifelink'],
        },
      },
      onEnter({ kind: 'createToken', token: 'cat-lifelink-token', count: 2 }),
    ],
  },
  'Claws Out': {
    ...spell([], { kind: 'pump', to: yours, power: 2, toughness: 2 }),
    costReduction: { count: 'creaturesYouControl', subtype: 'Cat' },
  },
  'Angelic Destiny': {
    // "Is an Angel in addition to its other types" is not modelled.
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 4, toughness: 4, keywords: ['flying', 'firstStrike'] },
      },
      {
        kind: 'triggered',
        trigger: { on: 'attachedDies' },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Banishing Light': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        effects: [{ kind: 'exileUntilSourceLeaves', what: t0 }],
      },
    ],
  },
  "Ajani's Pridemate": { abilities: [onLifeGain({ kind: 'counters', to: 'self', amount: 1 })] },
  'Cat Collector': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'food-token', count: 1 }),
      {
        ...onLifeGain({ kind: 'createToken', token: 'cat-token', count: 1 }),
        condition: { kind: 'firstLifeGainThisTurn' },
      },
    ],
  },
  'Dazzling Angel': { abilities: [whenAnotherEnters(gain(1))] },
  'Hinterland Sanctifier': { abilities: [whenAnotherEnters(gain(1))] },
  'Inspiring Overseer': { abilities: [onEnter(gain(1), draw(1))] },
  'Sun-Blessed Healer': {
    kicker: { cost: mana('{1}{W}') },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasKicked' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature', 'Artifact', 'Enchantment'], maxManaValue: 2 },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Twinblade Paladin': {
    abilities: [
      onLifeGain({ kind: 'counters', to: 'self', amount: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'whileLife',
          minLife: 25,
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike'],
        },
      },
    ],
  },
  'Moment of Triumph': spell([creature], { kind: 'pump', to: t0, power: 2, toughness: 2 }, gain(2)),

  // green
  'Wary Thespian': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
    ],
  },

  // black
  'Sanguine Syphoner': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }, gain(1)],
      },
    ],
  },
  'Vengeful Bloodwitch': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies' },
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'loseLife', who: t0, amount: 1 }, gain(1)],
      },
    ],
  },
  'Moment of Craving': spell(
    [creature],
    { kind: 'pump', to: t0, power: -2, toughness: -2 },
    gain(2),
  ),
  'Tribute to Hunger': spell([{ what: 'player', controller: 'opponent' }], {
    kind: 'opponentSacrifices',
    gainToughness: true,
  }),
  'Phyrexian Arena': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },

  // multicolour
  'Good-Fortune Unicorn': {
    abilities: [whenAnotherEnters({ kind: 'counters', to: 'subject', amount: 1 })],
  },
  'Anthem of Champions': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 1, toughness: 1 },
      },
    ],
  },
  'Unflinching Courage': {
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 2, keywords: ['trample', 'lifelink'] },
      },
    ],
  },
  'Elenda, Saint of Dusk': {
    // Starting life total is 20.
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'whileLife', minLife: 21, power: 1, toughness: 1, keywords: ['menace'] },
      },
      { kind: 'static', effect: { kind: 'whileLife', minLife: 30, power: 5, toughness: 5 } },
    ],
  },
  'Fiendish Panda': {
    abilities: [
      onLifeGain({ kind: 'counters', to: 'self', amount: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: {
              types: ['Creature'],
              notSubtype: 'Bear',
              maxManaValue: 'sourcePower',
              other: true,
            },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  Mortify: spell([{ what: 'permanent', filter: { types: ['Creature', 'Enchantment'] } }], {
    kind: 'destroy',
    what: t0,
  }),

  // ------------------------------------- Reckless Raid / Morbid Machinations
  // red
  'Goblin Boarders': {
    entersWithCounters: 1,
    entersWithCountersIf: { kind: 'attackedThisTurn' },
  },
  'Slumbering Cerberus': {
    abilities: [
      { kind: 'static', effect: { kind: 'doesntUntap' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: morbid,
        targets: [],
        effects: [{ kind: 'untap', what: 'self' }],
      },
    ],
  },
  'Strongbox Raider': {
    abilities: [
      {
        ...onEnter({ kind: 'exileTopChooseOne', count: 2 }),
        condition: { kind: 'attackedThisTurn' },
      } as AbilityDef,
    ],
  },
  Abrade: {
    modes: [
      { label: '3 damage to a creature', targets: [creature], effects: [damage(3)] },
      {
        label: 'Destroy an artifact',
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },

  // black
  'Infernal Vessel': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        condition: { kind: 'diedWithout', subtype: 'Demon' },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', counters: 2, addSubtype: 'Demon' }],
      },
    ],
  },
  'Infestation Sage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'insect-token', count: 1 }],
      },
    ],
  },
  'Midnight Reaper': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', nontoken: true },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'controller' }, draw(1)],
      },
    ],
  },
  'Reassembling Skeleton': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true }],
      },
    ],
  },
  'Tragic Banshee': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [
          {
            kind: 'if',
            condition: morbid,
            then: [{ kind: 'pump', to: t0, power: -13, toughness: -13 }],
            else: [{ kind: 'pump', to: t0, power: -1, toughness: -1 }],
          },
        ],
      },
    ],
  },
  'Vampire Gourmand': {
    // "You may sacrifice another creature": pick one, or skip.
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        optional: true,
        targets: [yourOther()],
        effects: [
          { kind: 'sacrifice', what: t0 },
          draw(1),
          { kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true },
        ],
      },
    ],
  },
  'Undying Malice': spell([creature], {
    kind: 'pump',
    to: t0,
    power: 0,
    toughness: 0,
    returnWhenDies: { counters: 1, treasure: false },
  }),
  'Eaten Alive': {
    ...spell([creature], { kind: 'exile', what: t0 }),
    sacrificeOrPay: mana('{3}{B}'),
  },
  'Vampiric Rites': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), sacrificeCreature: true },
        targets: [],
        effects: [gain(1), draw(1)],
      },
    ],
  },
  'Diregraf Ghoul': { entersTapped: true },
  'High-Society Hunter': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        optional: true,
        targets: [yourOther()],
        effects: [
          { kind: 'sacrifice', what: t0 },
          { kind: 'counters', to: 'self', amount: 1 },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'any', nontoken: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Massacre Wurm': {
    abilities: [
      onEnter({
        kind: 'pump',
        to: { each: 'creature', controller: 'opponent' },
        power: -2,
        toughness: -2,
      }),
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'opponent' },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 2 }],
      },
    ],
  },
  'Fake Your Own Death': spell([creature], {
    kind: 'pump',
    to: t0,
    power: 2,
    toughness: 0,
    returnWhenDies: { counters: 0, treasure: true },
  }),
  "Hero's Downfall": spell([creature], { kind: 'destroy', what: t0 }),

  // green
  'Cackling Prowler': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: morbid,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Needletooth Pack': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: morbid,
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 2 }],
      },
    ],
  },
  'Quilled Greatwurm': {
    castFromGraveyardRemovingCounters: 6,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDealsCombatDamage' },
        targets: [],
        effects: [{ kind: 'counters', to: 'subject', amount: { event: 'amount' } }],
      },
    ],
  },
  'Scavenging Ooze': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{G}') },
        targets: [{ what: 'graveyardCard' }],
        effects: [
          {
            kind: 'exileGraveyardCard',
            what: t0,
            ifCreature: [{ kind: 'counters', to: 'self', amount: 1 }, gain(1)],
          },
        ],
      },
    ],
  },

  // multicolour
  'Wardens of the Cycle': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: morbid,
        targets: [],
        effects: [],
        modes: [
          { label: 'You gain 2 life', targets: [], effects: [gain(2)] },
          {
            label: 'Draw a card and lose 1 life',
            targets: [],
            effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
          },
        ],
      },
    ],
  },
  'Alesha, Who Laughs at Fate': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'attackedThisTurn' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 'sourcePower' },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Perforating Artist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'attackedThisTurn' },
        targets: [],
        effects: [{ kind: 'punisher', life: 3 }],
      },
    ],
  },

  // ---------------------------------- Learn From the Land / Arcane Aerialists
  // blue
  'Fog Bank': { abilities: [{ kind: 'static', effect: { kind: 'preventCombatDamage' } }] },
  'High Fae Trickster': { abilities: [{ kind: 'static', effect: { kind: 'flashForAll' } }] },
  'Spectral Sailor': {
    abilities: [
      { kind: 'activated', cost: { mana: mana('{3}{U}') }, targets: [], effects: [draw(1)] },
    ],
  },
  'Faebloom Trick': spell(
    // "When you do, tap target creature an opponent controls": the target is chosen on casting.
    [{ what: 'creature', controller: 'opponent', optional: true }],
    { kind: 'createToken', token: 'faerie-token', count: 2 },
    { kind: 'tap', what: t0 },
  ),
  'Chart a Course': spell([], draw(2), {
    kind: 'if',
    condition: { kind: 'attackedThisTurn' },
    then: [],
    else: [{ kind: 'discard', count: 1 }],
  }),
  'Bigfin Bouncer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Exclusion Mage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Mischievous Mystic': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'faerie-token', count: 1 }],
      },
    ],
  },
  'Quick Study': spell([], draw(2)),
  'Curator of Destinies': {
    // "Can't be countered" matters once counterspells exist (Phase 6).
    abilities: [onEnter({ kind: 'piles', count: 5 })],
  },

  // white
  'Giada, Font of Hope': {
    abilities: [
      { kind: 'static', effect: { kind: 'entersWithCountersPerSubtype', subtype: 'Angel' } },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W', onlyFor: 'Angel' },
    ],
  },
  'Lyra Dawnbringer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Angel' },
          power: 1,
          toughness: 1,
          keywords: ['lifelink'],
        },
      },
    ],
  },
  'Vanguard Seraph': {
    abilities: [
      {
        ...onLifeGain({ kind: 'surveil', amount: 1 }),
        condition: { kind: 'firstLifeGainThisTurn', anyTurn: true },
      },
    ],
  },
  'Youthful Valkyrie': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Angel' } },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Stasis Snare': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [{ kind: 'exileUntilSourceLeaves', what: t0 }],
      },
    ],
  },

  // green
  'Apothecary Stomper': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Two +1/+1 counters on a creature you control',
            targets: [yourCreature],
            effects: [{ kind: 'counters', to: t0, amount: 2 }],
          },
          { label: 'You gain 4 life', targets: [], effects: [gain(4)] },
        ],
      },
    ],
  },
  'Loot, Exuberant Explorer': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraLandDrop' } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'lookForCreature', count: 6 }],
      },
    ],
  },
  'Mossborn Hydra': {
    entersWithCounters: 1,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: { countersOn: 'self' } }],
      },
    ],
  },
  'Circuitous Route': spell(
    [],
    { kind: 'searchLibrary', filter: 'basicLandOrGate', to: 'battlefieldTapped', shuffle: false },
    { kind: 'searchLibrary', filter: 'basicLandOrGate', to: 'battlefieldTapped' },
  ),
  'Primeval Bounty': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'creature' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'beast-3-token', count: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 3 }],
      },
      { kind: 'triggered', trigger: { on: 'landfall' }, targets: [], effects: [gain(3)] },
    ],
  },

  // multicolour
  Cloudblazer: { abilities: [onEnter(gain(2), draw(2))] },
  'Empyrean Eagle': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { hasKeyword: 'flying' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  },
  'Tatyova, Benthic Druid': {
    abilities: [
      { kind: 'triggered', trigger: { on: 'landfall' }, targets: [], effects: [gain(1), draw(1)] },
    ],
  },

  // ---------------------------------------- Wondrous Wizardry / Graveyard Gifts
  // blue
  'Arcanis the Omnipotent': {
    abilities: [
      { kind: 'activated', cost: { tapSelf: true }, targets: [], effects: [draw(3)] },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}{U}') },
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
      },
    ],
  },
  'Brineborn Cutthroat': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'opponentsTurn' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Kiora, the Rising Tide': {
    abilities: [
      onEnter(draw(2), { kind: 'discard', count: 2 }),
      {
        // Threshold; "you may" is always taken.
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: threshold,
        targets: [],
        effects: [{ kind: 'createToken', token: 'scion-of-the-deep-token', count: 1 }],
      },
    ],
  },
  'Essence Scatter': spell([{ what: 'spell', filter: { types: ['Creature'] } }], {
    kind: 'counter',
    what: t0,
  }),
  Opt: spell([], { kind: 'scry', amount: 1 }, draw(1)),
  'Inspiration from Beyond': {
    ...spell(
      [],
      { kind: 'mill', count: 3 },
      { kind: 'returnFromGraveyard', types: ['Instant', 'Sorcery'] },
    ),
    flashback: mana('{5}{U}{U}'),
  },
  'Archmage of Runes': {
    abilities: [
      { kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Drake Hatcher': {
    abilities: [
      prowess,
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [{ kind: 'namedCounters', name: 'incubation', amount: { event: 'amount' } }],
      },
      {
        kind: 'activated',
        cost: { removeCounters: { name: 'incubation', count: 3 } },
        targets: [],
        effects: [{ kind: 'createToken', token: 'drake-token', count: 1 }],
      },
    ],
  },
  'Tolarian Terror': {
    costReduction: { count: 'cardsInGraveyard', types: ['Instant', 'Sorcery'] },
  },
  'Arcane Epiphany': {
    ...spell([], draw(3)),
    costReduction: { count: 'creaturesYouControl', subtype: 'Wizard', max: 1 },
  },
  'Dive Down': spell([yourCreature], {
    kind: 'pump',
    to: t0,
    power: 0,
    toughness: 3,
    keywords: ['hexproof'],
  }),

  // black
  'Abyssal Harvester': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [
          { what: 'graveyardCard', filter: { types: ['Creature'], enteredThisTurn: true } },
        ],
        effects: [
          {
            kind: 'tokenCopyOf',
            what: t0,
            addSubtype: 'Nightmare',
            exileOtherTokensWithSubtype: true,
          },
        ],
      },
    ],
  },
  'Arbiter of Woe': {
    sacrificeCreatureToCast: true,
    abilities: [
      onEnter(
        { kind: 'discard', count: 1, who: 'eachOpponent' },
        { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
        draw(1),
        gain(2),
      ),
    ],
  },
  'Billowing Shriekmass': {
    abilities: [
      onEnter({ kind: 'mill', count: 3 }),
      { kind: 'static', effect: { kind: 'while', condition: threshold, power: 2, toughness: 1 } },
    ],
  },
  'Crow of Dark Tidings': {
    abilities: [
      onEnter({ kind: 'mill', count: 2 }),
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'mill', count: 2 }],
      },
    ],
  },
  'Bake into a Pie': spell(
    [creature],
    { kind: 'destroy', what: t0 },
    { kind: 'createToken', token: 'food-token', count: 1 },
  ),
  Stab: spell([creature], { kind: 'pump', to: t0, power: -2, toughness: -2 }),
  'Rise of the Dark Realms': spell([], { kind: 'reanimateAll' }),
  Zombify: spell([{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }], {
    kind: 'returnToBattlefield',
    what: t0,
  }),

  // red
  'Ghitu Lavarunner': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'graveyardCount', min: 2, types: ['Instant', 'Sorcery'] },
          power: 1,
          toughness: 0,
          keywords: ['haste'],
        },
      },
    ],
  },
  'Fiery Annihilation': spell(
    [
      creature,
      // "Exile up to one target Equipment attached to that creature": any Equipment here.
      { what: 'permanent', filter: { subtype: 'Equipment' }, optional: true },
    ],
    { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
    damage(5),
    { kind: 'exile', what: t1 },
  ),

  // multicolour and colourless
  'Dreadwing Scavenger': {
    abilities: [
      onEnter(draw(1), { kind: 'discard', count: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: threshold,
          power: 1,
          toughness: 1,
          keywords: ['deathtouch'],
        },
      },
    ],
  },
  'Balmor, Battlemage Captain': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [{ kind: 'pump', to: yours, power: 1, toughness: 0, keywords: ['trample'] }],
      },
    ],
  },
  'Enigma Drake': { powerEquals: { count: 'cardsInGraveyard', types: ['Instant', 'Sorcery'] } },
  'Niv-Mizzet, Visionary': {
    abilities: [
      { kind: 'static', effect: { kind: 'noMaxHandSize' } },
      {
        kind: 'triggered',
        trigger: { on: 'yourNoncombatDamageToOpponent' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: { event: 'amount' } }],
      },
    ],
  },
  'Ovika, Enigma Goliath': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'phyrexian-goblin-token',
            count: { event: 'amount' },
            hasteThisTurn: true,
          },
        ],
      },
    ],
  },
  'Gleaming Barrier': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'treasure-token', count: 1 }],
      },
    ],
  },

  // --------------------------------------------- Color Challenge: white
  'Charmed Stray': {
    abilities: [
      onEnter({
        kind: 'counters',
        to: {
          each: 'creature',
          controller: 'you',
          filter: { sameNameAsSource: true, other: true },
        },
        amount: 1,
      }),
    ],
  },
  'Hallowed Priest': { abilities: [onLifeGain({ kind: 'counters', to: 'self', amount: 1 })] },
  'Impassioned Orator': { abilities: [whenAnotherEnters(gain(1))] },
  'Moorland Inquisitor': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['firstStrike'] }],
      },
    ],
  },
  'Angel of Vitality': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraLifeGain', amount: 1 } },
      { kind: 'static', effect: { kind: 'whileLife', minLife: 25, power: 2, toughness: 2 } },
    ],
  },
  'Leonin Warleader': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'cat-lifelink-token', count: 2, attacking: true }],
      },
    ],
  },
  'Spiritual Guardian': { abilities: [onEnter(gain(4))] },
  'Angelic Guardian': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { attacking: true } },
            power: 0,
            toughness: 0,
            keywords: ['indestructible'],
          },
        ],
      },
    ],
  },
  'Inspiring Commander': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: { maxPower: 2 } },
        targets: [],
        effects: [gain(1), draw(1)],
      },
    ],
  },
  'Goring Ceratops': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { other: true } },
            power: 0,
            toughness: 0,
            keywords: ['doubleStrike'],
          },
        ],
      },
    ],
  },
  Pacifism: {
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, cantAttackOrBlock: true },
      },
    ],
  },
  'Angelic Reward': {
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 3, toughness: 3, keywords: ['flying'] },
      },
    ],
  },
  'Tactical Advantage': spell(
    [{ what: 'creature', controller: 'you', filter: { inCombatBlock: true } }],
    { kind: 'pump', to: t0, power: 2, toughness: 2 },
  ),
  'Confront the Assault': {
    ...spell([], { kind: 'createToken', token: 'spirit-flying-token', count: 3 }),
    castOnlyIf: { kind: 'beingAttacked' },
  },
  'Bond of Discipline': spell(
    [],
    { kind: 'tap', what: { each: 'creature', controller: 'opponent' } },
    { kind: 'pump', to: yours, power: 0, toughness: 0, keywords: ['lifelink'] },
  ),

  // ----------------------------------------------- Color Challenge: red
  'Tin Street Cadet': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'becomesBlocked' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'goblin-token', count: 1 }],
      },
    ],
  },
  'Goblin Tunneler': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', filter: { maxPower: 2 } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Molten Ravager': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{R}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },
  'Goblin Gang Leader': {
    abilities: [onEnter({ kind: 'createToken', token: 'goblin-token', count: 2 })],
  },
  'Goblin Trashmaster': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Goblin' },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'activated',
        cost: { sacrificeCreature: true, sacrificeFilter: { subtype: 'Goblin' } },
        targets: [{ what: 'permanent', filter: { types: ['Artifact'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Ogre Battledriver': {
    abilities: [
      whenAnotherEnters({
        kind: 'pump',
        to: 'subject',
        power: 2,
        toughness: 0,
        keywords: ['haste'],
      }),
    ],
  },
  'Immortal Phoenix': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Siege Dragon': {
    abilities: [
      onEnter({
        kind: 'destroy',
        what: { each: 'creature', controller: 'opponent', filter: { subtype: 'Wall' } },
      }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'opponentControlsCreature', filter: { subtype: 'Wall' } },
            then: [],
            else: [
              {
                kind: 'damage',
                amount: 2,
                to: {
                  each: 'creature',
                  controller: 'opponent',
                  filter: { lacksKeyword: 'flying' },
                },
              },
            ],
          },
        ],
      },
    ],
  },
  'Raid Bombardment': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlAttacks', filter: { maxPower: 2 } },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  'Storm Strike': spell(
    [creature],
    { kind: 'pump', to: t0, power: 1, toughness: 0, keywords: ['firstStrike'] },
    { kind: 'scry', amount: 1 },
  ),
  'Burn Bright': spell([], { kind: 'pump', to: yours, power: 2, toughness: 0 }),
  'Inescapable Blaze': burn(6),
  'Goblin Gathering': spell([], {
    kind: 'createToken',
    token: 'goblin-token',
    count: { count: 'cardsInGraveyard', named: 'goblin-gathering', plus: 2 },
  }),

  // --------------------------------------------- Color Challenge: green
  'Jungle Delver': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}') },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Ilysian Caryatid': {
    // "Two mana of any one color" is modelled as two mana of any colors.
    abilities: (['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true },
      produces,
      doubleIf: { kind: 'controlsCreature', filter: { minPower: 4 } },
    })),
  },
  'Woodland Mystic': { abilities: [tapFor('G')] },
  'Baloth Packhunter': {
    abilities: [
      onEnter({
        kind: 'counters',
        to: {
          each: 'creature',
          controller: 'you',
          filter: { sameNameAsSource: true, other: true },
        },
        amount: 2,
      }),
    ],
  },
  'Prized Unicorn': { abilities: [{ kind: 'static', effect: { kind: 'lure' } }] },
  'World Shaper': {
    abilities: [
      {
        // "You may mill": always done.
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'mill', count: 3 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'returnLandsFromGraveyard' }],
      },
    ],
  },
  'Rampaging Brontodon': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: { count: 'landsYouControl' },
            toughness: { count: 'landsYouControl' },
          },
        ],
      },
    ],
  },
  'Colossal Majesty': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Epic Proportions': {
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 5, toughness: 5, keywords: ['trample'] },
      },
    ],
  },
  'Stony Strength': spell(
    [yourCreature],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'untap', what: t0 },
  ),
  'Rabid Bite': spell([yourCreature, theirCreature], {
    kind: 'damage',
    amount: { powerOf: t0 },
    to: t1,
    from: t0,
  }),

  ...dualLandBehaviors(),
};

const token = (
  id: string,
  name: string,
  color: 'R' | 'G' | 'W' | 'B' | 'U',
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
});

const artifactToken = (id: string, name: string, abilities: AbilityDef[]): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: ['Artifact'],
  supertypes: [],
  subtypes: [name],
  keywords: [],
  abilities,
  isToken: true,
});

export const TOKENS: CardDefinition[] = [
  ...MARVEL_TOKENS,
  ...MARVEL_BRAWL_TOKENS,
  ...FINAL_FANTASY_TOKENS,
  ...STRIXHAVEN_TOKENS,
  token('zombie-token', 'Zombie', 'B', ['Zombie'], 2, 2),
  token('cat-beast-token', 'Cat Beast', 'W', ['Cat', 'Beast'], 2, 2),
  token('raccoon-token', 'Raccoon', 'G', ['Raccoon'], 3, 3),
  token('dragon-5-token', 'Dragon', 'R', ['Dragon'], 5, 5, ['flying']),
  token('knight-3-token', 'Knight', 'W', ['Knight'], 3, 3),
  token('rabbit-token', 'Rabbit', 'W', ['Rabbit'], 1, 1),
  token('rat-token', 'Rat', 'B', ['Rat'], 1, 1),
  token('goblin-token', 'Goblin', 'R', ['Goblin'], 1, 1),
  token('dragon-token', 'Dragon', 'R', ['Dragon'], 4, 4, ['flying']),
  token('elf-warrior-token', 'Elf Warrior', 'G', ['Elf', 'Warrior'], 1, 1),
  token('beast-token', 'Beast', 'G', ['Beast'], 4, 4),
  token('soldier-token', 'Soldier', 'W', ['Soldier'], 1, 1),
  token('dog-token', 'Dog', 'W', ['Dog'], 1, 1),
  token('cat-token', 'Cat', 'W', ['Cat'], 1, 1),
  token('cat-lifelink-token', 'Cat', 'W', ['Cat'], 1, 1, ['lifelink']),
  token('faerie-token', 'Faerie', 'U', ['Faerie'], 1, 1, ['flying']),
  token('beast-3-token', 'Beast', 'G', ['Beast'], 3, 3),
  token('drake-token', 'Drake', 'U', ['Drake'], 2, 2, ['flying']),
  token('spirit-flying-token', 'Spirit', 'W', ['Spirit'], 1, 1, ['flying']),
  token('phyrexian-goblin-token', 'Phyrexian Goblin', 'R', ['Phyrexian', 'Goblin'], 1, 1),
  token('squirrel-token', 'Squirrel', 'G', ['Squirrel'], 1, 1),
  token('fish-token', 'Fish', 'U', ['Fish'], 1, 1),
  token('bat-token', 'Bat', 'B', ['Bat'], 1, 1, ['flying']),
  token('snail-token', 'Snail', 'B', ['Snail'], 1, 1),
  token('wall-token', 'Wall', 'W', ['Wall'], 0, 4, ['defender']),
  {
    // Blacksmith's Talent's Sword: "Equipped creature gets +1/+1", equip {2}.
    ...artifactToken('sword-token', 'Sword', [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      equip('{2}'),
    ]),
    subtypes: ['Equipment'],
  },
  {
    ...token('otter-token', 'Otter', 'U', ['Otter'], 1, 1),
    colors: ['U', 'R'],
    abilities: [prowess],
  },
  {
    // Vren's Rats: "This token gets +1/+1 for each other Rat you control."
    ...token('vren-rat-token', 'Rat', 'B', ['Rat'], 1, 1),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'creaturesYouControl', subtype: 'Rat', other: true },
          toughness: { count: 'creaturesYouControl', subtype: 'Rat', other: true },
        },
      },
    ],
  },
  {
    ...artifactToken('cragflame-token', 'Cragflame', [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 1,
          toughness: 1,
          keywords: ['vigilance', 'trample', 'haste'],
        },
      },
      equip('{2}'),
    ]),
    supertypes: ['Legendary'],
    subtypes: ['Equipment'],
  },
  {
    ...token('scion-of-the-deep-token', 'Scion of the Deep', 'U', ['Octopus'], 8, 8),
    supertypes: ['Legendary'],
  },
  { ...token('insect-token', 'Insect', 'B', ['Insect'], 1, 1, ['flying']), colors: ['B', 'G'] },
  artifactToken('treasure-token', 'Treasure', [
    ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true, sacrificeSelf: true },
      produces,
    })),
  ]),
  artifactToken('food-token', 'Food', [
    {
      kind: 'activated',
      cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
      targets: [],
      effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
    },
  ]),
];
