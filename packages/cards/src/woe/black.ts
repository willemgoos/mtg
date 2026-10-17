import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  draw,
  drain,
  food,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
  yours,
} from '../blb/helpers.ts';
import { chapter, spell } from '../fin/helpers.ts';
import {
  bargain,
  createRole,
  ifBargained,
  whenEnchantmentYouControlToGraveyard,
  whenEntersIfBargained,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23b): black cards. Printed characteristics come from Scryfall; this file has the rules text. A back face
 * (Adventure spell side) is keyed by its own name in WOE_BLACK_BACKS. See docs/wilds-of-eldraine-plan.md. Engine pieces that
 * only these cards need are in engine/src/woe-black-effects.ts.
 */

/** The 1/1 black Rat creature token with "This token can't block." */
export const WOE_RAT = 'woe-rat-token';
/** Ashiok's 1/1 black Nightmare token: "At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token." */
const NIGHTMARE = 'woe-ashiok-nightmare-token';

const rat: EffectDef = { kind: 'createToken', token: WOE_RAT, count: 1 };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const anyCreature: TargetSpec = { what: 'creature' };
const upToOneCreature: TargetSpec = { what: 'creature', optional: true };
const loseLife = (
  amount: number,
  who: 'controller' | 'eachOpponent' = 'controller',
): EffectDef => ({
  kind: 'loseLife',
  who,
  amount,
});
const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
const counter = (to: 'self' | { target: number }, amount = 1): EffectDef => ({
  kind: 'counters',
  to,
  amount,
});
const discardEachOpponent = (count: number): EffectDef => ({
  kind: 'discard',
  count,
  who: 'eachOpponent',
});
/** The Food-sacrifice cost of an activated ability. */
const sacrificeFood = { sacrificePermanent: { subtype: 'Food' } } as const;

/** "Pump X/X" with the negative X of an {X} spell. */
const minusX = { x: true, times: -1 } as const;

export const WOE_BLACK: Record<string, Behavior> = {
  // "Whenever an enchantment you control is put into a graveyard from the battlefield, draw a card." (Roles count.)
  "Ashiok's Reaper": { abilities: [whenEnchantmentYouControlToGraveyard([draw(1)])] },

  // "If you would pay life while your library has at least that many cards in it, exile that many cards from the top of your
  // library instead." (the engine pays every life cost through `payLife`.)
  // "+1: Look at the top two cards of your library. Exile one of them and put the other into your hand."
  // "−2: Create two 1/1 black Nightmare creature tokens with 'At the beginning of combat on your turn, if a card was put into
  // exile this turn, put a +1/+1 counter on this token.'"
  // "−7: Target player exiles the top X cards of their library, where X is the total mana value of cards you own in exile."
  'Ashiok, Wicked Manipulator': {
    abilities: [
      { kind: 'static', effect: { kind: 'woePayLifeExilesLibrary' } },
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'woeAshiokLook' }],
        label:
          '+1: Look at the top two cards of your library. Exile one of them and put the other into your hand',
      },
      {
        kind: 'activated',
        cost: { loyalty: -2 },
        targets: [],
        effects: [{ kind: 'createToken', token: NIGHTMARE, count: 2 }],
        label: '−2: Create two 1/1 black Nightmare creature tokens',
      },
      {
        kind: 'activated',
        cost: { loyalty: -7 },
        targets: [{ what: 'player' }],
        effects: [custom('woeAshiokUltimate')],
        label:
          '−7: Target player exiles the top X cards of their library, where X is the total mana value of cards you own in exile',
      },
    ],
  },

  // "Bargain. Return up to two target creature cards from your graveyard to your hand. If this spell was bargained, you may put
  // one of those cards with mana value 4 or less onto the battlefield instead of putting it into your hand."
  'Back for Seconds': {
    ...bargain(),
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature'] },
          anyNumber: true,
          maxTargets: 2,
        },
      ],
      effects: [
        ifBargained(
          [{ kind: 'chooseCustom', handler: 'woeBackForSeconds' }],
          [custom('woeBackReturn')],
        ),
      ],
    },
  },

  // Flying. "This creature has lifelink as long as you control another Faerie." "{2}{B}: This creature gets +1/+0 until end of turn."
  'Barrow Naughty': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsAnother', subtype: 'Faerie' },
          power: 0,
          toughness: 0,
          keywords: ['lifelink'],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}') },
        targets: [],
        effects: [pump('self', 1, 0)],
      },
    ],
  },

  // "This creature enters with a +1/+1 counter on it for each creature that died under your control this turn."
  'Callous Sell-Sword': { entersWithCountersAmount: { count: 'creaturesYouLostThisTurn' } },

  // Bargain. "Target creature gets -3/-3 until end of turn. If this spell was bargained, that creature gets -5/-5 instead."
  'Candy Grapple': {
    ...bargain(),
    ...spell([anyCreature], ifBargained([pump(t0, -5, -5)], [pump(t0, -3, -3)])),
  },

  // Menace. (The Adventure is Price of Beauty.)
  'Conceited Witch': {},

  // Flying. "Whenever you cast a spell during an opponent's turn, up to one target creature an opponent controls gets -1/-1 until
  // end of turn."
  'Dream Spoilers': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'opponentsTurn' },
        targets: [{ what: 'creature', controller: 'opponent', optional: true }],
        effects: [pump(t0, -1, -1)],
      },
    ],
  },

  // "Target opponent discards two cards. Create a Wicked Role token attached to up to one target creature you control."
  "Eriette's Whisper": spell(
    [
      { what: 'player', controller: 'opponent' },
      { ...yourCreature, optional: true },
    ],
    { kind: 'discard', count: 2, of: t0 },
    createRole('Wicked', t1),
  ),

  // "When this creature enters, create a Food token." "Whenever you sacrifice a Food, create a 1/1 black Rat creature token with
  // 'This token can't block.'"
  'Experimental Confectioner': {
    abilities: [onEnter(food), when({ on: 'youSacrifice', filter: { subtype: 'Food' } }, [], rat)],
  },

  // Flying. "When this creature enters, surveil 1." "{2}{B}, Exile this card from your graveyard: You draw a card and you lose 1 life."
  'Faerie Dreamthief': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{2}{B}'), exileSelf: true },
        targets: [],
        effects: [draw(1), loseLife(1)],
      },
    ],
  },

  // "Target creature gets -X/-X until end of turn. That creature gets an additional -3/-3 until end of turn if you controlled a
  // Faerie as you cast this spell." (The engine notes the Faerie as the spell is cast: it matters not whether you still do.)
  'Faerie Fencing': spell([anyCreature], pump(t0, minusX, minusX), {
    kind: 'if',
    condition: { kind: 'custom', handler: 'woeFaerieAtCast' },
    then: [pump(t0, -3, -3)],
  }),

  // "Destroy target creature with mana value 3 or less. If it's your turn, create a Food token."
  'Feed the Cauldron': spell(
    [{ what: 'creature', filter: { maxManaValue: 3 } }],
    { kind: 'destroy', what: t0 },
    { kind: 'if', condition: { kind: 'yourTurn' }, then: [food] },
  ),

  // Lifelink. "When this creature enters, up to one target creature gets -X/-X until end of turn, where X is the amount of life
  // you gained this turn." (The Adventure is Tempt with Treats.)
  'Gumdrop Poisoner': {
    abilities: [
      when(
        { on: 'etb' },
        [upToOneCreature],
        pump(
          t0,
          { multiply: -1, amount: { count: 'lifeGainedThisTurn' } },
          { multiply: -1, amount: { count: 'lifeGainedThisTurn' } },
        ),
      ),
    ],
  },

  // Bargain, flying. "When this creature enters, if it was bargained, each opponent loses 3 life and you gain 3 life."
  'High Fae Negotiator': {
    ...bargain(),
    abilities: [whenEntersIfBargained(drain(3))],
  },

  // "When this enchantment enters, each opponent discards a card and loses 2 life." "When this enchantment is put into a graveyard
  // from the battlefield, scry 2." "{2}{B}: Sacrifice this enchantment."
  'Hopeless Nightmare': {
    abilities: [
      onEnter(discardEachOpponent(1), loseLife(2, 'eachOpponent')),
      when({ on: 'selfToGraveyard' }, [], scry(2)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}') },
        targets: [],
        effects: [{ kind: 'sacrifice', what: 'self' }],
      },
    ],
  },

  // "When this creature enters, choose one — • Create a 1/1 black Rat creature token with 'This token can't block.' • You may
  // sacrifice another creature. If you do, scry 2, then draw a card. • Creatures you control gain menace until end of turn."
  "Lord Skitter's Butcher": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          { label: 'Create a 1/1 Rat', targets: [], effects: [rat] },
          {
            label: 'You may sacrifice another creature: scry 2, then draw a card',
            targets: [],
            effects: [
              {
                kind: 'may',
                effects: [
                  {
                    kind: 'sacrificeSeveral',
                    count: 1,
                    filter: { types: ['Creature'] },
                    then: [scry(2), draw(1)],
                  },
                ],
              },
            ],
          },
          {
            label: 'Creatures you control gain menace until end of turn',
            targets: [],
            effects: [pump(yours, 0, 0, ['menace'])],
          },
        ],
      },
    ],
  },

  // "Whenever another Rat you control enters, exile up to one target card from an opponent's graveyard." "At the beginning of
  // combat on your turn, create a 1/1 black Rat creature token with 'This token can't block.'"
  'Lord Skitter, Sewer King': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Rat' } },
        [{ what: 'graveyardCard', controller: 'opponent', optional: true }],
        { kind: 'exileGraveyardCard', what: t0 },
      ),
      atYourCombat([], rat),
    ],
  },

  // "When this creature dies, create a Food token."
  Mintstrosity: { abilities: [when({ on: 'dies' }, [], food)] },

  // "Until end of turn, target creature you control gains 'When this creature dies, return it to the battlefield tapped under its
  // owner's control, then create a Wicked Role token attached to it.'"
  'Not Dead After All': spell([yourCreature], {
    kind: 'whenDiesThisTurn',
    what: t0,
    byLastController: true,
    effects: [
      { kind: 'returnToBattlefield', what: 'subject', tapped: true, underOwner: true },
      createRole('Wicked', 'chosen'),
    ],
  }),

  // Flying. "At the beginning of each end step, if a creature died this turn, create a Food token." "{2}{B}, Sacrifice another
  // creature or artifact: Old Flitterfang gets +2/+2 until end of turn."
  'Old Flitterfang': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'creatureDiedThisTurn' },
        targets: [],
        effects: [food],
      },
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}{B}'),
          sacrificePermanent: {
            anyOf: [{ types: ['Creature'] }, { types: ['Artifact'] }],
            other: true,
          },
        },
        targets: [],
        effects: [pump('self', 2, 2)],
      },
    ],
  },

  // "Up to one target creature gets -1/-1 until end of turn. You create a 1/1 black Rat creature token with 'This token can't block.'"
  'Rat Out': spell([upToOneCreature], pump(t0, -1, -1), rat),

  // Bargain. "If this spell was bargained, look at the top four cards of your library, then put up to two of them back on top of
  // your library in any order and the rest into your graveyard. You draw two cards and you lose 2 life."
  "Rowan's Grim Search": {
    ...bargain(),
    ...spell(
      [],
      ifBargained([{ kind: 'chooseCustom', handler: 'woeRowanTop' }]),
      draw(2),
      loseLife(2),
    ),
  },

  // Deathtouch. "Whenever this creature deals combat damage to a player, create a Food token."
  'Scream Puff': { abilities: [when({ on: 'combatDamageToPlayer' }, [], food)] },

  // Flying. "When this creature enters, each opponent discards a card." (The Adventure is Take It Back.)
  'Spellscorn Coven': { abilities: [onEnter(discardEachOpponent(1))] },

  // Flash, flying. "When this creature enters, destroy target creature an opponent controls that was dealt damage this turn."
  'Stingblade Assassin': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent', filter: { damaged: true } }],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },

  // "Target creature gets +3/+0 until end of turn. Draw a card."
  'Sugar Rush': spell([anyCreature], pump(t0, 3, 0), draw(1)),

  // "When this creature enters, create a Food token." "{2}, Sacrifice a Food: Target player loses 2 life."
  'Sweettooth Witch': {
    abilities: [
      onEnter(food),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), ...sacrificeFood },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'loseLife', who: t0, amount: 2 }],
      },
    ],
  },

  // "Exile target creature. If you control an enchantment, scry 2."
  'Taken by Nightmares': spell(
    [anyCreature],
    { kind: 'exile', what: t0 },
    {
      kind: 'if',
      condition: { kind: 'controlsPermanents', filter: { types: ['Enchantment'] }, min: 1 },
      then: [scry(2)],
    },
  ),

  // "I — Destroy target creature an opponent controls with mana value 2 or less. II — Create a Food token. III — Create a Wicked
  // Role token attached to target creature you control."
  "The Witch's Vanity": {
    saga: 3,
    abilities: [
      chapter([1], [{ ...theirCreature, filter: { maxManaValue: 2 } }], {
        kind: 'destroy',
        what: t0,
      }),
      chapter([2], [], food),
      chapter([3], [yourCreature], createRole('Wicked')),
    ],
  },

  // "When this creature enters, create a 1/1 black Rat creature token with 'This creature can't block.' Then for each Rat you
  // control, create a Wicked Role token attached to that Rat."
  'Twisted Sewer-Witch': {
    abilities: [
      onEnter(
        rat,
        createRole('Wicked', { each: 'creature', controller: 'you', filter: { subtype: 'Rat' } }),
      ),
    ],
  },

  // "At the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control." (The
  // Adventure is Locthwain Scorn.)
  'Virtue of Persistence': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [{ what: 'graveyardCard', filter: { types: ['Creature'] } }],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },

  // "When this creature enters, create a 1/1 black Rat creature token with 'This token can't block.'" "Whenever another creature
  // you control dies, put a +1/+1 counter on this creature."
  'Voracious Vermin': {
    abilities: [
      onEnter(rat),
      when({ on: 'otherCreatureDies', controller: 'you' }, [], counter('self')),
    ],
  },

  // "Whenever an enchantment you control is put into a graveyard from the battlefield, each opponent loses 1 life."
  'Wicked Visitor': {
    abilities: [whenEnchantmentYouControlToGraveyard([loseLife(1, 'eachOpponent')])],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_BLACK_BACKS: Record<string, Behavior> = {
  // Sorcery — Adventure {R}: "Target creature you control deals damage equal to its power to any other target. Then sacrifice it."
  'Burn Together': spell(
    [yourCreature, { what: 'any' }],
    { kind: 'damage', amount: { powerOf: t0 }, from: t0, to: t1 },
    { kind: 'sacrifice', what: t0 },
  ),

  // Sorcery — Adventure {B}: "Create a Wicked Role token attached to target creature you control."
  'Price of Beauty': spell([yourCreature], createRole('Wicked')),

  // Instant — Adventure {B}: "Create a Food token."
  'Tempt with Treats': spell([], food),

  // Instant — Adventure {2}{U}: "Return target spell to its owner's hand."
  'Take It Back': spell([{ what: 'spell' }], { kind: 'returnSpellToHand', what: t0 }),

  // Sorcery — Adventure {1}{B}: "Target creature gets -3/-3 until end of turn. You gain 2 life."
  'Locthwain Scorn': spell([anyCreature], pump(t0, -3, -3), gain(2)),
};

const NO_COST = { generic: 0, colored: {} };

/** Tokens only this group's cards make. */
export const WOE_BLACK_TOKENS: CardDefinition[] = [
  // The 1/1 black Rat creature token with "This token can't block." (Experimental Confectioner, Lord Skitter's Butcher, Lord
  // Skitter, Rat Out, Twisted Sewer-Witch, Voracious Vermin, and the other sets' Rat makers).
  {
    id: WOE_RAT,
    name: 'Rat',
    manaCost: NO_COST,
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Rat'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [{ kind: 'static', effect: { kind: 'cantBlock' } }],
    isToken: true,
  },
  // Ashiok, Wicked Manipulator's 1/1 black Nightmare.
  {
    id: NIGHTMARE,
    name: 'Nightmare',
    manaCost: NO_COST,
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Nightmare'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'cardsExiledThisTurn' },
        targets: [],
        effects: [counter('self')],
      } as AbilityDef,
    ],
    isToken: true,
  },
];
