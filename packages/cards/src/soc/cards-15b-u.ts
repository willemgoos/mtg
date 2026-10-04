import type {
  AbilityDef,
  Amount,
  CardDefinition,
  EffectDef,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, pump, t0, t1, when, yours } from '../blb/helpers.ts';
import { investigate } from '../msh/helpers.ts';
import { tapFor } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b): the blue cards of the Brawl decks. Printed
 * characteristics come from Scryfall; only rules text lives here. One-offs are
 * `custom` handlers in packages/engine/src/brawl-15b-u-effects.ts.
 */

export const SOC_15B_U_BIRD_ILLUSION = 'soc-15b-u-bird-illusion';
export const SOC_15B_U_ARMY = 'soc-15b-u-zombie-army';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
});

/** The 1/1 blue Bird Illusion with flying (Murmuring Mystic) and the 0/0 black Zombie Army (amass). */
export const BRAWL_15B_U_TOKENS: CardDefinition[] = [
  token(SOC_15B_U_BIRD_ILLUSION, 'Bird Illusion', ['U'], ['Bird', 'Illusion'], 1, 1, ['flying']),
  token(SOC_15B_U_ARMY, 'Zombie Army', ['B'], ['Zombie', 'Army'], 0, 0),
];

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
const anySpell: TargetSpec = { what: 'spell' };
const noncreatureSpell: TargetSpec = { what: 'spell', filter: { notTypes: ['Creature'] } };
const counter: EffectDef = { kind: 'counter', what: t0 };
const instantOrSorceryInYourGraveyard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Instant', 'Sorcery'] },
};
const discardOne: EffectDef = { kind: 'discard', count: 1 };
const instantsAndSorceriesInGraveyard: Amount = {
  count: 'cardsInGraveyard',
  types: ['Instant', 'Sorcery'],
};
const seekNonland = custom('seekNonland'); // shared with 15a: Gate to the Citadel

/** The back faces' lands: tapped, or "pay 3 life as it enters or it enters tapped". */
const tappedIsland: Behavior = { entersTapped: true, abilities: [tapFor('U')] };
const shockIsland: Behavior = {
  // It enters tapped; paying 3 life as it enters untaps it (same result as "you may pay 3 life").
  entersTapped: true,
  abilities: [
    tapFor('U'),
    when({ on: 'etb' }, [], {
      kind: 'may',
      effects: [
        { kind: 'loseLife', who: 'controller', amount: 3 },
        { kind: 'untap', what: 'self' },
      ],
    }),
  ],
};

/** Overload {cost}: an alternative cost that changes "target" to "each". */
const overload = (cost: string, each: SpellDef): NonNullable<Behavior['kicker']> => ({
  cost: mana(cost),
  replacesCost: true,
  altLabel: 'overload (each)',
  spell: each,
});

export const BRAWL_15B_U: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Slickshot Lockpicker': {
    abilities: [
      when({ on: 'etb' }, [instantOrSorceryInYourGraveyard], custom('grantFlashback')),
      {
        // Plot {2}{U}: exile it from your hand; cast it free on a later turn, at sorcery speed.
        kind: 'activated',
        cost: { mana: mana('{2}{U}') },
        fromHand: true,
        sorcerySpeed: true,
        targets: [],
        effects: [custom('u15bPlot')],
        label: 'Plot {2}{U}',
      },
    ],
  },
  'Soulblade Djinn': {
    abilities: [when({ on: 'castSpell', filter: 'noncreature' }, [], pump(yours, 1, 1))],
  },
  'Ingenious Prodigy': {
    entersWithXCounters: true,
    abilities: [
      // Skulk: can't be blocked by creatures with greater power.
      {
        kind: 'static',
        effect: { kind: 'cantBeBlockedBy', filter: { greaterPowerThanSource: true } },
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        condition: { kind: 'sourceCounters', min: 1 },
        targets: [],
        effects: [{ kind: 'may', effects: [custom('u15bProdigyDraw')] }],
      },
    ],
  },
  'Hydroelectric Specimen': {
    back: 'hydroelectric-laboratory',
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'spell', filter: { types: ['Instant', 'Sorcery'] }, optional: true }],
        { kind: 'may', effects: [custom('u15bRetarget')] },
      ),
    ],
  },
  'Haughty Djinn': {
    powerEquals: instantsAndSorceriesInGraveyard,
    abilities: [{ kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } }],
  },
  'Murmuring Mystic': {
    abilities: [
      when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'createToken',
        token: SOC_15B_U_BIRD_ILLUSION,
        count: 1,
      }),
    ],
  },
  'Reflective Rimekin': {
    abilities: [
      when({ on: 'etb' }, [], {
        // A one-time boon (Alchemy): from now on, copy your cheap instants and sorceries.
        kind: 'emblem',
        until: 'permanent',
        ability: {
          kind: 'triggered',
          trigger: { on: 'castSpell', filter: 'instantOrSorcery', spell: { maxManaValue: 3 } },
          targets: [],
          effects: [{ kind: 'copySpell', what: 'subject' }],
        },
      }),
    ],
  },

  // ------------------------------------------------------------ counterspells
  Counterspell: spell([anySpell], counter),
  'Spell Pierce': spell([noncreatureSpell], {
    kind: 'counterUnlessPays',
    what: t0,
    cost: mana('{2}'),
  }),
  Syncopate: spell([anySpell], {
    kind: 'counterUnlessPays',
    what: t0,
    cost: mana(''),
    xCost: true,
    exile: true,
  }),
  'Spell Swindle': spell([anySpell], counter, custom('u15bSwindleTreasures')),
  'Essence Capture': spell(
    [
      { what: 'spell', filter: { types: ['Creature'] } },
      { what: 'creature', controller: 'you', optional: true },
    ],
    counter,
    { kind: 'counters', to: t1, amount: 1 },
  ),
  'Wash Away': {
    // Cleave {1}{U}{U}: without the bracketed words, any spell.
    spell: {
      targets: [{ what: 'spell', filter: { notCastFromHand: true } }],
      effects: [counter],
    },
    kicker: {
      cost: mana('{1}{U}{U}'),
      replacesCost: true,
      altLabel: 'cleave',
      spell: { targets: [anySpell], effects: [counter] },
    },
  },
  'Three Steps Ahead': {
    // Spree: any of the modes, each with its own additional cost.
    spree: [mana('{1}{U}'), mana('{3}'), mana('{2}')],
    pawprints: [
      {
        paws: 1,
        spell: { label: 'Counter target spell', targets: [anySpell], effects: [counter] },
      },
      {
        paws: 1,
        spell: {
          label: 'Create a token that’s a copy of target artifact or creature you control',
          targets: [
            { what: 'permanent', controller: 'you', filter: { types: ['Artifact', 'Creature'] } },
          ],
          effects: [{ kind: 'tokenCopy', of: t0 }],
        },
      },
      {
        paws: 1,
        spell: {
          label: 'Draw two cards, then discard a card',
          targets: [],
          effects: [draw(2), discardOne],
        },
      },
    ],
  },

  // ------------------------------------------------------------ cantrips and card selection
  Quicken: spell([], custom('u15bQuicken'), draw(1)),
  Preordain: spell([], { kind: 'scry', amount: 2 }, draw(1)),
  Consider: spell([], { kind: 'surveil', amount: 1 }, draw(1)),
  Deduce: spell([], draw(1), investigate),
  'Stock Up': spell([], { kind: 'lookAndTake', count: 5, filter: {}, followUp: {} }),
  'Experimental Augury': spell(
    [],
    { kind: 'lookAndTake', count: 3, filter: {} },
    custom('u15bProliferate'),
  ),
  "Tezzeret's Gambit": {
    // {3}{U/P}: pay {U} (the cost) or 2 life instead of the blue.
    spell: { targets: [], effects: [draw(2), custom('u15bProliferate')] },
    kicker: { cost: mana('{3}'), replacesCost: true, life: 2, altLabel: 'pay 2 life' },
  },
  'Unexpected Assistance': { convoke: true, ...spell([], draw(3), discardOne) },
  Thoughtcast: {
    // Affinity for artifacts.
    costReduction: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } },
    ...spell([], draw(2)),
  },
  'Treasure Cruise': { delve: true, ...spell([], draw(3)) },
  'Distant Melody': spell([], { kind: 'chooseCreatureType' }, custom('u15bDrawPerChosenType')),
  'Seek New Knowledge': spell([], seekNonland, seekNonland, {
    kind: 'chooseCustom',
    handler: 'u15bBottomFromHand',
  }),
  'Bounty of the Deep': spell([], {
    kind: 'if',
    condition: { kind: 'not', condition: { kind: 'handHas', filter: { types: ['Land'] } } },
    then: [custom('u15bSeekLand'), seekNonland],
    else: [seekNonland, seekNonland],
  }),
  'Sea Gate Restoration': {
    back: 'sea-gate-reborn',
    ...spell(
      [],
      { kind: 'draw', who: 'controller', amount: { sum: [{ count: 'cardsInHand' }, 1] } },
      custom('u15bNoMaxHandSize'),
    ),
  },
  'Silundi Vision': {
    back: 'silundi-isle',
    ...spell([], {
      kind: 'lookAndTake',
      count: 6,
      filter: { types: ['Instant', 'Sorcery'] },
    }),
  },

  // ------------------------------------------------------------ bounce, tempo, protection
  'Sink into Stupor': {
    back: 'soporific-springs',
    modes: [
      {
        label: 'Return target spell an opponent controls to its owner’s hand',
        targets: [{ what: 'spell', controller: 'opponent' }],
        effects: [{ kind: 'returnSpellToHand', what: t0 }],
      },
      {
        label: 'Return target nonland permanent an opponent controls to its owner’s hand',
        targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Cyclonic Rift': {
    spell: {
      targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
      effects: [{ kind: 'bounce', what: t0 }],
    },
    kicker: overload('{6}{U}', {
      targets: [],
      effects: [{ kind: 'bouncePlayerPermanents', who: 'eachOpponent', nonland: true }],
    }),
  },
  "Baral's Expertise": spell(
    [
      { what: 'permanent', filter: { types: ['Artifact', 'Creature'] }, optional: true },
      { what: 'permanent', filter: { types: ['Artifact', 'Creature'] }, optional: true },
      { what: 'permanent', filter: { types: ['Artifact', 'Creature'] }, optional: true },
    ],
    { kind: 'bounce', what: t0 },
    { kind: 'bounce', what: t1 },
    { kind: 'bounce', what: { target: 2 } },
    { kind: 'castFree', what: t0, from: 'hand', filter: { maxManaValue: 4 } },
  ),
  'Stolen by the Fae': {
    targetManaValueX: true,
    ...spell(
      [{ what: 'creature' }],
      { kind: 'bounce', what: t0 },
      {
        kind: 'createToken',
        token: 'faerie-token',
        count: { x: true },
      },
    ),
  },
  'Slip Out the Back': spell(
    [{ what: 'creature' }],
    { kind: 'counters', to: t0, amount: 1 },
    { kind: 'phaseOut', what: t0 },
  ),
  'Mizzium Skin': {
    spell: {
      targets: [{ what: 'creature', controller: 'you' }],
      effects: [pump(t0, 0, 1, ['hexproof'])],
    },
    kicker: overload('{1}{U}', { targets: [], effects: [pump(yours, 0, 1, ['hexproof'])] }),
  },
  'Lazotep Plating': spell([], custom('u15bAmass'), { kind: 'playerHexproof' }),

  // ------------------------------------------------------------ big spells
  'Part the Waterveil': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [{ kind: 'extraTurn' }] },
    kicker: {
      // Awaken 6 {6}{U}{U}{U}.
      cost: mana('{6}{U}{U}{U}'),
      replacesCost: true,
      altLabel: 'awaken 6',
      spell: {
        targets: [{ what: 'permanent', controller: 'you', filter: { types: ['Land'] } }],
        effects: [{ kind: 'extraTurn' }, custom('u15bAwaken')],
      },
    },
  },
  'Rise from the Tides': spell([], {
    kind: 'createToken',
    token: 'zombie-token',
    count: instantsAndSorceriesInGraveyard,
    tapped: true,
  }),
  'Better Offer': spell([{ what: 'player', controller: 'opponent' }], custom('u15bBetterOffer')),
  'Mass Manipulation': {
    // Simplification: at most three targets.
    upToXTargets: true,
    spell: {
      targets: [
        { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } },
        { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] }, optional: true },
        { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] }, optional: true },
      ],
      effects: [
        { kind: 'gainControl', what: t0, permanent: true },
        { kind: 'gainControl', what: t1, permanent: true },
        { kind: 'gainControl', what: { target: 2 }, permanent: true },
      ],
    },
  },
  Expropriate: {
    afterResolving: 'exile',
    ...spell([], {
      kind: 'chooseCustom',
      handler: 'u15bVote',
      params: { stage: 0, votes: [] },
    }),
  },
  Housemeld: spell([{ what: 'creature' }], custom('u15bHousemeld')),

  // ------------------------------------------------------------ lands
  'Snow-Covered Island': {},
  'Thriving Isle': {
    entersTapped: true,
    abilities: [
      when({ on: 'etb' }, [], { kind: 'chooseColor', except: 'U' }),
      tapFor('U'),
      ...(['W', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
    ],
  },
  'Gate to Seatower': {
    entersTapped: true,
    abilities: [
      tapFor('U'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}'), tapSelf: true },
        once: true,
        targets: [],
        effects: [seekNonland],
        label: '{3}{U}, {T}: seek a nonland card',
      },
    ],
  },
  'Mystic Sanctuary': {
    entersTappedIf: {
      kind: 'not',
      condition: {
        kind: 'controlsPermanents',
        filter: { types: ['Land'], subtype: 'Island' },
        min: 3,
      },
    },
    abilities: [
      tapFor('U'),
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'not', condition: { kind: 'sourceTapped' } },
        targets: [{ ...instantOrSorceryInYourGraveyard, optional: true }],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'top' }],
      },
    ],
  },
};

/** Back faces of the double-faced cards above. */
export const BRAWL_15B_U_BACKS: Record<string, Behavior> = {
  'Silundi Isle': tappedIsland,
  'Soporific Springs': shockIsland,
  'Sea Gate, Reborn': shockIsland,
  'Hydroelectric Laboratory': shockIsland,
};
