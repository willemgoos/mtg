import type { AbilityDef, CardDefinition, CardFilter, EffectDef } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, onEnter, t0, t1, when } from '../blb/helpers.ts';
import { equip, spell, tapFor } from '../fin/helpers.ts';
import { sacrificeLandForCounters, subtypecycling } from '../hob-vocab.ts';
import { HOB_DWARF } from './tokens.ts';

/**
 * The Hobbit (20b): colorless (artifacts and lands) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_COLORLESS_BACKS. See docs/the-hobbit-plan.md.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });

type Mana = 'W' | 'U' | 'B' | 'R' | 'G';
type Attached = Extract<Extract<AbilityDef, { kind: 'static' }>['effect'], { kind: 'attached' }>;

const EQUIPMENT: CardFilter = { subtype: 'Equipment' };
const INSTANT_OR_SORCERY: CardFilter = { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }] };
const COLORS: Mana[] = ['W', 'U', 'B', 'R', 'G'];

/** "This land enters tapped. {T}: Add {A} or {B}." plus the sacrifice-for-counters ability (the five two-colour lands). */
const hobLand = (a: Mana, b: Mana, counters: AbilityDef): Behavior => ({
  entersTapped: true,
  abilities: [...tapFor(a, b), counters],
});

/** "Equipped creature gets +P/+T (and has ...)": a static ability of an Equipment. */
const equippedGets = (
  power: number,
  toughness: number,
  extra: Partial<Attached> = {},
): AbilityDef => ({ kind: 'static', effect: { kind: 'attached', power, toughness, ...extra } });

/** "Search your library for a basic land card, reveal it, put it into your hand, then shuffle." */
const searchBasicToHand: EffectDef = {
  kind: 'searchLibrary',
  filter: 'basicLand',
  to: 'hand',
  reveal: true,
};

export const HOB_COLORLESS: Record<string, Behavior> = {
  // "When this Equipment enters, attach it to target Dwarf you control. Equipped creature gets +2/+2 and has ward {1}. Equip {3}"
  'Dwarven Mattock': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'creature', controller: 'you', filter: { subtype: 'Dwarf' } }], {
        kind: 'attach',
        to: t0,
      }),
      equippedGets(2, 2, { keywords: ['wardOne'] }),
      equip('{3}'),
    ],
  },
  // "{T}, Pay 1 life, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then
  // shuffle. You may behold an Elf. If you do, untap that land."
  'Elven Passage': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, life: 1, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: 'basicLand',
            to: 'battlefieldTapped',
            rememberFound: true,
          },
          {
            kind: 'chooseCustom',
            handler: 'beholdThen',
            params: { filter: { subtype: 'Elf' }, then: [{ kind: 'untap', what: 'chosen' }] },
          },
        ],
      },
    ],
  },
  "Elvenking's Halls": hobLand('G', 'U', sacrificeLandForCounters('{2}{G}{U}', ['Elf'])),
  // "When this artifact enters, scry 2. {1}, {T}: Add one mana of any color. {7}, {T}, Sacrifice this artifact: Destroy target
  // permanent."
  "Giant's Boulder": {
    abilities: [
      onEnter({ kind: 'scry', amount: 2 }),
      // A mana ability whose cost is mana itself: it resolves at once and the mana (one colour, chosen as it is spent) waits in the pool.
      {
        kind: 'activated',
        manaAbility: true,
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [COLORS] }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{7}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'permanent' }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // "Instant and sorcery spells you cast cost {X} less to cast, where X is equipped creature's power. Equip {2}"
  'Glamdring, Foe-hammer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: INSTANT_OR_SORCERY,
          amount: { powerOf: 'attached' },
        },
      },
      equip('{2}'),
    ],
  },
  'Goblin-town': hobLand('B', 'R', sacrificeLandForCounters('{2}{B}{R}', ['Goblin', 'Orc'])),
  // "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.
  // Halflingcycling {4}"
  'Hobbit Hole': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      },
      subtypecycling('Halfling', '{4}'),
    ],
  },
  'Iron Hills': hobLand('R', 'W', sacrificeLandForCounters('{2}{R}{W}', ['Dwarf'])),
  // "{2}, {T}: Target creature can't be blocked this turn. {1}, {T}, Discard a legendary card with the same name as a legendary
  // permanent you control: Draw two cards."
  'Key to the Side-Door': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
      {
        kind: 'activated',
        cost: {
          mana: mana('{1}'),
          tapSelf: true,
          discard: true,
          discardNamesLegendaryPermanent: true,
        },
        targets: [],
        effects: [draw(2)],
      },
    ],
  },
  'Lake-town': hobLand('W', 'U', sacrificeLandForCounters('{2}{W}{U}', ['Human'])),
  // "Flash. Reach. When this creature enters, create a tapped Treasure token."
  'Long-Bodied Grey Dog': {
    abilities: [onEnter({ kind: 'createToken', token: 'treasure-token', count: 1, tapped: true })],
  },
  Mirkwood: hobLand('B', 'G', sacrificeLandForCounters('{2}{B}{G}', ['Bear', 'Spider', 'Wolf'])),
  // "Equipped creature has hexproof and can't be blocked. Equip—{2}, Pay 2 life."
  'My Precious': {
    abilities: [
      equippedGets(0, 0, { keywords: ['hexproof'], cantBeBlocked: true }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), life: 2 },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
        label: 'Equip',
      },
    ],
  },
  // "Flying. When this creature enters, you gain 2 life. You may search your library for a basic land card, reveal it, then shuffle
  // and put that card on top."
  'Old Thrush': {
    abilities: [
      onEnter(gain(2), {
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'libraryTop', reveal: true }],
      }),
    ],
  },
  // "Equipped creature gets +2/+2 and has trample. Whenever equipped creature deals combat damage to a player, choose a creature
  // type. Create a Treasure token for each creature you control of that type. Equip {3}"
  'Orcrist, Goblin-cleaver': {
    abilities: [
      equippedGets(2, 2, { keywords: ['trample'] }),
      when(
        { on: 'equippedDealsCombatDamageToPlayer' },
        [],
        { kind: 'chooseCreatureType' },
        { kind: 'createToken', token: 'treasure-token', count: { count: 'creaturesOfChosenType' } },
      ),
      equip('{3}'),
    ],
  },
  // "Flash. When Sting enters, put a hone counter on Sting for each creature target opponent controls. Attach Sting to up to one
  // target creature you control. (Each hone counter on an Equipment grants +1/+0 to equipped creature.) Equip {3}"
  "Sting, Bilbo's Sword": {
    abilities: [
      when(
        { on: 'etb' },
        [
          { what: 'player', controller: 'opponent' },
          { what: 'creature', controller: 'you', optional: true },
        ],
        {
          kind: 'namedCounters',
          name: 'hone',
          amount: { count: 'permanentsOpponentsControl', filter: { types: ['Creature'] } },
        },
        { kind: 'attach', to: t1 },
      ),
      {
        kind: 'static',
        effect: { kind: 'attached', power: { namedCountersOnSource: 'hone' }, toughness: 0 },
      },
      equip('{3}'),
    ],
  },
  // "Creatures you control get +1/+1. At the beginning of your end step, draw a card."
  'The Arkenstone': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 1, toughness: 1 },
      },
      when({ on: 'beginningOfEndStep', whose: 'yours' }, [], draw(1)),
    ],
  },
  // "Flash. When The Black Arrow enters, it deals 1 damage to any target. If a Dragon is dealt damage this way, destroy it.
  // Equipped creature gets +1/+1 and has reach. Equip {1}"
  'The Black Arrow': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'any' }], custom('hobBlackArrow')),
      equippedGets(1, 1, { keywords: ['reach'] }),
      equip('{1}'),
    ],
  },
  // "({T}: Add {R}.) This land enters tapped unless you control an Equipment. {4}{R}, {T}: Create a 2/2 red Dwarf creature token.
  // This ability costs {1} less to activate for each Equipment you control. Activate only as a sorcery."
  'The Lonely Mountain': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: EQUIPMENT, min: 1 },
    },
    abilities: [
      ...tapFor('R'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}'), tapSelf: true },
        sorcerySpeed: true,
        costReduction: { count: 'permanentsYouControl', filter: EQUIPMENT },
        targets: [],
        effects: [{ kind: 'createToken', token: HOB_DWARF, count: 1 }],
      },
    ],
  },
  // "When Thrór's Map enters, search your library for a basic land card, reveal it, put it into your hand, then shuffle.
  // {2}, {T}: Draw a card, then discard a card."
  "Thrór's Map": {
    abilities: [
      onEnter(searchBasicToHand),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
    ],
  },
  // "{2}, {T}, Sacrifice this creature: Search your library for up to two basic land cards, reveal them, put one onto the
  // battlefield tapped and the other into your hand, then shuffle."
  'Troop of Ponies': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: 'basicLand',
            to: 'battlefieldTapped',
            reveal: true,
            shuffle: false,
          },
          searchBasicToHand,
        ],
      },
    ],
  },
  // "When this Equipment enters, you gain 2 life. Equipped creature gets +1/+1. Equip {1}"
  'Well-Worn Spatula': {
    abilities: [onEnter(gain(2)), equippedGets(1, 1), equip('{1}')],
  },
};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_COLORLESS_BACKS: Record<string, Behavior> = {
  // "As an additional cost to cast this spell, sacrifice a creature. Draw two cards."
  'Allure of Power': { sacrificeCreatureToCast: true, ...spell([], draw(2)) },
  // "Mill six cards, then put all instant and sorcery cards from among them into your hand."
  'Gleam of Death': spell([], custom('hobGleamOfDeath')),
  // "Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle."
  'Seek the Heart': spell([], {
    kind: 'searchLibrary',
    filter: { types: ['Creature'], supertypes: ['Legendary'] },
    to: 'hand',
    reveal: true,
  }),
};

/** Tokens only this group's cards make. */
export const HOB_COLORLESS_TOKENS: CardDefinition[] = [];
