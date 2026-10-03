import type { AbilityDef, EffectDef, Ref, SpellDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  basicOrTown,
  chapter,
  combos,
  creature,
  cycling,
  draw,
  equip,
  equipped,
  gain,
  hero,
  jobSelect,
  landcycling,
  mana,
  mayRummage,
  mode,
  onEnter,
  returnTransformed,
  spell,
  t0,
  t1,
  theirCreature,
  tiered,
  yourCreature,
  yours,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) 11a: the cards of our first two decks, Heroes' Arsenal (R/W
 * Equipment and job select) and Eidolons' Call (G/W Sagas and Summons).
 * Printed characteristics come from Scryfall; only rules text lives here.
 */

const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const pump = (to: Ref, power: number, toughness: number, keywords?: ('flying' | 'trample')[]) =>
  ({ kind: 'pump', to, power, toughness, ...(keywords ? { keywords } : {}) }) as EffectDef;

const others = { each: 'creature', controller: 'you', filter: { other: true } } as const;
const anotherOfYours: TargetSpec = { what: 'creature', controller: 'you', filter: { other: true } };
const equipmentYouControl = { types: ['Artifact' as const], subtype: 'Equipment' };
const yourSaga: TargetSpec = { what: 'permanent', controller: 'you', filter: { subtype: 'Saga' } };
const knight: EffectDef = { kind: 'createToken', token: 'fin-knight-token', count: 1 };

// ------------------------------------------------------------ R/W: Heroes' Arsenal

export const HEROES_ARSENAL: Record<string, Behavior> = {
  'Giott, King of the Dwarves': {
    abilities: [
      onEnter(mayRummage),
      triggered(
        {
          on: 'otherPermanentEtb',
          filter: { anyOf: [{ types: ['Creature'], subtype: 'Dwarf' }, equipmentYouControl] },
        },
        [],
        mayRummage,
      ),
    ],
  },
  // "Whenever an opponent gains control of a permanent from you, you create a Treasure" isn't modelled.
  'Zidane, Tantalus Thief': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [theirCreature],
        effects: [
          { kind: 'gainControl', what: t0 },
          { kind: 'untap', what: t0 },
          { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['lifelink', 'haste'] },
        ],
      },
    ],
  },
  'Dwarven Castle Guard': { abilities: [triggered({ on: 'dies' }, [], hero())] },
  'Adelbert Steiner': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'permanentsYouControl', filter: equipmentYouControl },
          toughness: { count: 'permanentsYouControl', filter: equipmentYouControl },
        },
      },
    ],
  },
  'Item Shopkeep': {
    abilities: [
      triggered(
        { on: 'youAttack' },
        [{ what: 'creature', controller: 'you', filter: { attacking: true, equipped: true } }],
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['menace'] },
      ),
    ],
  },
  Coeurl: {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true },
        targets: [{ what: 'creature', filter: { notTypes: ['Enchantment'] } }],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
  // The Equipment and the creature are chosen as the trigger goes on the stack, with the {1}.
  'Weapons Vendor': {
    abilities: [
      onEnter(draw(1)),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'controlsPermanents', filter: equipmentYouControl, min: 1 },
        cost: mana('{1}'),
        targets: [
          { what: 'permanent', controller: 'you', filter: equipmentYouControl },
          yourCreature,
        ],
        effects: [{ kind: 'attach', what: t0, to: t1 }],
      },
    ],
  },
  'Barret Wallace': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'damage',
        amount: {
          count: 'permanentsYouControl',
          filter: { types: ['Creature'], equipped: true },
        },
        to: 'eachOpponent',
      }),
    ],
  },

  // Job select Equipment.
  "White Mage's Staff": {
    abilities: [
      jobSelect,
      equipped(1, 1, 'Cleric'),
      triggered({ on: 'equippedAttacks' }, [], gain(1)),
      equip('{3}'),
    ],
  },
  "Red Mage's Rapier": {
    abilities: [
      jobSelect,
      equipped(0, 0, 'Wizard'),
      triggered({ on: 'castSpell', filter: 'noncreature' }, [], pump('attached', 2, 0)),
      equip('{3}'),
    ],
  },
  "Paladin's Arms": {
    abilities: [jobSelect, equipped(2, 1, 'Knight', ['wardOne']), equip('{4}')],
  },
  "Dragoon's Lance": {
    abilities: [
      jobSelect,
      equipped(1, 0, 'Knight', [], { yourTurnKeywords: ['flying'] }),
      equip('{4}'),
    ],
  },
  "Samurai's Katana": {
    abilities: [jobSelect, equipped(2, 2, 'Samurai', ['trample', 'haste']), equip('{5}')],
  },
  "Warrior's Sword": { abilities: [jobSelect, equipped(3, 2, 'Warrior'), equip('{5}')] },
  "Monk's Fist": { abilities: [jobSelect, equipped(1, 0, 'Monk'), equip('{2}')] },
  "Bard's Bow": { abilities: [jobSelect, equipped(2, 2, 'Bard', ['reach']), equip('{6}')] },
  "Machinist's Arsenal": {
    abilities: [
      jobSelect,
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: {
            multiply: 2,
            amount: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } },
          },
          toughness: {
            multiply: 2,
            amount: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } },
          },
          addSubtypes: ['Artificer'],
        },
      },
      equip('{4}'),
    ],
  },
  'Crystal Fragments': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      returnTransformed('{5}{W}{W}'),
      equip('{1}'),
    ],
  },

  // Spells.
  'Thunder Magic': tiered(
    ['{0}', mode('Thunder', [creature], { kind: 'damage', amount: 2, to: t0 })],
    ['{3}', mode('Thundara', [creature], { kind: 'damage', amount: 4, to: t0 })],
    ['{5}{R}', mode('Thundaga', [creature], { kind: 'damage', amount: 8, to: t0 })],
  ),
  'Fire Magic': tiered(
    ['{0}', mode('Fire', [], { kind: 'damage', amount: 1, to: { each: 'creature' } })],
    ['{2}', mode('Fira', [], { kind: 'damage', amount: 2, to: { each: 'creature' } })],
    ['{5}', mode('Firaga', [], { kind: 'damage', amount: 3, to: { each: 'creature' } })],
  ),
  'Restoration Magic': tiered(
    [
      '{0}',
      mode('Cure', [{ what: 'permanent' }], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        keywords: ['hexproof', 'indestructible'],
      }),
    ],
    [
      '{1}',
      mode(
        'Cura',
        [{ what: 'permanent' }],
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['hexproof', 'indestructible'] },
        gain(3),
      ),
    ],
    [
      '{3}{W}',
      mode(
        'Curaga',
        [],
        {
          kind: 'pump',
          to: { each: 'permanent', controller: 'you' },
          power: 0,
          toughness: 0,
          keywords: ['hexproof', 'indestructible'],
        },
        gain(6),
      ),
    ],
  ),
  'Slash of Light': spell([creature], {
    kind: 'damage',
    amount: {
      sum: [
        { count: 'creaturesYouControl' },
        { count: 'permanentsYouControl', filter: equipmentYouControl },
      ],
    },
    to: t0,
  }),
  "You're Not Alone": spell([creature], {
    kind: 'if',
    condition: { kind: 'controlsPermanents', filter: { types: ['Creature'] }, min: 3 },
    then: [pump(t0, 4, 4)],
    else: [pump(t0, 2, 2)],
  }),
  'Battle Menu': {
    modes: [
      mode('Attack: a 2/2 Knight', [], knight),
      mode('Ability: +0/+4', [creature], pump(t0, 0, 4)),
      mode('Magic: destroy power 4+', [{ what: 'creature', filter: { minPower: 4 } }], {
        kind: 'destroy',
        what: t0,
      }),
      mode('Item: gain 4 life', [], gain(4)),
    ],
  },
  'Fate of the Sun-Cryst': {
    ...spell([{ what: 'permanent', filter: { nonland: true } }], { kind: 'destroy', what: t0 }),
    costReductionIfTarget: { filter: { tapped: true, types: ['Creature'] }, amount: 2 },
  },
};

/** Back faces (not cards of their own). */
export const HEROES_ARSENAL_BACKS: Record<string, Behavior> = {
  'Summon: Alexander': {
    saga: 3,
    abilities: [
      chapter([1, 2], [], { kind: 'custom', handler: 'shieldCreaturesThisTurn' }),
      chapter([3], [], { kind: 'tap', what: { each: 'creature', controller: 'opponent' } }),
    ],
  },
};

// --------------------------------------------------- G/W: Sagas and Summons

const removeLore: SpellDef = mode('Remove a lore counter', [yourSaga], {
  kind: 'removeLore',
  what: t0,
});
const addLore: SpellDef = mode('Add a lore counter', [yourSaga], { kind: 'addLore', what: t0 });
const fight: SpellDef = mode('Fight', [yourCreature, theirCreature], {
  kind: 'fight',
  a: t0,
  b: t1,
});

export const EIDOLONS_CALL: Record<string, Behavior> = {
  'Garnet, Princess of Alexandria': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'removeLoreFromAny',
        then: [{ kind: 'counters', to: 'self', amount: 1 }],
      }),
    ],
  },
  'Rinoa Heartilly': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'angelo-token', count: 1 }),
      triggered({ on: 'attacks' }, [anotherOfYours], {
        kind: 'pump',
        to: t0,
        power: { count: 'creaturesYouControl' },
        toughness: { count: 'creaturesYouControl' },
      }),
    ],
  },
  'Snow Villiers': { powerEquals: { count: 'creaturesYouControl' } },
  'Loporrit Scout': {
    abilities: [triggered({ on: 'otherCreatureEtb', controller: 'you' }, [], pump('self', 1, 1))],
  },
  'Goobbue Gardener': { abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }] },
  'Balamb T-Rexaur': { abilities: [onEnter(gain(3)), landcycling('Forest')] },
  // "Mill four cards; you may put a land card from among them into your hand." The Town's 2 life isn't modelled.
  'Town Greeter': {
    abilities: [onEnter({ kind: 'millThenTake', count: 4, filter: { types: ['Land'] } })],
  },
  "Dion, Bahamut's Dominant": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Knight' },
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
      onEnter(knight),
      returnTransformed('{4}{W}{W}', true),
    ],
  },

  // Summons (Saga creatures).
  'Summon: Choco/Mog': {
    saga: 4,
    abilities: [chapter([1, 2, 3, 4], [], pump(others, 1, 0))],
  },
  'Summon: Primal Garuda': {
    saga: 3,
    abilities: [
      chapter([1], [{ what: 'creature', controller: 'opponent', filter: { tapped: true } }], {
        kind: 'damage',
        amount: 4,
        to: t0,
      }),
      chapter([2, 3], [anotherOfYours], pump(t0, 1, 0, ['flying'])),
    ],
  },
  'Summon: Fat Chocobo': {
    saga: 4,
    abilities: [
      chapter([1], [], { kind: 'createToken', token: 'fin-bird-token', count: 1 }),
      chapter([2, 3, 4], [], pump(yours, 0, 0, ['trample'])),
    ],
  },
  'Summon: Fenrir': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }),
      chapter([2], [], {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: triggered({ on: 'castSpell', filter: 'creature' }, [], {
          kind: 'custom',
          handler: 'bonusCounterOnSubject',
        }),
      }),
      chapter([3], [], { kind: 'custom', handler: 'drawIfGreatestPower' }),
    ],
  },
  'Summon: Titan': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'mill', count: 5 }),
      chapter([2], [], { kind: 'returnLandsFromGraveyard' }),
      chapter([3], [anotherOfYours], {
        kind: 'pump',
        to: t0,
        power: { count: 'landsYouControl' },
        toughness: { count: 'landsYouControl' },
        keywords: ['trample'],
      }),
    ],
  },
  'Esper Origins': {
    ...spell([], { kind: 'surveil', amount: 2 }, gain(2)),
    flashback: mana('{3}{G}'),
    flashbackSpell: {
      targets: [],
      effects: [
        { kind: 'surveil', amount: 2 },
        gain(2),
        { kind: 'custom', handler: 'enterTransformedWithFinality' },
      ],
    },
  },

  // Spells.
  'Clash of the Eikons': { modes: combos([fight, removeLore, addLore], [1, 2, 3]) },
  "Tifa's Limit Break": tiered(
    ['{0}', mode('Somersault', [creature], pump(t0, 2, 2))],
    [
      '{2}',
      mode('Meteor Strikes', [creature], {
        kind: 'pump',
        to: t0,
        power: { powerOf: t0 },
        toughness: { toughnessOf: t0 },
      }),
    ],
    [
      '{6}{G}',
      mode('Final Heaven', [creature], {
        kind: 'pump',
        to: t0,
        power: { multiply: 2, amount: { powerOf: t0 } },
        toughness: { multiply: 2, amount: { toughnessOf: t0 } },
      }),
    ],
  ),
  'Airship Crash': {
    ...spell(
      [
        {
          what: 'permanent',
          filter: {
            anyOf: [
              { types: ['Artifact'] },
              { types: ['Enchantment'] },
              { types: ['Creature'], hasKeyword: 'flying' },
            ],
          },
        },
      ],
      { kind: 'destroy', what: t0 },
    ),
    abilities: [cycling('{2}')],
  },
  // The +1/+1 counter's target is chosen as the spell is cast.
  "Prishe's Wanderings": spell(
    [{ ...yourCreature, optional: true }],
    { kind: 'searchLibrary', filter: basicOrTown, to: 'battlefieldTapped' },
    { kind: 'counters', to: t0, amount: 1 },
  ),
  "Rydia's Return": {
    modes: [
      mode('Creatures get +3/+3', [], pump(yours, 3, 3)),
      mode(
        'Return two permanent cards',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land'] },
            optional: true,
          },
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land'] },
            optional: true,
          },
        ],
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
      ),
    ],
  },
  'Blitzball Shot': spell([creature], pump(t0, 3, 3, ['trample'])),
};

/** Back faces (not cards of their own). */
export const EIDOLONS_CALL_BACKS: Record<string, Behavior> = {
  'Bahamut, Warden of Light': {
    saga: 3,
    abilities: [
      chapter(
        [1, 2],
        [],
        { kind: 'counters', to: others, amount: 1 },
        pump(others, 0, 0, ['flying']),
      ),
      chapter(
        [3],
        [{ what: 'permanent' }],
        { kind: 'destroy', what: t0 },
        { kind: 'blink', what: 'self' },
      ),
    ],
  },
  'Summon: Esper Maduin': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'custom', handler: 'revealTopPermanentToHand' }),
      chapter([2], [], { kind: 'addMana', mana: [['G'], ['G']] }),
      chapter([3], [], pump(others, 2, 2, ['trample'])),
    ],
  },
};
