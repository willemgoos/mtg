import type { CardDefinition, CardFilter, EffectDef } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, gain, onEnter, pump, t0, when } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';

/**
 * Reality Fracture (17a): gold cards of W/B, U/R, B/G, R/W, G/U and three or more colours. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_MULTI_B_BACKS. See docs/reality-fracture-plan.md.
 *
 * One-offs are `custom` handlers in packages/engine/src/fra-multi-b-effects.ts.
 */

const THOPTER = 'fra-multi-b-thopter-token';
const SCULPTURE_TREASURE = 'fra-sculpture-treasure-token';

const creatureOrWalker: CardFilter = { types: ['Creature', 'Planeswalker'] };
const anotherCreatureOrWalker: CardFilter = { types: ['Creature', 'Planeswalker'], other: true };
const planeswalker: CardFilter = { types: ['Planeswalker'] };
const createToken = (token: string): EffectDef => ({ kind: 'createToken', token, count: 1 });

export const FRA_MULTI_B: Record<string, Behavior> = {
  // "{2}{W/B}: Return this card from your graveyard to your hand."
  'Blessed Ghoul': {
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{2}{W/B}') },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Charge the Sanctum': {
    modes: [
      mode(
        'Creatures you control get +2/+0',
        [],
        pump({ each: 'creature', controller: 'you' }, 2, 0),
      ),
      mode(
        'Target creature gets +2/+0 and first strike; +1/+1 counter',
        [{ what: 'creature' }],
        pump(t0, 2, 0, ['firstStrike']),
        { kind: 'counters', to: t0, amount: 1 },
      ),
    ],
  },
  // "Its owner may put it on top of their library. If they do, ... deals 2 damage to them. If they
  // didn't put the card on top of their library, they put it on the bottom."
  'Clash of Elements': {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [
        {
          kind: 'choose',
          ownerOf: 0,
          options: [
            {
              label: 'Put it on top of your library (take 2 damage)',
              effects: [
                { kind: 'damage', amount: 2, to: { ownerOf: 0 } },
                { kind: 'putInLibrary', what: t0, position: 'top' },
              ],
            },
            {
              label: 'Put it on the bottom of your library',
              effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
            },
          ],
        },
      ],
    },
  },
  'Edgar, Ancient Bloodlord': {
    abilities: [
      when({ on: 'permanentYouControlDies', filter: creatureOrWalker, other: true }, [], gain(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificePermanent: anotherCreatureOrWalker },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }, pump('self', 0, 0, ['menace'])],
      },
    ],
  },
  // "You may sacrifice a planeswalker. If you do, search your library for a planeswalker card, put it
  // onto the battlefield, then shuffle."
  'Entrust the Spark': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: planeswalker, min: 1 },
          then: [
            {
              kind: 'may',
              effects: [
                {
                  kind: 'sacrificeSeveral',
                  count: 1,
                  filter: planeswalker,
                  then: [{ kind: 'searchLibrary', filter: planeswalker, to: 'battlefield' }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  'Ferocity of the Hunt': {
    enchant: { what: 'creature' },
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['deathtouch'] },
      },
      when({ on: 'attachedDies' }, [], {
        kind: 'returnToBattlefield',
        what: 'subject',
        tapped: true,
        underOwner: true,
      }),
    ],
  },
  'Frostbite Pyromental': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], draw(2)),
      // "At the beginning of the end step": every end step, not only yours.
      when({ on: 'beginningOfEndStep', whose: 'each' }, [], { kind: 'sacrifice', what: 'self' }),
    ],
  },
  // "For each opponent, put X -1/-1 counters on up to one target creature that player controls,
  // where X is the greatest mana value among cards in your graveyard."
  'Hapatra, the Desert Fang': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'opponent', optional: true }],
        effects: [
          {
            kind: 'namedCounters',
            name: '-1/-1',
            amount: { count: 'greatestManaValueInGraveyard' },
            to: t0,
          },
        ],
      },
    ],
  },
  'Karn, Gilded Guardian': {
    abilities: [
      onEnter({
        kind: 'draw',
        who: 'controller',
        amount: { count: 'colorsAmongOtherArtifactsYouControl' },
      }),
    ],
  },
  'Mabel, Valley Hero': {
    abilities: [
      when(
        { on: 'selfOrCreatureEtb', filter: {} },
        [{ what: 'creature', filter: { enteredThisTurn: true } }],
        { kind: 'counters', to: t0, amount: 1 },
      ),
    ],
  },
  // Ability 1 is the "when you do" reflexive trigger.
  'Primal Witchstalker': {
    abilities: [
      onEnter({ kind: 'mill', count: 4 }, { kind: 'reflexiveTrigger', ability: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Land'] } }],
        effects: [{ kind: 'returnToBattlefield', what: t0, tapped: true }],
      },
    ],
  },
  'Saheeli, Jewel of Avishkar': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Thopter' },
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      when({ on: 'castSpell', filter: 'noncreature' }, [], createToken(THOPTER)),
    ],
  },
  'Solitary Cell': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { nonland: true, maxManaValue: 3 },
          },
        ],
        effects: [{ kind: 'exileUntilSourceLeaves', what: t0 }],
      },
      {
        kind: 'activated',
        cost: {
          mana: mana('{1}'),
          tapSelf: true,
          discard: true,
          discardFilter: { supertypes: ['Legendary'] },
        },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // "Proliferate X times, where X is the number of planeswalker types among planeswalkers you control."
  'Tam, the Possibility': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: planeswalker, amount: 1 } },
      {
        kind: 'activated',
        cost: { mana: mana('{W}{U}{B}{R}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'proliferate', times: { count: 'planeswalkerTypesYouControl' } }],
      },
    ],
  },
  // "If this spell wasn't cast from your hand, draw two cards instead."
  'Twinned Vision': {
    flashback: mana('{1}{U/R}{U/R}'),
    flashbackDiscard: true,
    spell: {
      targets: [],
      effects: [
        { kind: 'if', condition: { kind: 'notCastFromHand' }, then: [draw(2)], else: [draw(1)] },
      ],
    },
  },
  'Twisted Fates': {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }, { what: 'player' }],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'counters', to: { each: 'creature', targetPlayer: 1 }, amount: 1 },
      ],
    },
  },
  // Exile it; if its mana value was 3 or less, return it tapped under your control and exile it at the
  // beginning of the next end step (engine: fra-multi-b-effects.ts).
  'Vindictive Triumph': {
    spell: {
      targets: [{ what: 'permanent', filter: creatureOrWalker }],
      effects: [{ kind: 'custom', handler: 'vindictiveTriumph' }],
    },
  },
  'Vraska, Soul of Stone': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { types: ['Artifact'] },
          power: 0,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
      when({ on: 'castSpell', filter: 'noncreature' }, [], createToken(SCULPTURE_TREASURE)),
    ],
  },
  'Vraska, the Cutting Glare': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 6 },
        targets: [{ what: 'permanent', controller: 'opponent' }],
        effects: [
          { kind: 'destroy', what: t0 },
          { kind: 'createToken', token: 'treasure-token', count: 1, forControllerOf: 0 },
        ],
      },
    ],
  },
  "Warrior's Blades": {
    abilities: [
      when({ on: 'etb' }, [{ what: 'any' }], { kind: 'damage', amount: 3, to: t0 }, gain(3)),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 1 } },
      // "Equip {3}. This ability costs {1} less to activate for each +1/+1 counter on the creature it targets."
      {
        kind: 'activated',
        cost: { mana: mana('{3}') },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'attach', to: t0 }],
        costReductionPerTargetCounter: true,
      },
    ],
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_MULTI_B_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const FRA_MULTI_B_TOKENS: CardDefinition[] = [
  // Saheeli: "a 1/1 colorless Thopter artifact creature token with flying".
  {
    id: THOPTER,
    name: 'Thopter',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Thopter'],
    power: 1,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
  // Vraska, Soul of Stone: a 1/1 colorless Sculpture Treasure artifact creature token with
  // "{T}, Sacrifice this token: Add one mana of any color."
  {
    id: SCULPTURE_TREASURE,
    name: 'Sculpture Treasure',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Sculpture', 'Treasure'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: (['W', 'U', 'B', 'R', 'G'] as const).map((produces) => ({
      kind: 'mana' as const,
      cost: { tapSelf: true, sacrificeSelf: true },
      produces,
    })),
    isToken: true,
  },
];
