import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { creature, draw, gain, onEnter, pump, t0, when, yours } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { beholdToEnterUntapped, empowerJace, JACE, loyaltyAbility, planeswalkersHave } from './helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17c): planeswalker rares and mythics, including the eight planeswalker cards. Printed characteristics come from Scryfall;
 * this file has the rules text. See docs/reality-fracture-plan.md.
 */

export const FRA_ILLUSION = 'fra-illusion-token';
export const FRA_PRIDEMATE = 'fra-pridemate-token';
export const FRA_BEAST = 'fra-beast-trample-token';

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const createToken = (token: string): EffectDef => ({ kind: 'createToken', token, count: 1 });
const damageEachOpponent = (amount: number): EffectDef => ({
  kind: 'damage',
  amount,
  to: 'eachOpponent',
});
/** "−X": the loyalty ability that removes X counters (X is `{ x: true }` in its effects). */
const loyaltyX = (
  label: string,
  targets: TargetSpec[],
  effects: EffectDef[],
): AbilityDef => ({
  kind: 'activated',
  cost: { loyalty: 0, loyaltyX: true, loyaltyXZero: true },
  targets,
  effects,
  label,
});
/** "You get an emblem with ...", for good. */
const emblem = (ability: AbilityDef, label: string, colorless = false): EffectDef => ({
  kind: 'emblem',
  until: 'permanent',
  ability,
  label,
  ...(colorless ? { colorless } : {}),
});
const yourCreatures = yours;
const anyCreatureOrWalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};

export const FRA_PW_C: Record<string, Behavior> = {
  // ------------------------------------------------------------------ planeswalkers
  'The Theorist, Jace Beleren': {
    abilities: [
      // "At the beginning of each opponent's draw step, you draw a card." (the turn-based draw is theirs, first)
      when({ on: 'beginningOfDraw', whose: 'opponents' }, [], draw(1)),
      loyaltyAbility(1, '+1: Create a 1/1 blue Illusion creature token', [createToken(FRA_ILLUSION)]),
      // "For each opponent, return up to one target artifact or creature that player controls to its owner's hand."
      loyaltyAbility(
        -2,
        "−2: For each opponent, return up to one target artifact or creature that player controls to its owner's hand",
        [{ kind: 'bounce', what: t0 }],
        {
          targets: [
            {
              what: 'permanent',
              controller: 'opponent',
              filter: { types: ['Artifact', 'Creature'] },
              optional: true,
            },
          ],
        },
      ),
      loyaltyAbility(
        -6,
        '−6: Draw three cards. Then put X +1/+1 counters on each creature you control, where X is the number of cards in your hand',
        [draw(3), { kind: 'counters', to: yourCreatures, amount: { count: 'cardsInHand' } }],
      ),
    ],
  },
  'Jace, Reality Sculptor': {
    abilities: [
      loyaltyAbility(
        1,
        '+1: Empower Jace X, where X is the number of Islands you control',
        [empowerJace({ count: 'landsYouControl', subtype: 'Island' })],
      ),
      // "Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -5/-0 until end of turn."
      loyaltyAbility(
        -3,
        '−3: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets −5/−0 until end of turn',
        [
          {
            kind: 'emblem',
            until: 'yourNextTurn',
            label:
              'Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets −5/−0 until end of turn.',
            ability: {
              kind: 'triggered',
              trigger: { on: 'opponentCreatureAttacks', orPlaneswalkers: true },
              targets: [],
              effects: [pump('subject', -5, 0)],
            },
          },
        ],
      ),
      loyaltyAbility(
        0,
        "0: Exile all but the bottom card of each opponent's library. Activate only if there are twenty-five or more loyalty counters among Jaces you control",
        [custom('exileAllButBottomOfOpponentLibrary')],
        {
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'loyaltyAmongPlaneswalkers', filter: JACE },
            min: 25,
          },
        },
      ),
    ],
  },
  'Ajani Resolute': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'loyaltyCounters', to: 'self', amount: 1 }),
      loyaltyAbility(0, '0: You gain 1 life', [gain(1)]),
      loyaltyAbility(
        -4,
        `−4: Create a 2/2 white Cat Soldier creature token named Ajani's Pridemate with "Whenever you gain life, put a +1/+1 counter on this token."`,
        [createToken(FRA_PRIDEMATE)],
      ),
      loyaltyAbility(-10, '−10: You get an emblem with "Creatures you control get +2/+2."', [
        emblem(
          {
            kind: 'static',
            effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 2, toughness: 2 },
          },
          'Creatures you control get +2/+2.',
        ),
      ]),
    ],
  },
  'Ajani Unrelenting': {
    abilities: [
      // "Whenever you activate a loyalty ability, create a 2/2 colorless Wizard Soldier creature token named Cadet."
      when({ on: 'youActivateLoyaltyAbility' }, [], createToken(FRA_CADET)),
      loyaltyAbility(1, '+1: Creatures you control get +1/+0 and gain haste until end of turn', [
        pump(yourCreatures, 1, 0, ['haste']),
      ]),
      loyaltyAbility(
        -2,
        '−2: Discard your hand, then draw a card for each creature you control',
        [
          { kind: 'discardHand' },
          { kind: 'draw', who: 'controller', amount: { count: 'creaturesYouControl' } },
        ],
      ),
      // "Ajani deals 4 damage to each creature except for tokens you control": every nontoken creature, and the tokens
      // your opponents control.
      loyaltyAbility(-3, '−3: Ajani deals 4 damage to each creature except for tokens you control', [
        { kind: 'damage', amount: 4, to: { each: 'creature', filter: { nontoken: true } } },
        {
          kind: 'damage',
          amount: 4,
          to: { each: 'creature', controller: 'opponent', filter: { token: true } },
        },
      ]),
    ],
  },
  'Chandra, Chill of Compliance': {
    abilities: [
      // "Surveil 1. If you put a noncreature, nonland card into your graveyard this way, put that card into your hand."
      loyaltyAbility(1, '+1: Surveil 1. If you put a noncreature, nonland card into your graveyard this way, put that card into your hand', [
        {
          kind: 'surveil',
          amount: 1,
          graveyardToHand: { filter: { nonland: true, notTypes: ['Creature'] } },
        },
      ]),
      // "Add {U}. Spend this mana only to cast a noncreature spell." (a loyalty ability, so it uses the stack)
      loyaltyAbility(1, '+1: Add {U}. Spend this mana only to cast a noncreature spell', [
        { kind: 'addMana', mana: [['U']], onlyFor: 'Noncreature' },
      ]),
      loyaltyX(
        '−X: Tap target artifact or creature. Put X stun counters on it',
        [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
        [
          { kind: 'tap', what: t0 },
          { kind: 'namedCounters', name: 'stun', amount: { x: true }, to: t0 },
        ],
      ),
      loyaltyAbility(-6, '−6: You get an emblem with "Whenever you cast a spell, draw a card."', [
        emblem(
          {
            kind: 'triggered',
            trigger: { on: 'castSpell', filter: 'any' },
            targets: [],
            effects: [draw(1)],
          },
          'Whenever you cast a spell, draw a card.',
        ),
      ]),
    ],
  },
  'Chandra, Torch of Defiance': {
    abilities: [
      // "Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent."
      loyaltyAbility(
        1,
        "+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent",
        [{ kind: 'exileTopMayCast', otherwise: [damageEachOpponent(2)] }],
      ),
      loyaltyAbility(1, '+1: Add {R}{R}', [{ kind: 'addMana', mana: [['R'], ['R']] }]),
      loyaltyAbility(-3, '−3: Chandra deals 4 damage to target creature', [
        { kind: 'damage', amount: 4, to: t0 },
      ], { targets: [creature] }),
      loyaltyAbility(
        -7,
        '−7: You get an emblem with "Whenever you cast a spell, this emblem deals 5 damage to any target."',
        [
          // The emblem is a colorless source of its own.
          emblem(
            {
              kind: 'triggered',
              trigger: { on: 'castSpell', filter: 'any' },
              targets: [{ what: 'any' }],
              effects: [{ kind: 'damage', amount: 5, to: t0 }],
            },
            'Whenever you cast a spell, this emblem deals 5 damage to any target.',
            true,
          ),
        ],
      ),
    ],
  },
  'Garruk, Curse Breaker': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you', filter: { minPower: 4 } }, [], draw(1)),
      loyaltyAbility(2, '+2: Untap up to two target lands', [{ kind: 'untap', what: { targetsFrom: 0 } }], {
        targets: [
          { what: 'permanent', filter: { types: ['Land'] }, optional: true },
          { what: 'permanent', filter: { types: ['Land'] }, optional: true },
        ],
      }),
      loyaltyAbility(-3, '−3: Create a 4/4 green Beast creature token with trample', [
        createToken(FRA_BEAST),
      ]),
      // "Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and
      // gain trample until end of turn."
      loyaltyAbility(
        -4,
        '−4: Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn',
        [
          {
            kind: 'emblem',
            until: 'yourNextTurn',
            label:
              'Until your next turn, whenever one or more creatures attack one of your opponents, those creatures get +2/+2 and gain trample until end of turn.',
            ability: {
              kind: 'triggered',
              trigger: { on: 'creaturesAttackYourOpponent' },
              targets: [],
              effects: [pump('subjects', 2, 2, ['trample'])],
            },
          },
        ],
      ),
    ],
  },
  'Garruk, Veiled Butcher': {
    abilities: [
      // "If a creature an opponent controls would die, exile it instead."
      { kind: 'static', effect: { kind: 'exileOpponentCreaturesInstead' } },
      loyaltyAbility(
        2,
        '+2: Up to one target creature gets −4/−1 until your next turn',
        [{ kind: 'pump', to: t0, power: -4, toughness: -1, untilYourNextTurn: true }],
        { targets: [{ ...creature, optional: true }] },
      ),
      // "Each player sacrifices a creature of their choice. If you sacrificed a creature this way, create a 4/4 green Beast
      // creature token with trample."
      loyaltyAbility(
        -2,
        '−2: Each player sacrifices a creature of their choice. If you sacrificed a creature this way, create a 4/4 green Beast creature token with trample',
        [
          { kind: 'opponentSacrifices', you: true, then: [createToken(FRA_BEAST)] },
          { kind: 'opponentSacrifices' },
        ],
      ),
      // "Each opponent discards two cards. For each opponent who didn't discard two nonland cards this way, you draw a card."
      loyaltyAbility(
        -3,
        "−3: Each opponent discards two cards. For each opponent who didn't discard two nonland cards this way, you draw a card",
        [{ kind: 'discard', count: 2, who: 'eachOpponent', drawUnlessNonland: 2 }],
      ),
    ],
  },

  // ------------------------------------------------------------------ the other rares and mythics
  'Avatar of Burgeoning Echoes': {
    abilities: [
      when({ on: 'landfall' }, [], empowerJace(2)),
      planeswalkersHave(
        loyaltyAbility(
          -10,
          '−10: Put a +1/+1 counter on target creature for each land you control',
          [{ kind: 'counters', to: t0, amount: { count: 'landsYouControl' } }],
          { targets: [creature] },
        ),
      ),
    ],
  },
  // "Ward—Discard a card." comes from the printed keyword.
  'Gideon the Oathless': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'opponent' }, [], damageEachOpponent(1)),
      when({ on: 'opponentActivatesLoyaltyAbility' }, [], damageEachOpponent(1)),
    ],
  },
  "Jace's Machinations": {
    spell: {
      targets: [],
      effects: [{ kind: 'loyaltyAtInstantSpeed', filter: JACE }, empowerJace(8)],
    },
  },
  'Overwrite the Multiverse': {
    spell: {
      targets: [],
      effects: [
        { kind: 'exile', what: { each: 'creature' } },
        empowerJace({ exiledThisWay: true }),
      ],
    },
  },
  'Repurposed Enforcer': {
    abilities: [when({ on: 'attacks' }, [], empowerJace({ count: 'creaturesYouControl' }))],
  },
  'Sanctum Lurker': {
    abilities: [
      onEnter(empowerJace(1)),
      { kind: 'static', effect: { kind: 'planeswalkersStayAtZero' } },
      planeswalkersHave(
        loyaltyAbility(2, '+2: This planeswalker deals 1 damage to each opponent and you gain 1 life', [
          damageEachOpponent(1),
          gain(1),
        ]),
      ),
    ],
  },
  "Theorist's Proxy": {
    abilities: [
      onEnter(empowerJace(3)),
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), sacrificeSelf: true },
        targets: [],
        effects: [custom('nextSpellUncounterable')],
        label: "{U}, Sacrifice this creature: The next spell you cast this turn can't be countered",
      },
    ],
  },
  // "As this land enters, you may behold a Jace. If you don't, this land enters tapped."
  "Theorist's Sanctum": beholdToEnterUntapped(
    JACE,
    { kind: 'mana', cost: { tapSelf: true }, produces: 'U' },
    {
      kind: 'activated',
      cost: { mana: mana('{2}{U}'), tapSelf: true },
      targets: [],
      effects: [empowerJace(2)],
      label: '{2}{U}, {T}: Empower Jace 2',
    },
  ),
  "Vraska's Final Mercy": {
    modes: [
      mode(
        'You lose 2 life. Destroy target creature or planeswalker.',
        [anyCreatureOrWalker],
        { kind: 'loseLife', who: 'controller', amount: 2 },
        { kind: 'destroy', what: t0 },
      ),
      mode(
        'You lose 2 life. Empower Jace 6.',
        [],
        { kind: 'loseLife', who: 'controller', amount: 2 },
        empowerJace(6),
      ),
    ],
  },
};

/** Back faces (none expected here). */
export const FRA_PW_C_BACKS: Record<string, Behavior> = {};

const token = (
  id: string,
  name: string,
  color: CardDefinition['colors'][number],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors: [color],
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords: [],
  abilities: [],
  isToken: true,
  ...extra,
});

/** Tokens only these cards make. */
export const FRA_PW_C_TOKENS: CardDefinition[] = [
  // The Theorist, Jace Beleren: "a 1/1 blue Illusion creature token."
  token(FRA_ILLUSION, 'Illusion', 'U', ['Illusion'], 1, 1),
  // Ajani Resolute: "a 2/2 white Cat Soldier creature token named Ajani's Pridemate".
  token(FRA_PRIDEMATE, "Ajani's Pridemate", 'W', ['Cat', 'Soldier'], 2, 2, {
    abilities: [when({ on: 'youGainLife' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  }),
  // Garruk, Curse Breaker; Garruk, Veiled Butcher: "a 4/4 green Beast creature token with trample."
  token(FRA_BEAST, 'Beast', 'G', ['Beast'], 4, 4, { keywords: ['trample'] }),
];
