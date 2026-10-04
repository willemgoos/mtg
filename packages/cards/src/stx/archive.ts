import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { combos, draw, gain, mana, mode, spell, t0, t1, yourCreature } from '../fin/helpers.ts';
import { when } from '../blb/helpers.ts';

/**
 * Mystical Archive (16, STA): the Strixhaven Mystical Archive cards no other set
 * file implements (most are reprints of famous instants and sorceries). Printed
 * characteristics come from Scryfall; only rules text lives here. One-offs are
 * `custom` handlers in packages/engine/src/archive-16-effects.ts.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const anyTarget: TargetSpec = { what: 'any' };
const aPlayer: TargetSpec = { what: 'player' };
const aSpell: TargetSpec = { what: 'spell' };

/** Storm: "When you cast this spell, copy it for each spell cast before it this turn." */
export const storm: AbilityDef = when({ on: 'castSelf' }, [], {
  kind: 'copySpell',
  what: 'subject',
  count: { count: 'spellsCastBeforeSubject' },
});

export const STX_ARCHIVE: Record<string, Behavior> = {
  // ------------------------------------------------------------ white
  'Gift of Estates': spell([], {
    kind: 'if',
    condition: { kind: 'opponentHasMore', what: 'lands' },
    then: [
      { kind: 'searchLibrary', filter: { subtype: 'Plains' }, to: 'hand', shuffle: false },
      { kind: 'searchLibrary', filter: { subtype: 'Plains' }, to: 'hand', shuffle: false },
      { kind: 'searchLibrary', filter: { subtype: 'Plains' }, to: 'hand' },
    ],
  }),
  'Divine Gambit': spell(
    [
      {
        what: 'permanent',
        controller: 'opponent',
        filter: { types: ['Artifact', 'Creature', 'Enchantment'] },
      },
    ],
    { kind: 'exile', what: t0 },
    { kind: 'chooseCustom', handler: 'divineGambit' },
  ),
  Despark: spell([{ what: 'permanent', filter: { minManaValue: 4 } }], { kind: 'exile', what: t0 }),
  Ephemerate: {
    ...spell([yourCreature], { kind: 'blink', what: t0 }),
    rebound: true,
  },
  'Gods Willing': spell(
    [yourCreature],
    { kind: 'chooseCustom', handler: 'protectionColor' },
    {
      kind: 'scry',
      amount: 1,
    },
  ),
  'Defiant Strike': spell(
    [{ what: 'creature' }],
    {
      kind: 'pump',
      to: t0,
      power: 1,
      toughness: 0,
    },
    draw(1),
  ),
  Revitalize: spell([], gain(3), draw(1)),
  'Mana Tithe': spell([aSpell], { kind: 'counterUnlessPays', what: t0, cost: mana('{1}') }),
  "Teferi's Protection": {
    ...spell([], custom('teferisLock'), {
      kind: 'phaseOut',
      what: { each: 'permanent', controller: 'you' },
    }),
    afterResolving: 'exile',
  },
  'Approach of the Second Sun': {
    ...spell([], custom('approachResolve')),
    abilities: [when({ on: 'castSelf' }, [], custom('approachCast'))],
  },
  // ------------------------------------------------------------ blue
  Brainstorm: spell([], draw(3), {
    kind: 'chooseCustom',
    handler: 'putBackFromHand',
    params: { n: 2 },
  }),
  'Compulsive Research': spell([], draw(3), { kind: 'chooseCustom', handler: 'compulsiveDiscard' }),
  "Blue Sun's Zenith": spell(
    [aPlayer],
    { kind: 'draw', who: t0, amount: { x: true } },
    custom('shuffleSelfIntoLibrary'),
  ),
  'Memory Lapse': spell([aSpell], custom('counterToTop')),
  // Simplified: a single target spell, countered unless its controller pays {4}.
  'Whirlwind Denial': spell([aSpell], { kind: 'counterUnlessPays', what: t0, cost: mana('{4}') }),
  'Time Warp': spell([], { kind: 'extraTurn' }),
  'Strategic Planning': spell([], { kind: 'lookTakeRestGraveyard', count: 3, take: 1 }),
  "Mind's Desire": { ...spell([], custom('mindsDesire')), abilities: [storm] },
  // ------------------------------------------------------------ black
  'Dark Ritual': spell([], { kind: 'addMana', mana: [['B'], ['B'], ['B']] }),
  'Demonic Tutor': spell([], { kind: 'searchLibrary', filter: {}, to: 'hand' }),
  'Sign in Blood': spell(
    [aPlayer],
    { kind: 'draw', who: t0, amount: 2 },
    { kind: 'loseLife', who: t0, amount: 2 },
  ),
  Duress: spell([], {
    kind: 'chooseFromOpponentHand',
    filter: { nonland: true, notTypes: ['Creature'] },
    then: 'discard',
  }),
  'Inquisition of Kozilek': spell([], {
    kind: 'chooseFromOpponentHand',
    filter: { nonland: true, maxManaValue: 3 },
    then: 'discard',
  }),
  'Agonizing Remorse': spell(
    [],
    { kind: 'chooseCustom', handler: 'agonizingRemorse' },
    { kind: 'loseLife', who: 'controller', amount: 1 },
  ),
  'Doom Blade': spell([{ what: 'creature', filter: { notColors: ['B'] } }], {
    kind: 'destroy',
    what: t0,
  }),
  Eliminate: spell(
    [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'], maxManaValue: 3 } }],
    { kind: 'destroy', what: t0 },
  ),
  'Tainted Pact': spell([], { kind: 'chooseCustom', handler: 'taintedPact' }),
  'Tendrils of Agony': {
    ...spell([aPlayer], { kind: 'loseLife', who: t0, amount: 2 }, gain(2)),
    abilities: [storm],
  },
  // ------------------------------------------------------------ red
  Infuriate: spell([{ what: 'creature' }], { kind: 'pump', to: t0, power: 3, toughness: 2 }),
  'Claim the Firstborn': spell(
    [{ what: 'creature', filter: { maxManaValue: 3 } }],
    { kind: 'gainControl', what: t0 },
    { kind: 'untap', what: t0 },
    { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['haste'] },
  ),
  'Stone Rain': spell([{ what: 'permanent', filter: { types: ['Land'] } }], {
    kind: 'destroy',
    what: t0,
  }),
  Grapeshot: { ...spell([anyTarget], { kind: 'damage', amount: 1, to: t0 }), abilities: [storm] },
  "Urza's Rage": {
    ...spell([anyTarget], { kind: 'damage', amount: 3, to: t0 }),
    uncounterable: true,
    kicker: {
      cost: mana('{8}{R}'),
      spell: { targets: [anyTarget], effects: [{ kind: 'damage', amount: 10, to: t0 }] },
    },
  },
  Electrolyze: {
    modes: [
      mode('2 damage to one target', [anyTarget], { kind: 'damage', amount: 2, to: t0 }, draw(1)),
      mode(
        '1 damage to each of two targets',
        [anyTarget, anyTarget],
        { kind: 'damage', amount: 1, to: t0 },
        { kind: 'damage', amount: 1, to: t1 },
        draw(1),
      ),
    ],
  },
  'Increasing Vengeance': {
    ...spell([{ what: 'spell', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }], {
      kind: 'copySpell',
      what: t0,
    }),
    flashback: mana('{3}{R}{R}'),
    flashbackSpell: {
      targets: [{ what: 'spell', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
      effects: [{ kind: 'copySpell', what: t0, count: 2 }],
    },
  },
  // ------------------------------------------------------------ green
  'Abundant Harvest': spell([], {
    kind: 'choose',
    options: [
      {
        label: 'Land',
        effects: [{ kind: 'revealUntil', filter: { types: ['Land'] }, to: 'hand' }],
      },
      {
        label: 'Nonland',
        effects: [{ kind: 'revealUntil', filter: { nonland: true }, to: 'hand' }],
      },
    ],
  }),
  'Adventurous Impulse': spell([], {
    kind: 'lookAndTake',
    count: 3,
    filter: { types: ['Creature', 'Land'] },
  }),
  Channel: spell([], custom('channel')),
  'Krosan Grip': {
    ...spell([{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }], {
      kind: 'destroy',
      what: t0,
    }),
    splitSecond: true,
  },
  'Natural Order': {
    sacrificeCreatureToCast: true,
    sacrificeToCastFilter: { types: ['Creature'], colors: ['G'] },
    ...spell([], {
      kind: 'searchLibrary',
      filter: { types: ['Creature'], colors: ['G'] },
      to: 'battlefield',
    }),
  },
  'Primal Command': {
    modes: combos(
      [
        mode('Target player gains 7 life', [aPlayer], { kind: 'gainLife', who: t0, amount: 7 }),
        mode(
          "Put target noncreature permanent on top of its owner's library",
          [{ what: 'permanent', filter: { notTypes: ['Creature'] } }],
          { kind: 'putInLibrary', what: t0, position: 'top' },
        ),
        mode(
          'Target player shuffles their graveyard into their library',
          [aPlayer],
          custom('shuffleGraveyardIn', { target: 0 }),
        ),
        mode('Search for a creature card', [], {
          kind: 'searchLibrary',
          filter: { types: ['Creature'] },
          to: 'hand',
        }),
      ],
      [2],
    ),
  },
  Putrefy: spell([{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }], {
    kind: 'destroy',
    what: t0,
  }),
  'Weather the Storm': { ...spell([], gain(3)), abilities: [storm] },
  'Crux of Fate': {
    modes: [
      mode('Destroy all Dragon creatures', [], {
        kind: 'destroyAll',
        filter: { subtype: 'Dragon' },
      }),
      mode('Destroy all non-Dragon creatures', [], {
        kind: 'destroyAll',
        filter: { notSubtype: 'Dragon' },
      }),
    ],
  },
};
