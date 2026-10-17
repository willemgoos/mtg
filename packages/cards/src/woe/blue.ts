import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  draw,
  mana,
  onEnter,
  prowess,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';
import {
  bargain,
  castAdventureSpell,
  createRole,
  creaturesAttackedThisTurn,
  ifBargained,
  tapAndStun,
  whenEntersIfBargained,
  whenYouTapOpponentCreature,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23): blue cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_BLUE_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

export const WOE_FAERIE = 'woe-faerie-token';

const creature: TargetSpec = { what: 'creature' };
const upToOne = (t: TargetSpec): TargetSpec => ({ ...t, optional: true });
const instantOrSorcery: CardFilter = { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }] };
const NOTHING = { generic: 0, colored: {} };

/** "Aura": it enchants a creature, and these abilities. */
const aura = (enchant: TargetSpec, ...abilities: AbilityDef[]): Behavior => ({
  enchant,
  abilities,
});

/** "Whenever you cast a spell with mana value 5 or greater, <effects>" (Galvanic Giant, Stormkeld Prowler). */
const castBigSpell = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 5 } }, targets, ...effects);

/** "Whenever you cast an instant or sorcery spell, create a Sorcerer Role token attached to up to one other target creature you control." */
const otherCreatureYouControl: TargetSpec = upToOne({
  what: 'creature',
  controller: 'you',
  filter: { other: true },
});

export const WOE_BLUE: Record<string, Behavior> = {
  // "Whenever you cast your first instant or sorcery spell each turn, this creature gets +2/+0 until end of turn."
  'Aquatic Alchemist': {
    abilities: [
      when({ on: 'castSpell', filter: 'firstInstantOrSorcery' }, [], {
        kind: 'pump',
        to: 'self',
        power: 2,
        toughness: 0,
      }),
    ],
  },
  "Beluna's Gatekeeper": {},
  // "Enchant creature. When this Aura enters, tap enchanted creature. Enchanted creature doesn't untap during its controller's untap
  // step. When this Aura is put into a graveyard from the battlefield, you may pay {1}. If you do, scry 1, then draw a card."
  'Bitter Chill': aura(
    creature,
    onEnter({ kind: 'tap', what: 'attached' }),
    { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, doesntUntap: true } },
    when({ on: 'selfToGraveyard' }, [], {
      kind: 'may',
      cost: mana('{1}'),
      effects: [{ kind: 'scry', amount: 1 }, draw(1)],
    }),
  ),
  // "Flying. Whenever you cast an Adventure spell, you may copy it. You may choose new targets for the copy."
  'Chancellor of Tales': {
    abilities: [
      castAdventureSpell([
        { kind: 'may', effects: [{ kind: 'copySpell', what: 'subject', newTargets: true }] },
      ]),
    ],
  },
  // "Prowess. Creatures with power less than this creature's power can't block it."
  'Elusive Otter': {
    abilities: [
      prowess,
      {
        kind: 'static',
        effect: { kind: 'cantBeBlockedBy', filter: { powerLessThanSource: true } },
      },
    ],
  },
  // "Bargain. Look at the top four cards of your library. If this spell was bargained, look at the top eight cards of your library
  // instead. Put two of them into your hand and the rest on the bottom of your library in a random order."
  'Farsight Ritual': {
    ...bargain(),
    spell: {
      targets: [],
      effects: [
        ifBargained(
          [{ kind: 'lookAndTake', count: 8, filter: {}, upTo: 2, required: true }],
          [{ kind: 'lookAndTake', count: 4, filter: {}, upTo: 2, required: true }],
        ),
      ],
    },
  },
  // "Tap target creature an opponent controls and put three stun counters on it. Scry 2."
  'Freeze in Place': spell([theirCreature], ...tapAndStun(t0, 3), { kind: 'scry', amount: 2 }),
  // I: "Create a Cursed Role token attached to up to one target creature." II: "Scry 2." III: "When you next cast an instant or
  // sorcery spell with mana value 3 or less this turn, copy that spell. You may choose new targets for the copy."
  "Gadwick's First Duel": {
    saga: 3,
    abilities: [
      chapter([1], [upToOne(creature)], createRole('Cursed')),
      chapter([2], [], { kind: 'scry', amount: 2 }),
      chapter([3], [], {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: when(
          { on: 'castSpell', filter: 'instantOrSorcery', spell: { maxManaValue: 3 } },
          [],
          { kind: 'copySpell', what: 'subject', newTargets: true },
        ),
      }),
    ],
  },
  // "Whenever you cast a spell with mana value 5 or greater, tap target creature an opponent controls and put a stun counter on it."
  'Galvanic Giant': {
    abilities: [castBigSpell([theirCreature], ...tapAndStun(t0))],
  },
  // "Flash. Ward {2}. This creature enters tapped unless it's your turn."
  'Horned Loch-Whale': {
    entersTappedIf: { kind: 'not', condition: { kind: 'yourTurn' } },
  },
  // "Bargain. This spell costs {1} less to cast if it's bargained. Counter target spell."
  'Ice Out': {
    ...bargain({ costReduction: 1 }),
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: t0 }] },
  },
  // "Vigilance. Whenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls.
  // Whenever you tap an untapped creature an opponent controls, this creature gets +2/+1 until end of turn."
  'Icewrought Sentry': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        cost: mana('{1}{U}'),
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }],
      },
      whenYouTapOpponentCreature([{ kind: 'pump', to: 'self', power: 2, toughness: 1 }]),
    ],
  },
  // "Draw three cards. Create a 1/1 blue Faerie creature token with flying and 'This token can block only creatures with flying.'"
  'Into the Fae Court': spell([], draw(3), { kind: 'createToken', token: WOE_FAERIE, count: 1 }),
  // "Bargain. This spell costs {2} less to cast if it's bargained. Return target nonland permanent to its owner's hand. Draw a card."
  "Johann's Stopgap": {
    ...bargain({ costReduction: 2 }),
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }, draw(1)],
    },
  },
  // "{1}, Sacrifice this creature: Draw a card. Create a Sorcerer Role token attached to up to one other target creature you control.
  // Activate only as a sorcery."
  'Living Lectern': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [otherCreatureYouControl],
        effects: [draw(1), createRole('Sorcerer')],
      },
    ],
  },
  // "Target creature's owner puts it on their choice of the top or bottom of their library."
  'Misleading Motes': spell([creature], { kind: 'chooseCustom', handler: 'eclLibraryChoice' }),
  "Obyra's Attendants": {},
  'Picklock Prankster': {},
  // "This spell costs {1} less to cast for each creature that attacked this turn. Draw three cards."
  'Rowdy Research': {
    costReduction: creaturesAttackedThisTurn,
    spell: { targets: [], effects: [draw(3)] },
  },
  // "Flying, ward {2}. This creature enters tapped with three stun counters on it. {1}{U}: Untap this creature."
  'Sleep-Cursed Faerie': {
    entersTapped: true,
    entersWithNamedCounters: { stun: 3 },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}') },
        targets: [],
        effects: [{ kind: 'untap', what: 'self' }],
      },
    ],
  },
  // "Flying. When this creature enters, you may pay {2}. When you do, tap target creature an opponent controls and put a stun
  // counter on it."
  'Snaremaster Sprite': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        cost: mana('{2}'),
        targets: [theirCreature],
        effects: tapAndStun(t0),
      },
    ],
  },
  // "Counter target spell unless its controller pays {2} plus an additional {1} for each Faerie you control."
  'Spell Stutter': {
    spell: {
      targets: [{ what: 'spell' }],
      effects: [
        {
          kind: 'counterUnlessPays',
          what: t0,
          cost: mana('{2}'),
          costAmount: {
            sum: [2, { count: 'permanentsYouControl', filter: { subtype: 'Faerie' } }],
          },
        },
      ],
    },
  },
  // "Whenever you cast an instant or sorcery spell, create a Sorcerer Role token attached to up to one other target creature you
  // control."
  'Splashy Spellcaster': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'instantOrSorcery' },
        [otherCreatureYouControl],
        createRole('Sorcerer'),
      ),
    ],
  },
  // "Whenever you cast a spell with mana value 5 or greater, put two +1/+1 counters on this creature."
  'Stormkeld Prowler': {
    abilities: [castBigSpell([], { kind: 'counters', to: 'self', amount: 2 })],
  },
  // "Flying. Whenever you cast an Adventure spell, draw a card."
  'Storyteller Pixie': {
    abilities: [castAdventureSpell([draw(1)])],
  },
  // "Tap one or two target creatures an opponent controls. Put a stun counter on each of them."
  'Succumb to the Cold': spell(
    [theirCreature, upToOne(theirCreature)],
    ...tapAndStun(t0),
    ...tapAndStun(t1),
  ),
  // "Flying. Whenever you attack with one or more Faeries, draw a card, then discard a card. When you discard a card this way, put a
  // +1/+1 counter on target Faerie you control." (ability 1 is the reflexive trigger)
  "Talion's Messenger": {
    abilities: [
      when({ on: 'youAttack', filter: { subtype: 'Faerie' } }, [], draw(1), {
        kind: 'discard',
        count: 1,
        reflexiveOnAny: 1,
      }),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature', controller: 'you', filter: { subtype: 'Faerie' } }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  // "Bargain. When this creature enters, if it was bargained, return target instant or sorcery card from your graveyard to your hand."
  'Tenacious Tomeseeker': {
    ...bargain(),
    abilities: [
      whenEntersIfBargained(
        [{ kind: 'returnToHand', what: t0 }],
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
      ),
    ],
  },
  'Threadbind Clique': {},
  'Vantress Transmuter': {},
  // "Until end of turn, target creature you control has base power and toughness 4/4 and gains flying and hexproof."
  'Water Wings': spell([yourCreature], {
    kind: 'pump',
    to: t0,
    power: 4,
    toughness: 4,
    setBase: true,
    keywords: ['flying', 'hexproof'],
  }),
};

/** Back faces: keyed by their own names. */
export const WOE_BLUE_BACKS: Record<string, Behavior> = {
  // Aquatic Alchemist: "Put target instant or sorcery card from your graveyard on top of your library."
  'Bubble Up': spell([{ what: 'graveyardCard', controller: 'you', filter: instantOrSorcery }], {
    kind: 'putInLibrary',
    what: t0,
    position: 'top',
  }),
  // Beluna's Gatekeeper: "Return target creature you don't control with mana value 3 or less to its owner's hand."
  'Entry Denied': spell(
    [{ what: 'creature', controller: 'opponent', filter: { maxManaValue: 3 } }],
    { kind: 'bounce', what: t0 },
  ),
  // Elusive Otter: "Distribute X +1/+1 counters among any number of target creatures you control."
  "Grove's Bounty": spell([], {
    kind: 'divide',
    amount: { x: true },
    maxTargets: 99,
    spec: yourCreature,
    give: 'counters',
  }),
  // Galvanic Giant: "Draw four cards, then discard two cards."
  'Storm Reading': spell([], draw(4), { kind: 'discard', count: 2 }),
  // Horned Loch-Whale: "The owner of target attacking creature you don't control puts it on their choice of the top or bottom of
  // their library."
  'Lagoon Breach': spell(
    [{ what: 'creature', controller: 'opponent', filter: { attacking: true } }],
    { kind: 'chooseCustom', handler: 'eclLibraryChoice' },
  ),
  // Obyra's Attendants: "Target creature gets -4/-0 until end of turn."
  'Desperate Parry': spell([creature], {
    kind: 'pump',
    to: t0,
    power: -4,
    toughness: 0,
  }),
  // Picklock Prankster: "Mill four cards. Then put an instant, sorcery, or Faerie card from among the milled cards into your hand."
  'Free the Fae': spell([], {
    kind: 'millThenTake',
    count: 4,
    filter: { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }, { subtype: 'Faerie' }] },
    required: true,
  }),
  // Threadbind Clique: "Destroy target tapped creature."
  'Rip the Seams': spell([{ what: 'creature', filter: { tapped: true } }], {
    kind: 'destroy',
    what: t0,
  }),
  // Vantress Transmuter: "Tap target creature. Create a Cursed Role token attached to it."
  'Croaking Curse': spell([creature], { kind: 'tap', what: t0 }, createRole('Cursed')),
};

/** Tokens only this group's cards make. */
export const WOE_BLUE_TOKENS: CardDefinition[] = [
  // A 1/1 blue Faerie creature token with flying and "This token can block only creatures with flying." (Into the Fae Court)
  {
    id: WOE_FAERIE,
    name: 'Faerie',
    manaCost: NOTHING,
    colors: ['U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Faerie'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [
      { kind: 'static', effect: { kind: 'canBlockOnly', filter: { hasKeyword: 'flying' } } },
    ],
    isToken: true,
  },
];
