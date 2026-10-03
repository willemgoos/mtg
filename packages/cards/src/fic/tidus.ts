import type { AbilityDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { combos, COLORS, tapFor } from '../msc/helpers.ts';
import {
  activated,
  atCombat,
  condition,
  counters,
  creature,
  custom,
  draw,
  equip,
  equipped,
  mana,
  may,
  mode,
  oncePerTurn,
  onEnter,
  permanent,
  self,
  spell,
  staticAbility,
  t0,
  token,
  when,
  yourCreature,
} from './helpers.ts';

/**
 * Counter Blitz (12c), the Arena Store Brawl deck led by Tidus, Yuna's
 * Guardian (G/W/U): +1/+1 counters. Its cards that aren't Final Fantasy
 * booster cards or shared lands.
 */

/** Saddle N: tap other creatures with total power N or more; it's saddled until end of turn. */
const saddle = (n: number): AbilityDef =>
  activated(null, { crew: n }, [], [custom('saddle')], {
    sorcerySpeed: true,
    label: `Saddle ${n}`,
  });
const whenSaddledAttacks = (...effects: Parameters<typeof when>[2][]): AbilityDef => ({
  ...when({ on: 'attacks' }, [], ...effects),
  condition: condition('saddled'),
});
const proliferate = custom('proliferate');
const levelUp = (to: number, cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  condition: { kind: 'classLevel', exactly: to - 1 },
  targets: [],
  effects: [{ kind: 'levelUp' }],
  label: `Level ${to}`,
});

export const TIDUS: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  "Tidus, Yuna's Guardian": {
    abilities: [
      atCombat(
        [
          { ...yourCreature, filter: { hasCounters: true }, optional: true },
          { ...yourCreature, filter: { other: true }, optional: true },
        ],
        custom('moveCounter'),
      ),
      // Cheer — "you may draw a card and proliferate. Do this only once each turn."
      oncePerTurn(
        when(
          { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: { hasCounters: true } },
          [],
          may(draw(1), proliferate),
        ),
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Altered Ego': {
    entersAsCopy: { anyManaValue: true },
    entersWithXCounters: true,
  },
  'Botanical Brawler': {
    entersWithCounters: 2,
    abilities: [
      {
        ...when({ on: 'youPutCounters', other: true }, [], counters(self)),
        condition: condition('subjectFirstCounters'),
      },
    ],
  },
  'Bulwark Ox': {
    abilities: [
      {
        ...when({ on: 'attacks' }, [creature], counters(t0)),
        condition: condition('saddled'),
      },
      activated(
        null,
        { sacrificeSelf: true },
        [],
        [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { hasCounters: true } },
            power: 0,
            toughness: 0,
            keywords: ['hexproof', 'indestructible'],
          },
        ],
      ),
      saddle(1),
    ],
  },
  'Chasm Skulker': {
    abilities: [
      when({ on: 'drawCard', whose: 'yours' }, [], counters(self)),
      when({ on: 'dies' }, [], custom('tokensBySourceCounters', { token: 'squid-token' })),
    ],
  },
  'District Mascot': {
    entersWithCounters: 1,
    abilities: [
      activated(
        '{1}{G}',
        {},
        [permanent({ types: ['Artifact'] })],
        [custom('removeSelfCounters', { n: 2 }), { kind: 'destroy', what: t0 }],
        { condition: { kind: 'sourceCounters', min: 2 } },
      ),
      whenSaddledAttacks(counters(self)),
      saddle(1),
    ],
  },
  'Duskshell Crawler': {
    abilities: [
      onEnter([creature], counters(t0)),
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { minPlusOneCounters: 1 },
        power: 0,
        toughness: 0,
        keywords: ['trample'],
      }),
    ],
  },
  'Forgotten Ancient': {
    // Its upkeep move is never used (the engine keeps the counters on it, a simplification).
    abilities: [
      {
        ...when({ on: 'castSpell', filter: 'any', caster: 'any' }, [], counters(self)),
        optional: true,
      },
    ],
  },
  'Generous Pup': {
    abilities: [
      oncePerTurn({
        ...when({ on: 'youPutCounters' }, [], {
          kind: 'counters',
          to: { each: 'creature', controller: 'you', filter: { other: true } },
          amount: 1,
        }),
        condition: condition('subjectIsSelf'),
      }),
    ],
  },
  'Grateful Apparition': { abilities: [when({ on: 'combatDamageToPlayer' }, [], proliferate)] },
  'Incubation Druid': {
    // "Any type a land you control could produce": any colour; three with a counter: two here.
    abilities: [
      ...COLORS.map((c) => tapFor(c, { doubleIf: { kind: 'sourceCounters', min: 1 } })),
      activated(
        '{3}{G}{G}',
        {},
        [],
        [
          {
            kind: 'if',
            condition: { kind: 'not', condition: { kind: 'sourceCounters', min: 1 } },
            then: [counters(self, 3)],
          },
        ],
        { label: 'Adapt 3' },
      ),
    ],
  },
  'Luminous Broodmoth': {
    abilities: [
      {
        ...when({ on: 'creatureYouControlDies', filter: { lacksKeyword: 'flying' } }, [], {
          kind: 'returnToBattlefield',
          what: 'subject',
          counter: 'flying',
        }),
        condition: condition('subjectHadNoFlyingCounter'),
      },
    ],
  },
  'Tireless Tracker': {
    abilities: [
      when({ on: 'landfall' }, [], token('clue-token')),
      when({ on: 'youSacrifice', filter: { subtype: 'Clue' } }, [], counters(self)),
    ],
  },
  'Yuna, Grand Summoner': {
    abilities: [
      ...COLORS.map((c) => tapFor(c)),
      // Grand Summon's delayed bonus: the next creature spell cast while Yuna is tapped (a simplification).
      oncePerTurn({
        ...when(
          { on: 'castSpell', filter: 'creature' },
          [],
          custom('subjectBonusCounters', { n: 2 }),
        ),
        condition: { kind: 'sourceTapped' },
      }),
      {
        ...when(
          { on: 'permanentYouControlDies', filter: {} },
          [{ what: 'creature', optional: true }],
          custom('countersBySubjectLastCounters'),
        ),
        condition: condition('subjectHadCounters'),
      },
    ],
  },
  // ------------------------------------------------------------ other permanents
  'Bred for the Hunt': {
    abilities: [
      {
        ...when(
          {
            on: 'creatureYouControlDealsCombatDamage',
            toPlayer: true,
            filter: { minPlusOneCounters: 1 },
          },
          [],
          draw(1),
        ),
        optional: true,
      },
    ],
  },
  'Fight Rigging': {
    abilities: [
      onEnter([], custom('hideaway', { count: 5 })),
      atCombat([yourCreature], counters(t0), {
        kind: 'if',
        condition: { kind: 'controlsCreature', filter: { minPower: 7 } },
        then: [{ kind: 'castFree', what: self, from: 'exiledWithSource' }],
      }),
    ],
  },
  'Hardened Scales': { abilities: [staticAbility({ kind: 'oneMoreCounter' })] },
  'Inexorable Tide': {
    abilities: [when({ on: 'castSpell', filter: 'any' }, [], proliferate)],
  },
  'Ranger Class': {
    abilities: [
      onEnter([], token('wolf-2-2-token')),
      levelUp(2, '{1}{G}'),
      {
        ...when(
          { on: 'youAttack' },
          [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
          counters(t0),
        ),
        condition: { kind: 'classLevel', min: 2 },
      },
      levelUp(3, '{3}{G}'),
      staticAbility({
        kind: 'playFromTop',
        filter: { types: ['Creature'] },
        condition: { kind: 'classLevel', min: 3 },
      }),
    ],
  },
  'Sword of Body and Mind': {
    abilities: [
      // Protection from green and from blue isn't built (a simplification).
      equipped(2, 2),
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], token('wolf-2-2-token'), {
        kind: 'mill',
        count: 10,
        who: 'eachOpponent',
      }),
      equip('{2}'),
    ],
  },
  // ------------------------------------------------------------ spells
  // Spells and graveyard cards aren't targets here: a nonland permanent, put on top by its owner.
  'Endless Detour': spell([permanent({ nonland: true })], {
    kind: 'putInLibrary',
    what: t0,
    position: 'top',
  }),
  Farewell: {
    modes: combos(
      [
        mode('Exile all artifacts', [], {
          kind: 'exile',
          what: { each: 'permanent', filter: { types: ['Artifact'] } },
        }),
        mode('Exile all creatures', [], {
          kind: 'exile',
          what: { each: 'permanent', filter: { types: ['Creature'] } },
        }),
        mode('Exile all enchantments', [], {
          kind: 'exile',
          what: { each: 'permanent', filter: { types: ['Enchantment'] } },
        }),
        mode('Exile all graveyards', [], { kind: 'exileGraveyard', who: 'eachPlayer' }),
      ],
      [1, 2, 3, 4],
    ),
  },
  'Pull from Tomorrow': spell([], draw({ x: true }), { kind: 'discard', count: 1 }),
};
