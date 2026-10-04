import type { AbilityDef, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, onEnter, pump, t0, t1, when, yours } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { empowerJace, JACE, controlsJace, loyaltyAbility, planeswalkersHave } from './helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17c): the planeswalker uncommons (the Way of the … cycle and the rest). Printed characteristics come from
 * Scryfall; this file has the rules text. See docs/reality-fracture-plan.md.
 */

/** The 4/4 green Beast token with trample (defined in fra/green.ts). */
const BEAST = 'fra-green-beast-token';
const LEVIATHAN = 'fra-leviathan-token';

/** "Each planeswalker you control." */
const yourPlaneswalkers: Ref = {
  each: 'permanent',
  controller: 'you',
  filter: { types: ['Planeswalker'] },
};
/** "Put a loyalty counter on each planeswalker you control." */
const loyaltyOnEach: EffectDef = { kind: 'loyaltyCounters', to: yourPlaneswalkers, amount: 1 };

const creatureOrWalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};

/** A "Way of the …": "When this enters, empower Jace N", then its other abilities. */
const way = (n: number, ...abilities: AbilityDef[]): Behavior => ({
  abilities: [onEnter(empowerJace(n)), ...abilities],
});

/**
 * Teyo: "When Teyo enters, target permanent you control gains <keyword> until end of turn. Put a +1/+1 counter on it if it's a
 * creature. Put a loyalty counter on it if it's a planeswalker."
 */
const teyo = (keyword: 'deathtouch' | 'hexproof'): Behavior => ({
  abilities: [
    when(
      { on: 'etb' },
      [{ what: 'permanent', controller: 'you' }],
      pump(t0, 0, 0, [keyword]),
      {
        kind: 'if',
        condition: { kind: 'targetMatches', target: 0, filter: { types: ['Creature'] } },
        then: [{ kind: 'counters', to: t0, amount: 1 }],
      },
      {
        kind: 'if',
        condition: { kind: 'targetMatches', target: 0, filter: { types: ['Planeswalker'] } },
        then: [{ kind: 'loyaltyCounters', to: t0, amount: 1 }],
      },
    ),
  ],
});

export const FRA_PW_B: Record<string, Behavior> = {
  // "As an additional cost to cast this spell, behold a Jace or pay {1}. Counter target spell. Empower Jace 1."
  Countersculpt: {
    beholdOrPay: { filter: JACE, pay: mana('{1}') },
    spell: {
      targets: [{ what: 'spell' }],
      effects: [{ kind: 'counter', what: t0 }, empowerJace(1)],
    },
  },

  // "Choose one — • Draw a card. Empower Jace 2. • Return target spell or creature to its owner's hand.
  // • Creatures you control get +1/+2 until end of turn."
  'Fatehold Charm': {
    modes: [
      mode('Draw a card. Empower Jace 2', [], draw(1), empowerJace(2)),
      mode(
        "Return target spell or creature to its owner's hand",
        [{ what: 'spell', orCreature: true }],
        { kind: 'returnSpellToHand', what: t0, orCreature: true },
      ),
      mode('Creatures you control get +1/+2 until end of turn', [], pump(yours, 1, 2)),
    ],
  },

  // "Whenever you attack, if you've activated a loyalty ability this turn, untap target attacking creature. It can't be
  // blocked this turn. / Planeswalkers you control have '−8: Create an 8/8 blue Leviathan creature token with hexproof.'"
  'Kiora of Salt and Sand': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        condition: { kind: 'activatedLoyaltyAbilityThisTurn' },
        targets: [{ what: 'creature', filter: { attacking: true } }],
        effects: [
          { kind: 'untap', what: t0 },
          { kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true },
        ],
      },
      planeswalkersHave(
        loyaltyAbility(-8, '−8: Create an 8/8 blue Leviathan creature token with hexproof', [
          { kind: 'createToken', token: LEVIATHAN, count: 1 },
        ]),
      ),
    ],
  },

  // "This creature has vigilance as long as you control a Jace planeswalker. / When this creature enters, it fights up to one
  // target creature an opponent controls."
  'Mind Meanderer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: controlsJace,
          power: 0,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
      when({ on: 'etb' }, [{ what: 'creature', controller: 'opponent', optional: true }], {
        kind: 'fight',
        a: 'self',
        b: t0,
      }),
    ],
  },

  // "When this enchantment enters, the owner of up to one other target nonland permanent puts it on their choice of the top
  // or bottom of their library. / Whenever you cast your first noncreature spell each turn, empower Jace 1."
  'Plan for All Outcomes': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'permanent', filter: { nonland: true, other: true }, optional: true }],
        {
          kind: 'choose',
          ownerOf: 0,
          options: [
            {
              label: 'Put it on top of your library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'top' }],
            },
            {
              label: 'Put it on the bottom of your library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
            },
          ],
        },
      ),
      when({ on: 'castSpell', filter: 'firstNoncreature' }, [], empowerJace(1)),
    ],
  },

  // "Return target creature or planeswalker card with mana value 6 or less from your graveyard to the battlefield. Empower Jace 2."
  'Rewrite Regrets': {
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature', 'Planeswalker'], maxManaValue: 6 },
        },
      ],
      effects: [{ kind: 'returnToBattlefield', what: t0 }, empowerJace(2)],
    },
  },

  'Teyo, Diamondblade Mage': teyo('deathtouch'),
  'Teyo, Lightshield Expert': teyo('hexproof'),

  // "Flying. Planeswalkers you control have 'No more than one creature can attack this planeswalker each combat.'
  // {T}: Target creature with a +1/+1 counter on it gains flying until end of turn."
  'Tomik, Orzhov Lawmage': {
    abilities: [
      planeswalkersHave({ kind: 'static', effect: { kind: 'oneAttackerOnly' } }),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', filter: { minPlusOneCounters: 1 } }],
        effects: [pump(t0, 0, 0, ['flying'])],
        label: '{T}: Target creature with a +1/+1 counter on it gains flying until end of turn',
      },
    ],
  },

  // "Violent Echoes deals 6 damage to target creature or planeswalker. If excess damage was dealt to that permanent this way,
  // empower Jace X, where X is that excess damage."
  'Violent Echoes': {
    spell: {
      targets: [creatureOrWalker],
      effects: [
        {
          kind: 'damage',
          amount: 6,
          to: t0,
          ifExcess: [empowerJace({ event: 'amount' })],
        },
      ],
    },
  },

  // "Planeswalkers you control have '−3: When you next cast an instant or sorcery spell this turn, copy that spell. You may
  // choose new targets for the copy.'"
  'Way of the Cryomancer': way(
    5,
    planeswalkersHave(
      loyaltyAbility(
        -3,
        '−3: When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy',
        [
          {
            kind: 'emblem',
            until: 'nextSpellThisTurn',
            ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
              kind: 'copySpell',
              what: 'subject',
              newTargets: true,
            }),
          },
        ],
      ),
    ),
  ),

  // "Planeswalkers you control have '−2: You may sacrifice a creature. If you do, create a 4/4 green Beast creature token with trample.'"
  'Way of the Deathbringer': way(
    5,
    planeswalkersHave(
      loyaltyAbility(
        -2,
        '−2: You may sacrifice a creature. If you do, create a 4/4 green Beast creature token with trample',
        [
          {
            kind: 'if',
            condition: { kind: 'controlsCreature', filter: {} },
            then: [
              {
                kind: 'may',
                effects: [
                  {
                    kind: 'sacrificeSeveral',
                    count: 1,
                    filter: { types: ['Creature'] },
                    then: [{ kind: 'createToken', token: BEAST, count: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      ),
    ),
  ),

  // "Planeswalkers you control have '−2: Create a 2/2 colorless Wizard Soldier creature token named Cadet. Surveil 1.'"
  'Way of the Healer': way(
    5,
    planeswalkersHave(
      loyaltyAbility(
        -2,
        '−2: Create a 2/2 colorless Wizard Soldier creature token named Cadet. Surveil 1',
        [
          { kind: 'createToken', token: FRA_CADET, count: 1 },
          { kind: 'surveil', amount: 1 },
        ],
      ),
    ),
  ),

  // "Whenever you gain life, put a loyalty counter on each planeswalker you control."
  'Way of the Mentor': way(5, when({ on: 'youGainLife' }, [], loyaltyOnEach)),

  // "Whenever you activate a loyalty ability, if you removed two or more loyalty counters to activate it, draw a card."
  'Way of the Mind Sculptor': way(
    5,
    when({ on: 'youActivateLoyaltyAbility', removedAtLeast: 2 }, [], draw(1)),
  ),

  // "Whenever a creature you control dies, put a loyalty counter on each planeswalker you control."
  'Way of the Necromancer': way(2, when({ on: 'creatureYouControlDies' }, [], loyaltyOnEach)),

  // "Whenever you activate a loyalty ability, you gain 1 life. You may play an additional land this turn."
  'Way of the Paradox': way(
    5,
    when({ on: 'youActivateLoyaltyAbility' }, [], gain(1), {
      kind: 'custom',
      handler: 'extraLandThisTurn',
    }),
  ),

  // "Planeswalkers you control have '[+1]: Add {R}.'"
  'Way of the Pyromancer': way(
    2,
    planeswalkersHave(loyaltyAbility(1, '+1: Add {R}', [{ kind: 'addMana', mana: [['R']] }])),
  ),

  // "Planeswalkers you control have '−4: This planeswalker deals 2 damage to up to one target creature or planeswalker and
  // 2 damage to target player.'" The player is the first target so the "up to one" can come last.
  'Way of the Warlord': way(
    5,
    planeswalkersHave(
      loyaltyAbility(
        -4,
        '−4: This planeswalker deals 2 damage to up to one target creature or planeswalker and 2 damage to target player',
        [
          { kind: 'damage', amount: 2, to: t1 },
          { kind: 'damage', amount: 2, to: t0 },
        ],
        { targets: [{ what: 'player' }, { ...creatureOrWalker, optional: true }] },
      ),
    ),
  ),

  // "Planeswalkers you control have '−4: Create a 4/4 green Beast creature token with trample.'"
  'Way of the Wildspeaker': way(
    7,
    planeswalkersHave(
      loyaltyAbility(-4, '−4: Create a 4/4 green Beast creature token with trample', [
        { kind: 'createToken', token: BEAST, count: 1 },
      ]),
    ),
  ),
};

/** Back faces (none expected here). */
export const FRA_PW_B_BACKS: Record<string, Behavior> = {};

/** Tokens only these cards make (the 4/4 Beast is green.ts's, the Cadet and the Jace token are shared: tokens.ts). */
export const FRA_PW_B_TOKENS: CardDefinition[] = [
  // "An 8/8 blue Leviathan creature token with hexproof."
  {
    id: LEVIATHAN,
    name: 'Leviathan',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Leviathan'],
    power: 8,
    toughness: 8,
    keywords: ['hexproof'],
    abilities: [],
    isToken: true,
  },
];
