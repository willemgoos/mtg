import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, prowess, t0, when } from '../blb/helpers.ts';
import { tapFor } from '../msc/helpers.ts';

/**
 * Brawl Quintorius, History Chaser (15a, red): the red cards of the deck, mostly
 * discard/rummage and graveyard play. One-offs are custom effects in
 * packages/engine/src/brawl-15a-r-effects.ts.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const BLOOD = 'blood-token';
const ELEMENTAL = 'brawl-elemental-1-1-red-token';
const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });

/** "{cost}: Unearth": return it from your graveyard with haste; exiled at the end step. */
const unearth = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  fromGraveyard: true,
  sorcerySpeed: true,
  targets: [],
  effects: [{ kind: 'unearth' }],
  label: `Unearth ${cost}`,
});

/** "You may discard a card. If you do, draw N cards." */
const mayDiscardDraw = (n: number): EffectDef => ({
  kind: 'may',
  effects: [
    {
      kind: 'if',
      condition: { kind: 'handSize', min: 1 },
      then: [{ kind: 'discard', count: 1 }, draw(n)],
    },
  ],
});

const anotherCreatureEnters = (...effects: EffectDef[]): AbilityDef =>
  when({ on: 'otherCreatureEtb', controller: 'you' }, [], ...effects);

const instantOrSorceryCard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Instant', 'Sorcery'] },
};

export const BRAWL_15A_R: Record<string, Behavior> = {
  // The front of Pinnacle Monk // Mystic Peak.
  'Pinnacle Monk': {
    abilities: [
      prowess,
      when({ on: 'etb' }, [instantOrSorceryCard], { kind: 'returnToHand', what: t0 }),
    ],
  },
  'Thrill of Possibility': {
    discardToCast: true,
    spell: { targets: [], effects: [draw(2)] },
  },
  'Faithless Looting': {
    spell: { targets: [], effects: [draw(2), { kind: 'discard', count: 2 }] },
    flashback: mana('{2}{R}'),
  },
  'Enduring Courage': {
    abilities: [
      anotherCreatureEnters({
        kind: 'pump',
        to: 'subject',
        power: 2,
        toughness: 0,
        keywords: ['haste'],
      }),
      when({ on: 'dies' }, [], custom('enduringReturn')),
    ],
  },
  'Fallaji Antiquarian': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            controller: 'you',
            filter: {
              other: true,
              nontoken: true,
              anyOf: [{ types: ['Creature'] }, { types: ['Artifact'] }],
            },
          },
        ],
        custom('fallajiConjure'),
      ),
    ],
  },
  'Ivora, Insatiable Heir': {
    abilities: [
      onEnter(token(BLOOD)),
      when({ on: 'combatDamageToPlayer' }, [], token(BLOOD)),
      when({ on: 'youDiscard' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Molten Gatekeeper': {
    abilities: [
      anotherCreatureEnters({ kind: 'damage', amount: 1, to: 'eachOpponent' }),
      unearth('{R}'),
    ],
  },
  'Scrapwork Mutt': {
    abilities: [onEnter(mayDiscardDraw(1)), unearth('{1}{R}')],
  },
  'Seasoned Pyromancer': {
    abilities: [
      onEnter({ kind: 'discard', count: 2, drawAfter: 2, tokenPerNonland: ELEMENTAL }),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{R}{R}'), exileSelf: true },
        fromGraveyard: true,
        targets: [],
        effects: [token(ELEMENTAL, 2)],
        label: '{3}{R}{R}, exile this card from your graveyard: two 1/1 Elementals',
      },
    ],
  },
  'Squee, the Immortal': { castFromGraveyardOrExile: true },
  'Tersa Lightshatter': {
    abilities: [
      onEnter({ kind: 'discardAnyThenDraw', who: 'controller', max: 2 }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'graveyardCount', min: 7 },
        targets: [],
        effects: [custom('exileRandomPlayable')],
      },
    ],
  },
  'Bitter Reunion': {
    abilities: [
      onEnter(mayDiscardDraw(2)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you' },
            power: 0,
            toughness: 0,
            keywords: ['haste'],
          },
        ],
        label: '{1}, sacrifice this enchantment: creatures you control gain haste',
      },
    ],
  },
  'Shared Animosity': {
    abilities: [when({ on: 'creatureYouControlAttacks' }, [], custom('sharedAnimosity'))],
  },
};

/** The back face of Pinnacle Monk: a land that costs 3 life to enter untapped. */
export const BRAWL_15A_R_BACKS: Record<string, Behavior> = {
  'Mystic Peak': {
    entersTapped: true,
    abilities: [
      tapFor('R'),
      // "As this land enters, you may pay 3 life. If you don't, it enters tapped."
      onEnter({
        kind: 'may',
        effects: [
          { kind: 'loseLife', who: 'controller', amount: 3 },
          { kind: 'untap', what: 'self' },
        ],
      }),
    ],
  },
};

export const BRAWL_15A_R_TOKENS: CardDefinition[] = [
  {
    id: BLOOD,
    name: 'Blood',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Blood'],
    keywords: [],
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, discard: true, sacrificeSelf: true },
        targets: [],
        effects: [draw(1)],
        label: '{1}, {T}, discard a card, sacrifice this token: draw a card',
      },
    ],
    isToken: true,
  },
  {
    id: ELEMENTAL,
    name: 'Elemental',
    manaCost: { generic: 0, colored: {} },
    colors: ['R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
