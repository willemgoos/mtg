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
  creature,
  draw,
  gain,
  mana,
  mode,
  onEnter,
  spell,
  t0,
  t1,
  theirCreature,
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
  // The Wandering Minstrel: "a 2/2 Elemental creature token that's all colors".
  token('fin-elemental-token', 'Elemental', ['W', 'U', 'B', 'R', 'G'], ['Elemental'], 2, 2),
];

// ------------------------------------------------------------------ white

const WHITE: Record<string, Behavior> = {
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
};

// ------------------------------------------------------------------ blue

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
  'Travel the Overworld': { ...spell([], draw(4)), costReduction: towns },
  // "Its activated abilities can't be activated" isn't modelled.
  "Stuck in Summoner's Sanctum": {
    enchant: { what: 'permanent', filter: { types: ['Artifact', 'Creature'] } },
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }),
      { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, doesntUntap: true } },
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
  'Light of Judgment': spell(
    [creature],
    { kind: 'damage', amount: 6, to: t0 },
    { kind: 'custom', handler: 'destroyEquipmentOnTarget' },
  ),
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
