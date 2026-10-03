import type { AbilityDef, CardDefinition, EffectDef, Keyword, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  combos,
  creature,
  draw,
  mana,
  mode,
  onEnter,
  spell,
  t0,
  t1,
  tapFor,
  yourCreature,
} from '../fin/helpers.ts';

/**
 * Strixhaven (STX) 13a: Lorehold Reckoning (R/W) and its Lessons. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */

export const SPIRIT = 'lorehold-spirit-token';

/** The 3/2 red and white Spirit creature token. */
export const LOREHOLD_TOKENS: CardDefinition[] = [
  {
    id: SPIRIT,
    name: 'Spirit',
    manaCost: { generic: 0, colored: {} },
    colors: ['R', 'W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Spirit'],
    power: 3,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

const spirit = (tapped = false): EffectDef => ({
  kind: 'createToken',
  token: SPIRIT,
  count: 1,
  ...(tapped ? { tapped: true } : {}),
});

/** Magecraft: "whenever you cast or copy an instant or sorcery spell". */
const magecraft = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets: [],
  effects,
});

const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const activated = (
  cost: Extract<AbilityDef, { kind: 'activated' }>['cost'],
  targets: TargetSpec[],
  extra: Partial<Extract<AbilityDef, { kind: 'activated' }>>,
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'activated', cost, targets, effects, ...extra });

const instantOrSorcery = { types: ['Instant' as const, 'Sorcery' as const] };
const pumpEot = (power: number, toughness: number, keywords: Keyword[] = []): EffectDef => ({
  kind: 'pump',
  to: t0,
  power,
  toughness,
  ...(keywords.length ? { keywords } : {}),
});
const learn: EffectDef = { kind: 'learn' };
const anyTarget: TargetSpec = { what: 'any' };

/** "Spirit creatures you control gain '{T}: This creature deals 1 damage to each opponent.'" */
const pinger: AbilityDef = {
  kind: 'activated',
  cost: { tapSelf: true },
  targets: [],
  effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
  label: '{T}: 1 damage to each opponent',
};

const pledgeMagecraft = magecraft({ kind: 'pump', to: 'self', power: 1, toughness: 0 });

export const LOREHOLD: Record<string, Behavior> = {
  // ---------------------------------------------------------------- creatures
  'Eager First-Year': { abilities: [pledgeMagecraft] },
  'Lorehold Pledgemage': { abilities: [pledgeMagecraft] },
  'Professor of Symbology': { abilities: [onEnter(learn)] },
  'Stonerise Spirit': {
    abilities: [
      activated(
        { mana: mana('{4}'), exileFromGraveyard: {} },
        [creature],
        {},
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['flying'] },
      ),
    ],
  },
  'Lorehold Apprentice': {
    abilities: [
      magecraft({
        kind: 'grantAbility',
        to: { each: 'creature', controller: 'you', filter: { subtype: 'Spirit' } },
        ability: pinger,
      }),
    ],
  },
  'Illustrious Historian': {
    abilities: [
      activated({ mana: mana('{5}'), exileSelf: true }, [], { fromGraveyard: true }, spirit(true)),
    ],
  },
  'Combat Professor': {
    abilities: [
      triggered({ on: 'beginningOfCombat', whose: 'yours' }, [yourCreature], {
        kind: 'pump',
        to: t0,
        power: 1,
        toughness: 0,
        keywords: ['vigilance'],
      }),
    ],
  },
  'Pillardrop Rescuer': {
    abilities: [
      onEnterTarget(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Twinscroll Shaman': {},
  'Returned Pastcaller': {
    abilities: [
      onEnterTarget(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { anyOf: [{ subtype: 'Spirit' }, instantOrSorcery] },
          },
        ],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  // Quintorius: Spirits you control get +1/+0 (it isn't one itself); one or more cards leaving your graveyard make a Spirit.
  'Quintorius, Field Historian': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Spirit' },
          power: 1,
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        targets: [],
        effects: [spirit()],
        batch: true,
      },
    ],
  },
  'Storm-Kiln Artist': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } },
          toughness: 0,
        },
      },
      magecraft({ kind: 'createToken', token: 'treasure-token', count: 1 }),
    ],
  },
  'Pillardrop Warden': {
    abilities: [
      activated(
        { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        [{ what: 'graveyardCard', controller: 'you', filter: instantOrSorcery }],
        { sorcerySpeed: true },
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Tome Shredder': {
    abilities: [
      activated(
        { tapSelf: true, exileFromGraveyard: instantOrSorcery },
        [],
        {},
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },

  // Added to the draft list for strength (see docs/strixhaven-13a-decks.md).
  'Relic Sloth': {},
  'Blade Historian': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { attacking: true },
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike'],
        },
      },
    ],
  },
  'Dueling Coach': {
    abilities: [
      onEnterTarget([creature], { kind: 'counters', to: t0, amount: 1 }),
      activated(
        { mana: mana('{4}{W}'), tapSelf: true },
        [],
        {},
        {
          kind: 'counters',
          to: { each: 'creature', controller: 'you', filter: { minPlusOneCounters: 1 } },
          amount: 1,
        },
      ),
    ],
  },
  'Venerable Warsinger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        // X is the damage it dealt (its power, short of damage modifiers).
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 'sourcePower' },
            optional: true,
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Stonebound Mentor': {
    abilities: [leaveGraveyard({ kind: 'scry', amount: 1 })],
  },
  'Fuming Effigy': {
    abilities: [leaveGraveyard({ kind: 'damage', amount: 1, to: 'eachOpponent' })],
  },

  // ------------------------------------------------------------------- spells
  'Igneous Inspiration': spell([anyTarget], { kind: 'damage', amount: 3, to: t0 }, learn),
  'Heated Debate': {
    uncounterable: true,
    ...spell([{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }], {
      kind: 'damage',
      amount: 4,
      to: t0,
    }),
  },
  Expel: spell([{ what: 'creature', filter: { tapped: true } }], { kind: 'exile', what: t0 }),
  'Make Your Mark': spell([creature], pumpEot(1, 0), {
    kind: 'whenDiesThisTurn',
    what: t0,
    effects: [spirit()],
  }),
  'Pigment Storm': spell([creature], { kind: 'custom', handler: 'pigmentStorm' }),
  'Lorehold Command': {
    modes: combos(
      [
        mode('Create a 3/2 Spirit', [], spirit()),
        mode('Creatures you control get +1/+0, indestructible and haste', [], {
          kind: 'pump',
          to: { each: 'creature', controller: 'you' },
          power: 1,
          toughness: 0,
          keywords: ['indestructible', 'haste'],
        }),
        mode(
          '3 damage to any target, a player gains 3 life',
          [anyTarget, { what: 'player' }],
          { kind: 'damage', amount: 3, to: t0 },
          { kind: 'gainLife', who: t1, amount: 3 },
        ),
        mode('Sacrifice a permanent, then draw two cards', [], {
          kind: 'sacrificeSeveral',
          count: 1,
          filter: {},
          then: [draw(2)],
        }),
      ],
      [2],
    ),
  },
  'Beaming Defiance': spell([yourCreature], pumpEot(2, 2, ['hexproof'])),
  'Study Break': spell(
    [
      { what: 'creature', optional: true },
      { what: 'creature', optional: true },
    ],
    { kind: 'tap', what: t0 },
    { kind: 'tap', what: t1 },
    learn,
  ),
  'Academic Dispute': spell(
    [creature],
    { kind: 'mustBlock', what: t0 },
    {
      kind: 'may',
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['reach'] }],
    },
    learn,
  ),
  'Enthusiastic Study': spell([creature], pumpEot(3, 1, ['trample']), learn),
  'Guiding Voice': spell([creature], { kind: 'counters', to: t0, amount: 1 }, learn),
  'Lorehold Campus': {
    entersTapped: true,
    abilities: [
      ...tapFor('R', 'W'),
      activated({ mana: mana('{4}'), tapSelf: true }, [], {}, { kind: 'scry', amount: 1 }),
    ],
  },

  // ------------------------------------------------------------------ Lessons
  'Spirit Summoning': spell([], spirit()),
  'Reduce to Memory': spell(
    [{ what: 'permanent', filter: { nonland: true } }],
    { kind: 'exile', what: t0 },
    { kind: 'createToken', token: SPIRIT, count: 1, forControllerOf: 0 },
  ),
  'Start from Scratch': {
    modes: [
      mode('1 damage to any target', [anyTarget], { kind: 'damage', amount: 1, to: t0 }),
      mode('Destroy target artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], {
        kind: 'destroy',
        what: t0,
      }),
    ],
  },
  'Introduction to Prophecy': spell([], { kind: 'scry', amount: 2 }, draw(1)),
  'Expanded Anatomy': spell(
    [creature],
    { kind: 'counters', to: t0, amount: 2 },
    pumpEot(0, 0, ['vigilance']),
  ),
};

/** "Whenever one or more cards leave your graveyard, ...". */
function leaveGraveyard(...effects: EffectDef[]): AbilityDef {
  return {
    kind: 'triggered',
    trigger: { on: 'cardsLeaveYourGraveyard' },
    targets: [],
    effects,
    batch: true,
  };
}

/** An enters-the-battlefield trigger with targets. */
function onEnterTarget(targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef {
  return triggered({ on: 'etb' }, targets, ...effects);
}
