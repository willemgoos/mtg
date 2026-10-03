import type {
  AbilityDef,
  Amount,
  CardDefinition,
  EffectDef,
  Keyword,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  combos,
  creature,
  mana,
  mode,
  spell,
  t0,
  tapFor,
  yourCreature,
} from '../fin/helpers.ts';

/**
 * Strixhaven (STX) 13b: Silverquill (W/B) cards and Lessons. Printed
 * characteristics come from Scryfall; only rules text lives here. Shared with
 * other decks: Combat Professor, Pillardrop Rescuer, Professor of Symbology
 * and Reduce to Memory (lorehold.ts), the Pest token (quandrix.ts).
 */

export const INKLING = 'stx-inkling-token';
const PEST = 'stx-pest-token';

/** The 2/1 white and black Inkling creature token with flying. */
export const SILVERQUILL_TOKENS: CardDefinition[] = [
  {
    id: INKLING,
    name: 'Inkling',
    manaCost: { generic: 0, colored: {} },
    colors: ['W', 'B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Inkling'],
    power: 2,
    toughness: 1,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];

export const inkling = (count: Amount = 1, tapped = false): EffectDef => ({
  kind: 'createToken',
  token: INKLING,
  count,
  ...(tapped ? { tapped: true } : {}),
});
export const pest: EffectDef = { kind: 'createToken', token: PEST, count: 1 };
export const learn: EffectDef = { kind: 'learn' };
const opponentLoses = (amount: number): EffectDef => ({
  kind: 'loseLife',
  who: 'eachOpponent',
  amount,
});

/** Magecraft: "whenever you cast or copy an instant or sorcery spell". */
const magecraft = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets,
  effects,
});

const pumpSelf = (power: number, toughness: number, keywords: Keyword[] = []): EffectDef => ({
  kind: 'pump',
  to: 'self',
  power,
  toughness,
  ...(keywords.length ? { keywords } : {}),
});

/** "When this dies, put its counters on target creature you control." */
const dyingCounters: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'dies' },
  targets: [yourCreature],
  effects: [{ kind: 'counters', to: t0, amount: { countersOn: 'self' } }],
};

/** What Shadrix gives an opponent whichever pair you choose: they draw a card and lose 1 life. */
const shadrixOpponent: EffectDef[] = [
  { kind: 'draw', who: 'eachOpponent', amount: 1 },
  opponentLoses(1),
];

export const SILVERQUILL: Record<string, Behavior> = {
  'Silverquill Apprentice': {
    abilities: [magecraft([creature], { kind: 'pump', to: t0, power: 1, toughness: 0 })],
  },
  // Lifelink and menace are keywords; spells that target a creature cost {2} less.
  'Killian, Ink Duelist': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLessTargeting', filter: { types: ['Creature'] }, amount: 2 },
      },
    ],
  },
  'Silverquill Pledgemage': {
    abilities: [
      magecraft([], {
        kind: 'choose',
        options: [
          { label: 'Flying', effects: [pumpSelf(0, 0, ['flying'])] },
          { label: 'Lifelink', effects: [pumpSelf(0, 0, ['lifelink'])] },
        ],
      }),
    ],
  },
  'Shadewing Laureate': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'permanentYouControlDies',
          filter: { types: ['Creature'], hasKeyword: 'flying' },
          other: true,
        },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  'Spiteful Squad': { entersWithCounters: 2, abilities: [dyingCounters] },
  'Owlin Shieldmage': {},
  // Simplified: you choose which of the two pairs; an opponent always gets the draw mode.
  'Shadrix Silverquill': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [],
        modes: [
          mode(
            'You create a 2/1 Inkling; an opponent draws a card and loses 1 life',
            [],
            inkling(),
            ...shadrixOpponent,
          ),
          mode(
            'You put a +1/+1 counter on each creature you control; an opponent draws a card and loses 1 life',
            [],
            { kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 },
            ...shadrixOpponent,
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------- spells
  'Vanishing Verse': spell([{ what: 'permanent', filter: { monocolored: true } }], {
    kind: 'exile',
    what: t0,
  }),
  'Closing Statement': {
    costReductionIf: { condition: { kind: 'yourStep', steps: ['end'] }, amount: 2 },
    spell: {
      targets: [
        {
          what: 'permanent',
          controller: 'opponent',
          filter: { types: ['Creature', 'Planeswalker'] },
        },
        { ...yourCreature, optional: true },
      ],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'counters', to: { target: 1 }, amount: 1 },
      ],
    },
  },
  'Defend the Campus': {
    modes: [
      mode('Creatures you control get +1/+1 until end of turn', [], {
        kind: 'pump',
        to: { each: 'creature', controller: 'you' },
        power: 1,
        toughness: 1,
      }),
      mode(
        'Destroy target creature with power 4 or greater',
        [{ what: 'creature', filter: { minPower: 4 } }],
        { kind: 'destroy', what: t0 },
      ),
    ],
  },
  'Umbral Juke': {
    modes: [
      mode('Target player sacrifices a creature or planeswalker', [], {
        kind: 'opponentSacrifices',
        filter: { types: ['Creature', 'Planeswalker'] },
      }),
      mode('Create a 2/1 Inkling creature token with flying', [], inkling()),
    ],
  },
  'Silverquill Command': {
    modes: combos(
      [
        mode('Target creature gets +3/+3 and gains flying until end of turn', [creature], {
          kind: 'pump',
          to: t0,
          power: 3,
          toughness: 3,
          keywords: ['flying'],
        }),
        mode(
          'Return target creature card with mana value 2 or less from your graveyard to the battlefield',
          [
            {
              what: 'graveyardCard',
              controller: 'you',
              filter: { types: ['Creature'], maxManaValue: 2 },
            },
          ],
          { kind: 'returnToBattlefield', what: t0 },
        ),
        mode(
          'Target player draws a card and loses 1 life',
          [{ what: 'player' }],
          { kind: 'draw', who: t0, amount: 1 },
          { kind: 'loseLife', who: t0, amount: 1 },
        ),
        mode('Target opponent sacrifices a creature of their choice', [], {
          kind: 'opponentSacrifices',
        }),
      ],
      [2],
    ),
  },
  // Simplified: the other creatures you control get +1/+1 too, the target as well.
  'Exhilarating Elocution': spell(
    [yourCreature],
    { kind: 'counters', to: t0, amount: 2 },
    { kind: 'pump', to: { each: 'creature', controller: 'you' }, power: 1, toughness: 1 },
  ),
  'Dramatic Finale': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { token: true },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', nontoken: true },
        targets: [],
        effects: [inkling()],
        batch: true,
        oncePerTurn: true,
      },
    ],
  },
  // Simplified: the X 6 or more sweep of noncreature permanents is left out.
  'Blot Out the Sky': spell([], inkling({ x: true }, true)),
  'Silverquill Campus': {
    entersTapped: true,
    abilities: [
      ...tapFor('W', 'B'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
      },
    ],
  },
};
