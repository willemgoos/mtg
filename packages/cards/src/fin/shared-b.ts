import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  CardType,
  EffectDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew } from '../msh/helpers.ts';
import {
  basicOrTown,
  chapter,
  creature,
  draw,
  gain,
  hero,
  landcycling,
  mana,
  mode,
  onEnter,
  spell,
  t0,
  t1,
  theirCreature,
  tiered,
  yourCreature,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) 11b, group B: the mono-coloured and colourless cards of
 * Turks' Contract (W/B), Forbidden Magicks (U/R), Into the Void (B/G) and Road
 * Trip (G/U). The gold cards live in sacrifice-spellcraft.ts and
 * graveyard-towns.ts. Printed characteristics come from Scryfall; only rules
 * text lives here.
 */

// ------------------------------------------------------------------ shapes

export const triggered = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

export const activated = (
  cost: Extract<AbilityDef, { kind: 'activated' }>['cost'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'activated', cost, targets, effects });

/** "A creature or artifact". */
export const creatureOrArtifact: CardFilter = { types: ['Artifact', 'Creature'] };
/** "Another creature or artifact" (a sacrifice cost). */
export const anotherCreatureOrArtifact: CardFilter = { ...creatureOrArtifact, other: true };
const PERMANENT_TYPES: CardType[] = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
/** "Towns you control". */
export const towns: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Land'], subtype: 'Town' },
};
/** "Permanent cards in your graveyard". */
export const permanentCardsInGraveyard: Amount = {
  count: 'cardsInGraveyard',
  types: PERMANENT_TYPES,
};
/** "Noncreature, nonland cards in your graveyard". */
export const noncreatureNonlandInGraveyard: Amount = {
  count: 'cardsInGraveyard',
  notTypes: ['Creature', 'Land'],
};
/** "Whenever you cast a noncreature spell, if at least N mana was spent to cast it". */
export const bigSpell = (min: number, targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  triggered({ on: 'castSpell', filter: 'noncreature', minManaSpent: min }, targets, ...effects);

export const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
export const food: EffectDef = { kind: 'createToken', token: 'food-token', count: 1 };
export const wizard: EffectDef = { kind: 'createToken', token: 'fin-wizard-token', count: 1 };
export const bird: EffectDef = { kind: 'createToken', token: 'fin-bird-token', count: 1 };
const stun = (to: EffectDef & { kind: 'tap' }): EffectDef[] => [
  to,
  { kind: 'namedCounters', name: 'stun', amount: 1, to: to.what },
];
const sevenLands: Extract<AbilityDef, { kind: 'static' }>['effect'] = {
  kind: 'while',
  condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 7 },
  power: 0,
  toughness: 0,
};
const yourGraveyardCard = (filter: CardFilter, optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
  ...(optional ? { optional: true } : {}),
});

// ------------------------------------------------------------------ tokens

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords: [],
  abilities: [],
  isToken: true,
  ...extra,
});

export const DARKSTAR = 'fin-darkstar-token';

export const FIN_TOKENS_B: CardDefinition[] = [
  // Rufus Shinra: "Darkstar, a legendary 2/2 white and black Dog creature token".
  token(DARKSTAR, 'Darkstar', ['W', 'B'], ['Dog'], 2, 2, { supertypes: ['Legendary'] }),
  // Retrieve the Esper: "a 3/3 blue Robot Warrior artifact creature token".
  token('fin-robot-warrior-token', 'Robot Warrior', ['U'], ['Robot', 'Warrior'], 3, 3, {
    types: ['Artifact', 'Creature'],
  }),
  // The Wandering Minstrel: "a 2/2 Elemental creature token that's all colors".
  token('fin-elemental-token', 'Elemental', ['W', 'U', 'B', 'R', 'G'], ['Elemental'], 2, 2),
];

// ------------------------------------------------------------------ white

const WHITE: Record<string, Behavior> = {
  'Magitek Infantry': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'controlsPermanents',
            filter: { types: ['Artifact'], other: true },
            min: 1,
          },
          power: 1,
          toughness: 0,
        },
      },
      activated({ mana: mana('{2}{W}') }, [], {
        kind: 'searchLibrary',
        filter: { named: 'magitek-infantry' },
        to: 'battlefieldTapped',
      }),
    ],
  },
  "G'raha Tia": {
    abilities: [
      {
        ...(triggered(
          { on: 'permanentYouControlDies', filter: creatureOrArtifact, other: true },
          [],
          draw(1),
        ) as Extract<AbilityDef, { kind: 'triggered' }>),
        oncePerTurn: true,
      },
    ],
  },
  // His counters: the +1/+1 counter he enters with (other counters and his Equipment stay behind).
  'Zack Fair': {
    entersWithCounters: 1,
    abilities: [
      activated(
        { mana: mana('{1}'), sacrificeSelf: true },
        [{ ...yourCreature, filter: { other: true } }],
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['indestructible'] },
        { kind: 'counters', to: t0, amount: 1 },
      ),
    ],
  },
  // "Choose one" as two abilities with the same cost.
  'Phoenix Down': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true, exileSelf: true },
        targets: [yourGraveyardCard({ types: ['Creature'], maxManaValue: 4 })],
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
  Gaelicat: {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsPermanents', filter: { types: ['Artifact'] }, min: 2 },
          power: 2,
          toughness: 0,
        },
      },
    ],
  },
  'White Auracite': {
    abilities: [
      triggered(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
    ],
  },
  'Aerith Rescue Mission': {
    modes: [
      mode('Take the Elevator: three Heroes', [], hero(3)),
      mode(
        'Take 59 Flights of Stairs: tap three',
        [
          { ...creature, optional: true },
          { ...creature, optional: true },
          { ...creature, optional: true },
        ],
        ...stun({ kind: 'tap', what: t0 }),
        { kind: 'tap', what: t1 },
        { kind: 'tap', what: { target: 2 } },
      ),
    ],
  },
};

// ------------------------------------------------------------------ blue

const iceTarget: TargetSpec[] = [creature];

const BLUE: Record<string, Behavior> = {
  Sahagin: {
    abilities: [
      bigSpell(
        4,
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true },
      ),
    ],
  },
  'Ultros, Obnoxious Octopus': {
    abilities: [
      bigSpell(4, [theirCreature], ...stun({ kind: 'tap', what: t0 })),
      bigSpell(8, [], { kind: 'counters', to: 'self', amount: 8 }),
    ],
  },
  'Ice Flan': {
    abilities: [
      triggered(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact', 'Creature'] },
          },
        ],
        ...stun({ kind: 'tap', what: t0 }),
      ),
      landcycling('Island'),
    ],
  },
  // Blizzara: the owner puts it on top (their usual choice).
  'Ice Magic': tiered(
    ['{0}', mode('Blizzard', iceTarget, { kind: 'bounce', what: t0 })],
    ['{2}', mode('Blizzara', iceTarget, { kind: 'putInLibrary', what: t0, position: 'top' })],
    [
      '{5}{U}',
      mode('Blizzaga', iceTarget, { kind: 'custom', handler: 'shuffleTargetIntoLibrary' }),
    ],
  ),
  Eject: spell(
    [{ what: 'permanent', filter: { nonland: true } }],
    { kind: 'bounce', what: t0 },
    draw(1),
  ),
  'Retrieve the Esper': {
    ...spell([], { kind: 'createToken', token: 'fin-robot-warrior-token', count: 1 }),
    flashback: mana('{5}{U}'),
    flashbackSpell: {
      targets: [],
      effects: [{ kind: 'createToken', token: 'fin-robot-warrior-token', count: 1, counters: 2 }],
    },
  },
  'Dreams of Laguna': {
    ...spell([], { kind: 'surveil', amount: 1 }, draw(1)),
    flashback: mana('{3}{U}'),
  },
  'Combat Tutorial': spell(
    [{ what: 'player' }, { ...yourCreature, optional: true }],
    { kind: 'draw', who: t0, amount: 2 },
    { kind: 'counters', to: t1, amount: 1 },
  ),
  // "When you next cast an instant or sorcery spell this turn, copy that spell" (same targets).
  Ether: {
    abilities: [
      activated(
        { tapSelf: true, exileSelf: true },
        [],
        { kind: 'addMana', mana: [['U']] },
        {
          kind: 'emblem',
          until: 'nextSpellThisTurn',
          ability: triggered({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
            kind: 'copySpell',
            what: 'subject',
          }),
        },
      ),
    ],
  },
  'The Prima Vista': {
    abilities: [bigSpell(4, [], { kind: 'becomeCreature', what: 'self' }), crew(2)],
  },
  'Qiqirn Merchant': {
    abilities: [
      activated({ mana: mana('{1}'), tapSelf: true }, [], draw(1), { kind: 'discard', count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{7}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [draw(3)],
        costReduction: towns,
      },
    ],
  },
  'Scorpion Sentinel': { abilities: [{ kind: 'static', effect: { ...sevenLands, power: 3 } }] },
  'Il Mheg Pixie': {
    abilities: [triggered({ on: 'attacks' }, [], { kind: 'surveil', amount: 1 })],
  },
  'Travel the Overworld': { ...spell([], draw(4)), costReduction: towns },
  'Summon: Shiva': {
    saga: 3,
    abilities: [
      chapter([1, 2], [theirCreature], ...stun({ kind: 'tap', what: t0 })),
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
  "Dragoon's Wyvern": { abilities: [onEnter(hero())] },
  // "Its activated abilities can't be activated" isn't modelled.
  "Stuck in Summoner's Sanctum": {
    enchant: { what: 'permanent', filter: { types: ['Artifact', 'Creature'] } },
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }),
      { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, doesntUntap: true } },
    ],
  },
  'Rook Turret': {
    abilities: [
      triggered({ on: 'otherPermanentEtb', filter: { types: ['Artifact'] } }, [], {
        kind: 'may',
        effects: [draw(1), { kind: 'discard', count: 1 }],
      }),
    ],
  },
};

// ------------------------------------------------------------------ black

const BLACK: Record<string, Behavior> = {
  'Al Bhed Salvagers': {
    abilities: [
      triggered(
        { on: 'permanentYouControlDies', filter: creatureOrArtifact },
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
        gain(1),
      ),
    ],
  },
  Ahriman: {
    abilities: [
      activated({ mana: mana('{3}'), sacrificePermanent: anotherCreatureOrArtifact }, [], draw(1)),
    ],
  },
  'Undercity Dire Rat': { abilities: [triggered({ on: 'dies' }, [], treasure)] },
  'Namazu Trader': {
    abilities: [
      onEnter({ kind: 'loseLife', who: 'controller', amount: 1 }, treasure),
      triggered({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: creatureOrArtifact,
            then: [{ kind: 'surveil', amount: 2 }],
          },
        ],
      }),
    ],
  },
  "Vayne's Treachery": {
    ...spell([creature], { kind: 'pump', to: t0, power: -2, toughness: -2 }),
    kicker: {
      cost: mana('{0}'),
      sacrifice: creatureOrArtifact,
      spell: { targets: [creature], effects: [{ kind: 'pump', to: t0, power: -6, toughness: -6 }] },
    },
  },
  "Sephiroth's Intervention": spell([creature], { kind: 'destroy', what: t0 }, gain(2)),
  Overkill: spell([creature], { kind: 'pump', to: t0, power: 0, toughness: -9999 }),
  'Cornered by Black Mages': spell([], { kind: 'opponentSacrifices' }, wizard),
  'Evil Reawakened': spell([yourGraveyardCard({ types: ['Creature'] })], {
    kind: 'returnToBattlefield',
    what: t0,
    countersIf: { filter: {}, count: 2 },
  }),
  Hecteyes: { abilities: [onEnter({ kind: 'discard', count: 1, who: 'eachOpponent' })] },
  'Summon: Anima': {
    saga: 4,
    abilities: [
      chapter([1, 2, 3], [], draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }),
      chapter(
        [4],
        [],
        { kind: 'opponentSacrifices' },
        { kind: 'loseLife', who: 'eachOpponent', amount: 3 },
      ),
    ],
  },
  // It becomes an artifact creature until end of turn (not also a Spirit).
  'Phantom Train': {
    abilities: [
      activated(
        { sacrificePermanent: anotherCreatureOrArtifact },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'becomeCreature', what: 'self' },
      ),
    ],
  },
  'Shinra Reinforcements': {
    abilities: [onEnter({ kind: 'mill', count: 3 }, gain(3))],
  },
  Tonberry: {
    entersTapped: true,
    entersWithNamedCounters: { stun: 1 },
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike', 'deathtouch'],
        },
      },
    ],
  },
  "Shambling Cie'th": {
    entersTapped: true,
    abilities: [
      {
        ...(triggered({ on: 'castSpell', filter: 'noncreature' }, [], {
          kind: 'may',
          cost: mana('{B}'),
          effects: [{ kind: 'returnSource', to: 'hand' }],
        }) as Extract<AbilityDef, { kind: 'triggered' }>),
        fromGraveyard: true,
      },
    ],
  },
  Malboro: {
    abilities: [
      onEnter(
        { kind: 'discard', count: 1, who: 'eachOpponent' },
        { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
        { kind: 'custom', handler: 'opponentExilesTop', params: { count: 3 } },
      ),
      landcycling('Swamp'),
    ],
  },
  'Fight On!': spell(
    [
      yourGraveyardCard({ types: ['Creature'] }, true),
      yourGraveyardCard({ types: ['Creature'] }, true),
    ],
    { kind: 'returnToHand', what: t0 },
    { kind: 'returnToHand', what: t1 },
  ),
  'Resentful Revelation': {
    ...spell([], { kind: 'lookTakeRestGraveyard', count: 3, take: 1 }),
    flashback: mana('{6}{B}'),
  },
};

// ------------------------------------------------------------------ red

const RED: Record<string, Behavior> = {
  'Blazing Bomb': {
    abilities: [
      bigSpell(4, [], { kind: 'counters', to: 'self', amount: 1 }),
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [creature],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: t0 }],
        label: 'Blow Up',
      },
    ],
  },
  'Prompto Argentum': { abilities: [bigSpell(4, [], treasure)] },
  'Mysidian Elder': { abilities: [onEnter(wizard)] },
  'Hill Gigas': { abilities: [landcycling('Mountain')] },
  'Summon: Esper Ramuh': {
    saga: 3,
    abilities: [
      chapter([1], [theirCreature], {
        kind: 'damage',
        amount: noncreatureNonlandInGraveyard,
        to: t0,
      }),
      chapter([2, 3], [], {
        kind: 'pump',
        to: { each: 'creature', controller: 'you', filter: { subtype: 'Wizard' } },
        power: 1,
        toughness: 0,
      }),
    ],
  },
  'Light of Judgment': spell(
    [creature],
    { kind: 'damage', amount: 6, to: t0 },
    { kind: 'custom', handler: 'destroyEquipmentOnTarget' },
  ),
  Suplex: {
    modes: [
      mode(
        'Deal 3 damage (exile it if it would die)',
        [creature],
        { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
        { kind: 'damage', amount: 3, to: t0 },
      ),
      mode('Exile an artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], {
        kind: 'exile',
        what: t0,
      }),
    ],
  },
  'Laughing Mad': { ...spell([], draw(2)), discardToCast: true, flashback: mana('{3}{R}') },
  'Call the Mountain Chocobo': {
    ...spell([], { kind: 'searchLibrary', filter: { subtype: 'Mountain' }, to: 'hand' }, bird),
    flashback: mana('{5}{R}'),
  },
  'Choco-Comet': spell([{ what: 'any' }], { kind: 'damage', amount: { x: true }, to: t0 }, bird),
  // Only instant and sorcery cards from your graveyard (not exiled flashback cards).
  "Sorceress's Schemes": {
    ...spell(
      [yourGraveyardCard({ types: ['Instant', 'Sorcery'] })],
      { kind: 'returnToHand', what: t0 },
      { kind: 'addMana', mana: [['R']] },
    ),
    flashback: mana('{4}{R}'),
  },
  // "Until your next end step" is until the end of your next turn.
  'Opera Love Song': {
    modes: [
      mode('Exile the top two cards; play them', [], {
        kind: 'exileTopPlayable',
        count: 2,
        until: 'endOfNextTurn',
      }),
      mode(
        'One or two creatures get +2/+0',
        [creature, { ...creature, optional: true }],
        { kind: 'pump', to: t0, power: 2, toughness: 0 },
        { kind: 'pump', to: t1, power: 2, toughness: 0 },
      ),
    ],
  },
};

// ------------------------------------------------------------------ green

const GREEN: Record<string, Behavior> = {
  'Gran Pulse Ochu': {
    abilities: [
      activated({ mana: mana('{8}') }, [], {
        kind: 'pump',
        to: 'self',
        power: permanentCardsInGraveyard,
        toughness: permanentCardsInGraveyard,
      }),
    ],
  },
  Gigantoad: { abilities: [{ kind: 'static', effect: { ...sevenLands, power: 2, toughness: 2 } }] },
  'Diamond Weapon': {
    costReduction: permanentCardsInGraveyard,
    abilities: [{ kind: 'static', effect: { kind: 'preventCombatDamageToSelf' } }],
  },
  'Coliseum Behemoth': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          mode(
            'Destroy an artifact or enchantment',
            [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
            { kind: 'destroy', what: t0 },
          ),
          mode('Draw a card', [], draw(1)),
        ],
      },
    ],
  },
  Cactuar: {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'not', condition: { kind: 'sourceEnteredThisTurn' } },
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
      },
    ],
  },
  'Commune with Beavers': spell([], {
    kind: 'lookAndTake',
    count: 3,
    filter: { types: ['Artifact', 'Creature', 'Land'] },
  }),
  'Chocobo Kick': {
    ...spell([yourCreature, theirCreature], {
      kind: 'damage',
      amount: { powerOf: t0 },
      from: t0,
      to: t1,
    }),
    kicker: {
      cost: mana('{0}'),
      sacrifice: { types: ['Land'] },
      returnLand: true,
      spell: {
        targets: [yourCreature, theirCreature],
        effects: [
          { kind: 'damage', amount: { multiply: 2, amount: { powerOf: t0 } }, from: t0, to: t1 },
        ],
      },
    },
  },
  'Chocobo Racetrack': { abilities: [triggered({ on: 'landfall' }, [], bird)] },
  "Sazh's Chocobo": {
    abilities: [triggered({ on: 'landfall' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  },
  // "With different names" isn't checked.
  'Reach the Horizon': spell(
    [],
    { kind: 'searchLibrary', filter: basicOrTown, to: 'battlefieldTapped' },
    { kind: 'searchLibrary', filter: basicOrTown, to: 'battlefieldTapped' },
  ),
};

// ------------------------------------------------------------------ colourless

const COLORLESS: Record<string, Behavior> = {
  'Magic Pot': {
    abilities: [
      triggered({ on: 'dies' }, [], treasure),
      activated({ mana: mana('{2}'), tapSelf: true }, [{ what: 'graveyardCard' }], {
        kind: 'exileGraveyardCard',
        what: t0,
      }),
    ],
  },
  'Instant Ramen': {
    abilities: [
      onEnter(draw(1)),
      activated({ mana: mana('{2}'), tapSelf: true, sacrificeSelf: true }, [], gain(3)),
    ],
  },
  // "{3}: base power becomes the number of Towns": +X/+0 on its printed 0.
  'PuPu UFO': {
    abilities: [
      activated({ tapSelf: true }, [], {
        kind: 'putFromHandOrGraveyard',
        filter: { types: ['Land'] },
        handOnly: true,
      }),
      activated({ mana: mana('{3}') }, [], {
        kind: 'pump',
        to: 'self',
        power: towns,
        toughness: 0,
      }),
    ],
  },
  'World Map': {
    abilities: [
      activated({ mana: mana('{1}'), tapSelf: true, sacrificeSelf: true }, [], {
        kind: 'searchLibrary',
        filter: 'basicLand',
        to: 'hand',
      }),
      activated({ mana: mana('{3}'), tapSelf: true, sacrificeSelf: true }, [], {
        kind: 'searchLibrary',
        filter: { types: ['Land'] },
        to: 'hand',
      }),
    ],
  },
};

export const SHARED_B: Record<string, Behavior> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...COLORLESS,
};
