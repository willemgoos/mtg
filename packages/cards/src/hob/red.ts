import type { AbilityDef, Amount, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { draw, pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { combos, equip } from '../msc/helpers.ts';
import {
  amassGoblins,
  enduringStory,
  storied,
  storyPump,
  subtypecycling,
} from '../hob-vocab.ts';
import { HOB_DRAGON } from './tokens.ts';

/**
 * The Hobbit (20b): red cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_RED_BACKS. See docs/the-hobbit-plan.md.
 */

const HOB_AXE = 'hob-axe-token';
const HOB_STONE_BOULDER = 'hob-stone-boulder-token';

const creature: TargetSpec = { what: 'creature' };
const upTo = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
const yourEquipment: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { subtype: 'Equipment' },
};
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const treasuresYouControl: Amount = {
  count: 'permanentsYouControl',
  filter: { subtype: 'Treasure' },
};
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** A Saga chapter: "I, II — ...". */
const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => when({ on: 'chapter', chapters }, targets, ...effects);

/** "Equipped creature gets +N/+0." */
const equippedPower = (power: number): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'attached', power, toughness: 0 },
});

export const HOB_RED: Record<string, Behavior> = {
  // Storied. "Whenever Balin or another Dwarf you control enters, you may discard your hand. Draw X cards, where X is the number
  // of cards discarded this way. If you have an enduring story, Balin deals X damage to each opponent."
  'Balin, Loremaster': {
    abilities: [
      storied,
      when({ on: 'selfOrCreatureEtb', filter: { subtype: 'Dwarf' } }, [], {
        kind: 'may',
        effects: [custom('hobBalinDiscardDraw')],
      }),
    ],
  },

  // Storied. "Bombur doesn't untap during your untap step unless you have an enduring story."
  'Bombur, Gentle Dreamer': {
    abilities: [storied, { kind: 'static', effect: { kind: 'doesntUntap', unless: enduringStory } }],
  },

  // "Whenever you cast a noncreature spell, amass Goblins 1."
  'Bothersome Noisemaker': {
    abilities: [when({ on: 'castSpell', filter: 'noncreature' }, [], amassGoblins(1))],
  },

  // "I — This Saga deals 6 damage to target creature an opponent controls. II — Destroy target artifact an opponent controls.
  // III, IV — Add {R}."
  'Burn, Burn, Tree and Fern': {
    saga: 4,
    abilities: [
      chapter([1], [{ what: 'creature', controller: 'opponent' }], {
        kind: 'damage',
        amount: 6,
        to: t0,
      }),
      chapter([2], [{ what: 'permanent', controller: 'opponent', filter: { types: ['Artifact'] } }], {
        kind: 'destroy',
        what: t0,
      }),
      chapter([3, 4], [], { kind: 'addMana', mana: [['R']] }),
    ],
  },

  // "When Dáin enters, create a colorless Equipment artifact token named Axe with 'Equipped creature gets +1/+0' and equip {2}.
  // When you do, attach it to target creature you control."
  // "Whenever Dáin attacks, each equipped attacking creature gains double strike until end of turn."
  'Dáin Ironfoot': {
    abilities: [
      when(
        { on: 'etb' },
        [],
        { kind: 'createToken', token: HOB_AXE, count: 1 },
        { kind: 'reflexiveTrigger', ability: 1, subject: 'chosen' },
      ),
      when({ on: 'reflexive' }, [yourCreature], { kind: 'attach', what: 'subject', to: t0 }),
      when(
        { on: 'attacks' },
        [],
        pump(
          { each: 'creature', controller: 'you', filter: { equipped: true, attacking: true } },
          0,
          0,
          ['doubleStrike'],
        ),
      ),
    ],
  },

  // "This creature gets +2/+0 for each Mountain you control."
  // "Whenever you attack with creatures with total power 12 or greater for the first time each turn, untap all attacking
  // creatures. After this phase, there is an additional combat phase."
  'Desert Were-Worm': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: { multiply: 2, amount: { count: 'landsYouControl', subtype: 'Mountain' } },
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        condition: {
          kind: 'amountAtLeast',
          amount: { count: 'totalPowerOfCreaturesYouControl', attacking: true },
          min: 12,
        },
        oncePerTurn: true,
        targets: [],
        effects: [
          { kind: 'untap', what: { each: 'creature', controller: 'you', filter: { attacking: true } } },
          { kind: 'extraCombat' },
        ],
      },
    ],
  },

  // "Desolation of Smaug deals 3 damage to each non-Dragon creature. Add four mana in any combination of colors. Spend this
  // mana only to cast Dragon spells."
  'Desolation of Smaug': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'damage',
          amount: 3,
          to: { each: 'creature', filter: { notSubtype: 'Dragon' } },
        },
        {
          kind: 'addMana',
          mana: [
            ['W', 'U', 'B', 'R', 'G'],
            ['W', 'U', 'B', 'R', 'G'],
            ['W', 'U', 'B', 'R', 'G'],
            ['W', 'U', 'B', 'R', 'G'],
          ],
          onlyFor: 'Dragon',
        },
      ],
    },
  },

  // "Flying". Adventure: Spew Flame (HOB_RED_BACKS).
  'Smaug, the Great Calamity': {},

  // "Trample". "When Dori enters, create a Treasure token."
  'Dori, Bearer of Friends': {
    abilities: [when({ on: 'etb' }, [], treasure)],
  },

  // "Equip abilities you activate that target this creature cost {2} less to activate."
  'Dwarven Mauler': {
    abilities: [
      { kind: 'static', effect: { kind: 'equipCostsLess', amount: 2, targetSelf: true } },
    ],
  },

  // "Whenever you cast a noncreature spell, Gandalf gets +1/+1 until end of turn and deals 1 damage to each opponent."
  "Gandalf, Goblins' Bane": {
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [],
        pump('self', 1, 1),
        { kind: 'damage', amount: 1, to: 'eachOpponent' },
      ),
    ],
  },

  // "Reach". "When Gandalf enters, he deals 3 damage divided as you choose among one, two, or three targets."
  'Gandalf, Spark Starter': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'divide',
        amount: 3,
        maxTargets: 3,
        spec: { what: 'any' },
        give: 'damage',
        atLeastOne: true,
      }),
    ],
  },

  // "When this artifact is put into a graveyard from the battlefield, reveal the top thirteen cards of your library. Put a
  // random creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."
  'Getaway Barrel': {
    abilities: [when({ on: 'selfToGraveyard' }, [], custom('hobGetawayBarrel'))],
  },

  // "At the beginning of your first main phase, add {R}{R}."
  'Glóin the Mighty': {
    abilities: [when({ on: 'beginningOfMain', which: 1 }, [], { kind: 'addMana', mana: [['R'], ['R']] })],
  },

  // "Haste". "When this creature enters, amass Goblins 1."
  'Goblin-town Flunkies': {
    abilities: [when({ on: 'etb' }, [], amassGoblins(1))],
  },

  // "When this creature enters, exile the top card of your library. Until the end of your next turn, you may play that card."
  'Gundabad Opportunist': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }),
    ],
  },

  // "Reach, trample". "When this creature enters, attach target Equipment you control to up to one target creature you control."
  'Iron Hills Stalwart': {
    abilities: [
      when({ on: 'etb' }, [yourEquipment, upTo(yourCreature)], {
        kind: 'attach',
        what: t0,
        to: t1,
      }),
    ],
  },

  // "Whenever a Mountain you control enters, put a quest counter on this enchantment. If it has six or more quest counters on
  // it, sacrifice it. If you do, search your hand and/or library for a Dragon card and put it onto the battlefield. If you
  // search your library this way, shuffle." Mountaincycling {2}.
  "Last Light of Durin's Day": {
    abilities: [
      when(
        { on: 'otherPermanentEtb', filter: { subtype: 'Mountain' } },
        [],
        { kind: 'namedCounters', name: 'quest', amount: 1 },
        {
          kind: 'if',
          condition: { kind: 'sourceNamedCounters', name: 'quest', min: 6 },
          then: [
            { kind: 'putFromHandOrLibrary', filter: { subtype: 'Dragon' }, sacrificeSource: true },
          ],
        },
      ),
      subtypecycling('Mountain', '{2}'),
    ],
  },

  // "Whenever you attack, amass Goblins 2."
  'Misty Mountains Raider': {
    abilities: [when({ on: 'youAttack' }, [], amassGoblins(2))],
  },

  // Storied. "As long as you have an enduring story, Óin gets +1/+0 and has haste."
  // "{1}, {T}, Discard a card: Draw a card."
  'Óin the Brave': {
    abilities: [
      storied,
      storyPump(1, 0, ['haste']),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, discard: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },

  // "Choose one or both — • Pinecone Strike deals 3 damage to target creature. If that creature would die this turn, exile it
  // instead. • Destroy target artifact token."
  'Pinecone Strike': {
    modes: combos(
      [
        {
          label: 'Pinecone Strike deals 3 damage to target creature',
          targets: [creature],
          effects: [
            { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
            { kind: 'damage', amount: 3, to: t0 },
          ],
        },
        {
          label: 'Destroy target artifact token',
          targets: [{ what: 'permanent', filter: { types: ['Artifact'], token: true } }],
          effects: [{ kind: 'destroy', what: t0 }],
        },
      ],
      [1, 2],
    ),
  },

  // "When this Equipment enters, you may discard a card. If you do, draw two cards." "Equipped creature gets +2/+0." Equip {3}.
  'Ragged Short Spear': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'may',
        effects: [{ kind: 'discard', count: 1, then: [draw(2)] }],
      }),
      equippedPower(2),
      equip('{3}'),
    ],
  },

  // "Flying, haste". "Whenever Smaug attacks, he deals damage equal to the number of Treasures you control to any target."
  // "At the beginning of your upkeep, create a Treasure token."
  'Smaug the Magnificent': {
    abilities: [
      when({ on: 'attacks' }, [{ what: 'any' }], {
        kind: 'damage',
        amount: treasuresYouControl,
        to: t0,
      }),
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], treasure),
    ],
  },

  // "Target creature gets +3/+0 and gains reach and first strike until end of turn."
  "Smaug's Fury": {
    spell: {
      targets: [creature],
      effects: [pump(t0, 3, 0, ['reach', 'firstStrike'])],
    },
  },

  // "Sacrifice another creature or artifact: Exile the top card of your library. You may play it until the end of your next
  // turn. Activate only during your turn and only once each turn."
  'Snowslope Hunter': {
    abilities: [
      {
        kind: 'activated',
        cost: {
          sacrificePermanent: {
            anyOf: [
              { types: ['Creature'], other: true },
              { types: ['Artifact'], other: true },
            ],
          },
        },
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }],
      },
    ],
  },

  // "Whenever this creature enters or attacks, create a 3/1 colorless Wall artifact creature token with defender named Stone
  // Boulder." "{2}{R}, Sacrifice an artifact: This creature deals 4 damage to any target."
  'Stone-Giant of High Pass': {
    abilities: [
      when({ on: 'etb' }, [], { kind: 'createToken', token: HOB_STONE_BOULDER, count: 1 }),
      when({ on: 'attacks' }, [], { kind: 'createToken', token: HOB_STONE_BOULDER, count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}'), sacrificePermanent: { types: ['Artifact'] } },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
      },
    ],
  },

  // "I, II, III, IV — Create a Treasure token. Then if you control four or more Treasures, sacrifice this Saga. If you do,
  // create a 6/6 red Dragon creature token with flying."
  'The Misty Mountains Cold': {
    saga: 4,
    abilities: [
      chapter([1, 2, 3, 4], [], treasure, {
        kind: 'if',
        condition: { kind: 'amountAtLeast', amount: treasuresYouControl, min: 4 },
        then: [
          {
            kind: 'sacrifice',
            what: 'self',
            then: [{ kind: 'createToken', token: HOB_DRAGON, count: 1 }],
          },
        ],
      }),
    ],
  },

  // "Trample". "When Thorin enters, attach any number of target Equipment you control to target creature you control. When one
  // or more Equipment become attached to that creature this way, that creature deals damage equal to its power to up to one
  // target creature."
  'Thorin, Mountain-king': {
    abilities: [
      when(
        { on: 'etb' },
        [yourCreature, { ...yourEquipment, anyNumber: true }],
        custom('hobThorinAttach', { reflexive: 1 }),
      ),
      when({ on: 'reflexive' }, [upTo(creature)], {
        kind: 'damage',
        amount: { powerOf: 'subject' },
        to: t0,
        from: 'subject',
      }),
    ],
  },

  // "Amass Goblins 1. If this spell was cast from a graveyard, amass Goblins 3 instead." Flashback {3}{R}.
  'Tidings of War': {
    flashback: mana('{3}{R}'),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'castFromGraveyard' },
          then: [amassGoblins(3)],
          else: [amassGoblins(1)],
        },
      ],
    },
  },
};

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_RED_BACKS: Record<string, Behavior> = {
  // "Look at the top two cards of your library and exile them face down. For as long as they remain exiled, you may play them
  // if you control a Wizard."
  Flameshape: { spell: { targets: [], effects: [custom('hobFlameshape')] } },
  // "Easy Pickings deals 1 damage to each creature your opponents control."
  'Easy Pickings': {
    spell: {
      targets: [],
      effects: [{ kind: 'damage', amount: 1, to: { each: 'creature', controller: 'opponent' } }],
    },
  },
  // "Spew Flame deals 5 damage to target creature."
  'Spew Flame': {
    spell: { targets: [creature], effects: [{ kind: 'damage', amount: 5, to: t0 }] },
  },
};

/** Tokens only this group's cards make. */
export const HOB_RED_TOKENS: CardDefinition[] = [
  // Dáin Ironfoot's Axe: "Equipped creature gets +1/+0." Equip {2}.
  {
    id: HOB_AXE,
    name: 'Axe',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Equipment'],
    keywords: [],
    abilities: [equippedPower(1), equip('{2}')],
    isToken: true,
  },
  // Stone-Giant of High Pass's Stone Boulder: a 3/1 colorless Wall artifact creature with defender.
  {
    id: HOB_STONE_BOULDER,
    name: 'Stone Boulder',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Wall'],
    power: 3,
    toughness: 1,
    keywords: ['defender'],
    abilities: [],
    isToken: true,
  },
];
