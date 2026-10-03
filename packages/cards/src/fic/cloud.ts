import type { Behavior } from '../build.ts';
import { classCard } from '../blb/helpers.ts';
import {
  activated,
  creature,
  custom,
  draw,
  equip,
  equipment,
  equipped,
  mana,
  mode,
  onEnter,
  permanent,
  pump,
  self,
  spell,
  staticAbility,
  t0,
  treasure,
  when,
  yourEquipment,
} from './helpers.ts';

/**
 * Limit Break (12b), the Arena Store Brawl deck led by Cloud, Ex-SOLDIER
 * (R/G/W): Equipment. Its cards that aren't Final Fantasy booster cards or
 * shared lands.
 */

const equippedAttacking = { types: ['Creature' as const], equipped: true, attacking: true };

/** Arms Scavenger's spellbook here: Equipment in the pool (Arena's own list isn't printed). */
const SCAVENGER_BOOK = [
  'adventuring-gear',
  'basilisk-collar',
  'fireshrieker',
  'goldvein-pick',
  'pirates-cutlass',
  'swiftfoot-boots',
  'sword-of-vengeance',
  'colossus-hammer',
  'darksteel-plate',
  'heros-heirloom',
  'buster-sword',
];

/** Spree: one or more modes, each adding its cost ({1} each for Requisition Raid). */
const raidModes = [
  mode('Destroy an artifact', [permanent({ types: ['Artifact'] })], {
    kind: 'destroy',
    what: t0,
  }),
  mode('Destroy an enchantment', [permanent({ types: ['Enchantment'] })], {
    kind: 'destroy',
    what: t0,
  }),
  // "Each creature target player controls": always you (a simplification).
  mode('+1/+1 counter on each creature you control', [], {
    kind: 'counters',
    to: { each: 'creature', controller: 'you' },
    amount: 1,
  }),
];

export const CLOUD: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Cloud, Ex-SOLDIER': {
    abilities: [
      onEnter([yourEquipment({ optional: true })], { kind: 'attach', to: self, what: t0 }),
      when(
        { on: 'attacks' },
        [],
        draw({ count: 'permanentsYouControl', filter: equippedAttacking }),
        {
          kind: 'if',
          condition: { kind: 'sourcePowerAtLeast', min: 7 },
          then: [treasure(2)],
        },
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Arms Scavenger': {
    abilities: [
      when(
        { on: 'beginningOfUpkeep', whose: 'yours' },
        [],
        custom('draftToExile', { book: SCAVENGER_BOOK }),
      ),
      staticAbility({ kind: 'equipCostsLess', amount: 1 }),
    ],
  },
  'Professional Face-Breaker': {
    abilities: [
      when({ on: 'creaturesYouControlDealCombatDamageToPlayer' }, [], treasure()),
      activated(
        null,
        { sacrificePermanent: { subtype: 'Treasure' } },
        [],
        [{ kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' }],
      ),
    ],
  },
  'Tifa, Martial Artist': {
    abilities: [
      // Melee: one opponent in Brawl.
      when({ on: 'attacks' }, [], pump(self, 1, 1)),
      {
        ...when(
          { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: { minPower: 7 } },
          [],
          { kind: 'untap', what: { each: 'creature', controller: 'you' } },
          {
            kind: 'if',
            condition: { kind: 'custom', handler: 'firstCombat' },
            then: [{ kind: 'extraCombat' }],
          },
        ),
      },
    ],
  },
  // ------------------------------------------------------------ Equipment
  'Colossus Hammer': {
    abilities: [equipped(10, 10, [], { loseKeywords: ['flying'] }), equip('{8}')],
  },
  'Darksteel Plate': { abilities: [equipped(0, 0, ['indestructible']), equip('{2}')] },
  "Hero's Heirloom": {
    abilities: [equipped(2, 1, [], { legendaryKeywords: ['trample', 'haste'] }), equip('{2}')],
  },
  'Lost Jitte': {
    abilities: [
      // "Deals combat damage": to a player here (a simplification).
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], {
        kind: 'namedCounters',
        name: 'charge',
        amount: 1,
      }),
      activated(
        null,
        { removeCounters: { name: 'charge', count: 1 } },
        [permanent({ types: ['Land'] })],
        [{ kind: 'untap', what: t0 }],
        { label: 'Untap target land' },
      ),
      activated(
        null,
        { removeCounters: { name: 'charge', count: 1 } },
        [creature],
        [pump(t0, 0, 0, [], { cantBlock: true })],
        { label: "Target creature can't block" },
      ),
      activated(
        null,
        { removeCounters: { name: 'charge', count: 1 } },
        [],
        [{ kind: 'counters', to: 'attached', amount: 1 }],
        { label: '+1/+1 counter on equipped creature' },
      ),
      equip('{1}'),
    ],
  },
  'Sword of Forge and Frontier': {
    abilities: [
      // Protection from red and from green isn't built (a simplification).
      equipped(2, 2),
      when(
        { on: 'equippedDealsCombatDamageToPlayer' },
        [],
        { kind: 'exileTopPlayable', count: 2, until: 'endOfTurn' },
        custom('extraLandThisTurn'),
      ),
      equip('{2}'),
    ],
  },
  'Sword of Vengeance': {
    abilities: [equipped(2, 0, ['firstStrike', 'vigilance', 'trample', 'haste']), equip('{3}')],
  },
  // ------------------------------------------------------------ other permanents
  'Fighter Class': classCard(
    [
      onEnter([], { kind: 'searchLibrary', filter: equipment, to: 'hand' }),
      staticAbility({
        kind: 'equipCostsLess',
        amount: 2,
        condition: { kind: 'classLevel', min: 2 },
      }),
      {
        ...when(
          { on: 'creatureYouControlAttacks' },
          [{ what: 'creature', controller: 'opponent', optional: true }],
          custom('mustBlockSubject'),
        ),
        condition: { kind: 'classLevel', min: 3 },
      },
    ],
    { cost: '{1}{R}{W}', abilities: [] },
    { cost: '{3}{R}{W}', abilities: [] },
  ),
  'Furious Rise': {
    abilities: [
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], {
          kind: 'exileTopPlayableUntilNext',
        }),
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
      },
    ],
  },
  'Inspiring Statuary': {
    abilities: [staticAbility({ kind: 'nonartifactSpellsHaveImprovise' })],
  },
  // ------------------------------------------------------------ spells
  Decimate: spell(
    [
      permanent({ types: ['Artifact'] }),
      { what: 'creature' },
      permanent({ types: ['Enchantment'] }),
      permanent({ types: ['Land'] }),
    ],
    { kind: 'destroy', what: { target: 0 } },
    { kind: 'destroy', what: { target: 1 } },
    { kind: 'destroy', what: { target: 2 } },
    { kind: 'destroy', what: { target: 3 } },
  ),
  Explore: spell([], custom('extraLandThisTurn'), draw(1)),
  'Rampant Growth': spell([], {
    kind: 'searchLibrary',
    filter: 'basicLand',
    to: 'battlefieldTapped',
  }),
  'Requisition Raid': {
    // Spree: every non-empty combination, {1} more per mode.
    modes: [1, 2, 3, 4, 5, 6, 7].map((mask) => {
      const picked = raidModes.filter((_, i) => mask & (1 << i));
      const targets = picked.flatMap((m) => m.targets);
      let shift = 0;
      const effects = picked.flatMap((m) => {
        const out = m.effects.map((e) =>
          'what' in e && typeof e.what === 'object' && 'target' in e.what
            ? { ...e, what: { target: shift } }
            : e,
        );
        shift += m.targets.length;
        return out;
      });
      return {
        label: `${picked.map((m) => m.label).join(' + ')} — {${picked.length}}`,
        targets,
        effects,
        extraCost: mana(`{${picked.length}}`),
      };
    }),
  },
  'Secret Rendezvous': spell([], draw(3), { kind: 'draw', who: 'eachOpponent', amount: 3 }),
};
