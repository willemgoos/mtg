import type {
  AbilityDef,
  Amount,
  CardDefinition,
  EffectDef,
  Keyword,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew } from '../msh/helpers.ts';
import {
  chapter,
  draw,
  equip,
  equipped,
  gain,
  jobSelect,
  mana,
  onEnter,
  spell,
  t0,
  t1,
  theirCreature,
  yourCreature,
  yours,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) 11c, group 1: the white, blue, black and colourless
 * rares and mythics (and their back faces). Printed characteristics come from
 * Scryfall; only rules text lives here.
 */

const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const pump = (to: Ref, power: number, toughness: number, keywords?: Keyword[]): EffectDef => ({
  kind: 'pump',
  to,
  power,
  toughness,
  ...(keywords ? { keywords } : {}),
});

const counter = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const costLess = (color: 'W' | 'U' | 'B'): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'spellsCostLess', filter: { colors: [color] }, amount: 1 },
});
const others = { each: 'creature', controller: 'you', filter: { other: true } } as const;
const anotherOfYours: TargetSpec = { what: 'creature', controller: 'you', filter: { other: true } };
const thatMuch: Amount = { event: 'amount' };
const MOOGLE = 'fin-moogle-token';
/** "Kraken, Leviathan, Merfolk, Octopus, or Serpent" (Summon: Leviathan). */
const SEA = ['Kraken', 'Leviathan', 'Merfolk', 'Octopus', 'Serpent'];

/** "You may sacrifice another creature. If you do, draw a card." (Sephiroth). */
const maySacrificeToDraw: EffectDef = {
  kind: 'if',
  condition: { kind: 'controlsCreature', filter: { other: true } },
  then: [
    {
      kind: 'may',
      effects: [
        { kind: 'sacrificeSeveral', count: 1, filter: { types: ['Creature'] }, then: [draw(1)] },
      ],
    },
  ],
};

/** Sephiroth's Super Nova emblem: "Whenever a creature dies, target opponent loses 1 life and you gain 1 life." */
const superNova: AbilityDef = triggered(
  { on: 'otherCreatureDies', controller: 'any' },
  [{ what: 'player', controller: 'opponent' }],
  { kind: 'loseLife', who: t0, amount: 1 },
  gain(1),
);

// --------------------------------------------------------------------------- White

const WHITE: Record<string, Behavior> = {
  'Aerith Gainsborough': {
    abilities: [
      triggered({ on: 'youGainLife' }, [], counter('self')),
      triggered({ on: 'dies' }, [], {
        kind: 'counters',
        to: { each: 'creature', controller: 'you', filter: { supertypes: ['Legendary'] } },
        amount: { countersOn: 'self' },
      }),
    ],
  },
  // "If they do" checks the permanent is still yours as it resolves.
  'Stiltzkin, Moogle Merchant': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [
          { what: 'player', controller: 'opponent' },
          { what: 'permanent', controller: 'you', filter: { other: true } },
        ],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'targetControlledByYou', target: 1 },
            then: [{ kind: 'giveControl', what: t1, to: 'eachOpponent' }, draw(1)],
          },
        ],
        label: 'Give away a permanent, draw a card',
      },
    ],
  },
  'From Father to Son': {
    ...spell([], { kind: 'searchLibrary', filter: { subtype: 'Vehicle' }, to: 'hand' }),
    flashback: mana('{4}{W}{W}{W}'),
    flashbackSpell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: { subtype: 'Vehicle' }, to: 'battlefield' }],
    },
  },
  'The Wind Crystal': {
    abilities: [
      costLess('W'),
      { kind: 'static', effect: { kind: 'doubleLifeGain' } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}{W}'), tapSelf: true },
        targets: [],
        effects: [pump(yours, 0, 0, ['flying', 'lifelink'])],
        label: 'Creatures gain flying and lifelink',
      },
    ],
  },
  'Venat, Heart of Hydaelyn': {
    abilities: [
      {
        ...triggered(
          { on: 'castSpell', filter: 'any', spell: { supertypes: ['Legendary'] } },
          [],
          draw(1),
        ),
        oncePerTurn: true,
      } as AbilityDef,
      {
        kind: 'activated',
        cost: { mana: mana('{7}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'permanent', filter: { nonland: true } }],
        effects: [
          { kind: 'exile', what: t0 },
          { kind: 'transform', what: 'self' },
        ],
        label: "Hero's Sundering",
      },
    ],
  },
  'Cloud, Midgar Mercenary': {
    abilities: [
      onEnter({ kind: 'searchLibrary', filter: { subtype: 'Equipment' }, to: 'hand' }),
      { kind: 'static', effect: { kind: 'equippedTriggersTwice' } },
    ],
  },
  Ultima: {
    ...spell(
      [],
      { kind: 'destroyAll', permanents: true, filter: { types: ['Artifact', 'Creature'] } },
      { kind: 'custom', handler: 'endTheTurn' },
    ),
    afterResolving: 'exile',
  },
  'Summon: Knights of Round': {
    saga: 5,
    abilities: [
      chapter([1, 2, 3, 4], [], { kind: 'createToken', token: 'fin-knight-token', count: 3 }),
      chapter([5], [], pump(others, 2, 2), {
        kind: 'namedCounters',
        name: 'indestructible',
        amount: 1,
        to: others,
      }),
    ],
  },
  "Moogles' Valor": spell(
    [],
    { kind: 'createToken', token: MOOGLE, count: { count: 'creaturesYouControl' } },
    pump(yours, 0, 0, ['indestructible']),
  ),
  'Minwu, White Mage': {
    abilities: [
      triggered(
        { on: 'youGainLife' },
        [],
        counter({ each: 'creature', controller: 'you', filter: { subtype: 'Cleric' } }),
      ),
    ],
  },
};

/** Back faces (not cards of their own). */
const WHITE_BACKS: Record<string, Behavior> = {
  'Hydaelyn, the Mothercrystal': {
    abilities: [
      triggered(
        { on: 'beginningOfCombat', whose: 'yours' },
        [anotherOfYours],
        counter(t0),
        {
          kind: 'pump',
          to: t0,
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
          untilYourNextTurn: true,
        },
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { supertypes: ['Legendary'] } },
          then: [draw(1)],
        },
      ),
    ],
  },
};

// --------------------------------------------------------------------------- Blue

const WATER_CRYSTAL_MILL: EffectDef = { kind: 'custom', handler: 'opponentMillsHandSize' };

/**
 * Memories Returning: you take one of the top five, the opponent bottoms one,
 * you take one, they bottom one, you get the last.
 */
const memoriesReturning: EffectDef[] = [
  { kind: 'lookAndTake', count: 5, filter: {}, restOnTop: true },
  { kind: 'custom', handler: 'opponentBottomsOne', params: { count: 4 } },
  { kind: 'lookAndTake', count: 3, filter: {}, restOnTop: true },
  { kind: 'custom', handler: 'opponentBottomsOne', params: { count: 2 } },
  { kind: 'custom', handler: 'topCardToHand' },
];

const BLUE: Record<string, Behavior> = {
  'Matoya, Archon Elder': { abilities: [triggered({ on: 'youScryOrSurveil' }, [], draw(1))] },
  // X is at least 1 in the cast menu only in spirit: X = 0 copies nothing.
  'Gogo, Master of Mimicry': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{X}{X}'), tapSelf: true },
        targets: [{ what: 'spell', controller: 'you', abilitiesOnly: true }],
        effects: [{ kind: 'custom', handler: 'copyTargetAbility' }],
        label: '{X}{X}, {T}: Copy an ability X times',
      },
    ],
  },
  "Louisoix's Sacrifice": {
    ...spell([{ what: 'spell', abilities: true, filter: { notTypes: ['Creature'] } }], {
      kind: 'counter',
      what: t0,
    }),
    sacrificeOrPay: mana('{2}'),
    sacrificeToCastFilter: { supertypes: ['Legendary'] },
  },
  'Summon: Leviathan': {
    saga: 3,
    abilities: [
      chapter([1], [], {
        kind: 'bounce',
        what: { each: 'creature', filter: { notSubtypes: SEA } },
      }),
      chapter([2, 3], [], {
        kind: 'emblem',
        until: 'endOfTurn',
        ability: triggered(
          { on: 'creatureYouControlAttacks', filter: { subtypes: SEA } },
          [],
          draw(1),
        ),
      }),
    ],
  },
  "Y'shtola Rhul": {
    abilities: [
      triggered(
        { on: 'beginningOfEndStep', whose: 'yours' },
        [yourCreature],
        { kind: 'blink', what: t0 },
        {
          kind: 'if',
          condition: { kind: 'firstEndStep' },
          then: [{ kind: 'custom', handler: 'extraEndStep' }],
        },
      ),
    ],
  },
  'The Water Crystal': {
    abilities: [
      costLess('U'),
      { kind: 'static', effect: { kind: 'opponentsMillMore', amount: 4 } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{U}{U}'), tapSelf: true },
        targets: [],
        effects: [WATER_CRYSTAL_MILL],
        label: 'Opponent mills your hand size',
      },
    ],
  },
  // The counters are put on the Equipment's creature (the triggers live on the Equipment).
  "Astrologian's Planisphere": {
    abilities: [
      jobSelect,
      equipped(0, 0, 'Wizard'),
      triggered({ on: 'castSpell', filter: 'noncreature' }, [], counter('attached')),
      triggered({ on: 'drawThirdCard' }, [], counter('attached')),
      equip('{2}', undefined, 'Diana — Equip {2}'),
    ],
  },
  'Memories Returning': { ...spell([], ...memoriesReturning), flashback: mana('{7}{U}{U}') },
  'The Lunar Whale': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'playFromTop', filter: {}, condition: { kind: 'sourceAttackedThisTurn' } },
      },
      crew(1),
    ],
  },
};

// --------------------------------------------------------------------------- Black

const BLACK: Record<string, Behavior> = {
  'Cecil, Dark Knight': {
    abilities: [
      triggered(
        { on: 'dealsDamage' },
        [],
        { kind: 'loseLife', who: 'controller', amount: thatMuch },
        {
          kind: 'if',
          condition: { kind: 'lifeAtMostHalfStarting' },
          then: [
            { kind: 'untap', what: 'self' },
            { kind: 'transform', what: 'self' },
          ],
        },
      ),
    ],
  },
  'Vincent Valentine': {
    abilities: [
      triggered({ on: 'otherCreatureDies', controller: 'opponent' }, [], counter('self', thatMuch)),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        optional: true,
        effects: [{ kind: 'transform', what: 'self' }],
      },
    ],
  },
  // The creature card to return is chosen as the ability resolves.
  'The Darkness Crystal': {
    abilities: [
      costLess('B'),
      { kind: 'static', effect: { kind: 'exileOpponentNontokenCreatures', life: 2 } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{B}{B}'), tapSelf: true },
        condition: { kind: 'sourceHasExiled' },
        targets: [],
        effects: [
          {
            kind: 'putExiledWithSource',
            filter: { types: ['Creature'] },
            tapped: true,
            counters: 2,
          },
        ],
        label: 'Return an exiled creature',
      },
    ],
  },
  'Jecht, Reluctant Guardian': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [],
        optional: true,
        effects: [{ kind: 'blink', what: 'self', transformed: true }],
      },
    ],
  },
  'Kain, Traitorous Dragoon': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
      triggered(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'giveControl', what: 'self', to: 'eachOpponent' },
        { kind: 'draw', who: 'controller', amount: thatMuch },
        { kind: 'createToken', token: 'treasure-token', count: thatMuch, tapped: true },
        { kind: 'loseLife', who: 'controller', amount: thatMuch },
      ),
    ],
  },
  'Zodiark, Umbral God': {
    abilities: [
      onEnter({ kind: 'eachPlayerSacrificesHalf', filter: { notSubtype: 'God' } }),
      triggered({ on: 'playerSacrificesCreature' }, [], counter('self')),
    ],
  },
  // The token keeps the card's colours and adds Demon to its creature types.
  'Ardyn, the Usurper': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Demon' },
          power: 0,
          toughness: 0,
          keywords: ['menace', 'lifelink', 'haste'],
        },
      },
      triggered(
        { on: 'beginningOfCombat', whose: 'yours' },
        [{ what: 'graveyardCard', filter: { types: ['Creature'] }, optional: true }],
        {
          kind: 'tokenCopyOf',
          what: t0,
          addSubtype: 'Demon',
          exileOtherTokensWithSubtype: false,
          pt: [5, 5],
        },
      ),
    ],
  },
  // The creature is chosen as a target. Others get -2/-2; the chosen one gets it back.
  'Zenos yae Galvus': {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ ...theirCreature, optional: true }],
        { kind: 'custom', handler: 'rememberTarget' },
        pump({ each: 'creature', filter: { other: true } }, -2, -2),
        pump(t0, 2, 2),
      ),
      triggered({ on: 'chosenLeaves' }, [], { kind: 'transform', what: 'self' }),
    ],
  },
  'Sephiroth, Fabled SOLDIER': {
    abilities: [
      onEnter(maySacrificeToDraw),
      triggered({ on: 'attacks' }, [], maySacrificeToDraw),
      triggered(
        { on: 'otherCreatureDies', controller: 'any' },
        [{ what: 'player', controller: 'opponent' }],
        { kind: 'loseLife', who: t0, amount: 1 },
        gain(1),
        { kind: 'noteResolution' },
        {
          kind: 'if',
          condition: { kind: 'resolvedThisTurn', n: 4 },
          then: [
            { kind: 'transform', what: 'self' },
            {
              kind: 'if',
              condition: {
                kind: 'controlsCreature',
                filter: { named: 'sephiroth-one-winged-angel' },
              },
              then: [{ kind: 'emblem', until: 'permanent', ability: superNova }],
            },
          ],
        },
      ),
    ],
  },
  'Summon: Primal Odin': {
    saga: 3,
    abilities: [
      chapter([1], [theirCreature], { kind: 'destroy', what: t0 }),
      chapter([3], [], draw(2), { kind: 'loseLife', who: 'eachPlayer', amount: 2 }),
      // Zantetsuken (chapter II): it has this once it has two lore counters.
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        condition: { kind: 'amountAtLeast', amount: { namedCountersOnSource: 'lore' }, min: 2 },
        targets: [],
        effects: [{ kind: 'custom', handler: 'opponentLosesGame' }],
      },
    ],
  },
  "Ninja's Blades": {
    abilities: [
      jobSelect,
      equipped(1, 1, 'Ninja'),
      triggered(
        { on: 'equippedDealsCombatDamageToPlayer' },
        [],
        draw(1),
        { kind: 'discard', count: 1 },
        { kind: 'custom', handler: 'loseLifeByDiscarded' },
      ),
      equip('{2}', undefined, 'Mutsunokami — Equip {2}'),
    ],
  },
};

/** Back faces (not cards of their own). */
const BLACK_BACKS: Record<string, Behavior> = {
  'Cecil, Redeemed Paladin': {
    abilities: [
      triggered(
        { on: 'attacks' },
        [],
        pump(
          { each: 'creature', controller: 'you', filter: { attacking: true, other: true } },
          0,
          0,
          ['indestructible'],
        ),
      ),
    ],
  },
  'Galian Beast': {
    abilities: [
      triggered({ on: 'dies' }, [], { kind: 'returnSource', to: 'battlefield', tapped: true }),
    ],
  },
  "Braska's Final Aeon": {
    saga: 3,
    abilities: [
      chapter([1, 2], [], { kind: 'discard', count: 1, who: 'eachOpponent' }, draw(1)),
      chapter([3], [], { kind: 'opponentSacrifices' }, { kind: 'opponentSacrifices' }),
    ],
  },
  // With two players, "when the chosen player loses the game, you win" changes nothing.
  'Shinryu, Transcendent Rival': { abilities: [] },
  'Sephiroth, One-Winged Angel': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'repeat',
        count: { count: 'creaturesYouControl', other: true },
        effects: [maySacrificeToDraw],
      }),
    ],
  },
};

// --------------------------------------------------------------------------- Colourless

const COLORLESS: Record<string, Behavior> = {
  'Aettir and Priwen': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, basePTAmount: { count: 'lifeTotal' } },
      },
      equip('{5}'),
    ],
  },
  'Ultima, Origin of Oblivion': {
    abilities: [
      triggered({ on: 'attacks' }, [{ what: 'permanent', filter: { types: ['Land'] } }], {
        kind: 'namedCounters',
        name: 'blight',
        amount: 1,
        to: t0,
      }),
      { kind: 'static', effect: { kind: 'extraColorlessFromLands' } },
    ],
  },
  'Buster Sword': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 2 } },
      triggered({ on: 'equippedDealsCombatDamageToPlayer' }, [], draw(1), {
        kind: 'castFree',
        what: 'self',
        from: 'hand',
        maxManaValue: thatMuch,
      }),
      equip('{2}'),
    ],
  },
  'Summon: Bahamut': {
    saga: 4,
    abilities: [
      chapter([1, 2], [{ what: 'permanent', filter: { nonland: true }, optional: true }], {
        kind: 'destroy',
        what: t0,
      }),
      chapter([3], [], draw(2)),
      chapter([4], [], {
        kind: 'damage',
        amount: { count: 'totalManaValue', filter: { other: true } },
        to: 'eachOpponent',
      }),
    ],
  },
  'The Masamune': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          attackingKeywords: ['firstStrike'],
          mustBeBlockedAttacking: true,
          deathTriggersTwice: true,
        },
      },
      equip('{2}'),
    ],
  },
  'Excalibur II': {
    abilities: [
      triggered({ on: 'youGainLife' }, [], { kind: 'namedCounters', name: 'charge', amount: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: { namedCountersOnSource: 'charge' },
          toughness: { namedCountersOnSource: 'charge' },
        },
      },
      equip('{3}'),
    ],
  },
  'The Regalia': {
    abilities: [
      triggered({ on: 'attacks' }, [], {
        kind: 'revealUntil',
        filter: { types: ['Land'] },
        to: 'battlefieldTapped',
      }),
      crew(1),
    ],
  },
  'Genji Glove': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, keywords: ['doubleStrike'] },
      },
      {
        kind: 'triggered',
        trigger: { on: 'equippedAttacks' },
        condition: { kind: 'firstCombatPhase' },
        targets: [],
        effects: [{ kind: 'untap', what: 'attached' }, { kind: 'extraCombat' }],
      },
      equip('{3}'),
    ],
  },
};

export const RARES_1: Record<string, Behavior> = { ...WHITE, ...BLUE, ...BLACK, ...COLORLESS };
export const RARES_1_BACKS: Record<string, Behavior> = { ...WHITE_BACKS, ...BLACK_BACKS };

export const RARES_1_TOKENS: CardDefinition[] = [
  {
    id: MOOGLE,
    name: 'Moogle',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Moogle'],
    power: 1,
    toughness: 2,
    keywords: ['lifelink'],
    abilities: [],
    isToken: true,
  },
];
