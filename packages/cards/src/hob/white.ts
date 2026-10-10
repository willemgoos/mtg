import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, pump, t0, when, yourCreature, yours } from '../blb/helpers.ts';
import { equip, spell } from '../fin/helpers.ts';
import { enduringStory, recruit, storied, storyAnthem, storyPump } from '../hob-vocab.ts';
import { HOB_DWARF } from './tokens.ts';

/**
 * The Hobbit (20b): white cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_WHITE_BACKS. See docs/the-hobbit-plan.md.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
/** "Creatures you control get +P/+T until end of turn." */
const teamPump = (power: number, toughness: number): EffectDef => pump(yours, power, toughness);

export const HOB_BIRD_SOLDIER = 'hob-bird-soldier-token';
export const HOB_AXE = 'hob-axe-token';

/** An Equipment or Dwarf you control entering (Kíli the Resourceful). */
const dwarfOrEquipment = { anyOf: [{ subtype: 'Dwarf' }, { subtype: 'Equipment' }] };
/** "Target creature you own" (The Eagles Are Coming!): the spell's controller owns it, whoever controls it. */
const creatureYouOwn: TargetSpec = { what: 'creature', filter: { ownedBySourceController: true } };

const sagaLore = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});

export const HOB_WHITE: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Belladonna Took': {
    abilities: [
      // "Whenever a token you control enters, you gain 1 life if this is the first time this ability has resolved this turn. If
      // it's the second time, draw a card. If it's the third time, put a +1/+1 counter on each creature you control."
      when(
        { on: 'otherPermanentEtb', filter: { token: true } },
        [],
        { kind: 'noteResolution' },
        { kind: 'if', condition: { kind: 'resolvedThisTurn', n: 1 }, then: [gain(1)] },
        { kind: 'if', condition: { kind: 'resolvedThisTurn', n: 2 }, then: [draw(1)] },
        {
          kind: 'if',
          condition: { kind: 'resolvedThisTurn', n: 3 },
          then: [{ kind: 'counters', to: yours, amount: 1 }],
        },
      ),
    ],
  },
  'Bofur, Reliable Guardian': {},
  'Dáin, Lord of the Iron Hills': {
    abilities: [
      storied,
      // "As long as you have an enduring story, creatures can't attack you unless their controller pays {1} for each of those
      // creatures."
      { kind: 'static', effect: { kind: 'attackTax', amount: 1, condition: enduringStory } },
    ],
  },
  'Dwarven Provisioner': {
    abilities: [
      // "{3}{W}: Creatures you control get +1/+1 until end of turn."
      { kind: 'activated', cost: { mana: mana('{3}{W}') }, targets: [], effects: [teamPump(1, 1)] },
    ],
  },
  'Eagle of the Great Shelf': {
    abilities: [
      // "Whenever this creature attacks, it gets +1/+1 until end of turn for each other creature you control."
      when(
        { on: 'attacks' },
        [],
        pump(
          'self',
          { count: 'creaturesYouControl', other: true },
          { count: 'creaturesYouControl', other: true },
        ),
      ),
    ],
  },
  'Esgaroth Garrison': {
    // "Esgaroth Garrison's power is equal to the number of creatures you control."
    powerEquals: { count: 'creaturesYouControl' },
    // "When this creature enters, recruit."
    abilities: [when({ on: 'etb' }, [], recruit)],
  },
  'Fíli the Pathfinder': {
    abilities: [
      storied,
      // "As long as you have an enduring story, creatures you control get +1/+1."
      storyAnthem(1, 1),
      // "Whenever Fíli or another nontoken Dwarf you control enters, create a 2/2 red Dwarf creature token."
      when({ on: 'selfOrCreatureEtb', filter: { subtype: 'Dwarf', nontoken: true } }, [], {
        kind: 'createToken',
        token: HOB_DWARF,
        count: 1,
      }),
    ],
  },
  'Iron Hills Blacksmith': {
    // Double strike comes from Scryfall.
    abilities: [
      // "When this creature enters, create a colorless Equipment artifact token named Axe with "Equipped creature gets +1/+0"
      // and equip {2}."
      when({ on: 'etb' }, [], { kind: 'createToken', token: HOB_AXE, count: 1 }),
    ],
  },
  'Kíli the Resourceful': {
    abilities: [
      storied,
      // "As long as you have an enduring story, you may pay {0} rather than pay the equip cost of the first equip ability you
      // activate each turn."
      { kind: 'static', effect: { kind: 'firstEquipFree', condition: enduringStory } },
      // "Whenever another Dwarf or Equipment you control enters, draw a card. This ability triggers only once each turn."
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: dwarfOrEquipment },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Lake-town Lookout': {
    // "When this creature dies, recruit."
    abilities: [when({ on: 'dies' }, [], recruit)],
  },
  'Lake-town Toymaker': {
    abilities: [
      // "At the beginning of combat on your turn, if you've drawn two or more cards this turn, another target creature you
      // control gets +3/+0 and gains first strike until end of turn."
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'cardsDrawnThisTurn', min: 2 },
        targets: [{ ...yourCreature, filter: { other: true } }],
        effects: [pump(t0, 3, 0, ['firstStrike'])],
      },
    ],
  },
  'Ori, Keeper of Songs': {
    abilities: [
      storied,
      // "As long as you have an enduring story, Ori gets +1/+0 and has vigilance."
      storyPump(1, 0, ['vigilance']),
    ],
  },
  'The Queen of Dale': {
    abilities: [
      // "Whenever an opponent casts their first noncreature spell each turn, you recruit."
      when({ on: 'castSpell', filter: 'firstNoncreature', caster: 'opponent' }, [], recruit),
    ],
  },
  'Velvetwing Butterflies': {},

  // ------------------------------------------------------------ noncreature
  'An Unexpected Party': {
    abilities: [
      // "As this enchantment enters, choose a creature type."
      when({ on: 'etb' }, [], { kind: 'chooseCreatureType' }),
      // "Creatures you control of the chosen type get +2/+2."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { chosenTypeOfSource: true },
          power: 2,
          toughness: 2,
        },
      },
    ],
  },
  "Bilbo's Gambit": {
    // "Gift a Treasure. Return target spell to its owner's hand. If the gift was promised, players can't cast spells this turn."
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'returnSpellToHand', what: t0 }] },
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      spell: {
        targets: [{ what: 'spell' }],
        effects: [
          { kind: 'createToken', token: 'treasure-token', count: 1, forOpponent: true },
          { kind: 'giftGiven' },
          { kind: 'returnSpellToHand', what: t0 },
          custom('hobPlayersCantCast'),
        ],
      },
    },
  },
  'Celebrate the Mountain-king': {
    abilities: [
      // "When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until
      // this enchantment leaves the battlefield."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', optional: true, filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      // "When this enchantment enters, recruit."
      when({ on: 'etb' }, [], recruit),
    ],
  },
  'Dwarven Shortsword': {
    abilities: [
      // "When this Equipment enters, create a 2/2 red Dwarf creature token, then attach this Equipment to it."
      when(
        { on: 'etb' },
        [],
        { kind: 'createToken', token: HOB_DWARF, count: 1 },
        { kind: 'attach', to: 'chosen' },
      ),
      // "Equipped creature gets +1/+2."
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
      equip('{2}'),
    ],
  },
  'Gleaming Splendor': {
    abilities: [
      // "Whenever an opponent draws their second card each turn, you create a Treasure token."
      when({ on: 'drawSecondCard', whose: 'opponents' }, [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: 1,
      }),
      // "{2}{W}: Two target players each draw a card."
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [{ what: 'player' }, { what: 'player' }],
        effects: [
          { kind: 'draw', who: t0, amount: 1 },
          { kind: 'draw', who: { target: 1 }, amount: 1 },
        ],
      },
    ],
  },
  'Magnificent End': {
    // "This spell costs {3} less to cast if it targets a tapped creature."
    costReductionIfTarget: { filter: { tapped: true }, amount: 3 },
    // "Magnificent End deals 5 damage to target creature."
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'damage', amount: 5, to: t0 }] },
  },
  'Moment of Glory': {
    flashback: mana('{4}{W}'),
    // "Put a +1/+1 counter on target creature you control. If this spell was cast from a graveyard, also put a +1/+1 counter on
    // each other creature you control." (Cast from a graveyard, every creature you control, the target included, gets one.)
    spell: {
      targets: [yourCreature],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'castFromGraveyard' },
          then: [{ kind: 'counters', to: yours, amount: 1 }],
          else: [{ kind: 'counters', to: t0, amount: 1 }],
        },
      ],
    },
  },
  'Roads Go Ever, Ever On': {
    saga: 4,
    abilities: [
      // "I — Search your library for up to two basic Plains cards, exile them, then shuffle. You gain 2 life."
      sagaLore(
        [1],
        [],
        {
          kind: 'searchLibrary',
          filter: { subtype: 'Plains', supertypes: ['Basic'] },
          to: 'hand',
          upTo: 2,
          exileWithSource: true,
        },
        gain(2),
      ),
      // "II, III — Put a card exiled with this Saga into its owner's hand."
      sagaLore([2, 3], [], custom('hobRoadsToHand')),
      // "IV — Whenever you attack this turn, target creature you control gets +1/+1 until end of turn for each Plains you control."
      sagaLore([4], [], {
        kind: 'emblem',
        until: 'endOfTurn',
        label:
          'Whenever you attack this turn, target creature you control gets +1/+1 until end of turn for each Plains you control.',
        ability: when(
          { on: 'youAttack' },
          [yourCreature],
          pump(
            t0,
            { count: 'landsYouControl', subtype: 'Plains' },
            { count: 'landsYouControl', subtype: 'Plains' },
          ),
        ),
      }),
    ],
  },
  'Settle the Wreckage': {
    // "Exile all attacking creatures target player controls. That player may search their library for that many basic land
    // cards, put those cards onto the battlefield tapped, then shuffle."
    spell: {
      targets: [{ what: 'player' }],
      effects: [
        {
          kind: 'exile',
          what: { each: 'creature', filter: { attacking: true }, controllerTarget: 0 },
        },
        {
          kind: 'searchLibrary',
          filter: 'basicLand',
          to: 'battlefieldTapped',
          upTo: { exiledThisWay: true },
          forControllerOf: 0,
        },
      ],
    },
  },
  'Stone by Sunlight': {
    modes: [
      {
        // "Destroy target creature with power 4 or greater."
        label: 'Destroy target creature with power 4 or greater',
        targets: [{ what: 'creature', filter: { minPower: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        // "Until end of turn, target creature becomes an artifact in addition to its other types and gains indestructible."
        label:
          'Target creature becomes an artifact in addition to its other types and gains indestructible',
        targets: [{ what: 'creature' }],
        effects: [custom('hobStoneBySunlight')],
      },
    ],
  },
  'The Eagles Are Coming!': {
    // "Choose target creature you own. Return it to your hand. At the beginning of the next upkeep, create a 4/4 white Bird
    // Soldier creature token with flying for each creature returned to your hand this way."
    spell: {
      targets: [creatureYouOwn],
      effects: [{ kind: 'bounce', what: t0 }, custom('hobEaglesBirds')],
    },
    // "Kicker {2}{W}{W}. If this spell was kicked, instead choose any number of target creatures you own."
    kicker: {
      cost: mana('{2}{W}{W}'),
      spell: {
        targets: [{ ...creatureYouOwn, anyNumber: true }],
        effects: [{ kind: 'bounce', what: { targetsFrom: 0 } }, custom('hobEaglesBirds')],
      },
    },
  },
  "The Mountain-king's Return": {
    saga: 3,
    abilities: [
      // "I — Recruit."
      sagaLore([1], [], recruit),
      // "II — Return target creature card with mana value 3 or less from your graveyard to the battlefield."
      sagaLore(
        [2],
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
      // "III — Put a +1/+1 counter on up to one target creature."
      sagaLore([3], [{ what: 'creature', optional: true }], {
        kind: 'counters',
        to: t0,
        amount: 1,
      }),
    ],
  },
  "Thorin's Last Stand": {
    modes: [
      {
        // "Creatures you control get +2/+1 until end of turn."
        label: 'Creatures you control get +2/+1 until end of turn',
        targets: [],
        effects: [teamPump(2, 1)],
      },
      {
        // "Destroy target artifact or enchantment. You gain 2 life."
        label: 'Destroy target artifact or enchantment. You gain 2 life',
        targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }, gain(2)],
      },
    ],
  },
  'Vow to Erebor': {
    // "Untap target creature you control. It gets +2/+2 until end of turn. If it's a Dwarf, you may attach an Equipment you
    // control to it."
    ...spell([yourCreature], { kind: 'untap', what: t0 }, pump(t0, 2, 2), {
      kind: 'if',
      condition: { kind: 'targetMatches', target: 0, filter: { subtype: 'Dwarf' } },
      then: [
        {
          kind: 'may',
          effects: [
            {
              kind: 'chooseYourPermanent',
              filter: { subtype: 'Equipment' },
              then: [{ kind: 'attach', to: t0, what: 'chosen' }],
            },
          ],
        },
      ],
    }),
  },
};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_WHITE_BACKS: Record<string, Behavior> = {
  // "Create X 2/2 red Dwarf creature tokens."
  'At the Door': spell([], { kind: 'createToken', token: HOB_DWARF, count: { x: true } }),
  // "Target artifact or creature you control gains hexproof and indestructible until end of turn."
  'Concerted Care': spell(
    [{ what: 'permanent', controller: 'you', filter: { types: ['Artifact', 'Creature'] } }],
    pump(t0, 0, 0, ['hexproof', 'indestructible']),
  ),
  // "Tap one or two target creatures."
  'Gaze in Wonder': spell(
    [{ what: 'creature' }, { what: 'creature', optional: true }],
    { kind: 'tap', what: t0 },
    { kind: 'tap', what: { target: 1 } },
  ),
};

/** Tokens only this group's cards make. */
export const HOB_WHITE_TOKENS: CardDefinition[] = [
  // A 4/4 white Bird Soldier creature token with flying (The Eagles Are Coming!).
  {
    id: HOB_BIRD_SOLDIER,
    name: 'Bird Soldier',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Bird', 'Soldier'],
    power: 4,
    toughness: 4,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
  // A colorless Equipment artifact token named Axe: "Equipped creature gets +1/+0", equip {2} (Iron Hills Blacksmith).
  {
    id: HOB_AXE,
    name: 'Axe',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Equipment'],
    keywords: [],
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 0 } },
      equip('{2}'),
    ],
    isToken: true,
  },
];
