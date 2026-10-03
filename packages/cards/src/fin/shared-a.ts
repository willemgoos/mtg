import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  EffectDef,
  Keyword,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew } from '../msh/helpers.ts';
import {
  basicOrTown,
  chapter,
  creature,
  draw,
  equip,
  equipped,
  gain,
  hero,
  jobSelect,
  landcycling,
  mana,
  mayRummage,
  mode,
  onEnter,
  returnTransformed,
  spell,
  t0,
  t1,
  t2,
  tapFor,
  theirCreature,
  tiered,
  yourCreature,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) 11b, group A: the mono-coloured and colourless cards of
 * Highwind Workshop (W/U), Time Compression (U/B), Black Mages' Waltz (B/R)
 * and Chocobo Stampede (R/G). The gold cards live in artifacts-graveyard.ts
 * and spells-landfall.ts. Printed characteristics come from Scryfall; only
 * rules text lives here.
 */

const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const pump = (to: Ref, power: Amount, toughness: Amount, keywords?: Keyword[]): EffectDef => ({
  kind: 'pump',
  to,
  power,
  toughness,
  ...(keywords ? { keywords } : {}),
});

/** "This gets +P/+T as long as ..." */
const controls = (filter: CardFilter, min: number) =>
  ({ kind: 'controlsPermanents', filter, min }) as const;
const whileThen = (
  filter: CardFilter,
  min: number,
  power: number,
  toughness: number,
): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'while', condition: controls(filter, min), power, toughness },
});

const artifact: CardFilter = { types: ['Artifact'] };
const artifactOrCreature: CardFilter = { types: ['Artifact', 'Creature'] };
const artifactsYouControl: Amount = { count: 'permanentsYouControl', filter: artifact };
const wizards = { each: 'creature', controller: 'you', filter: { subtype: 'Wizard' } } as const;
const birds = { each: 'creature', controller: 'you', filter: { subtype: 'Bird' } } as const;
const attackers = { each: 'creature', controller: 'you', filter: { attacking: true } } as const;

const token = (id: string, count: Amount = 1, extra: Partial<EffectDef> = {}): EffectDef =>
  ({ kind: 'createToken', token: id, count, ...extra }) as EffectDef;
const WIZARD = 'fin-wizard-token';
const BIRD = 'fin-bird-token';
const treasure = token('treasure-token');
const wizard = token(WIZARD);
const bird = token(BIRD);
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const stun: EffectDef = { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 };
const loseLife = (amount: number, who: Ref = 'controller'): EffectDef => ({
  kind: 'loseLife',
  who,
  amount,
});
/** "You may draw a card. If you do, discard a card." */
const mayLoot: EffectDef = {
  kind: 'may',
  effects: [draw(1), { kind: 'discard', count: 1 }],
};
const landfall = (targets: TargetSpec[], ...effects: EffectDef[]) =>
  triggered({ on: 'landfall' }, targets, ...effects);
const noncreatureCast = { on: 'castSpell', filter: 'noncreature' } as const;

/** Tokens made by these cards. */
export const SHARED_A_TOKENS: CardDefinition[] = [
  {
    id: 'fin-robot-warrior-token',
    name: 'Robot Warrior',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Robot', 'Warrior'],
    power: 3,
    toughness: 3,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  {
    id: 'fin-horror-token',
    name: 'Horror',
    manaCost: { generic: 0, colored: {} },
    colors: ['B'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Horror'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];

export const SHARED_A: Record<string, Behavior> = {
  // ------------------------------------------------------------------ white
  'Magitek Infantry': {
    abilities: [
      whileThen({ ...artifact, other: true }, 1, 1, 0),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [
          { kind: 'searchLibrary', filter: { named: 'magitek-infantry' }, to: 'battlefieldTapped' },
        ],
        label: 'Search for a Magitek Infantry',
      },
    ],
  },
  Gaelicat: { abilities: [whileThen(artifact, 2, 2, 0)] },
  'Magitek Armor': { abilities: [onEnter(hero()), crew(1)] },
  // Searches the library only (not the graveyard).
  'Delivery Moogle': {
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: { ...artifact, maxManaValue: 2 },
        to: 'hand',
      }),
    ],
  },
  'Cloudbound Moogle': {
    abilities: [
      triggered({ on: 'etb' }, [creature], { kind: 'counters', to: t0, amount: 1 }),
      landcycling('Plains'),
    ],
  },
  'Ashe, Princess of Dalmasca': {
    abilities: [
      triggered({ on: 'attacks' }, [], { kind: 'lookAndTake', count: 5, filter: artifact }),
    ],
  },
  'White Auracite': {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      ...tapFor('W'),
    ],
  },
  'Aerith Rescue Mission': {
    modes: [
      mode('Take the Elevator', [], hero(3)),
      mode(
        'Take 59 Flights of Stairs',
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        { kind: 'tap', what: t0 },
        { kind: 'tap', what: t1 },
        { kind: 'tap', what: t2 },
        stun,
      ),
    ],
  },
  // The two modes are two abilities with the same cost.
  'Phoenix Down': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true, exileSelf: true },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 4 },
          },
        ],
        effects: [
          { kind: 'returnToBattlefield', what: t0 },
          { kind: 'tap', what: 'chosen' },
        ],
        label: 'Return a creature card',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true, exileSelf: true },
        targets: [{ what: 'permanent', filter: { subtypes: ['Skeleton', 'Spirit', 'Zombie'] } }],
        effects: [{ kind: 'exile', what: t0 }],
        label: 'Exile a Skeleton, Spirit or Zombie',
      },
    ],
  },
  "Auron's Inspiration": { ...spell([], pump(attackers, 2, 0)), flashback: mana('{2}{W}{W}') },

  // ------------------------------------------------------------------- blue
  "Dragoon's Wyvern": { abilities: [onEnter(hero())] },
  'Rook Turret': {
    abilities: [triggered({ on: 'otherPermanentEtb', filter: artifact }, [], mayLoot)],
  },
  // The coin-flip ability isn't modelled (no coins in these decks).
  'Edgar, King of Figaro': {
    abilities: [onEnter({ kind: 'draw', who: 'controller', amount: artifactsYouControl })],
  },
  'Valkyrie Aerial Unit': {
    costReduction: artifactsYouControl,
    abilities: [onEnter(surveil(2))],
  },
  "Thief's Knife": {
    abilities: [
      jobSelect,
      equipped(1, 1, 'Rogue'),
      triggered({ on: 'equippedDealsCombatDamageToPlayer' }, [], draw(1)),
      equip('{4}'),
    ],
  },
  "Sage's Nouliths": {
    abilities: [
      jobSelect,
      equipped(1, 0, 'Cleric'),
      triggered({ on: 'equippedAttacks' }, [{ what: 'creature', filter: { attacking: true } }], {
        kind: 'untap',
        what: t0,
      }),
      equip('{3}', undefined, 'Hagneia — Equip {3}'),
    ],
  },
  // Blizzara: the owner puts it on top (not their choice of top or bottom).
  'Ice Magic': tiered(
    ['{0}', mode('Blizzard', [creature], { kind: 'bounce', what: t0 })],
    ['{2}', mode('Blizzara', [creature], { kind: 'putInLibrary', what: t0, position: 'top' })],
    [
      '{5}{U}',
      mode('Blizzaga', [creature], {
        kind: 'putInLibrary',
        what: t0,
        position: 'top',
        shuffle: true,
      }),
    ],
  ),
  'Combat Tutorial': spell(
    [{ what: 'player' }, { what: 'creature', controller: 'you', optional: true }],
    { kind: 'draw', who: t0, amount: 2 },
    { kind: 'counters', to: t1, amount: 1 },
  ),
  Eject: {
    uncounterable: true,
    ...spell(
      [{ what: 'permanent', filter: { nonland: true } }],
      { kind: 'bounce', what: t0 },
      draw(1),
    ),
  },
  'Magic Damper': spell([yourCreature], pump(t0, 1, 1, ['hexproof']), { kind: 'untap', what: t0 }),
  'Retrieve the Esper': {
    ...spell([], token('fin-robot-warrior-token')),
    flashback: mana('{5}{U}'),
    flashbackSpell: {
      targets: [],
      effects: [token('fin-robot-warrior-token', 1, { counters: 2 })],
    },
  },
  "Jill, Shiva's Dominant": {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ what: 'permanent', filter: { nonland: true, other: true }, optional: true }],
        { kind: 'bounce', what: t0 },
      ),
      returnTransformed('{3}{U}{U}', true),
    ],
  },
  'Il Mheg Pixie': { abilities: [triggered({ on: 'attacks' }, [], surveil(1))] },
  'Dreams of Laguna': { ...spell([], surveil(1), draw(1)), flashback: mana('{3}{U}') },
  'Summon: Shiva': {
    saga: 3,
    abilities: [
      chapter([1, 2], [theirCreature], { kind: 'tap', what: t0 }, stun),
      chapter([3], [], {
        kind: 'draw',
        who: 'controller',
        amount: {
          count: 'permanentsOpponentsControl',
          filter: { types: ['Creature'], tapped: true },
        },
      }),
    ],
  },
  'Ice Flan': {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: artifactOrCreature }],
        { kind: 'tap', what: t0 },
        stun,
      ),
      landcycling('Island'),
    ],
  },

  // ------------------------------------------------------------------ black
  Hecteyes: { abilities: [onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' })] },
  'Dark Confidant': {
    abilities: [
      triggered({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
        kind: 'revealTopToHandLoseLife',
      }),
    ],
  },
  'Undercity Dire Rat': { abilities: [triggered({ on: 'dies' }, [], treasure)] },
  'Shinra Reinforcements': { abilities: [onEnter({ kind: 'mill', count: 3 }, gain(3))] },
  Ahriman: {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), sacrificePermanent: { ...artifactOrCreature, other: true } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // "From a single graveyard" isn't checked.
  'Qutrub Forayer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          mode('Destroy a damaged creature', [{ what: 'creature', filter: { damaged: true } }], {
            kind: 'destroy',
            what: t0,
          }),
          mode(
            'Exile up to two cards from a graveyard',
            [
              { what: 'graveyardCard', optional: true },
              { what: 'graveyardCard', optional: true },
            ],
            { kind: 'exileGraveyardCard', what: t0 },
            { kind: 'exileGraveyardCard', what: t1 },
          ),
        ],
      },
    ],
  },
  'Namazu Trader': {
    abilities: [
      onEnter(loseLife(1), treasure),
      triggered({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: { ...artifactOrCreature, other: true },
            then: [{ kind: 'sacrifice', what: 'chosen' }, surveil(2)],
          },
        ],
      }),
    ],
  },
  Malboro: {
    abilities: [
      onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' }, loseLife(2, 'eachOpponent'), {
        kind: 'exileTopWithSource',
        count: 3,
        who: 'eachOpponent',
      }),
      landcycling('Swamp'),
    ],
  },
  'Resentful Revelation': {
    ...spell([], { kind: 'lookTakeRestGraveyard', count: 3, take: 1 }),
    flashback: mana('{6}{B}'),
  },
  "Sephiroth's Intervention": spell([creature], { kind: 'destroy', what: t0 }, gain(2)),
  "Vayne's Treachery": {
    ...spell([creature], pump(t0, -2, -2)),
    kicker: {
      cost: { generic: 0, colored: {} },
      sacrifice: artifactOrCreature,
      spell: { targets: [creature], effects: [pump(t0, -6, -6)] },
    },
  },
  'Fight On!': spell(
    [
      { what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] }, optional: true },
      { what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] }, optional: true },
    ],
    { kind: 'returnToHand', what: t0 },
    { kind: 'returnToHand', what: t1 },
  ),
  'Evil Reawakened': spell(
    [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
    { kind: 'returnToBattlefield', what: t0 },
    { kind: 'counters', to: 'chosen', amount: 2 },
  ),
  Overkill: spell([creature], pump(t0, 0, -9999)),
  'The Final Days': {
    ...spell([], token('fin-horror-token', 2, { tapped: true })),
    flashback: mana('{4}{B}{B}'),
    flashbackSpell: {
      targets: [],
      effects: [
        token(
          'fin-horror-token',
          { count: 'cardsInGraveyard', types: ['Creature'] },
          { tapped: true },
        ),
      ],
    },
  },
  'Summon: Anima': {
    saga: 4,
    abilities: [
      chapter([1, 2, 3], [], draw(1), loseLife(1)),
      chapter([4], [], { kind: 'opponentSacrifices' }, loseLife(3, 'eachOpponent')),
    ],
  },
  "Black Mage's Rod": {
    abilities: [
      jobSelect,
      equipped(1, 0, 'Wizard'),
      triggered(noncreatureCast, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
        from: 'attached',
      }),
      equip('{3}'),
    ],
  },
  'Cornered by Black Mages': spell([], { kind: 'opponentSacrifices' }, wizard),
  'Circle of Power': spell([], draw(2), loseLife(2), wizard, pump(wizards, 1, 0, ['lifelink'])),
  "Shambling Cie'th": {
    entersTapped: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: noncreatureCast,
        fromGraveyard: true,
        cost: mana('{B}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },

  // -------------------------------------------------------------------- red
  'Mysidian Elder': { abilities: [onEnter(wizard)] },
  'Queen Brahne': { abilities: [triggered({ on: 'attacks' }, [], wizard)] },
  'Summon: G.F. Ifrit': {
    saga: 4,
    abilities: [
      chapter([1, 2], [], mayRummage),
      chapter([3, 4], [], { kind: 'addMana', mana: [['R']] }),
    ],
  },
  'Summon: Esper Ramuh': {
    saga: 3,
    abilities: [
      chapter([1], [theirCreature], {
        kind: 'damage',
        amount: { count: 'cardsInGraveyard', notTypes: ['Creature', 'Land'] },
        to: t0,
      }),
      chapter([2, 3], [], pump(wizards, 1, 0)),
    ],
  },
  Suplex: {
    modes: [
      mode(
        'Suplex',
        [creature],
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 3, to: t0 },
      ),
      mode('Exile target artifact', [{ what: 'permanent', filter: artifact }], {
        kind: 'exile',
        what: t0,
      }),
    ],
  },
  'Laughing Mad': { discardToCast: true, ...spell([], draw(2)), flashback: mana('{3}{R}') },
  'Choco-Comet': spell([{ what: 'any' }], { kind: 'damage', amount: { x: true }, to: t0 }, bird),
  Sabotender: { abilities: [landfall([], { kind: 'damage', amount: 1, to: 'eachOpponent' })] },
  'Hill Gigas': { abilities: [landcycling('Mountain')] },
  'Call the Mountain Chocobo': {
    ...spell([], { kind: 'searchLibrary', filter: { subtype: 'Mountain' }, to: 'hand' }, bird),
    flashback: mana('{5}{R}'),
  },

  // ------------------------------------------------------------------ green
  "Sazh's Chocobo": { abilities: [landfall([], { kind: 'counters', to: 'self', amount: 1 })] },
  Gigantoad: { abilities: [whileThen({ types: ['Land'] }, 7, 2, 2)] },
  'Sazh Katzroy': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [
          {
            kind: 'searchLibrary',
            filter: {
              anyOf: [{ subtype: 'Bird' }, { types: ['Land'], supertypes: ['Basic'] }],
            },
            to: 'hand',
          },
        ],
      }),
      triggered(
        { on: 'attacks' },
        [creature],
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'counters', to: t0, amount: { countersOn: t0 } },
      ),
    ],
  },
  'Gysahl Greens': { ...spell([], bird), flashback: mana('{6}{G}') },
  'Sidequest: Raise a Chocobo': {
    abilities: [
      onEnter(bird),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        condition: controls({ types: ['Creature'], subtype: 'Bird' }, 4),
        targets: [],
        effects: [
          { kind: 'transform', what: 'self' },
          { kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'battlefieldTapped' },
        ],
      },
    ],
  },
  // "{5}{G}{G}: This enchantment becomes a 7/7 Beast creature" isn't modelled.
  'Ride the Shoopuf': {
    abilities: [landfall([yourCreature], { kind: 'counters', to: t0, amount: 1 })],
  },
  'Chocobo Racetrack': { abilities: [landfall([], bird)] },
  'Chocobo Kick': {
    ...spell([yourCreature, theirCreature], {
      kind: 'damage',
      amount: { powerOf: t0 },
      to: t1,
      from: t0,
    }),
    kicker: {
      cost: { generic: 0, colored: {} },
      returnLand: true,
      spell: {
        targets: [yourCreature, theirCreature],
        effects: [
          {
            kind: 'damage',
            amount: { multiply: 2, amount: { powerOf: t0 } },
            to: t1,
            from: t0,
          },
        ],
      },
    },
  },
  // "With different names" isn't checked.
  'Reach the Horizon': spell([], {
    kind: 'repeat',
    count: 2,
    effects: [{ kind: 'searchLibrary', filter: basicOrTown, to: 'battlefieldTapped' }],
  }),
  'Commune with Beavers': spell([], {
    kind: 'lookAndTake',
    count: 3,
    filter: { types: ['Artifact', 'Creature', 'Land'] },
  }),

  // -------------------------------------------------------------- colourless
  'Instant Ramen': {
    abilities: [
      onEnter(draw(1)),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain(3)],
      },
    ],
  },
  'Lunatic Pandora': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [surveil(1)],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{6}'), tapSelf: true, sacrificeSelf: true },
        targets: [{ what: 'permanent', filter: { nonland: true } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
};

export const SHARED_A_BACKS: Record<string, Behavior> = {
  'Shiva, Warden of Ice': {
    saga: 3,
    abilities: [
      chapter([1, 2], [creature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        cantBeBlocked: true,
      }),
      chapter(
        [3],
        [],
        {
          kind: 'tap',
          what: { each: 'permanent', controller: 'opponent', filter: { types: ['Land'] } },
        },
        { kind: 'blink', what: 'self' },
      ),
    ],
  },
  'Black Chocobo': {
    abilities: [landfall([], pump(birds, 1, 0))],
  },
};
