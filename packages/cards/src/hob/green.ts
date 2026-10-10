import type { Amount, CardDefinition, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
  yourCreaturesOf,
} from '../blb/helpers.ts';
import { chapter, mode } from '../fin/helpers.ts';
import { HOB_BEAR } from './tokens.ts';

/**
 * The Hobbit (20b): green cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_GREEN_BACKS. See docs/the-hobbit-plan.md.
 */

const counter = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const elves = yourCreaturesOf('Elf');
/** Ferocious: "if you control a creature with power 4 or greater". */
const ferocious = { kind: 'controlsCreature', filter: { minPower: 4 } } as const;
const permanentCard: CardFilter = {
  types: ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'],
};
const youCreatures: Ref = { each: 'creature', controller: 'you' };

export const HOB_GREEN: Record<string, Behavior> = {
  // "Landfall - Whenever a land you control enters, this creature gets +1/+1 until end of turn."
  Attercop: { abilities: [when({ on: 'landfall' }, [], pump('self', 1, 1))] },
  // "Whenever this creature deals combat damage to a player, choose one - a +1/+1 counter on target Wolf you control; or create a Treasure."
  'Bejeweled Warg': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        effects: [],
        modes: [
          mode(
            'Put a +1/+1 counter on target Wolf you control',
            [{ what: 'creature', controller: 'you', filter: { subtype: 'Wolf' } }],
            counter(t0),
          ),
          mode('Create a Treasure token', [], treasure),
        ],
      },
    ],
  },
  // "Other Bears you control get +2/+2. At the beginning of combat on your turn, put a trample counter on up to one target creature
  // you control. It becomes a Bear in addition to its other types. Then if you control three or more Bears, draw two cards."
  'Beorn the Fierce': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Bear' },
          power: 2,
          toughness: 2,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [{ ...yourCreature, optional: true }],
        effects: [
          { kind: 'namedCounters', name: 'trample', amount: 1, to: t0 },
          custom('hobAddBear'),
          {
            kind: 'if',
            condition: { kind: 'controlsPermanents', filter: { subtype: 'Bear' }, min: 3 },
            then: [draw(2)],
          },
        ],
      },
    ],
  },
  // "Landfall - ... put a +1/+1 counter on target creature you control. {5}{G}{G}: This enchantment becomes a Bear creature in
  // addition to its other types and gains 'This creature's power and toughness are each equal to the number of lands you control.'"
  "Beorn's Hospitality": {
    abilities: [
      when({ on: 'landfall' }, [yourCreature], counter(t0)),
      {
        kind: 'activated',
        cost: { mana: mana('{5}{G}{G}') },
        targets: [],
        effects: [custom('hobBecomeBear')],
      },
    ],
  },
  // Trample.
  'Beorn, Reluctant Host': {},
  // "When this creature enters, look at the top four cards of your library. You may reveal a permanent card from among them and
  // put it into your hand. Put the rest on the bottom of your library in a random order. Landfall - +2/+2 until end of turn."
  'Boughside Wanderers': {
    abilities: [
      onEnter({ kind: 'lookAndTake', count: 4, filter: permanentCard, reveal: true }),
      when({ on: 'landfall' }, [], pump('self', 2, 2)),
    ],
  },
  // "Affinity for Elves. When this creature enters, mill four cards, then put all Elf cards from among them into your hand."
  'Cantankerous Keepers': {
    costReduction: { count: 'creaturesYouControl', subtype: 'Elf' },
    abilities: [onEnter(custom('hobKeepersMill'))],
  },
  'Dancing from Dark to Dawn': {
    abilities: [
      // "Whenever you cast a creature spell, put X +1/+1 counters on target creature you control, where X is that spell's mana value."
      when(
        { on: 'castSpell', filter: 'creature' },
        [yourCreature],
        counter(t0, { manaValueOfSubject: true }),
      ),
      // "Landfall - Whenever a land you control enters, create a 2/2 green Bear creature token."
      when({ on: 'landfall' }, [], { kind: 'createToken', token: HOB_BEAR, count: 1 }),
    ],
  },
  'Down in the Valley': {
    saga: 4,
    abilities: [
      chapter([1], [], {
        kind: 'searchLibrary',
        filter: 'basicLand',
        to: 'hand',
        reveal: true,
      }),
      // "This Saga gains 'Landfall - Whenever a land you control enters, create a 1/1 green Elf creature token.'"
      chapter([2], [], custom('hobValleyGain')),
      // "Elves you control get +1/+0 and gain vigilance until end of turn."
      chapter([3, 4], [], pump(elves, 1, 0, ['vigilance'])),
    ],
  },
  // "Whenever Galion attacks, choose up to one other target creature you control. Its base power and toughness become equal to
  // Galion's power and toughness until end of turn."
  "Galion, Elvenking's Butler": {
    abilities: [
      when({ on: 'attacks' }, [{ ...yourCreature, filter: { other: true }, optional: true }], {
        kind: 'pump',
        to: t0,
        power: { powerOf: 'self' },
        toughness: { toughnessOf: 'self' },
        setBase: true,
      }),
    ],
  },
  // "This spell can't be countered." Hexproof, haste.
  'Gigantic Big Bear': {},
  // Trample. "{5}{G}{G}: Put three +1/+1 counters on this creature."
  'Guardian of the Halls': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{5}{G}{G}') },
        targets: [],
        effects: [counter('self', 3)],
      },
    ],
  },
  // Flash. "When this creature enters, untap another target creature you control. If that creature is a Bear, put a +1/+1 counter on it."
  'Little Bear': {
    abilities: [
      onEnterTarget(
        [{ ...yourCreature, filter: { other: true } }],
        { kind: 'untap', what: t0 },
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { subtype: 'Bear' } },
          then: [counter(t0)],
        },
      ),
    ],
  },
  // "This creature's power and toughness are each equal to the number of lands you control."
  'Mirkwood Pathmaker': { ptEquals: { count: 'landsYouControl' } },
  // "Ferocious - At the beginning of combat on your turn, if you control a creature with power 4 or greater, put a +1/+1 counter on this creature."
  'Nasty Little Rabbit': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: ferocious,
        targets: [],
        effects: [counter('self')],
      },
    ],
  },
  // Reach. "This creature can't be blocked by creatures with power 2 or less. Whenever this creature becomes the target of a spell
  // or ability an opponent controls, draw a card."
  'Old Fat Spider': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { maxPower: 2 } } },
      when({ on: 'targetedByOpponent' }, [], draw(1)),
    ],
  },
  'Ordinary Bear': {},
  // "Whenever a nontoken creature you control dies, reveal cards from the top of your library until you reveal a creature card. If
  // its mana value is less than or equal to the number of lands you control, put it onto the battlefield. Otherwise, put it into
  // your hand. Put the rest on the bottom of your library in a random order. This ability triggers only once each turn."
  'Part in Friendship': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', nontoken: true },
        targets: [],
        effects: [custom('hobPartInFriendship')],
        oncePerTurn: true,
      },
    ],
  },
  // "Target creature you control deals damage equal to its power to target creature an opponent controls."
  Quarrel: {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [{ kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 }],
    },
  },
  // "The first creature spell you cast each turn costs {2} less to cast and can be cast as though it had flash."
  'Radagast of Rhosgobel': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLessIf',
          filter: { types: ['Creature'] },
          amount: 2,
          condition: { kind: 'noneCastThisTurn', filter: { types: ['Creature'] } },
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'flashForAll',
          filter: { types: ['Creature'] },
          condition: { kind: 'noneCastThisTurn', filter: { types: ['Creature'] } },
        },
      },
    ],
  },
  'The Notary Hobbits': {
    abilities: [
      // "When The Notary Hobbits enter, if they're not a token, create two tokens that are copies of them, except the tokens aren't legendary."
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'sourceNotToken' },
        targets: [],
        effects: [{ kind: 'tokenCopy', of: 'self', count: 2, notLegendary: true }],
      },
      // "{T}: Add {C} for each Halfling you control."
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'C',
        amountOf: { count: 'creaturesYouControl', subtype: 'Halfling' },
      },
    ],
  },
  // "Look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then
  // shuffle. You gain 8 life."
  'Through the Forest Gate': {
    spell: { targets: [], effects: [custom('hobGateLook'), gain(8)] },
  },
  // "Put two +1/+1 counters on target creature you control. Then it fights target creature an opponent controls."
  'Troll Negotiations': {
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [counter(t0, 2), { kind: 'fight', a: t0, b: t1 }],
    },
  },
  'Warg Tactics': {
    modes: [
      mode(
        'Destroy target creature with flying',
        [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        { kind: 'destroy', what: t0 },
      ),
      mode(
        'Put a +1/+1 counter on target creature you control. It gains trample and hexproof until end of turn',
        [yourCreature],
        counter(t0),
        pump(t0, 0, 0, ['trample', 'hexproof']),
      ),
    ],
  },
  // "Ferocious - Whenever this creature attacks while you control a creature with power 4 or greater, until end of turn, this
  // creature gets +1/+0 and creatures you control gain trample."
  Wargling: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: ferocious,
        targets: [],
        effects: [pump('self', 1, 0), pump(youCreatures, 0, 0, ['trample'])],
      },
    ],
  },
  // "Ferocious - Whenever this creature attacks while you control a creature with power 4 or greater, put a +1/+1 counter on each
  // creature you control."
  'Wilderland Scrounger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: ferocious,
        targets: [],
        effects: [counter(youCreatures)],
      },
    ],
  },
  // "When this creature enters, search your library for a Forest card, put that card onto the battlefield, then shuffle."
  'Wood Elves': {
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: { subtype: 'Forest' },
        to: 'battlefield',
      }),
    ],
  },
  // Vigilance. "Whenever another Elf you control enters, this creature gets +1/+1 until end of turn. {T}: Add X mana of any one
  // color, where X is this creature's power. Spend this mana only to cast Elf spells and activate abilities of Elf sources."
  'Woodland Weavemaster': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Elf' } },
        [],
        pump('self', 1, 1),
      ),
      {
        kind: 'mana',
        cost: { tapSelf: true },
        produces: 'G',
        anyOneColor: true,
        perPower: true,
        onlyFor: 'Elf',
        orAbilitiesOfSources: true,
      },
    ],
  },
};

/** A triggered "when this creature enters" ability with targets. */
function onEnterTarget(targets: TargetSpec[], ...effects: EffectDef[]) {
  return when({ on: 'etb' }, targets, ...effects);
}

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_GREEN_BACKS: Record<string, Behavior> = {
  // "You may play an additional land this turn."
  'Till and Tend': {
    spell: { targets: [], effects: [custom('extraLandThisTurn')] },
  },
};

/** Tokens only this group's cards make. */
export const HOB_GREEN_TOKENS: CardDefinition[] = [];
