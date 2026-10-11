import type { CardDefinition, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  draw,
  food,
  mana,
  onEnter,
  pump,
  t0,
  theirCreature,
  when,
  yourCreatureCard,
} from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { amassOrcs, ringTempts, whenRingTempts, whenYouCreateToken } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): black cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_BLACK_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const LTR_BALLISTIC_BOULDER = 'ltr-ballistic-boulder-token';

const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const creature: TargetSpec = { what: 'creature' };
const destroyTarget: EffectDef = { kind: 'destroy', what: t0 };
/** "Another creature" for a sacrifice cost. */
const anotherCreature: CardFilter = { types: ['Creature'], other: true };
/** Goblins and Orcs ("Goblin or Orc", "Orcs and Goblins"). */
const goblinOrOrc: CardFilter = { subtypes: ['Goblin', 'Orc'] };
/** Each Wraith you control. */
const yourWraiths: Ref = { each: 'creature', controller: 'you', filter: { subtype: 'Wraith' } };
/** "Each opponent loses 1 life." */
const eachOpponentLoses1: EffectDef = { kind: 'loseLife', who: 'eachOpponent', amount: 1 };
/** "If the sacrificed creature was legendary" (the creature sacrificed as a cost). */
const sacrificedWasLegendary = {
  kind: 'amountAtLeast',
  amount: { sacrificedLegendary: true },
  min: 1,
} as const;

export const LTR_BLACK: Record<string, Behavior> = {
  // "Your opponents can't gain life." "{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was
  // legendary, amass Orcs 2."
  'Gríma Wormtongue': {
    abilities: [
      { kind: 'static', effect: { kind: 'opponentsCantGainLife' } },
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificePermanent: anotherCreature },
        targets: [{ what: 'player' }],
        effects: [
          { kind: 'loseLife', who: t0, amount: 1 },
          { kind: 'if', condition: sacrificedWasLegendary, then: [amassOrcs(2)] },
        ],
      },
    ],
  },

  // "Return target creature card from your graveyard to your hand. The Ring tempts you."
  "Sam's Desperate Rescue": {
    spell: {
      targets: [yourCreatureCard()],
      effects: [{ kind: 'returnToHand', what: t0 }, ringTempts],
    },
  },

  // Flying. "When this creature enters, each opponent sacrifices a creature of their choice. Create a Food token for each creature
  // sacrificed this way."
  'Voracious Fell Beast': {
    abilities: [onEnter({ kind: 'opponentSacrifices', then: [food] })],
  },

  // "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one — •
  // Draw a card. • Create a Treasure token." (the reflexive trigger is ability 1)
  'Gorbag of Minas Morgul': {
    abilities: [
      when(
        { on: 'creatureYouControlDealsCombatDamage', toPlayer: true, filter: goblinOrOrc },
        [],
        {
          kind: 'may',
          effects: [
            { kind: 'sacrifice', what: 'subject', then: [{ kind: 'reflexiveTrigger', ability: 1 }] },
          ],
        },
      ),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [],
        effects: [],
        modes: [
          mode('Draw a card', [], draw(1)),
          mode('Create a Treasure token', [], treasure),
        ],
      },
    ],
  },

  // "Destroy target creature. The Ring tempts you."
  'Claim the Precious': {
    spell: { targets: [creature], effects: [destroyTarget, ringTempts] },
  },

  // Deathtouch. "When this creature enters, the Ring tempts you." "Whenever the Ring tempts you, put a +1/+1 counter on each Wraith
  // you control." "A deck can have up to nine cards named Nazgûl." (a deck-building rule: nothing in the game enforces a copy limit)
  'Nazgûl': {
    abilities: [
      onEnter(ringTempts),
      whenRingTempts([{ kind: 'counters', to: yourWraiths, amount: 1 }]),
    ],
  },

  // Flying. "Whenever you create or sacrifice a token, each opponent loses 1 life."
  'Mirkwood Bats': {
    abilities: [
      whenYouCreateToken([eachOpponentLoses1]),
      when({ on: 'youSacrifice', filter: { token: true } }, [], eachOpponentLoses1),
    ],
  },

  // Menace. "Other Orcs and Goblins you control have menace." "At the beginning of combat on your turn, amass Orcs 2."
  'Warg Rider': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: goblinOrOrc,
          power: 0,
          toughness: 0,
          keywords: ['menace'],
        },
      },
      atYourCombat([], amassOrcs(2)),
    ],
  },

  // "Target creature gets -2/-2 until end of turn." "{3}{B}, Exile this card from your graveyard: The Ring tempts you. Activate
  // only as a sorcery."
  "Gollum's Bite": {
    spell: { targets: [creature], effects: [pump(t0, -2, -2)] },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{B}'), exileSelf: true },
        sorcerySpeed: true,
        fromGraveyard: true,
        targets: [],
        effects: [ringTempts],
      },
    ],
  },

  // "Target creature gets +1/+2 and gains deathtouch until end of turn. Create a Food token."
  "Shelob's Ambush": {
    spell: { targets: [creature], effects: [pump(t0, 1, 2, ['deathtouch']), food] },
  },

  // "When this creature enters, target creature an opponent controls gets -3/-3 until end of turn. If that creature is legendary,
  // its controller loses 3 life." "When the Ring tempts you, return this card from your graveyard to your hand."
  Ringwraiths: {
    abilities: [
      when(
        { on: 'etb' },
        [theirCreature],
        pump(t0, -3, -3),
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { supertypes: ['Legendary'] } },
          then: [{ kind: 'loseLife', who: { controllerOf: 0 }, amount: 3 }],
        },
      ),
      whenRingTempts([{ kind: 'returnSource', to: 'hand' }], { fromGraveyard: true }),
    ],
  },

  // Defender. "Whenever you attack with one or more Goblins and/or Orcs, create a 2/1 colorless Construct artifact creature token
  // with flying named Ballistic Boulder that's tapped and attacking. Sacrifice that token at end of combat."
  'Mordor Trebuchet': {
    abilities: [
      when({ on: 'youAttack', filter: goblinOrOrc }, [], {
        kind: 'createToken',
        token: LTR_BALLISTIC_BOULDER,
        count: 1,
        attacking: true,
        sacrificeAt: 'endCombat',
      }),
    ],
  },

  // "You draw a card and you lose 1 life. Amass Orcs 1."
  'Mordor Muster': {
    spell: {
      targets: [],
      effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }, amassOrcs(1)],
    },
  },

  // "When Gollum leaves the battlefield, the Ring tempts you." "{B}, Sacrifice a creature: Return this card from your graveyard to
  // your hand. Activate only as a sorcery."
  'Gollum, Patient Plotter': {
    abilities: [
      when({ on: 'leavesBattlefield' }, [], ringTempts),
      {
        kind: 'activated',
        cost: { mana: mana('{B}'), sacrificeCreature: true },
        sorcerySpeed: true,
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },

  // "As an additional cost to cast this spell, sacrifice a creature." "Draw two cards. If the sacrificed creature was legendary,
  // draw three cards instead."
  'Nasty End': {
    sacrificeCreatureToCast: true,
    spell: {
      targets: [],
      effects: [{ kind: 'if', condition: sacrificedWasLegendary, then: [draw(3)], else: [draw(2)] }],
    },
  },

  // "As an additional cost to cast this spell, sacrifice a creature or pay {4}." "Destroy target creature."
  'Lash of the Balrog': {
    sacrificeOrPay: mana('{4}'),
    spell: { targets: [creature], effects: [destroyTarget] },
  },

  // "When Gothmog enters, amass Orcs 1." "Creature tokens you control have deathtouch."
  'Gothmog, Morgul Lieutenant': {
    abilities: [
      onEnter(amassOrcs(1)),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { token: true },
          power: 0,
          toughness: 0,
          keywords: ['deathtouch'],
        },
      },
    ],
  },

  // Trample. "As long as it's your turn and you control an Army, Grond is an artifact creature." Crew 3.
  'Grond, the Gatebreaker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'all',
            of: [{ kind: 'yourTurn' }, { kind: 'controlsPermanents', filter: { subtype: 'Army' }, min: 1 }],
          },
          power: 0,
          toughness: 0,
          becomesCreature: true,
        },
      },
      {
        kind: 'activated',
        cost: { crew: 3 },
        targets: [],
        effects: [{ kind: 'becomeCreature', what: 'self' }],
        label: 'Crew 3',
      },
    ],
  },

  // "Target creature gains your choice of lifelink or indestructible until end of turn. Amass Orcs 1."
  'Orcish Medicine': {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'choose',
          title: 'lifelink or indestructible',
          options: [
            { label: 'Lifelink', effects: [pump(t0, 0, 0, ['lifelink'])] },
            { label: 'Indestructible', effects: [pump(t0, 0, 0, ['indestructible'])] },
          ],
        },
        amassOrcs(1),
      ],
    },
  },

  // Flying. "When this creature enters, amass Orcs 2."
  'Dunland Crebain': {
    abilities: [onEnter(amassOrcs(2))],
  },

  // "When this creature dies, amass Orcs 1."
  'Easterling Vanguard': {
    abilities: [when({ on: 'dies' }, [], amassOrcs(1))],
  },

  // "{1}, {T}, Sacrifice another creature: Draw a card, then create a Food token."
  'Cirith Ungol Patrol': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, sacrificePermanent: anotherCreature },
        targets: [],
        effects: [draw(1), food],
      },
    ],
  },

  // "When this enchantment enters and whenever an Army you control attacks, amass Orcs 1."
  'March from the Black Gate': {
    abilities: [
      onEnter(amassOrcs(1)),
      when({ on: 'creatureYouControlAttacks', filter: { subtype: 'Army' } }, [], amassOrcs(1)),
    ],
  },

  // "When this creature enters, the Ring tempts you."
  'Uruk-hai Berserker': {
    abilities: [onEnter(ringTempts)],
  },

  // "This spell costs {3} less to cast if it targets a creature that was dealt damage this turn." "Destroy target creature. Its
  // controller loses 2 life."
  'Bitter Downfall': {
    costReductionIfTarget: { filter: { damaged: true }, amount: 3 },
    spell: {
      targets: [creature],
      effects: [destroyTarget, { kind: 'loseLife', who: { controllerOf: 0 }, amount: 2 }],
    },
  },
};

/** Back faces: keyed by their own names. */
export const LTR_BLACK_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_BLACK_TOKENS: CardDefinition[] = [
  // Mordor Trebuchet's Ballistic Boulder: a 2/1 colorless Construct artifact creature token with flying.
  {
    id: LTR_BALLISTIC_BOULDER,
    name: 'Ballistic Boulder',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Construct'],
    power: 2,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
