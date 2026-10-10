import type { Amount, CardDefinition, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  draw,
  drain,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreatureCard,
  yourCreaturesOf,
} from '../blb/helpers.ts';
import { chapter, mode } from '../fin/helpers.ts';
import { equip } from '../msc/helpers.ts';
import { amassGoblins } from '../hob-vocab.ts';
import { HOB_WOLF } from './tokens.ts';

/**
 * The Hobbit (20b): black cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_BLACK_BACKS. See docs/the-hobbit-plan.md.
 */

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const artifactOrCreature: CardFilter = { types: ['Artifact', 'Creature'] };
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const lose = (amount: number): EffectDef => ({ kind: 'loseLife', who: 'controller', amount });
/** Ferocious: "while you control a creature with power 4 or greater". */
const ferocious = { kind: 'controlsCreature', filter: { minPower: 4 } } as const;
/** +1/+1 counters on a creature. */
const counterOn = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });

export const HOB_BLACK: Record<string, Behavior> = {
  // "When this enchantment enters, return target creature card from your graveyard to your hand." "Whenever a creature card leaves
  // your graveyard, amass Goblins 1." (each card on its own) "{1}{B}: Goblins and Orcs you control gain menace until end of turn."
  'Along the Crooked Way': {
    abilities: [
      when({ on: 'etb' }, [yourCreatureCard()], { kind: 'returnToHand', what: t0 }),
      when({ on: 'cardsLeaveYourGraveyard', filter: { types: ['Creature'] } }, [], amassGoblins(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}') },
        targets: [],
        effects: [pump(yourCreaturesOf('Goblin', 'Orc'), 0, 0, ['menace'])],
      },
    ],
  },

  // "When Azog enters, destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's power.
  // If you controlled that creature, draw a card."
  "Azog, Moria's Ruin": {
    abilities: [
      when({ on: 'etb' }, [{ what: 'creature', filter: { other: true }, optional: true }], {
        kind: 'if',
        condition: { kind: 'targetChosen', target: 0 },
        then: [
          { kind: 'destroy', what: t0 },
          amassGoblins({ powerOf: t0 }, { controllerOf: 0 }),
          {
            kind: 'if',
            condition: { kind: 'targetWasControlledByYou', target: 0 },
            then: [draw(1)],
          },
        ],
      }),
    ],
  },

  // "Destroy target creature."
  "Bilbo's Deadly Slice": {
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'destroy', what: t0 }] },
  },

  // "When this Equipment enters, target opponent sacrifices a creature of their choice." "Equipped creature gets +2/+1." Equip {2}.
  'Crude Bent Blade': {
    abilities: [
      when({ on: 'etb' }, [opponent], { kind: 'opponentSacrifices' }),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 1 } },
      equip('{2}'),
    ],
  },

  // "Pay 2 life: This creature gets +2/+2 until end of turn. Activate only once each turn."
  'Desolation Prowler': {
    abilities: [
      {
        kind: 'activated',
        cost: { life: 2 },
        oncePerTurn: true,
        targets: [],
        effects: [pump('self', 2, 2)],
      },
    ],
  },

  // I — "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card." II — "Amass
  // Goblins 1." III, IV — "Target opponent loses 1 life and you gain 1 life."
  'Down, Down to Goblin-town': {
    saga: 4,
    abilities: [
      chapter([1], [opponent], {
        kind: 'chooseFromOpponentHand',
        filter: { nonland: true },
        then: 'discard',
      }),
      chapter([2], [], amassGoblins(1)),
      chapter([3, 4], [opponent], ...drain(1)),
    ],
  },

  // "This spell costs {3} less to cast if a creature died this turn." Flying, deathtouch.
  'Dreaded Bat-Cloud': {
    costReductionIf: { condition: { kind: 'creatureDiedThisTurn' }, amount: 3 },
  },

  // "When this creature dies, target creature an opponent controls gets -1/-1 until end of turn."
  'Front Porch Sentries': {
    abilities: [when({ on: 'dies' }, [theirCreature], pump(t0, -1, -1))],
  },

  // "Return up to one target creature card from your graveyard to your hand. Amass Goblins 3."
  'Gathering of Darkness': {
    spell: {
      targets: [yourCreatureCard(true)],
      effects: [{ kind: 'returnToHand', what: t0 }, amassGoblins(3)],
    },
  },

  // "Choose one — • Target creature gets -5/-5 until end of turn. If that creature would die this turn, exile it instead.
  // • Creatures target player controls get -1/-1 until end of turn."
  'Gnashing of Teeth': {
    modes: [
      mode('Target creature gets -5/-5 until end of turn', [{ what: 'creature' }], {
        kind: 'pump',
        to: t0,
        power: -5,
        toughness: -5,
        exileIfDies: true,
      }),
      mode(
        'Creatures target player controls get -1/-1 until end of turn',
        [{ what: 'player' }],
        pump({ each: 'creature', targetPlayer: 0 }, -1, -1),
      ),
    ],
  },

  // "Gollum can't block." "When Gollum enters, exile up to one target card from an opponent's graveyard. Each opponent loses 2
  // life." "{2}, Sacrifice an artifact or creature: Return this card from your graveyard to your hand. Activate only as a sorcery."
  'Gollum the Abandoned': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBlock' } },
      when(
        { on: 'etb' },
        [{ what: 'graveyardCard', controller: 'opponent', optional: true }],
        { kind: 'exileGraveyardCard', what: t0 },
        { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificePermanent: artifactOrCreature },
        sorcerySpeed: true,
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },

  // "As Gollum enters, choose odd or even. (Zero is even.)" "Whenever an opponent casts a spell with mana value of the chosen
  // quality, choose one that hasn't been chosen — • Put a +1/+1 counter on Gollum. • Each opponent loses 2 life and you gain 2
  // life. • Draw a card."
  'Gollum, Riddle Master': {
    abilities: [
      onEnter({
        kind: 'choose',
        title: 'choose odd or even',
        options: [
          { label: 'Odd', effects: [custom('setChosen', { type: 'odd' })] },
          { label: 'Even', effects: [custom('setChosen', { type: 'even' })] },
        ],
      }),
      {
        kind: 'triggered',
        trigger: {
          on: 'castSpell',
          filter: 'any',
          caster: 'opponent',
          spell: { manaValueParityOfSource: true },
        },
        targets: [],
        effects: [],
        modesOnce: true,
        modes: [
          { label: 'Put a +1/+1 counter on Gollum', targets: [], effects: [counterOn('self')] },
          {
            label: 'Each opponent loses 2 life and you gain 2 life',
            targets: [],
            effects: drain(2),
          },
          { label: 'Draw a card', targets: [], effects: [draw(1)] },
        ],
      },
    ],
  },

  // Menace. (Adventure: Meager Meal.)
  'Gollum, Silent Slinker': {},

  // Flying. "Whenever one or more other creatures die, scry 1."
  'Great Fierce Bee': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'any' },
        batch: true,
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
      },
    ],
  },

  // "Each creature you control with a +1/+1 counter on it has menace." (Adventure: Clap! Snap!.)
  'Great Ugly-Looking Goblin': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['menace'],
        },
      },
    ],
  },

  // Flash. "If a creature an opponent controls would die, exile it instead. When you do, create a 2/2 green Wolf creature token."
  'Head of the Hunt': {
    abilities: [
      { kind: 'static', effect: { kind: 'exileOpponentCreaturesInstead' } },
      when({ on: 'opponentCreatureExiledInstead' }, [], {
        kind: 'createToken',
        token: HOB_WOLF,
        count: 1,
      }),
    ],
  },

  // "Exile the top X cards of target opponent's library. You may play those cards this turn. If you cast a spell this way, pay life
  // equal to its mana value rather than pay its mana cost."
  'Inside Information': {
    spell: { targets: [opponent], effects: [custom('hobInsideInformation')] },
  },

  // Menace. Ferocious — "Whenever this creature attacks while you control a creature with power 4 or greater, this creature gets
  // +2/+2 until end of turn."
  'Nighthowl Pursuer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: ferocious,
        targets: [],
        effects: [pump('self', 2, 2)],
      },
    ],
  },

  // "You draw a card and lose 1 life. Amass Goblins 2."
  'Rage into the Valley': {
    spell: { targets: [], effects: [draw(1), lose(1), amassGoblins(2)] },
  },

  // Deathtouch. Ferocious — "Whenever this creature attacks while you control a creature with power 4 or greater, you gain 2 life."
  'Ravening Warg': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: ferocious,
        targets: [],
        effects: [gain(2)],
      },
    ],
  },

  // "Choose one — • Target player draws two cards and loses 2 life. • Target creature gets +2/+2 and gains lifelink until end of turn."
  'Reverent Howl': {
    modes: [
      mode(
        'Target player draws two cards and loses 2 life',
        [{ what: 'player' }],
        { kind: 'draw', who: t0, amount: 2 },
        { kind: 'loseLife', who: t0, amount: 2 },
      ),
      mode(
        'Target creature gets +2/+2 and gains lifelink until end of turn',
        [{ what: 'creature' }],
        pump(t0, 2, 2, ['lifelink']),
      ),
    ],
  },

  // "Whenever this creature attacks, you may sacrifice another creature. If you do, put a number of +1/+1 counters on this creature
  // equal to the sacrificed creature's power." "When this creature dies, amass Goblins X, where X is this creature's power."
  'Rhovanion Rampager': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: { types: ['Creature'] },
            then: [{ kind: 'sacrifice', what: 'chosen' }, counterOn('self', { powerOf: 'chosen' })],
          },
        ],
      }),
      when({ on: 'dies' }, [], amassGoblins({ powerOf: 'self' })),
    ],
  },

  // "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}." "Destroy target creature."
  'Stir Up Trouble': {
    sacrificeOrPay: mana('{4}'),
    sacrificeToCastFilter: artifactOrCreature,
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'destroy', what: t0 }] },
  },

  // "When this creature enters, each opponent discards a card."
  'Stony-Voiced Goblins': {
    abilities: [onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' })],
  },

  // "Put onto the battlefield under your control all creature cards in your opponents' graveyards that were put there from the
  // battlefield this turn. They are Food artifacts with '{2}, {T}, Sacrifice this artifact: You gain 3 life.' (They lose all other
  // types and subtypes.)"
  'Supper for Spiders': {
    spell: { targets: [], effects: [custom('hobSupperForSpiders')] },
  },

  // Deathtouch. "Whenever a player loses life, that player mills that many cards. (Damage causes loss of life.)" "When The Master of
  // Lake-town dies, draw a card for each graveyard with seven or more cards in it."
  'The Master of Lake-town': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'playerLosesLife', whose: 'you' },
        targets: [],
        effects: [{ kind: 'mill', count: { event: 'amount' }, who: 'controller' }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'playerLosesLife', whose: 'opponent' },
        targets: [],
        effects: [{ kind: 'mill', count: { event: 'amount' }, who: 'eachOpponent' }],
      },
      when({ on: 'dies' }, [], custom('hobMasterDraw')),
    ],
  },

  // "When The Sackville-Bagginses enter, you may sacrifice another creature or artifact. If you do, draw a card and create a Treasure
  // token." "Whenever you sacrifice a token, target opponent loses 1 life."
  'The Sackville-Bagginses': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: artifactOrCreature,
            then: [{ kind: 'sacrifice', what: 'chosen' }, draw(1), treasure],
          },
        ],
      }),
      when({ on: 'youSacrifice', filter: { token: true } }, [opponent], {
        kind: 'loseLife',
        who: t0,
        amount: 1,
      }),
    ],
  },
};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_BLACK_BACKS: Record<string, Behavior> = {
  // Gollum, Silent Slinker's Adventure: "Put a +1/+1 counter on up to one target creature. Target player gains 2 life."
  'Meager Meal': {
    spell: {
      targets: [{ what: 'creature', optional: true }, { what: 'player' }],
      effects: [counterOn(t0), { kind: 'gainLife', who: t1, amount: 2 }],
    },
  },
  // Great Ugly-Looking Goblin's Adventure: "Amass Goblins 2."
  'Clap! Snap!': {
    spell: { targets: [], effects: [amassGoblins(2)] },
  },
};

/** Tokens only this group's cards make. */
export const HOB_BLACK_TOKENS: CardDefinition[] = [];
