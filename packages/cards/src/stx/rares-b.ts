import type {
  AbilityDef,
  CardFilter,
  EffectDef,
  ManaType,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { combos, creature, draw, gain, mana, t0, t1, tapFor } from '../fin/helpers.ts';
import { drain } from '../blb/helpers.ts';
import { unlessReveal } from '../msc/helpers.ts';

/**
 * Strixhaven (13c), group B: the remaining black, green and Witherbloom (B/G)
 * booster cards. Printed characteristics come from Scryfall; only rules text
 * lives here.
 */

const PEST = 'stx-pest-token';
const pest: EffectDef = { kind: 'createToken', token: PEST, count: 1 };

/** "Magecraft: whenever you cast or copy an instant or sorcery spell, ...". */
const magecraft = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets: [],
  effects,
});

const lifeGained = { count: 'lifeGainedThisTurn' } as const;
const permanentTypes = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] as const;
const sacrificeCreatureOrWalker: CardFilter = { types: ['Creature', 'Planeswalker'] };
const basicLand = (to: 'battlefieldTapped' | 'hand', more: object = {}): EffectDef =>
  ({ kind: 'searchLibrary', filter: 'basicLand', to, shuffle: false, ...more }) as EffectDef;
const shufflingBasicLand = (to: 'battlefieldTapped' | 'hand'): EffectDef => ({
  kind: 'searchLibrary',
  filter: 'basicLand',
  to,
});

const modeOf = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});

/** Beledros Witherbloom, Blex, Valentin and Pestilent Cauldron are double-faced: the back faces are below. */
export const RARES_B: Record<string, Behavior> = {
  // ------------------------------------------------------------------- green
  'Accomplished Alchemist': {
    // "{T}: Add one mana of any color" and "{T}: Add X mana of any one color, where X is the life you
    // gained this turn", as one ability (X is at least one; each mana may be a different colour).
    abilities: (['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true },
      produces,
      perLifeGained: true,
    })),
  },
  'Charge Through': {
    spell: {
      targets: [creature],
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['trample'] }, draw(1)],
    },
  },
  'Dragonsguard Elite': {
    abilities: [
      magecraft({ kind: 'counters', to: 'self', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{G}') },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: { countersOn: 'self' } }],
        label: '{4}{G}{G}: Double the number of +1/+1 counters on this creature',
      },
    ],
  },
  'Ecological Appreciation': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'ecologicalAppreciation' }] },
  },
  'Emergent Sequence': {
    spell: {
      targets: [],
      effects: [
        { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', fractalLand: true },
      ],
    },
  },
  'Exponential Growth': {
    spell: { targets: [creature], effects: [{ kind: 'custom', handler: 'exponentialGrowth' }] },
  },
  'Fortifying Draught': {
    spell: {
      targets: [creature],
      effects: [gain(2), { kind: 'pump', to: t0, power: lifeGained, toughness: lifeGained }],
    },
  },
  'Scurrid Colony': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 8 },
          power: 2,
          toughness: 2,
        },
      },
    ],
  },
  Tangletrap: {
    modes: [
      modeOf(
        'Tangletrap deals 5 damage to target creature with flying',
        [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        { kind: 'damage', amount: 5, to: t0 },
      ),
      modeOf('Destroy target artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], {
        kind: 'destroy',
        what: t0,
      }),
    ],
  },
  'Verdant Mastery': {
    // Two basic lands onto the battlefield tapped, the rest (up to four in all) into your hand.
    spell: {
      targets: [],
      effects: [
        basicLand('battlefieldTapped'),
        basicLand('battlefieldTapped'),
        basicLand('hand'),
        shufflingBasicLand('hand'),
      ],
    },
    kicker: {
      cost: mana('{3}{G}'),
      replacesCost: true,
      altLabel: 'an opponent gets a basic land',
      spell: {
        targets: [],
        effects: [
          basicLand('battlefieldTapped', { forOpponent: true }),
          basicLand('battlefieldTapped'),
          basicLand('battlefieldTapped'),
          shufflingBasicLand('hand'),
        ],
      },
    },
  },

  // ------------------------------------------------------------------- black
  'Confront the Past': {
    modes: [
      modeOf(
        'Return target planeswalker card with mana value X or less from your graveyard to the battlefield',
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Planeswalker'] } }],
        { kind: 'custom', handler: 'confrontReturn' },
      ),
      modeOf(
        'Remove twice X loyalty counters from target planeswalker an opponent controls',
        [{ what: 'permanent', controller: 'opponent', filter: { types: ['Planeswalker'] } }],
        { kind: 'custom', handler: 'confrontRemove' },
      ),
    ],
  },
  'Oriq Loremage': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: {},
            to: 'graveyard',
            required: true,
            sourceCounterIfTypes: ['Instant', 'Sorcery'],
          },
        ],
        label:
          '{T}: Search your library for a card, put it into your graveyard, then shuffle. If it is an instant or sorcery card, put a +1/+1 counter on this creature',
      },
    ],
  },
  'Plumb the Forbidden': {
    sacrificeCreaturesToCopy: true,
    spell: { targets: [], effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }] },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSelf', perSacrificed: true },
        targets: [],
        effects: [{ kind: 'copySpell', what: 'subject', count: { event: 'amount' } }],
      },
    ],
  },
  'Professor Onyx': {
    abilities: [
      magecraft(...drain(2)),
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [
          { kind: 'loseLife', who: 'controller', amount: 1 },
          { kind: 'lookTakeRestGraveyard', count: 3, take: 1 },
        ],
        label:
          '+1: You lose 1 life. Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard',
      },
      {
        kind: 'activated',
        cost: { loyalty: -3 },
        targets: [],
        effects: [{ kind: 'opponentSacrifices', greatestPower: true }],
        label:
          '−3: Each opponent sacrifices a creature with the greatest power among creatures that player controls',
      },
      {
        kind: 'activated',
        cost: { loyalty: -8 },
        targets: [],
        effects: [
          {
            kind: 'repeat',
            count: 7,
            effects: [{ kind: 'punisher', life: 3, discardOnly: true }],
          },
        ],
        label:
          '−8: Each opponent may discard a card. If they don’t, they lose 3 life. Repeat this process six more times',
      },
    ],
  },

  // ---------------------------------------------------------------- Witherbloom
  'Beledros Witherbloom': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'each' },
        targets: [],
        effects: [pest],
      },
      {
        kind: 'activated',
        cost: { life: 10 },
        targets: [],
        effects: [
          {
            kind: 'untap',
            what: { each: 'permanent', controller: 'you', filter: { types: ['Land'] } },
          },
        ],
        oncePerTurn: true,
        label: 'Pay 10 life: Untap all lands you control. Activate only once each turn',
      },
    ],
  },
  'Blex, Vexing Pest': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: {
            anyOf: ['Pest', 'Bat', 'Insect', 'Snake', 'Spider'].map((subtype) => ({ subtype })),
          },
          power: 1,
          toughness: 1,
        },
      },
      { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [gain(4)] },
    ],
  },
  'Culling Ritual': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'destroyAll',
          permanents: true,
          filter: { maxManaValue: 2, nonland: true },
          manaPerDestroyed: ['B', 'G'] as ManaType[],
        },
      ],
    },
  },
  'Daemogoth Woe-Eater': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { types: ['Creature'] },
            includeSource: true,
            then: [],
          },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'sacrificed' },
        targets: [],
        effects: [{ kind: 'discard', count: 1, who: 'eachOpponent' }, draw(1), gain(2)],
      },
    ],
  },
  'Deadly Brew': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'opponentSacrifices',
          you: true,
          filter: sacrificeCreatureOrWalker,
          then: [{ kind: 'returnFromGraveyard', types: [...permanentTypes], exceptChosen: true }],
        },
        { kind: 'opponentSacrifices', filter: sacrificeCreatureOrWalker },
      ],
    },
  },
  'Harness Infinity': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'exchangeHandAndGraveyard' }] },
  },
  'Infuse with Vitality': {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'pump',
          to: t0,
          power: 0,
          toughness: 0,
          keywords: ['deathtouch'],
          returnWhenDies: { counters: 0, treasure: false },
        },
        gain(2),
      ],
    },
  },
  'Necroblossom Snarl': {
    entersTappedIf: unlessReveal('B', 'G'),
    abilities: tapFor('B', 'G'),
  },
  'Pestilent Cauldron': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, discard: true },
        targets: [],
        effects: [pest],
        label: '{T}, Discard a card: Create a 1/1 Pest',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'mill', count: lifeGained, who: 'eachOpponent' }],
        label: '{1}, {T}: Each opponent mills cards equal to the life you gained this turn',
      },
      ...(['you', 'opponent'] as const).map((controller): AbilityDef => ({
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [0, 1, 2, 3].map((): TargetSpec => ({ what: 'graveyardCard', controller })),
        effects: [
          ...[0, 1, 2, 3].map((i): EffectDef => ({
            kind: 'exileGraveyardCard',
            what: { target: i },
          })),
          draw(1),
        ],
        label: `{4}, {T}: Exile four target cards from ${controller === 'you' ? 'your' : 'an opponent’s'} graveyard. Draw a card`,
      })),
    ],
  },
  'Rushed Rebirth': {
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'whenDiesThisTurn',
          what: t0,
          effects: [
            {
              kind: 'searchLibrary',
              filter: { types: ['Creature'], lesserManaValueThanSubject: true },
              to: 'battlefieldTapped',
            },
          ],
        },
      ],
    },
  },
  'Valentin, Dean of the Vein': {
    abilities: [
      { kind: 'static', effect: { kind: 'exileOpponentCreaturesInstead', nontoken: true } },
      {
        kind: 'triggered',
        trigger: { on: 'opponentCreatureExiledInstead' },
        cost: mana('{2}'),
        targets: [],
        effects: [pest],
      },
    ],
  },
  'Witherbloom Command': {
    modes: combos(
      [
        modeOf(
          'Target player mills three cards, then you return a land card from your graveyard to your hand',
          [{ what: 'player' }],
          { kind: 'mill', count: 3, who: t0 },
          { kind: 'returnFromGraveyard', types: ['Land'] },
        ),
        modeOf(
          'Destroy target noncreature, nonland permanent with mana value 2 or less',
          [
            {
              what: 'permanent',
              filter: { notTypes: ['Creature'], nonland: true, maxManaValue: 2 },
            },
          ],
          { kind: 'destroy', what: t0 },
        ),
        modeOf('Target creature gets -3/-1 until end of turn', [creature], {
          kind: 'pump',
          to: t0,
          power: -3,
          toughness: -1,
        }),
        modeOf('Target opponent loses 2 life and you gain 2 life', [], ...drain(2)),
      ],
      [2],
    ),
  },
};

/** Back faces of the double-faced cards above. */
export const RARES_B_BACKS: Record<string, Behavior> = {
  'Search for Blex': {
    spell: {
      targets: [],
      effects: [{ kind: 'lookTakeRestGraveyard', count: 5, take: 5, upTo: true, lifePerCard: 3 }],
    },
  },
  'Restorative Burst': {
    afterResolving: 'exile',
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature', 'Land', 'Planeswalker'] },
          optional: true,
        },
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Creature', 'Land', 'Planeswalker'] },
          optional: true,
        },
      ],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
        { kind: 'gainLife', who: 'eachPlayer', amount: 4 },
      ],
    },
  },
  'Lisette, Dean of the Root': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        cost: mana('{1}'),
        targets: [],
        effects: [
          { kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 },
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you' },
            power: 0,
            toughness: 0,
            keywords: ['trample'],
          },
        ],
      },
    ],
  },
};
