import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  combos,
  creature,
  draw,
  mayRummage,
  mode,
  onEnter,
  spell,
  t0,
  t1,
  tapFor,
} from '../fin/helpers.ts';
import { opus } from './helpers.ts';

/**
 * Secrets of Strixhaven (14b, group D): the red and Prismari (U/R) cards. Printed
 * characteristics come from Scryfall; only rules text lives here.
 */

export const SOS_SPIRIT_RW = 'sos-spirit-rw-token';
export const SOS_ELEMENTAL_UR = 'sos-elemental-ur-token';
const TREASURE = 'treasure-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtype: string,
  power: number,
  toughness: number,
  keywords: CardDefinition['keywords'] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes: [subtype],
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

/** The 2/2 red and white Spirit and the 3/3 blue and red flying Elemental creature tokens. */
export const SOS_D_TOKENS: CardDefinition[] = [
  token(SOS_SPIRIT_RW, 'Spirit', ['R', 'W'], 'Spirit', 2, 2),
  token(SOS_ELEMENTAL_UR, 'Elemental', ['U', 'R'], 'Elemental', 3, 3, ['flying']),
];

const spirit = (count = 1): EffectDef => ({ kind: 'createToken', token: SOS_SPIRIT_RW, count });
const elemental = (count = 1, hasteThisTurn = false): EffectDef => ({
  kind: 'createToken',
  token: SOS_ELEMENTAL_UR,
  count,
  ...(hasteThisTurn ? { hasteThisTurn } : {}),
});
const treasure: EffectDef = { kind: 'createToken', token: TREASURE, count: 1 };
const anyTarget: TargetSpec = { what: 'any' };
const instantOrSorcery = ['Instant', 'Sorcery'] as const;
const yourCreatures = { each: 'creature', controller: 'you' } as const;

const pumpSelf = (
  power: number,
  toughness: number,
  keywords: Extract<EffectDef, { kind: 'pump' }>['keywords'] = [],
): EffectDef => ({
  kind: 'pump',
  to: 'self',
  power,
  toughness,
  ...(keywords.length ? { keywords } : {}),
});
const counterSelf = (amount: number): EffectDef => ({ kind: 'counters', to: 'self', amount });
const damageOpponents = (amount: number): EffectDef => ({
  kind: 'damage',
  amount,
  to: 'eachOpponent',
  from: 'self',
});
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
/** "{R}" and friends: restricted mana for instants and sorceries. */
const forSpells = 'InstantOrSorcery';

const strikeCreature: TargetSpec = { what: 'creature' };

export const SOS_D: Record<string, Behavior> = {
  // ------------------------------------------------------------------ red
  'Ancestral Anger': spell(
    [creature],
    {
      kind: 'pump',
      to: t0,
      power: { count: 'cardsInGraveyard', named: 'ancestral-anger', plus: 1 },
      toughness: 0,
      keywords: ['trample'],
    },
    draw(1),
  ),
  "Archaic's Agony": spell([strikeCreature], { kind: 'custom', handler: 'archaicAgony' }),
  'Artistic Process': {
    modes: [
      mode('6 damage to target creature', [creature], { kind: 'damage', amount: 6, to: t0 }),
      mode("2 damage to each creature you don't control", [], {
        kind: 'damage',
        amount: 2,
        to: { each: 'creature', controller: 'opponent' },
      }),
      mode(
        'Create a 3/3 Elemental with flying and haste until end of turn',
        [],
        elemental(1, true),
      ),
    ],
  },
  'Blazing Firesinger': { entersPrepared: true },
  'Charging Strifeknight': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, discard: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Choreographed Sparks': {
    cantBeCopied: true,
    // Simplified: the copies keep the original targets (no new-target choice).
    modes: combos(
      [
        mode(
          'Copy target instant or sorcery spell you control',
          [{ what: 'spell', controller: 'you', filter: { types: [...instantOrSorcery] } }],
          { kind: 'copySpell', what: t0 },
        ),
        mode(
          'Copy target creature spell you control',
          [{ what: 'spell', controller: 'you', filter: { types: ['Creature'] } }],
          { kind: 'copySpell', what: t0, hasteSacrifice: true },
        ),
      ],
      [1, 2],
    ),
  },
  // "Damage can't be prevented this turn" is left out: the engine has almost no prevention.
  'Duel Tactics': {
    flashback: mana('{1}{R}'),
    spell: {
      targets: [creature],
      effects: [
        { kind: 'damage', amount: 1, to: t0 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, cantBlock: true },
      ],
    },
  },
  'Expressive Firedancer': {
    abilities: [opus([pumpSelf(1, 1)], [pumpSelf(1, 1, ['doubleStrike'])])],
  },
  'Garrison Excavator': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        targets: [],
        effects: [spirit()],
        batch: true,
      },
    ],
  },
  'Heated Argument': spell(
    [creature],
    { kind: 'damage', amount: 6, to: t0 },
    { kind: 'chooseCustom', handler: 'heatedArgumentExile' },
  ),
  'Impractical Joke': spell([{ ...creatureOrWalker(), optional: true }], {
    kind: 'damage',
    amount: 3,
    to: t0,
  }),
  'Improvisation Capstone': {
    paradigm: true,
    spell: { targets: [], effects: [{ kind: 'exileUntilTotalCastFree', total: 4 }] },
  },
  'Living History': {
    abilities: [
      onEnter(spirit()),
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        condition: { kind: 'cardsLeftGraveyardThisTurn' },
        targets: [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
        effects: [{ kind: 'pump', to: t0, power: 2, toughness: 0 }],
      },
    ],
  },
  'Maelstrom Artisan': { entersPrepared: true },
  'Magmablood Archaic': {
    entersWithCountersPerColorSpent: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: yourCreatures,
            power: { colorsSpent: 'subject' },
            toughness: 0,
          },
        ],
      },
    ],
  },
  'Mica, Reader of Ruins': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'micaSacrifice' }],
      },
    ],
  },
  'Molten-Core Maestro': {
    abilities: [
      opus(
        [counterSelf(1)],
        [counterSelf(1), { kind: 'addMana', mana: [['R']], count: { powerOf: 'self' } }],
      ),
    ],
  },
  'Pigment Wrangler': { entersPrepared: true },
  'Rearing Embermare': {},
  'Rubble Rouser': {
    abilities: [
      onEnter(mayRummage),
      // Simplified: not a mana ability (the damage needs the stack), so it can't pay a cost mid-cast.
      {
        kind: 'activated',
        cost: { tapSelf: true, exileFromGraveyard: {} },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['R']] }, damageOpponents(1)],
      },
    ],
  },
  'Seize the Spoils': {
    discardToCast: true,
    spell: { targets: [], effects: [draw(2), treasure] },
  },
  'Steal the Show': {
    modes: combos(
      [
        // Simplified: you discard and draw (the target player is always you).
        mode('Discard any number of cards, then draw that many', [], {
          kind: 'discardAnyThenDraw',
          who: 'controller',
        }),
        mode('Damage equal to the instants and sorceries in your graveyard', [creatureOrWalker()], {
          kind: 'damage',
          amount: { count: 'cardsInGraveyard', types: [...instantOrSorcery] },
          to: t0,
        }),
      ],
      [1, 2],
    ),
  },
  'Strife Scholar': { entersPrepared: true },
  'Tablet of Discovery': {
    abilities: [
      onEnter({ kind: 'custom', handler: 'tabletMill' }),
      ...tapFor('R'),
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R', amount: 2, onlyFor: forSpells },
    ],
  },
  'Thunderdrum Soloist': {
    abilities: [opus([damageOpponents(1)], [damageOpponents(3)])],
  },
  'Tome Blast': {
    flashback: mana('{4}{R}'),
    spell: { targets: [anyTarget], effects: [{ kind: 'damage', amount: 2, to: t0 }] },
  },
  'Unsubtle Mockery': spell([creature], { kind: 'damage', amount: 4, to: t0 }, surveil(1)),
  'Zealous Lorecaster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          { what: 'graveyardCard', controller: 'you', filter: { types: [...instantOrSorcery] } },
        ],
        effects: [{ kind: 'returnToHand', what: t0 }],
      },
    ],
  },

  // ------------------------------------------------------------- Prismari
  'Abstract Paintmage': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['U'], ['R']], onlyFor: forSpells }],
      },
    ],
  },
  'Colorstorm Stallion': {
    abilities: [opus([pumpSelf(1, 1)], [pumpSelf(1, 1), { kind: 'tokenCopy', of: 'self' }])],
  },
  'Elemental Mascot': {
    abilities: [
      opus(
        [pumpSelf(1, 0)],
        [pumpSelf(1, 0), { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }],
      ),
    ],
  },
  'Prismari Charm': {
    modes: [
      mode('Surveil 2, then draw a card', [], surveil(2), draw(1)),
      mode(
        '1 damage to each of one or two targets',
        [anyTarget, { ...anyTarget, optional: true }],
        { kind: 'damage', amount: 1, to: t0 },
        { kind: 'damage', amount: 1, to: t1 },
      ),
      mode(
        "Return target nonland permanent to its owner's hand",
        [{ what: 'permanent', filter: { nonland: true } }],
        { kind: 'bounce', what: t0 },
      ),
    ],
  },
  'Prismari, the Inspiration': {
    abilities: [
      // Storm for your instants and sorceries; the copies keep the original targets.
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        effects: [
          { kind: 'copySpell', what: 'subject', count: { count: 'spellsCastBeforeSubject' } },
        ],
      },
    ],
  },
  'Rapturous Moment': spell(
    [],
    draw(3),
    { kind: 'discard', count: 2, who: 'controller' },
    { kind: 'addMana', mana: [['U'], ['U'], ['R'], ['R'], ['R']] },
  ),
  'Resonating Lute': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'grantMana',
          filter: { types: ['Land'] },
          produces: ['W', 'U', 'B', 'R', 'G'],
          onlyFor: forSpells,
          amount: 2,
        },
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'handSize', min: 7 },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Sanar, Unfinished Genius': {
    entersPrepared: true,
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'castInstantOrSorceryThisTurn' },
        targets: [],
        effects: [treasure],
      },
    ],
  },
  'Spectacular Skywhale': {
    abilities: [opus([pumpSelf(3, 0)], [counterSelf(3)])],
  },
  'Splatter Technique': {
    modes: [
      mode('Draw four cards', [], draw(4)),
      mode(
        '4 damage to each creature and planeswalker',
        [],
        { kind: 'damage', amount: 4, to: { each: 'creature' } },
        {
          kind: 'damage',
          amount: 4,
          to: { each: 'permanent', filter: { types: ['Planeswalker'] } },
        },
      ),
    ],
  },
  'Stadium Tidalmage': {
    abilities: [
      onEnter(mayRummage),
      { kind: 'triggered', trigger: { on: 'attacks' }, targets: [], effects: [mayRummage] },
    ],
  },
  'Stress Dream': spell(
    [{ ...strikeCreature, optional: true }],
    { kind: 'damage', amount: 5, to: t0 },
    { kind: 'lookAndTake', count: 2, filter: {} },
  ),
  'Traumatic Critique': spell(
    [anyTarget],
    { kind: 'damage', amount: { x: true }, to: t0 },
    draw(2),
    { kind: 'discard', count: 1, who: 'controller' },
  ),
  'Vibrant Outburst': spell(
    [anyTarget, { ...strikeCreature, optional: true }],
    { kind: 'damage', amount: 3, to: t0 },
    { kind: 'tap', what: t1 },
  ),
  "Visionary's Dance": {
    spell: { targets: [], effects: [elemental(2)] },
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), discardSelf: true },
        fromHand: true,
        targets: [],
        effects: [{ kind: 'lookTakeRestGraveyard', count: 2, take: 1 }],
        label: 'Discard: look at the top two cards',
      },
    ],
  },
  'Zaffai and the Tempests': {
    abilities: [{ kind: 'static', effect: { kind: 'freeSpellOncePerTurn' } }],
  },
  'Spectacle Summit': {
    entersTapped: true,
    abilities: [
      ...tapFor('U', 'R'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}{R}'), tapSelf: true },
        targets: [],
        effects: [surveil(1)],
      },
    ],
  },
  'Stormcarved Coast': {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 2 },
    },
    abilities: tapFor('U', 'R'),
  },
};

function creatureOrWalker(): TargetSpec {
  return { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } };
}

/** Prepare spell faces, keyed `Spell (Creature)`. */
export const SOS_D_BACKS: Record<string, Behavior> = {
  'Seething Song (Blazing Firesinger)': spell([], {
    kind: 'addMana',
    mana: [['R'], ['R'], ['R'], ['R'], ['R']],
  }),
  'Rocket Volley (Maelstrom Artisan)': spell(
    [{ what: 'permanent', filter: { types: ['Land'], nonbasic: true } }],
    { kind: 'destroy', what: t0 },
  ),
  'Striking Palette (Pigment Wrangler)': spell([], {
    kind: 'emblem',
    until: 'nextSpellThisTurn',
    ability: {
      kind: 'triggered',
      trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
      targets: [],
      effects: [{ kind: 'copySpell', what: 'subject' }],
    } satisfies AbilityDef,
  }),
  'Awaken the Ages (Strife Scholar)': spell([], spirit(2)),
  'Wild Idea (Sanar, Unfinished Genius)': spell([], {
    kind: 'searchLibrary',
    filter: { types: [...instantOrSorcery] },
    to: 'hand',
  }),
};
