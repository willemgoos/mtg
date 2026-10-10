import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { anyColor, draw, mana, onEnter, t0, t1, when } from '../blb/helpers.ts';
import { chapter, mode, spell } from '../fin/helpers.ts';
import { subtypecycling } from '../hob-vocab.ts';
import { amassOrcs, ringTempts, whenYouScry } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): blue cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_BLUE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const creature: TargetSpec = { what: 'creature' };
const scry = (amount: number): EffectDef => ({ kind: 'scry', amount });
const treasure = (count: number): EffectDef => ({
  kind: 'createToken',
  token: 'treasure-token',
  count,
});
const otherLegendaryCreature: TargetSpec = {
  what: 'creature',
  filter: { other: true, supertypes: ['Legendary'] },
};
const youControlAnIsland = { kind: 'controlsPermanents', filter: { subtype: 'Island' }, min: 1 } as const;

export const LTR_BLUE: Record<string, Behavior> = {
  // "{T}: Untap another target permanent." and "{T}: Untap two other target legendary creatures."
  'Ioreth of the Healing House': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'permanent', filter: { other: true } }],
        effects: [{ kind: 'untap', what: t0 }],
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [otherLegendaryCreature, otherLegendaryCreature],
        effects: [
          { kind: 'untap', what: t0 },
          { kind: 'untap', what: t1 },
        ],
      },
    ],
  },
  // Flying is printed.
  'Willow-Wind': { abilities: [onEnter(scry(2))] },
  'Knights of Dol Amroth': {
    abilities: [when({ on: 'drawSecondCard' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  },
  'Lórien Revealed': {
    ...spell([], draw(3)),
    abilities: [subtypecycling('Island', '{1}')],
  },
  "Saruman's Trickery": spell([{ what: 'spell' }], { kind: 'counter', what: t0 }, amassOrcs(1)),
  // Ward {2} is printed.
  'Saruman the White': {
    abilities: [when({ on: 'castSpell', filter: 'second' }, [], amassOrcs(2))],
  },
  'Bill Ferny, Bree Swindler': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'becomesBlocked' },
        targets: [],
        effects: [],
        modes: [
          mode('Create a Treasure token', [], treasure(1)),
          mode(
            'Target opponent gains control of target Horse you control. If they do, remove Bill Ferny from combat and create three Treasure tokens',
            [
              { what: 'player', controller: 'opponent' },
              { what: 'creature', controller: 'you', filter: { subtype: 'Horse' } },
            ],
            custom('ltrBillFerny'),
          ),
        ],
      },
    ],
  },
  'Nimrodel Watcher': {
    abilities: [
      whenYouScry([{ kind: 'pump', to: 'self', power: 1, toughness: 0, cantBeBlocked: true }], {
        oncePerTurn: true,
      }),
    ],
  },
  // "Whenever Elrond or another creature you control enters, scry 1. If this is the second time this ability has resolved this turn,
  // the Ring tempts you."
  'Elrond, Lord of Rivendell': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'selfOrCreatureEtb', filter: {} },
        targets: [],
        effects: [
          scry(1),
          { kind: 'noteResolution' },
          { kind: 'if', condition: { kind: 'resolvedThisTurn', n: 2 }, then: [ringTempts] },
        ],
      },
    ],
  },
  "Arwen's Gift": {
    costReductionIf: {
      condition: {
        kind: 'controlsCreature',
        filter: { supertypes: ['Legendary'] },
        count: 2,
      },
      amount: 1,
    },
    ...spell([], scry(2), draw(2)),
  },
  'Isolation at Orthanc': spell([creature], { kind: 'putInLibrary', what: t0, position: 'second' }),
  "Council's Deliberation": {
    ...spell([], draw(1)),
    abilities: [
      // "Whenever you scry, if you control an Island, you may exile this card from your graveyard. If you do, draw a card."
      whenYouScry(
        [
          {
            kind: 'may',
            effects: [
              custom('ltrExileSelfFromGraveyard'),
              {
                kind: 'if',
                condition: {
                  kind: 'amountAtLeast',
                  amount: { exiledThisWay: true },
                  min: 1,
                },
                then: [draw(1)],
              },
            ],
          },
        ],
        { fromGraveyard: true, condition: youControlAnIsland },
      ),
    ],
  },
  'Pelargir Survivor': {
    abilities: [
      // "{T}: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell."
      ...anyColor().map((a) => ({ ...a, onlyFor: 'InstantOrSorcery' }) as AbilityDef),
      {
        kind: 'activated',
        cost: { mana: mana('{5}{U}'), tapSelf: true },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'mill', count: 3, who: t0 }],
      },
    ],
  },
  // Flying is printed.
  'Meneldor, Swift Savior': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [{ ...creature, optional: true, filter: { ownedBySourceController: true } }],
        { kind: 'blink', what: t0 },
      ),
    ],
  },
  // Flying is printed.
  'Ithilien Kingfisher': { abilities: [when({ on: 'dies' }, [], draw(1))] },
  'Glorious Gale': spell([{ what: 'spell', filter: { types: ['Creature'] } }], {
    kind: 'if',
    // Read while the spell is still on the stack.
    condition: { kind: 'targetMatches', target: 0, filter: { supertypes: ['Legendary'] } },
    then: [{ kind: 'counter', what: t0 }, ringTempts],
    else: [{ kind: 'counter', what: t0 }],
  }),
  'Bewitching Leechcraft': {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }),
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          grantAbilities: [{ kind: 'static', effect: { kind: 'untapRemovesCounter' } }],
        },
      },
    ],
  },
  'Elvish Mariner': {
    abilities: [
      when({ on: 'attacks' }, [], scry(1)),
      // X is the number of cards looked at while scrying (the trigger's amount).
      whenYouScry([{ kind: 'tap', what: { targetsFrom: 0 } }], {
        targets: [
          { what: 'permanent', filter: { nonland: true }, anyNumber: true, optional: true, maxFromAmount: true },
        ],
      }),
    ],
  },
  'Minas Tirith Garrison': {
    powerEquals: { count: 'cardsInHand' },
    abilities: [
      // "You may tap any number of untapped Humans you control. Draw a card for each Human tapped this way."
      when({ on: 'attacks' }, [], custom('ltrGarrisonTap')),
    ],
  },
  'The Bath Song': {
    saga: 3,
    abilities: [
      chapter([1, 2], [], draw(2), { kind: 'discard', count: 1 }),
      chapter(
        [3],
        [{ what: 'graveyardCard', controller: 'you', anyNumber: true, optional: true }],
        custom('ltrBathSongShuffle'),
        { kind: 'addMana', mana: [['U'], ['U']] },
      ),
    ],
  },
  'Captain of Umbar': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
    ],
  },
  'Horses of the Bruinen': spell(
    [{ what: 'creature', anyNumber: true, maxTargets: 2 }],
    { kind: 'bounce', what: { targetsFrom: 0 } },
    scry(1),
    ringTempts,
  ),
};

/** Back faces: keyed by their own names. */
export const LTR_BLUE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_BLUE_TOKENS: CardDefinition[] = [];
