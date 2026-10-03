import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { combos, draw, mana, mode, onEnter, spell, t0, t1, tapFor } from '../fin/helpers.ts';

/**
 * Strixhaven (13b): the Prismari Artistry-style deck (U/R): big instants and
 * sorceries, Elementals, magecraft and Treasure. Printed characteristics come
 * from Scryfall; only rules text lives here. The Elemental token (4/4 blue and
 * red) is defined with the Quandrix tokens.
 */

const ELEMENTAL = 'stx-elemental-ur-token';
const TREASURE = 'treasure-token';

const elemental = (count = 1): EffectDef => ({ kind: 'createToken', token: ELEMENTAL, count });
const treasure: EffectDef = { kind: 'createToken', token: TREASURE, count: 1 };
const anyTarget: TargetSpec = { what: 'any' };
const permanent: TargetSpec = { what: 'permanent' };

/** Magecraft: "whenever you cast or copy an instant or sorcery spell". */
const magecraft = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
  targets: [],
  effects,
});

/** "{U/R}{U/R}, Discard this card: Create a Treasure token." (the Opus and Masterpiece). */
const discardForTreasure: AbilityDef = {
  kind: 'activated',
  cost: { mana: mana('{U/R}{U/R}'), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [treasure],
  label: '{U/R}{U/R}, Discard this card: Create a Treasure token',
};

export const PRISMARI: Record<string, Behavior> = {
  'Prismari Pledgemage': {
    abilities: [
      magecraft({ kind: 'pump', to: 'self', power: 0, toughness: 0, ignoreDefender: true }),
    ],
  },
  'Prismari Apprentice': {
    abilities: [
      magecraft({ kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true }),
      {
        kind: 'triggered',
        trigger: {
          on: 'castSpell',
          filter: 'instantOrSorcery',
          orCopy: true,
          spell: { minManaValue: 5 },
        },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Vortex Runner': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'amountAtLeast', amount: { count: 'landsYouControl' }, min: 8 },
          power: 1,
          toughness: 0,
          cantBeBlocked: true,
        },
      },
    ],
  },
  'Spectacle Mage': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { types: ['Instant', 'Sorcery'], minManaValue: 5 },
          amount: 1,
        },
      },
    ],
  },
  'Maelstrom Muse': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'nextSpellCostsLess', amount: { powerOf: 'self' } }],
      },
    ],
  },
  'Oggyar Battle-Seer': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
        label: '{T}: Scry 1',
      },
    ],
  },
  // Simplified: Treasures already tap for any colour, which is all the artifact
  // ability adds (for instants and sorceries), so only the Treasure is built.
  'Galazeth Prismari': { abilities: [onEnter(treasure)] },
  // Simplified: it learns whenever it enters (printed: only if cast), and has
  // no return-from-graveyard replacement for Learn.
  'Retriever Phoenix': { abilities: [onEnter({ kind: 'learn' })] },
  'Wormhole Serpent': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}') },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
        label: '{3}{U}: Target creature can’t be blocked this turn',
      },
    ],
  },
  'Elemental Expressionist': {
    // Simplified: the creature makes a 4/4 Elemental if it dies this turn
    // (the printed ability exiles it instead of letting it leave play).
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery', orCopy: true },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'whenDiesThisTurn', what: t0, effects: [elemental()] }],
      },
    ],
  },
  'Sudden Breakthrough': spell(
    [{ what: 'creature' }],
    { kind: 'pump', to: t0, power: 2, toughness: 0, keywords: ['firstStrike'] },
    treasure,
  ),
  'Prismari Command': {
    modes: combos(
      [
        mode('2 damage to any target', [anyTarget], { kind: 'damage', amount: 2, to: t0 }),
        // Simplified: you are the player who loots and who gets the Treasure.
        mode('Draw two cards, then discard two cards', [], draw(2), {
          kind: 'discard',
          count: 2,
          who: 'controller',
        }),
        mode('Create a Treasure token', [], treasure),
        mode('Destroy target artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], {
          kind: 'destroy',
          what: t0,
        }),
      ],
      [2],
    ),
  },
  'Magma Opus': {
    // Simplified: the 4 damage is dealt as 4 to one target or 2 and 2 to two targets.
    modes: [
      mode(
        '4 damage to any target; tap two target permanents; Elemental; draw two',
        [anyTarget, permanent, permanent],
        { kind: 'damage', amount: 4, to: t0 },
        { kind: 'tap', what: t1 },
        { kind: 'tap', what: { target: 2 } },
        elemental(),
        draw(2),
      ),
      mode(
        '2 damage to each of two targets; tap two target permanents; Elemental; draw two',
        [anyTarget, anyTarget, permanent, permanent],
        { kind: 'damage', amount: 2, to: t0 },
        { kind: 'damage', amount: 2, to: t1 },
        { kind: 'tap', what: { target: 2 } },
        { kind: 'tap', what: { target: 3 } },
        elemental(),
        draw(2),
      ),
    ],
    abilities: [discardForTreasure],
  },
  'Elemental Masterpiece': {
    spell: { targets: [], effects: [elemental(2)] },
    abilities: [discardForTreasure],
  },
  'Prismari Campus': {
    entersTapped: true,
    abilities: [
      ...tapFor('U', 'R'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
        label: '{4}, {T}: Scry 1',
      },
    ],
  },
};
