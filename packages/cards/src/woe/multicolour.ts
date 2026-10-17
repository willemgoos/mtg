import type { AbilityDef, CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, pump, t0, theirCreature, when } from '../blb/helpers.ts';
import { chapter, mode } from '../fin/helpers.ts';
import {
  adventurePermanentsCostLess,
  celebration,
  createRole,
  enchantedCreaturesYouControlGet,
  tapAndStun,
  whenThisAttacks,
  whenYouTapOpponentCreature,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23): multicolour cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_MULTICOLOUR_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const NO_COST = { generic: 0, colored: {} };

/** An ability with extra fields (an intervening condition, modes). */
const plus = (a: AbilityDef, extra: object): AbilityDef => ({ ...a, ...extra }) as AbilityDef;

/** Hylda of the Icy Crown's 4/4 white and blue Elemental creature token. */
export const WOE_ELEMENTAL_WU = 'woe-elemental-white-blue-token';
/** Totentanz's 1/1 black Rat creature token with "This token can't block." */
export const WOE_RAT_CANT_BLOCK = 'woe-rat-token'; // black.ts makes it

const food: EffectDef = { kind: 'createToken', token: 'food-token', count: 1 };
const sacrificeFood = { sacrificePermanent: { subtype: 'Food' } } as const;
const creatureYouControlOther = {
  what: 'creature',
  controller: 'you',
  filter: { other: true },
} as const;

/** "{T}: Spells you cast this turn that are <colors> cost {X} less to cast, where X is the amount of life you lost [gained] this turn." */
const lifeDiscount = (
  by: 'lifeLost' | 'lifeGained',
  colors: ('W' | 'U' | 'B' | 'R')[],
): AbilityDef => ({
  kind: 'activated',
  cost: { tapSelf: true },
  sorcerySpeed: true,
  targets: [],
  effects: [custom('woeLifeDiscount', { by, colors })],
});

const talionTrigger = (n: number): AbilityDef =>
  when(
    { on: 'castSpell', filter: 'any', caster: 'opponent', spell: { manaValuePowerOrToughness: n } },
    [],
    { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
    draw(1),
  );

export const WOE_MULTICOLOUR: Record<string, Behavior> = {
  // "Activated abilities of creatures you control cost {X} less to activate, where X is Agatha's power. This effect can't reduce the
  // mana in that cost to less than one mana." "{4}{R}{G}: Other creatures you control get +1/+1 and gain trample and haste until end
  // of turn."
  'Agatha of the Vile Cauldron': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'activatedAbilitiesCostLess', amount: { powerOf: 'self' } },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}{G}') },
        targets: [],
        effects: [
          pump({ each: 'creature', controller: 'you', filter: { other: true } }, 1, 1, [
            'trample',
            'haste',
          ]),
        ],
      },
    ],
  },
  // "Haste. Celebration — Whenever Ash attacks, if two or more nonland permanents entered the battlefield under your control this
  // turn, put a +1/+1 counter on Ash."
  'Ash, Party Crasher': {
    abilities: [
      plus(whenThisAttacks([{ kind: 'counters', to: 'self', amount: 1 }]), {
        condition: celebration,
      }),
    ],
  },
  // "Trample. Permanent spells you cast that have an Adventure cost {1} less to cast."
  'Beluna Grandsquall': { abilities: [adventurePermanentsCostLess(1)] },
  // "When this creature enters, create a Monster Role token attached to it." "{1}, Sacrifice an Aura attached to this creature: This
  // creature fights target creature you don't control. If that creature would die this turn, exile it instead. Activate only as a
  // sorcery."
  'Faunsbane Troll': {
    abilities: [
      onEnter(createRole('Monster', 'self')),
      {
        kind: 'activated',
        cost: {
          mana: mana('{1}'),
          sacrificePermanent: { subtype: 'Aura', attachedToSource: true },
        },
        sorcerySpeed: true,
        targets: [theirCreature],
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
          { kind: 'fight', a: 'self', b: t0 },
        ],
      },
    ],
  },
  // "When Greta enters, create a Food token." "{G}, Sacrifice a Food: Put a +1/+1 counter on target creature. Activate only as a
  // sorcery." "{1}{B}, Sacrifice a Food: You draw a card and you lose 1 life."
  'Greta, Sweettooth Scourge': {
    abilities: [
      onEnter(food),
      {
        kind: 'activated',
        cost: { mana: mana('{G}'), ...sacrificeFood },
        sorcerySpeed: true,
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), ...sacrificeFood },
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },
  // "Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one — • Create a 4/4 white
  // and blue Elemental creature token. • Put a +1/+1 counter on each creature you control. • Scry 2, then draw a card."
  'Hylda of the Icy Crown': {
    abilities: [
      plus(whenYouTapOpponentCreature([], { cost: mana('{1}') }), {
        modes: [
          mode('Create a 4/4 white and blue Elemental creature token', [], {
            kind: 'createToken',
            token: WOE_ELEMENTAL_WU,
            count: 1,
          }),
          mode('Put a +1/+1 counter on each creature you control', [], {
            kind: 'counters',
            to: { each: 'creature', controller: 'you' },
            amount: 1,
          }),
          mode('Scry 2, then draw a card', [], { kind: 'scry', amount: 2 }, draw(1)),
        ],
      }),
    ],
  },
  // "You may look at the top card of your library any time. Once each turn, you may cast an instant or sorcery spell from the top of
  // your library."
  'Johann, Apprentice Sorcerer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'playFromTop',
          filter: { types: ['Instant', 'Sorcery'] },
          oncePerTurn: true,
        },
      },
    ],
  },
  // "Flash. Flying. Whenever another Faerie you control enters, each opponent loses 1 life."
  'Obyra, Dreaming Duelist': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Faerie' } }, [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: 1,
      }),
    ],
  },
  // "Menace. {T}: Spells you cast this turn that are black and/or red cost {X} less to cast, where X is the amount of life you lost
  // this turn. Activate only as a sorcery."
  'Rowan, Scion of War': { abilities: [lifeDiscount('lifeLost', ['B', 'R'])] },
  // "When Sharae enters, tap target creature an opponent controls and put a stun counter on it." "Whenever you tap one or more
  // untapped creatures your opponents control, draw a card. This ability triggers only once each turn."
  'Sharae of Numbing Depths': {
    abilities: [
      when({ on: 'etb' }, [theirCreature], ...tapAndStun(t0, 1)),
      whenYouTapOpponentCreature([draw(1)], { oneOrMore: true, oncePerTurn: true }),
    ],
  },
  // "When Syr Armont enters, create a Monster Role token attached to another target creature you control." "Enchanted creatures you
  // control get +1/+1."
  'Syr Armont, the Redeemer': {
    abilities: [
      when({ on: 'etb' }, [creatureYouControlOther], createRole('Monster')),
      enchantedCreaturesYouControlGet(1, 1),
    ],
  },
  // "Flying. As Talion enters, choose a number between 1 and 10. Whenever an opponent casts a spell with mana value, power, or
  // toughness equal to the chosen number, that player loses 2 life and you draw a card."
  'Talion, the Kindly Lord': {
    enterChoiceTitle: 'choose a number between 1 and 10',
    enterChoices: Array.from({ length: 10 }, (_, i) => ({
      label: String(i + 1),
      abilities: [talionTrigger(i + 1)],
    })),
  },
  // "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.) I, II — Choose target nontoken creature
  // you control that doesn't have the same name as a token you control. Create a token that's a copy of it, except it isn't
  // legendary, is a Reflection in addition to its other types, and has haste. III — Sacrifice all Reflections you control."
  "The Apprentice's Folly": {
    saga: 3,
    abilities: [
      chapter(
        [1, 2],
        [
          {
            what: 'creature',
            controller: 'you',
            filter: { nontoken: true, nameNotOfYourToken: true },
          },
        ],
        { kind: 'tokenCopy', of: t0, notLegendary: true, haste: true, addSubtype: 'Reflection' },
      ),
      chapter([3], [], {
        kind: 'sacrifice',
        what: { each: 'permanent', controller: 'you', filter: { subtype: 'Reflection' } },
      }),
    ],
  },
  // "Flying. The Goose Mother enters with X +1/+1 counters on it. When The Goose Mother enters, create half X Food tokens, rounded up.
  // Whenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card."
  'The Goose Mother': {
    entersWithXCounters: true,
    abilities: [
      onEnter({
        kind: 'createToken',
        token: 'food-token',
        count: { floorDiv: 2, amount: { x: true, plus: 1 } },
      }),
      whenThisAttacks([
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Food' }, min: 1 },
          then: [
            {
              kind: 'may',
              effects: [
                {
                  kind: 'sacrificeSeveral',
                  count: 1,
                  filter: { subtype: 'Food' },
                  then: [draw(1)],
                },
              ],
            },
          ],
        },
      ]),
    ],
  },
  // "Whenever Totentanz or another nontoken creature you control dies, create a 1/1 black Rat creature token with 'This token can't
  // block.'" "{1}{B}: Target attacking Rat you control gains deathtouch until end of turn."
  'Totentanz, Swarm Piper': {
    abilities: [
      when({ on: 'dies' }, [], { kind: 'createToken', token: WOE_RAT_CANT_BLOCK, count: 1 }),
      when({ on: 'otherCreatureDies', controller: 'you', nontoken: true }, [], {
        kind: 'createToken',
        token: WOE_RAT_CANT_BLOCK,
        count: 1,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [
          { what: 'creature', controller: 'you', filter: { subtype: 'Rat', attacking: true } },
        ],
        effects: [pump(t0, 0, 0, ['deathtouch'])],
      },
    ],
  },
  // "Vigilance. {T}: Spells you cast this turn that are white and/or blue cost {X} less to cast, where X is the amount of life you
  // gained this turn. Activate only as a sorcery."
  'Will, Scion of Peace': { abilities: [lifeDiscount('lifeGained', ['W', 'U'])] },
  // "{2}, {T}: Choose target enchantment you control that doesn't have the same name as another permanent you control. Create a
  // token that's a copy of it, except it isn't legendary. If the token is an Aura, untap Yenna, then scry 2. Activate only as a
  // sorcery."
  'Yenna, Redtooth Regent': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [
          {
            what: 'permanent',
            controller: 'you',
            filter: { types: ['Enchantment'], nameUniqueAmongYourPermanents: true },
          },
        ],
        effects: [custom('woeYennaCopy')],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_MULTICOLOUR_BACKS: Record<string, Behavior> = {
  // "Mill seven cards. Then put all cards that have an Adventure from among the milled cards into your hand."
  'Seek Thrills': { spell: { targets: [], effects: [custom('woeSeekThrills')] } },
};

/** Tokens only this group's cards make. */
export const WOE_MULTICOLOUR_TOKENS: CardDefinition[] = [
  // A 4/4 white and blue Elemental creature token (Hylda of the Icy Crown).
  {
    id: WOE_ELEMENTAL_WU,
    name: 'Elemental',
    manaCost: NO_COST,
    colors: ['W', 'U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 4,
    toughness: 4,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
