import type { Amount, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, gain, mana, onEnter, pump, t0, when, yourCreature, yourCreatureCard } from '../blb/helpers.ts';
import { combos, equip, mode } from '../fin/helpers.ts';
import {
  blight,
  entersWithMinusCounters,
  hasMinusCounter,
  mayBlight,
  optionalBlight,
  returnBeheldWhenLeaves,
  VIVID,
  withBlight,
  withRemovedCounters,
} from '../ecl-vocab.ts';
import { ECL_ELF, ECL_FAERIE, ECL_GOBLIN } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): black. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_BLACK_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const anyCreature: TargetSpec = { what: 'creature' };
const upToOneCreature: TargetSpec = { what: 'creature', optional: true };

const lose = (amount: Amount): EffectDef => ({ kind: 'loseLife', who: 'controller', amount });
const eachOpponentLoses = (amount: Amount): EffectDef => ({
  kind: 'loseLife',
  who: 'eachOpponent',
  amount,
});
/** Each opponent loses N life and you gain N life. */
const drain = (amount: Amount): EffectDef[] => [eachOpponentLoses(amount), gain(amount)];
const minusCounters = (amount: Amount, to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: '-1/-1',
  amount,
  to,
});
const removeMinusCounter: EffectDef = { kind: 'removeCounters', from: 'self', name: '-1/-1', count: 1 };

/** An Elf card in your graveyard (changelings are Elves too). */
const elfCardsInGraveyard: Amount = { count: 'cardsInGraveyard', subtype: 'Elf' };
const elfInGraveyard = { kind: 'amountAtLeast', amount: elfCardsInGraveyard, min: 1 } as const;

const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});

export const ECL_BLACK: Record<string, Behavior> = {
  // Flash. "When this Equipment enters, attach it to target creature you control. That creature gains wither until end
  // of turn." "Equipped creature gets +1/+2." Equip {2}.
  'Barbed Bloodletter': {
    abilities: [
      when(
        { on: 'etb' },
        [yourCreature],
        { kind: 'attach', to: t0 },
        pump(t0, 0, 0, ['wither']),
      ),
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 2 } },
      equip('{2}'),
    ],
  },

  // "When this creature dies, put a -1/-1 counter on up to one target creature."
  'Bile-Vial Boggart': {
    abilities: [when({ on: 'dies' }, [upToOneCreature], minusCounters(1, t0))],
  },

  // Flash, flying. "At the beginning of your upkeep, you lose 1 life and create a 1/1 blue and black Faerie creature
  // token with flying."
  'Bitterbloom Bearer': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], lose(1), {
        kind: 'createToken',
        token: ECL_FAERIE,
        count: 1,
      }),
    ],
  },

  // "Whenever this creature enters or attacks, you may blight 2. If you do, you draw a card and lose 1 life."
  'Blighted Blackthorn': {
    abilities: [
      onEnter(mayBlight(2, [draw(1), lose(1)])),
      when({ on: 'attacks' }, [], mayBlight(2, [draw(1), lose(1)])),
    ],
  },

  // "Put four -1/-1 counters on target creature."
  'Blight Rot': spell([anyCreature], minusCounters(4, t0)),

  // Convoke. "Choose a creature type. Return all creature cards of the chosen type from your graveyard to the battlefield."
  'Bloodline Bidding': {
    convoke: true,
    ...spell([], { kind: 'chooseCreatureType' }, { kind: 'custom', handler: 'eclReturnChosenType' }),
  },

  // "When this enchantment enters, you may blight 1. If you do, create two 1/1 black and red Goblin creature tokens."
  // "Whenever a Goblin creature you control dies, each opponent loses 1 life and you gain 1 life."
  'Boggart Mischief': {
    abilities: [
      onEnter(mayBlight(1, [{ kind: 'createToken', token: ECL_GOBLIN, count: 2 }])),
      when({ on: 'creatureYouControlDies', filter: { subtype: 'Goblin' } }, [], ...drain(1)),
    ],
  },

  // "Whenever you attack, target attacking Goblin you control gets +1/+0 until end of turn."
  'Boggart Prankster': {
    abilities: [
      when(
        { on: 'youAttack' },
        [{ what: 'creature', controller: 'you', filter: { subtype: 'Goblin', attacking: true } }],
        pump(t0, 1, 0),
      ),
    ],
  },

  // "As an additional cost to cast this spell, blight 1 or pay {3}." "Exile target creature."
  "Bogslither's Embrace": {
    blightOrPay: { amount: 1, pay: mana('{3}') },
    ...spell([anyCreature], { kind: 'exile', what: t0 }),
  },

  // "As an additional cost to cast this spell, behold a Goblin and exile it." "Pay 1 life, Blight 2: Target opponent
  // blights 2. Activate only as a sorcery." "When this creature leaves the battlefield, return the exiled card to its
  // owner's hand."
  'Champion of the Weird': {
    beholdExile: { subtype: 'Goblin' },
    abilities: [
      {
        kind: 'activated',
        cost: { life: 1, blight: 2 },
        sorcerySpeed: true,
        targets: [opponent],
        effects: [blight(2, { who: { target: 0 } })],
        label: 'Pay 1 life, Blight 2: Target opponent blights 2',
      },
      returnBeheldWhenLeaves,
    ],
  },

  // "This creature enters with three -1/-1 counters on it." "At the beginning of your end step, if there is an Elf card in
  // your graveyard and this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature."
  'Creakwood Safewright': {
    ...entersWithMinusCounters(3),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'all', of: [elfInGraveyard, hasMinusCounter] },
        targets: [],
        effects: [removeMinusCounter],
      },
    ],
  },

  // "Put two -1/-1 counters on each creature."
  'Darkness Descends': spell([], minusCounters(2, { each: 'creature' })),

  // "{T}, Blight 1: Surveil 1." "{T}, Blight 2: Exile target card from a graveyard." "During your turn, you may cast creature
  // spells from among cards you own exiled with this creature by removing three counters from among creatures you control in
  // addition to paying their other costs."
  'Dawnhand Dissident': {
    abilities: [
      {
        kind: 'activated',
        cost: withBlight(1, { tapSelf: true }),
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
      {
        kind: 'activated',
        cost: withBlight(2, { tapSelf: true }),
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'exileGraveyardCard', what: t0, track: true }],
      },
      {
        kind: 'static',
        effect: {
          kind: 'castExiledWithSelf',
          filter: { types: ['Creature'] },
          removeCounters: 3,
          yourTurnOnly: true,
        },
      },
    ],
  },

  // Menace. "When this creature enters, mill three cards. Then if there is an Elf card in your graveyard, each opponent
  // loses 2 life and you gain 2 life."
  'Dawnhand Eulogist': {
    abilities: [
      onEnter(
        { kind: 'mill', count: 3 },
        { kind: 'if', condition: elfInGraveyard, then: drain(2) },
      ),
    ],
  },

  // "Return target creature card from your graveyard to the battlefield. Then if it isn't your main phase, blight 2."
  'Dose of Dawnglow': {
    ...spell(
      [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
      { kind: 'returnToBattlefield', what: t0 },
      {
        kind: 'if',
        condition: { kind: 'not', condition: { kind: 'yourStep', steps: ['main1', 'main2'] } },
        then: [blight(2)],
      },
    ),
  },

  // Flying. "When this creature enters, you may blight 1. If you do, each opponent discards a card."
  'Dream Seizer': {
    abilities: [onEnter(mayBlight(1, [{ kind: 'discard', who: 'eachOpponent', count: 1 }]))],
  },

  // "When this creature enters, target creature you control gets +X/+0 until end of turn and up to one target creature an
  // opponent controls gets -0/-X until end of turn, where X is the number of Elves you control plus the number of Elf cards
  // in your graveyard."
  'Gloom Ripper': {
    abilities: [
      when(
        { on: 'etb' },
        [yourCreature, { ...theirCreature, optional: true }],
        pump(t0, elfCount(), 0),
        pump({ target: 1 }, 0, { multiply: -1, amount: elfCount() }),
      ),
    ],
  },

  // "This creature enters with two -1/-1 counters on it." "{2}{B}, Remove two counters from this creature: Target creature
  // gets -2/-2 until end of turn. Activate only as a sorcery."
  'Gnarlbark Elm': {
    ...entersWithMinusCounters(2),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(2, { mana: mana('{2}{B}') }),
        sorcerySpeed: true,
        targets: [anyCreature],
        effects: [pump(t0, -2, -2)],
      },
    ],
  },

  // Changeling. "When this creature enters, you may return target creature card from your graveyard to your hand."
  Graveshifter: {
    abilities: [
      when({ on: 'etb' }, [yourCreatureCard(true)], { kind: 'returnToHand', what: t0 }),
    ],
  },

  // "At the beginning of your first main phase, you may blight 2. If you don't, you lose 3 life."
  'Gutsplitter Gang': {
    abilities: [
      when({ on: 'beginningOfMain', which: 1 }, [], mayBlight(2, [], [lose(3)])),
    ],
  },

  // "This creature enters with two -1/-1 counters on it." "Whenever another creature you control dies, surveil 1, then
  // remove a -1/-1 counter from this creature."
  'Heirloom Auntie': {
    ...entersWithMinusCounters(2),
    abilities: [
      when(
        { on: 'otherCreatureDies', controller: 'you' },
        [],
        { kind: 'surveil', amount: 1 },
        removeMinusCounter,
      ),
    ],
  },

  // "Discard a card: This creature gains indestructible until end of turn. Tap it."
  'Iron-Shield Elf': {
    abilities: [
      {
        kind: 'activated',
        cost: { discard: true },
        targets: [],
        effects: [pump('self', 0, 0, ['indestructible']), { kind: 'tap', what: 'self' }],
      },
    ],
  },

  // "Whenever this creature attacks, you draw a card and lose 1 life."
  'Moonglove Extractor': {
    abilities: [when({ on: 'attacks' }, [], draw(1), lose(1))],
  },

  // Menace. "This creature enters with six -1/-1 counters on it." "Whenever one or more permanent cards are put into your
  // graveyard from anywhere while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature."
  Moonshadow: {
    ...entersWithMinusCounters(6),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'permanentCardsToYourGraveyard' },
        batch: true,
        condition: hasMinusCounter,
        targets: [],
        effects: [removeMinusCounter],
      },
    ],
  },

  // "Players can't draw cards or gain life." "At the beginning of each player's draw step, that player loses 3 life,
  // searches their library for a card, puts it into their hand, then shuffles."
  'Mornsong Aria': {
    abilities: [
      { kind: 'static', effect: { kind: 'playersCantDraw' } },
      { kind: 'static', effect: { kind: 'noLifeGain' } },
      when(
        { on: 'beginningOfDraw', whose: 'each' },
        [],
        { kind: 'custom', handler: 'eclActivePlayerLosesLife', params: { amount: 3 } },
        {
          kind: 'searchLibrary',
          filter: {},
          to: 'hand',
          required: true,
          activePlayerSearches: true,
        },
      ),
    ],
  },

  // "As an additional cost to cast this spell, behold a Goblin or pay {2}." "This creature can't block." "When this creature
  // dies, destroy target creature an opponent controls with power 2 or less."
  'Mudbutton Cursetosser': {
    beholdOrPay: { filter: { subtype: 'Goblin' }, pay: mana('{2}') },
    abilities: [
      { kind: 'static', effect: { kind: 'cantBlock' } },
      when({ on: 'dies' }, [{ ...theirCreature, filter: { maxPower: 2 } }], {
        kind: 'destroy',
        what: t0,
      }),
    ],
  },

  // Changeling. "Target creature gets +3/-3 and loses all creature types until end of turn."
  'Nameless Inversion': spell(
    [anyCreature],
    pump(t0, 3, -3),
    { kind: 'loseCreatureTypes', what: t0 },
  ),

  // Flying, lifelink. "Whenever you cast a spell during an opponent's turn, put a -1/-1 counter on up to one target creature."
  'Nightmare Sower': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'opponentsTurn' },
        targets: [upToOneCreature],
        effects: [minusCounters(1, t0)],
      },
    ],
  },

  // "Choose one or both — • Target opponent exiles two cards from their hand. • Remove all counters from target creature."
  'Perfect Intimidation': {
    modes: combos(
      [
        mode('Target opponent exiles two cards from their hand', [opponent], {
          kind: 'discard',
          of: t0,
          count: 2,
          exile: true,
        }),
        mode('Remove all counters from target creature', [anyCreature], {
          kind: 'custom',
          handler: 'eclRemoveAllCounters',
          params: { target: 0 },
        }),
      ],
      [1, 2],
    ),
  },

  // "As an additional cost to cast this spell, you may blight 1." "Destroy target creature with mana value 2 or less. If this
  // spell's additional cost was paid, you gain 2 life."
  'Requiting Hex': {
    ...optionalBlight(1),
    ...spell(
      [{ what: 'creature', filter: { maxManaValue: 2 } }],
      { kind: 'destroy', what: t0 },
      { kind: 'if', condition: { kind: 'wasKicked' }, then: [gain(2)] },
    ),
  },

  // "When this creature dies, if it had a -1/-1 counter on it, return it to the battlefield under its owner's control and it
  // loses all abilities."
  'Retched Wretch': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        condition: { kind: 'sourceHadNamedCounter', name: '-1/-1' },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', losesAbilitiesGains: [] }],
      },
    ],
  },

  // Lifelink. "When this creature enters, mill two cards."
  'Scarblade Scout': { abilities: [onEnter({ kind: 'mill', count: 2 })] },

  // "Target creature you control gains deathtouch and lifelink until end of turn. When that creature dies this turn, create a
  // 2/2 black and green Elf creature token."
  "Scarblade's Malice": spell(
    [yourCreature],
    pump(t0, 0, 0, ['deathtouch', 'lifelink']),
    {
      kind: 'whenDiesThisTurn',
      what: t0,
      effects: [{ kind: 'createToken', token: ECL_ELF, count: 1 }],
    },
  ),

  // Menace. "Vivid — When this creature enters, each opponent loses X life and you gain X life, where X is the number of
  // colors among permanents you control."
  Shimmercreep: { abilities: [onEnter(...drain(VIVID))] },

  // "When this creature enters, target opponent reveals X cards from their hand, where X is the number of Goblins you control.
  // You choose one of those cards. That player exiles it. If an instant or sorcery card is exiled this way, you may cast it for
  // as long as you control this creature, and mana of any type can be spent to cast that spell."
  'Taster of Wares': {
    abilities: [
      when({ on: 'etb' }, [opponent], { kind: 'chooseCustom', handler: 'eclTasterReveal' }),
    ],
  },

  // "When this creature enters, surveil 2." "Whenever one or more other creatures you control enter, if they entered or were
  // cast from a graveyard, create a token that's a copy of one of them. This ability triggers only once each turn."
  'Twilight Diviner': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 2 }),
      {
        kind: 'triggered',
        trigger: { on: 'creaturesEnterFromOrCastFromGraveyard' },
        batch: true,
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'eclDivinerCopy' }],
      },
    ],
  },

  // "Choose one — • Return target creature card from your graveyard to your hand. • Return two target creature cards that share
  // a creature type from your graveyard to your hand."
  Unbury: {
    modes: [
      mode(
        'Return target creature card from your graveyard to your hand',
        [yourCreatureCard()],
        { kind: 'returnToHand', what: t0 },
      ),
      mode(
        'Return two target creature cards that share a creature type from your graveyard to your hand',
        [yourCreatureCard(), { ...yourCreatureCard(), sharesCreatureTypeWithPrevious: true }],
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: { target: 1 } },
      ),
    ],
  },
};

/** X = the number of Elves you control plus the number of Elf cards in your graveyard. */
function elfCount(): Amount {
  return { sum: [{ count: 'creaturesYouControl', subtype: 'Elf' }, elfCardsInGraveyard] };
}

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_BLACK_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_BLACK_TOKENS: CardDefinition[] = [];
