import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  EffectDef,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, t0, tapFor } from '../fin/helpers.ts';
import { unlessReveal } from '../msc/helpers.ts';

/**
 * Strixhaven (13c, group C): the remaining Quandrix (G/U) and Prismari (U/R)
 * cards, Codie and Extus. Printed characteristics come from Scryfall; only
 * rules text lives here. Frostboil Snarl and Expressive Iteration are already
 * in the pool (msc/).
 */

const FRACTAL = 'stx-fractal-token';
const ELEMENTAL = 'stx-elemental-ur-token';
const AVATAR = 'stx-avatar-token';
const TREASURE = 'treasure-token';

export const RARES_C_TOKENS: CardDefinition[] = [
  {
    id: AVATAR,
    name: 'Avatar',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Avatar'],
    power: 3,
    toughness: 6,
    keywords: ['haste'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'damage', amount: 3, to: 'eachOpponent' }],
      },
    ],
    isToken: true,
  },
];

const instantOrSorcery: CardFilter = { types: ['Instant', 'Sorcery'] };
const permanentTypes: CardFilter = {
  types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'],
};

/** "Magecraft: whenever you cast or copy an instant or sorcery spell, ...". */
const magecraft = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets,
  effects,
});

const fractal = (counters: Amount): EffectDef => ({
  kind: 'createToken',
  token: FRACTAL,
  count: 1,
  counters,
});

const treasure: EffectDef = { kind: 'createToken', token: TREASURE, count: 1 };
const anyColors = [['W'], ['U'], ['B'], ['R'], ['G']] as ['W' | 'U' | 'B' | 'R' | 'G'][];
const planeswalker = (cost: number, label: string, ...effects: EffectDef[]): AbilityDef => ({
  kind: 'activated',
  cost: { loyalty: cost },
  targets: [],
  effects,
  label,
});
const copyNextSpell: EffectDef = {
  kind: 'emblem',
  until: 'nextSpellThisTurn',
  ability: {
    kind: 'triggered',
    trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
    targets: [],
    effects: [{ kind: 'copySpell', what: 'subject' }],
  },
};
const everyOther: Ref = { each: 'creature', controller: 'you', filter: { other: true } };
const yourSpell = (filter: CardFilter): TargetSpec => ({
  what: 'spell',
  controller: 'you',
  filter,
});

export const RARES_C: Record<string, Behavior> = {
  // ---------------------------------------------------------------- Quandrix (G/U)
  'Aether Helix': {
    spell: {
      targets: [
        { what: 'permanent' },
        { what: 'graveyardCard', controller: 'you', filter: permanentTypes },
      ],
      effects: [
        { kind: 'bounce', what: t0 },
        { kind: 'returnToHand', what: { target: 1 } },
      ],
    },
  },
  'Augmenter Pugilist': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'landsYouControl' },
            min: 8,
          },
          power: 5,
          toughness: 5,
        },
      },
    ],
  },
  'Body of Research': {
    spell: { targets: [], effects: [fractal({ count: 'cardsInLibrary' })] },
  },
  'Double Major': {
    spell: {
      targets: [yourSpell({ types: ['Creature'] })],
      effects: [{ kind: 'copySpell', what: t0, nonlegendary: true }],
    },
  },
  'Golden Ratio': {
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: { count: 'differentPowersYouControl' } },
      ],
    },
  },
  'Jadzi, Oracle of Arcavios': {
    abilities: [
      {
        kind: 'activated',
        cost: { discard: true },
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
        label: 'Discard a card: Return Jadzi to its owner’s hand',
      },
      magecraft([], { kind: 'revealTopCastOrPlay', pay: mana('{1}') }),
    ],
  },
  'Kasmina, Enigma Sage': {
    abilities: [
      { kind: 'static', effect: { kind: 'sharesLoyaltyAbilities' } },
      planeswalker(2, '+2: Scry 1', { kind: 'scry', amount: 1 }),
      {
        kind: 'activated',
        cost: { loyalty: 0, loyaltyX: true },
        targets: [],
        effects: [fractal({ x: true })],
        label: '−X: Create a Fractal with X +1/+1 counters',
      },
      planeswalker(-8, '−8: Cast an instant or sorcery from your library free', {
        kind: 'searchLibrary',
        filter: { types: ['Instant', 'Sorcery'], colors: ['G', 'U'] },
        to: 'castFree',
      }),
    ],
  },
  'Kianne, Dean of Substance': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'custom', handler: 'kianneStudy' }],
        label:
          '{T}: Exile the top card of your library (a land goes to your hand, else a study counter)',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}') },
        targets: [],
        effects: [fractal({ count: 'differentStudyManaValues' })],
        label: '{4}{G}: Create a Fractal (a counter per different study mana value)',
      },
    ],
  },
  'Manifestation Sage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [fractal({ count: 'cardsInHand' })],
      },
    ],
  },
  'Square Up': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'pump', to: t0, power: 4, toughness: 4, setBase: true }],
    },
  },
  'Tanazir Quandrix': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'counters', to: t0, amount: { countersOn: t0 } }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [
              {
                kind: 'pump',
                to: everyOther,
                power: { powerOf: 'self' },
                toughness: { toughnessOf: 'self' },
                setBase: true,
              },
            ],
          },
        ],
      },
    ],
  },
  'Vineglimmer Snarl': {
    entersTappedIf: unlessReveal('G', 'U'),
    abilities: tapFor('G', 'U'),
  },

  // ---------------------------------------------------------------- Prismari (U/R)
  'Creative Outburst': {
    spell: {
      targets: [{ what: 'any' }],
      effects: [
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'lookAndTake', count: 5, filter: {} },
      ],
    },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{U/R}{U/R}'), discardSelf: true },
        fromHand: true,
        targets: [],
        effects: [treasure],
        label: '{U/R}{U/R}, Discard this card: Create a Treasure token',
      },
    ],
  },
  'Culmination of Studies': {
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'culminationOfStudies' }] },
  },
  'Practical Research': {
    spell: {
      targets: [],
      effects: [
        draw(4),
        {
          kind: 'if',
          condition: { kind: 'handHas', filter: instantOrSorcery },
          then: [{ kind: 'discard', count: 1, filter: instantOrSorcery }],
          else: [{ kind: 'discard', count: 2 }],
        },
      ],
    },
  },
  'Rootha, Mercurial Artist': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), returnSelf: true },
        targets: [yourSpell(instantOrSorcery)],
        effects: [{ kind: 'copySpell', what: t0 }],
        label:
          '{2}, Return Rootha to its owner’s hand: Copy target instant or sorcery spell you control',
      },
    ],
  },
  'Rowan, Scholar of Sparks': {
    abilities: [
      { kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } },
      planeswalker(1, '+1: 1 damage to each opponent (3 with three cards drawn)', {
        kind: 'if',
        condition: { kind: 'cardsDrawnThisTurn', min: 3 },
        then: [{ kind: 'damage', amount: 3, to: 'eachOpponent' }],
        else: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      }),
      planeswalker(-4, '−4: Emblem: copy instants and sorceries you cast for {2}', {
        kind: 'emblem',
        until: 'permanent',
        ability: {
          kind: 'triggered',
          trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
          targets: [],
          effects: [
            {
              kind: 'may',
              cost: mana('{2}'),
              effects: [{ kind: 'copySpell', what: 'subject' }],
            },
          ],
        },
      }),
    ],
  },
  'Teach by Example': {
    spell: { targets: [], effects: [copyNextSpell] },
  },
  'Torrent Sculptor': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: instantOrSorcery }],
        effects: [
          { kind: 'counters', to: 'self', amount: { halfManaValueUpOf: t0 } },
          { kind: 'exileGraveyardCard', what: t0 },
        ],
      },
    ],
  },
  'Uvilda, Dean of Perfection': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, exileRefine: true },
        targets: [],
        effects: [],
        label: '{T}: Exile an instant or sorcery card from your hand with three refine counters',
      },
    ],
  },

  // ---------------------------------------------------------------- Three or more colours
  'Codie, Vociferous Codex': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantCastPermanentSpells' } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [
          { kind: 'addMana', mana: anyColors, untilEndOfTurn: true },
          {
            kind: 'emblem',
            until: 'nextSpellThisTurn',
            ability: {
              kind: 'triggered',
              trigger: { on: 'castSpell', filter: 'any' },
              targets: [],
              effects: [
                { kind: 'revealUntilCastable', max: 'belowSubject', filter: instantOrSorcery },
              ],
            },
          },
        ],
        label:
          '{4}, {T}: Add {W}{U}{B}{R}{G}; your next spell this turn finds a cheaper instant or sorcery',
      },
    ],
  },
  'Extus, Oriq Overlord': {
    abilities: [
      magecraft(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], nonlegendary: true },
          },
        ],
        {
          kind: 'returnToHand',
          what: t0,
        },
      ),
    ],
  },
};

/** Back faces of the double-faced cards here, keyed by the back face's name. */
export const RARES_C_BACKS: Record<string, Behavior> = {
  // Quandrix and Prismari: the spells and creatures on the backs of the school's legends.
  'Echoing Equation': {
    spell: {
      targets: [{ what: 'creature', controller: 'you' }],
      effects: [
        {
          kind: 'becomeCopy',
          of: t0,
          what: { each: 'creature', controller: 'you' },
          nonlegendary: true,
        },
      ],
    },
  },
  'Journey to the Oracle': {
    spell: {
      targets: [],
      effects: [
        { kind: 'putFromHandOrGraveyard', filter: { types: ['Land'] }, handOnly: true, all: true },
        {
          kind: 'if',
          condition: {
            kind: 'all',
            of: [
              { kind: 'amountAtLeast', amount: { count: 'landsYouControl' }, min: 8 },
              { kind: 'handSize', min: 1 },
            ],
          },
          then: [
            {
              kind: 'may',
              effects: [{ kind: 'discard', count: 1 }, { kind: 'returnSelfFromStack' }],
            },
          ],
        },
      ],
    },
  },
  'Imbraham, Dean of Theory': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{X}{U}{U}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'custom', handler: 'studyExile' }, { kind: 'takeStudyCard' }],
        label: '{X}{U}{U}, {T}: Exile the top X cards with study counters; take one into your hand',
      },
    ],
  },
  'Flamethrower Sonata': {
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'] },
          optional: true,
        },
      ],
      effects: [{ kind: 'discard', count: 1, damageTo: 0 }, draw(1)],
    },
  },
  'Nassari, Dean of Expression': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'custom', handler: 'nassariExile' }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', fromExile: true },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Awaken the Blood Avatar': {
    sacrificeCreaturesForReduction: 2,
    spell: {
      targets: [],
      effects: [{ kind: 'opponentSacrifices' }, { kind: 'createToken', token: AVATAR, count: 1 }],
    },
  },
  'Will, Scholar of Frost': {
    abilities: [
      { kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } },
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [{ what: 'creature', optional: true }],
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 2, setBase: true, untilYourNextTurn: true },
        ],
        label:
          '+1: Up to one target creature has base power and toughness 0/2 until your next turn',
      },
      planeswalker(-3, '−3: Draw two cards', draw(2)),
      {
        kind: 'activated',
        cost: { loyalty: -7 },
        targets: [0, 1, 2, 3, 4].map((): TargetSpec => ({ what: 'permanent', optional: true })),
        effects: [0, 1, 2, 3, 4].flatMap((i): EffectDef[] => [
          { kind: 'exile', what: { target: i } },
          { kind: 'createToken', token: ELEMENTAL, count: 1, forControllerOf: i },
        ]),
        label: '−7: Exile up to five target permanents; each controller creates a 4/4 Elemental',
      },
    ],
  },
};
