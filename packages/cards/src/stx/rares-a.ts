import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, mode, spell, t0, t1, t2 } from '../fin/helpers.ts';
import { tapForEither, unlessReveal } from '../msc/helpers.ts';
import { SPIRIT } from './lorehold.ts';

/**
 * Strixhaven (13c, group A): the remaining white, blue, Silverquill (W/B) and
 * Lorehold (R/W) boosters cards. Printed characteristics come from Scryfall;
 * only rules text lives here. Rip Apart and Furycalm Snarl are already
 * implemented (msc/). Back faces of the modal double-faced cards are in
 * `RARES_A_BACKS`. Engine pieces: stx-13c-a-effects.ts ("Strixhaven (13c)").
 */

const ELEMENTAL = 'stx-elemental-ur-token';

/** The 4/4 blue and red Elemental creature token (Multiple Choice). */
export const RARES_A_TOKENS: CardDefinition[] = [
  {
    id: ELEMENTAL,
    name: 'Elemental',
    manaCost: { generic: 0, colored: {} },
    colors: ['U', 'R'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 4,
    toughness: 4,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const choose = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  ...(params ? { params } : {}),
});
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const yourCreatures = { each: 'creature', controller: 'you' } as const;
const scry1: EffectDef = { kind: 'scry', amount: 1 };
const x = { x: true } as const;
const atLeast = (min: number) => ({ kind: 'amountAtLeast', amount: x, min }) as const;
const walkerOrCreatureYours: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { types: ['Creature', 'Planeswalker'] },
  optional: true,
};

/** Multiple Choice: the three parts, by X. */
const mcScryDraw: EffectDef[] = [scry1, draw(1)];
const mcBounce: EffectDef = choose('multipleChoicePlayer');
const mcToken: EffectDef = { kind: 'createToken', token: ELEMENTAL, count: 1 };

const mentorsTypes: CardFilter = {
  anyOf: [
    { types: ['Planeswalker'] },
    { subtype: 'Cleric' },
    { subtype: 'Druid' },
    { subtype: 'Shaman' },
    { subtype: 'Warlock' },
    { subtype: 'Wizard' },
  ],
};

export const RARES_A: Record<string, Behavior> = {
  // ------------------------------------------------------------ white
  // Simplified: "choose a nonland card name" lists every nonland card (names the opponent has shown come first).
  'Academic Probation': {
    modes: [
      mode(
        'Opponents cannot cast spells with the chosen name',
        [],
        choose('cardName', { then: 'banName' }),
      ),
      mode(
        'It cannot attack or block, and its activated abilities cannot be activated',
        [{ what: 'permanent', filter: { nonland: true } }],
        custom('academicLock'),
      ),
    ],
  },
  'Devastating Mastery': {
    spell: {
      targets: [],
      effects: [{ kind: 'destroyAll', permanents: true, filter: { nonland: true } }],
    },
    kicker: {
      cost: mana('{2}{W}{W}'),
      replacesCost: true,
      spell: {
        targets: [],
        effects: [
          choose('masteryBounce'),
          { kind: 'destroyAll', permanents: true, filter: { nonland: true } },
        ],
      },
    },
  },
  'Secret Rendezvous': {
    spell: {
      targets: [],
      effects: [draw(3), { kind: 'draw', who: 'eachOpponent', amount: 3 }],
    },
  },

  'Show of Confidence': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['vigilance'] },
      ],
    },
    abilities: [
      triggered({ on: 'castSelf' }, [], {
        kind: 'copySpell',
        what: 'subject',
        count: { count: 'otherInstantsSorceriesCastThisTurn' },
        retarget: true,
      }),
    ],
  },
  "Stonebinder's Familiar": {
    abilities: [
      {
        ...triggered({ on: 'cardsExiledYourTurn' }, [], {
          kind: 'counters',
          to: 'self',
          amount: 1,
        }),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Mila, Crafty Companion': {
    back: 'lukka-wayward-bonder',
    abilities: [
      triggered({ on: 'opponentAttacksPlaneswalker' }, [], {
        kind: 'namedCounters',
        name: 'loyalty',
        amount: 1,
        to: { each: 'permanent', controller: 'you', filter: { types: ['Planeswalker'] } },
      }),
      triggered({ on: 'permanentTargetedByOpponent' }, [], { kind: 'may', effects: [draw(1)] }),
    ],
  },
  'Selfless Glyphweaver': {
    back: 'deadly-vanity',
    abilities: [
      {
        kind: 'activated',
        cost: { exileSelf: true },
        targets: [],
        effects: [
          { kind: 'pump', to: yourCreatures, power: 0, toughness: 0, keywords: ['indestructible'] },
        ],
        label: 'Exile this creature: creatures you control gain indestructible',
      },
    ],
  },
  'Shaile, Dean of Radiance': {
    back: 'embrose-dean-of-shadow',
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { enteredThisTurn: true } },
            amount: 1,
          },
        ],
        label: '{T}: +1/+1 counter on each creature that entered under your control this turn',
      },
    ],
  },
  'Plargg, Dean of Chaos': {
    back: 'augusta-dean-of-order',
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, discard: true },
        targets: [],
        effects: [draw(1)],
        label: '{T}, discard a card: draw a card',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'revealUntilCastable', max: 3, filter: { nonlegendary: true } }],
        label:
          '{4}{R}, {T}: cast a nonlegendary nonland card with mana value 3 or less from the top',
      },
    ],
  },
  'Flamescroll Celebrant': {
    back: 'revel-in-silence',
    abilities: [
      triggered({ on: 'opponentActivatesAbility' }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 0 }],
        label: '{1}{R}: +2/+0',
      },
    ],
  },
  // ------------------------------------------------------------ blue
  'Kelpie Guide': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'permanent', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'untap', what: t0 }],
        label: '{T}: untap another target permanent you control',
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 8 },
        targets: [{ what: 'permanent' }],
        effects: [{ kind: 'tap', what: t0 }],
        label: '{T}: tap target permanent (eight or more lands)',
      },
    ],
  },
  "Mentor's Guidance": {
    ...spell([], scry1, draw(1)),
    abilities: [
      {
        ...triggered({ on: 'castSelf' }, [], { kind: 'copySpell', what: 'subject' }),
        condition: { kind: 'controlsPermanents', filter: mentorsTypes, min: 1 },
      } as AbilityDef,
    ],
  },
  'Mercurial Transformation': {
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [choose('mercurial')],
    },
  },
  'Multiple Choice': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: atLeast(4),
          then: [...mcScryDraw, mcBounce, mcToken],
          else: [
            {
              kind: 'if',
              condition: atLeast(3),
              then: [mcToken],
              else: [
                {
                  kind: 'if',
                  condition: atLeast(2),
                  then: [mcBounce],
                  else: [{ kind: 'if', condition: atLeast(1), then: mcScryDraw }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  'Solve the Equation': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { types: ['Instant', 'Sorcery'] },
          to: 'hand',
        },
      ],
    },
  },
  'Tempted by the Oriq': {
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'], maxManaValue: 3 },
          optional: true,
        },
      ],
      effects: [{ kind: 'gainControl', what: t0, permanent: true }],
    },
  },
  'Test of Talents': {
    spell: {
      targets: [{ what: 'spell', filter: { types: ['Instant', 'Sorcery'] } }],
      effects: [{ kind: 'counter', what: t0 }, custom('testOfTalents')],
    },
  },
  // ------------------------------------------------------------ Silverquill (W/B)
  Fracture: {
    spell: {
      targets: [
        { what: 'permanent', filter: { types: ['Artifact', 'Enchantment', 'Planeswalker'] } },
      ],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  Humiliate: {
    spell: {
      targets: [],
      effects: [
        { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' },
        {
          kind: 'chooseYourPermanent',
          filter: { types: ['Creature'] },
          then: [{ kind: 'counters', to: 'chosen', amount: 1 }],
        },
      ],
    },
  },
  'Shineshadow Snarl': {
    entersTappedIf: unlessReveal('W', 'B'),
    abilities: tapForEither('W', 'B'),
  },
  'Silverquill Silencer': {
    abilities: [
      triggered({ on: 'etb' }, [], choose('cardName', { then: 'setChosenName' })),
      triggered(
        { on: 'castSpell', filter: 'any', caster: 'opponent', spell: { chosenNameOfSource: true } },
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: 3 },
        draw(1),
      ),
    ],
  },
  // ------------------------------------------------------------ Lorehold (R/W)
  'Hofri Ghostforge': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Spirit' },
          power: 1,
          toughness: 1,
          keywords: ['trample', 'haste'],
        },
      },
      triggered(
        { on: 'otherCreatureDies', controller: 'you', nontoken: true },
        [],
        custom('hofriCopy'),
      ),
    ],
  },
  'Lorehold Excavation': {
    abilities: [
      triggered({ on: 'beginningOfEndStep', whose: 'yours' }, [], custom('loreholdExcavation')),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), exileFromGraveyard: { types: ['Creature'] } },
        targets: [],
        effects: [{ kind: 'createToken', token: SPIRIT, count: 1, tapped: true }],
        label: '{5}, exile a creature card from your graveyard: tapped 3/2 Spirit',
      },
    ],
  },
  'Radiant Scrollwielder': {
    abilities: [
      { kind: 'static', effect: { kind: 'instantsSorceriesLifelink' } },
      triggered({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('scrollwielderExile')),
    ],
  },
  'Reconstruct History': {
    afterResolving: 'exile',
    spell: {
      targets: (['Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker'] as const).map(
        (type): TargetSpec => ({
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: [type] },
          optional: true,
        }),
      ),
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
        { kind: 'returnToHand', what: t2 },
        { kind: 'returnToHand', what: { target: 3 } },
        { kind: 'returnToHand', what: { target: 4 } },
      ],
    },
  },
  'Thrilling Discovery': {
    spell: {
      targets: [],
      effects: [
        { kind: 'gainLife', who: 'controller', amount: 2 },
        {
          kind: 'if',
          condition: { kind: 'handSize', min: 2 },
          then: [{ kind: 'may', effects: [{ kind: 'discard', count: 2 }, draw(3)] }],
        },
      ],
    },
  },
  'Velomachus Lorehold': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'castFreeFromTop',
        count: 7,
        from: 'yours',
        maxManaValue: { powerOf: 'self' },
        rest: 'bottom',
        filter: { types: ['Instant', 'Sorcery'] },
      }),
    ],
  },
};

// Semester's End: any number of your creatures and planeswalkers (up to three here).
RARES_A["Semester's End"] = {
  spell: {
    targets: [walkerOrCreatureYours, walkerOrCreatureYours, walkerOrCreatureYours],
    effects: [t0, t1, t2].map((what): EffectDef => ({
      kind: 'exileUntilEndStep',
      what,
      counters: 1,
      loyaltyToo: true,
    })),
  },
};

/** Back faces of the modal double-faced cards above, keyed by the back face's name. */
export const RARES_A_BACKS: Record<string, Behavior> = {
  'Revel in Silence': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [custom('revelInSilence')] },
  },
  'Deadly Vanity': { spell: { targets: [], effects: [choose('deadlyVanity')] } },
  'Embrose, Dean of Shadow': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', filter: { other: true } }],
        effects: [
          { kind: 'counters', to: t0, amount: 1 },
          { kind: 'damage', amount: 2, to: t0 },
        ],
        label: '{T}: +1/+1 counter on another target creature, then 2 damage to it',
      },
      triggered(
        { on: 'permanentYouControlDies', filter: { types: ['Creature'], minPlusOneCounters: 1 } },
        [],
        draw(1),
      ),
    ],
  },
  'Augusta, Dean of Order': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { tapped: true },
          power: 1,
          toughness: 0,
        },
      },
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { tapped: false },
          power: 0,
          toughness: 1,
        },
      },
      triggered({ on: 'youAttack' }, [], custom('untapAllYours'), choose('augustaTap')),
    ],
  },
  'Lukka, Wayward Bonder': {
    abilities: [
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [choose('lukkaDiscard')],
        label: '+1: you may discard a card; if you do, draw a card (two for a creature card)',
      },
      {
        kind: 'activated',
        cost: { loyalty: -2 },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
        effects: [custom('lukkaReanimate')],
        label: '−2: return a creature card from your graveyard with haste; exile it next upkeep',
      },
      {
        kind: 'activated',
        cost: { loyalty: -7 },
        targets: [],
        effects: [
          {
            kind: 'emblem',
            until: 'permanent',
            ability: {
              kind: 'triggered',
              trigger: { on: 'otherCreatureEtb', controller: 'you' },
              targets: [{ what: 'any' }],
              effects: [{ kind: 'damage', amount: { powerOf: 'subject' }, to: t0 }],
            },
          },
        ],
        label:
          '−7: emblem, whenever a creature you control enters it deals damage equal to its power',
      },
    ],
  },
};
