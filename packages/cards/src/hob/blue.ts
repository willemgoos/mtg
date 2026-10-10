import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  draw,
  mana,
  onEnter,
  prowess,
  t0,
  theirCreature,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { chapter, equip, mode, spell } from '../fin/helpers.ts';
import { recruit } from '../hob-vocab.ts';

/**
 * The Hobbit (20b): blue cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_BLUE_BACKS. See docs/the-hobbit-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const creature: TargetSpec = { what: 'creature' };
/** "Threshold": seven or more cards in your graveyard. */
const threshold = { kind: 'graveyardCount', min: 7 } as const;
const instantOrSorcery: CardFilter = { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }] };
/** "Draw a card, then discard a card." */
const loot: EffectDef[] = [draw(1), { kind: 'discard', count: 1 }];
const blinkable: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { types: ['Creature', 'Land'] },
};
const elrondTarget: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { nonland: true, other: true },
  optional: true,
};
/** "Whenever you draw a card" / "your second card each turn" counters. */
const counterOnSelf: EffectDef = { kind: 'counters', to: 'self', amount: 1 };
const recruitOnEnter: AbilityDef = when({ on: 'etb' }, [], recruit);

export const HOB_BLUE: Record<string, Behavior> = {
  "Wizard's Staff": {
    abilities: [
      // "Equipped creature has prowess" and "if a triggered ability of equipped creature triggers, that ability triggers an
      // additional time" (granted to the creature as it attaches; only its own abilities, not another Equipment's).
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          grantAbilities: [
            prowess,
            { kind: 'static', effect: { kind: 'equippedTriggersTwice', creatureOnly: true } },
          ],
        },
      },
      equip('{1}', { subtype: 'Wizard' }, 'Equip Wizard {1}'),
      equip('{3}'),
    ],
  },
  'Uncover the Moon-Letters': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [
          // Drawing no cards (a spell cast with no mana spent) is not "doing" it.
          {
            kind: 'if',
            condition: { kind: 'amountAtLeast', amount: { manaSpentOnSubject: true }, min: 1 },
            then: [
              {
                kind: 'may',
                effects: [
                  { kind: 'draw', who: 'controller', amount: { manaSpentOnSubject: true } },
                  { kind: 'discard', count: 2 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  'Gandalf, Wandering Wizard': {
    // Ward {3} is printed (Scryfall).
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [],
        effects: [custom('hobGandalfShuffle')],
      },
    ],
  },
  'Riddles in the Dark': spell([], { kind: 'piles', count: 4 }),
  'Most Decrepit Old Bird': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'while', condition: threshold, power: 1, toughness: 1 },
      },
    ],
  },
  'Elrond, Moon-Reader': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youActivateCreatureAbility' },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}{U}{U}') },
        // "Up to two other target nonland permanents you control": two optional targets (different ones).
        targets: [elrondTarget, elrondTarget],
        effects: [{ kind: 'exileUntilEndStep', what: { targetsFrom: 0 }, together: true }],
      },
    ],
  },
  // Vigilance and ward {2} are printed.
  'Lake-town Mariners': {},
  'Bilbo, Thief in the Night': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsFromOutsideHandCostLess', amount: 1 } },
      when({ on: 'attacks' }, [], {
        kind: 'castFromYourGraveyard',
        filter: {
          anyOf: [{ types: ['Artifact'] }, { types: ['Instant'] }, { types: ['Sorcery'] }],
        },
        exileInstantsSorceries: true,
      }),
    ],
  },
  "Old Fat Spider Can't See Me": {
    saga: 4,
    abilities: [
      chapter([1], [yourCreature], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        keywords: ['hexproof'],
        whileSource: true,
      }),
      chapter([2], [{ ...creature, optional: true }], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        preventDamageDealt: true,
        whileSource: true,
      }),
      chapter([3, 4], [], draw(1)),
    ],
  },
  'Bilbo Baggins, Burglar': { abilities: [onEnter(draw(1))] },
  'Fateful Discovery': {
    abilities: [when({ on: 'otherPermanentEtb', filter: { types: ['Artifact'] } }, [], draw(1))],
  },
  'Bilbo, Luckwearer': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
      when({ on: 'combatDamageToPlayer' }, [], ...loot),
    ],
  },
  'The Lord of the Eagles': {
    // Flash and flying are printed.
    costReduction: { count: 'totalPowerOfCreaturesYouControl', hasKeyword: 'flying' },
  },
  "Elvenking's Harper": {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{4}{U}') },
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Confusticate and Bebother': {
    modes: [
      mode('Counter target spell unless its controller pays {4}', [{ what: 'spell' }], {
        kind: 'counterUnlessPays',
        what: t0,
        cost: mana('{4}'),
      }),
      mode('Draw two cards, then discard a card', [], draw(2), { kind: 'discard', count: 1 }),
    ],
  },
  'Roll-Roll-Roll-Roll': {
    saga: 4,
    abilities: [
      chapter([1, 2, 3, 4], [{ ...blinkable, optional: true }], {
        kind: 'exileUntilEndStep',
        what: t0,
      }),
    ],
  },
  'Lakeshore Apothecary': {
    abilities: [when({ on: 'drawSecondCard' }, [], counterOnSelf)],
  },
  'Ravenhill Flock': {
    abilities: [when({ on: 'drawCard', whose: 'yours' }, [], counterOnSelf)],
  },
  "Enchanted River's Grasp": {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }, custom('hobRemoveAllCountersAttached')),
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          loseAbilities: true,
          doesntUntap: true,
        },
      },
    ],
  },
  'Mirkwood Meditator': {
    abilities: [
      when({ on: 'landfall' }, [], {
        kind: 'may',
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, basePT: [4, 2] }],
      }),
    ],
  },
  "Master's Councillors": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { multiply: 2, amount: { graveyardsWithAtLeast: 7 } },
          toughness: 0,
        },
      },
      when({ on: 'drawSecondCard' }, [{ what: 'player' }], { kind: 'mill', count: 3, who: t0 }),
    ],
  },
  'Plunder the Trollshaws': {
    ...spell([], {
      kind: 'if',
      condition: { kind: 'castFromGraveyard' },
      then: [draw(2)],
      else: [draw(1)],
    }),
    flashback: mana('{3}{U}'),
  },
  'Great Gilded Boat': {
    abilities: [
      when({ on: 'youAttack' }, [], recruit),
      {
        kind: 'activated',
        cost: { crew: 2 },
        targets: [],
        effects: [{ kind: 'becomeCreature', what: 'self' }],
        label: 'Crew 2',
      },
    ],
  },
  'Elven Raft-Steerer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [],
        modes: [
          mode('Tap target creature an opponent controls', [theirCreature], {
            kind: 'tap',
            what: t0,
          }),
          mode('Untap target creature you control', [yourCreature], { kind: 'untap', what: t0 }),
        ],
      },
    ],
  },
  'Long Lake Nuisance': { abilities: [recruitOnEnter] },
  'Sound the Trumpets': spell([{ what: 'spell' }], {
    kind: 'if',
    // Checked while the spell is still on the stack: its mana value (X counted) is read before it is countered.
    condition: { kind: 'targetMatches', target: 0, filter: { maxManaValue: 2 } },
    then: [{ kind: 'counter', what: t0 }, recruit],
    else: [{ kind: 'counter', what: t0 }],
  }),
  'Uneasy Partings': {
    ...spell([{ what: 'creature' }], { kind: 'chooseCustom', handler: 'eclLibraryChoice' }),
    costReductionIfTarget: { filter: { attacking: true, nontoken: true }, amount: 1 },
  },
  "Thranduil's Decree": spell([{ what: 'spell' }], custom('hobThranduilsDecree')),
};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_BLUE_BACKS: Record<string, Behavior> = {
  'Speak Secrets': spell([], {
    kind: 'millThenTake',
    count: 4,
    filter: instantOrSorcery,
    required: true,
  }),
  'Gone Fishing': spell([blinkable, blinkable], {
    kind: 'blink',
    what: { targetsFrom: 0 },
    together: true,
  }),
  'Take a Glance': spell([], { kind: 'scry', amount: 2 }),
  "Burglar's Plot": spell(
    [
      { what: 'permanent', filter: { nonland: true } },
      { what: 'permanent', filter: { nonland: true }, sharesCardTypeWithPrevious: true },
    ],
    custom('hobExchangeControl'),
  ),
};

/** Tokens only this group's cards make. */
export const HOB_BLUE_TOKENS: CardDefinition[] = [];
