import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, draw, drain, gain, onEnter, prowess, t0, t1, when, yourCreature, yours } from '../blb/helpers.ts';
import { renew } from '../tdm-vocab.ts';
import { mana } from '../blb/helpers.ts';
import { TDM_MONK, TDM_SPIRIT } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): the Abzan, Jeskai and Sultai cards and the five-colour one (Mardu and Temur are in clans-b.ts). Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_CLANS_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

/** A Saga chapter: "I, II — ...". */
const chapter = (
  chapters: number[],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'chapter', chapters },
  targets,
  effects,
});
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
/** "Distribute three +1/+1 counters among one, two, or three target creatures you control" (chosen step by step). */
const distributeThree: EffectDef = {
  kind: 'divide',
  amount: 3,
  maxTargets: 3,
  spec: yourCreature,
  give: 'counters',
  atLeastOne: true,
};

export const TDM_CLANS: Record<string, Behavior> = {
  // ---- Abzan (white-black-green) ----
  'Skirmish Rhino': { abilities: [onEnter(...drain(2))] },
  'Reputable Merchant': {
    abilities: [
      when({ on: 'etb' }, [yourCreature], { kind: 'counters', to: t0, amount: 1 }),
      when({ on: 'dies' }, [yourCreature], { kind: 'counters', to: t0, amount: 1 }),
    ],
  },
  'Severance Priest': {
    abilities: [
      // "Target opponent reveals their hand. You may choose a nonland card from it. If you do, exile that card."
      when({ on: 'etb' }, [{ what: 'player', controller: 'opponent' }], {
        kind: 'chooseFromOpponentHand',
        filter: { nonland: true },
        then: 'exile',
        linkToSource: true,
        optional: true,
      }),
      when({ on: 'leavesBattlefield' }, [], custom('severanceToken')),
    ],
  },
  'Felothar, Dawn of the Abzan': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { nonland: true },
            includeSource: true,
            then: [{ kind: 'reflexiveTrigger', ability: 2 }],
          },
        ],
      }),
      when({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: { nonland: true },
            includeSource: true,
            then: [{ kind: 'reflexiveTrigger', ability: 2 }],
          },
        ],
      }),
      // "When you do, put a +1/+1 counter on each creature you control."
      when({ on: 'reflexive' }, [], { kind: 'counters', to: yours, amount: 1 }),
    ],
  },
  'Yathan Roadwatcher': {
    abilities: [
      // "When this creature enters, if you cast it, mill four cards. When you do, return target creature card with mana value 3 or less."
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasCast' },
        targets: [],
        effects: [{ kind: 'mill', count: 4 }, { kind: 'reflexiveTrigger', ability: 1 }],
      },
      when(
        { on: 'reflexive' },
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'], maxManaValue: 3 } }],
        { kind: 'returnToBattlefield', what: t0 },
      ),
    ],
  },
  'Armament Dragon': { abilities: [onEnter(distributeThree)] },
  Perennation: {
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { notTypes: ['Instant', 'Sorcery'] },
        },
      ],
      effects: [
        {
          kind: 'returnToBattlefield',
          what: t0,
          counters: ['hexproof', 'indestructible'],
        },
      ],
    },
  },
  'Revival of the Ancestors': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'createToken', token: TDM_SPIRIT, count: 3, pt: 1 }),
      chapter([2], [], distributeThree),
      chapter([3], [], {
        kind: 'pump',
        to: yours,
        power: 0,
        toughness: 0,
        keywords: ['trample', 'lifelink'],
      }),
    ],
  },
  'Betor, Kin to All': {
    abilities: [
      // Each step checks the total toughness again as it happens.
      atYourEndStep(
        {
          kind: 'amountAtLeast',
          amount: { count: 'totalToughnessOfCreaturesYouControl' },
          min: 10,
        },
        [],
        draw(1),
        {
          kind: 'if',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'totalToughnessOfCreaturesYouControl' },
            min: 20,
          },
          then: [{ kind: 'untap', what: yours }],
        },
        {
          kind: 'if',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'totalToughnessOfCreaturesYouControl' },
            min: 40,
          },
          then: [{ kind: 'loseLife', who: 'eachOpponent', amount: { count: 'opponentLifeHalf' } }],
        },
      ),
    ],
  },

  // ---- Jeskai (blue-red-white) ----
  'Monastery Messenger': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            optional: true,
            filter: { nonland: true, notTypes: ['Creature'] },
          },
        ],
        { kind: 'putInLibrary', what: t0, position: 'top' },
      ),
    ],
  },
  'Jeskai Shrinekeeper': {
    abilities: [when({ on: 'combatDamageToPlayer' }, [], gain(1), draw(1))],
  },
  'Jeskai Brushmaster': { abilities: [prowess] },
  'Jeskai Revelation': {
    spell: {
      targets: [{ what: 'spell', orPermanent: true }, { what: 'any' }],
      effects: [
        { kind: 'returnSpellToHand', what: t0, orPermanent: true },
        { kind: 'damage', amount: 4, to: t1 },
        { kind: 'createToken', token: TDM_MONK, count: 2 },
        draw(2),
        gain(4),
      ],
    },
  },
  'Narset, Jeskai Waymaster': {
    abilities: [
      atYourEndStep(undefined, [], {
        kind: 'may',
        effects: [{ kind: 'discardHand' }, { kind: 'draw', who: 'controller', amount: { count: 'spellsCastThisTurn' } }],
      }),
    ],
  },
  'Shiko, Paragon of the Way': {
    abilities: [
      // "Exile target nonland card with mana value 3 or less from your graveyard. Copy it, then you may cast the copy without paying its mana cost."
      when(
        { on: 'etb' },
        [{ what: 'graveyardCard', controller: 'you', filter: { nonland: true, maxManaValue: 3 } }],
        { kind: 'exileCopyCastFree', from: 0, budget: 3 },
      ),
    ],
  },
  'Flamehold Grappler': {
    abilities: [
      // "Copy the next spell you cast this turn when you cast it. You may choose new targets for the copy."
      onEnter({
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: when({ on: 'castSpell', filter: 'any' }, [], {
          kind: 'copySpell',
          what: 'subject',
          newTargets: true,
        }),
      }),
    ],
  },
  'Riverwheel Sweep': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: 3, to: t0 },
        // "Exile the top two cards of your library. Choose one of them. Until the end of your next turn, you may play that card."
        { kind: 'exileTopChooseOne', count: 2 },
      ],
    },
  },
  'New Way Forward': {
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'nwfSource' }] },
  },
  'Rediscover the Way': {
    saga: 3,
    abilities: [
      chapter([1, 2], [], { kind: 'chooseCustom', handler: 'rediscoverPick' }),
      chapter([3], [], {
        kind: 'emblem',
        until: 'endOfTurn',
        label: 'Whenever you cast a noncreature spell this turn, target creature you control gains double strike until end of turn.',
        ability: when({ on: 'castSpell', filter: 'noncreature' }, [yourCreature], {
          kind: 'pump',
          to: t0,
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike'],
        }),
      }),
    ],
  },

  // ---- Sultai (black-green-blue) ----
  'Death Begets Life': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'destroyAll',
          permanents: true,
          filter: { anyOf: [{ types: ['Creature'] }, { types: ['Enchantment'] }] },
          drawPerDestroyed: true,
        },
      ],
    },
  },
  'Awaken the Honored Dead': {
    saga: 3,
    abilities: [
      chapter([1], [{ what: 'permanent', filter: { nonland: true } }], { kind: 'destroy', what: t0 }),
      chapter([2], [], { kind: 'mill', count: 3 }),
      // "You may discard a card. When you do, return target creature or land card from your graveyard to your hand."
      chapter([3], [], {
        kind: 'may',
        effects: [{ kind: 'discard', count: 1, then: [{ kind: 'reflexiveTrigger', ability: 3 }] }],
      }),
      when(
        { on: 'reflexive' },
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature', 'Land'] } }],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Teval, Arbiter of Virtue': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsHaveDelve' } },
      when({ on: 'castSpell', filter: 'any' }, [], {
        kind: 'loseLife',
        who: 'controller',
        amount: { manaValueOfSubject: true },
      }),
    ],
  },
  'Rakshasa\'s Bargain': {
    spell: { targets: [], effects: [{ kind: 'lookTakeRestGraveyard', count: 4, take: 2 }] },
  },
  "Fangkeeper's Familiar": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'You gain 3 life and surveil 3',
            targets: [],
            effects: [gain(3), { kind: 'surveil', amount: 3 }],
          },
          {
            label: 'Destroy target enchantment',
            targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
            effects: [{ kind: 'destroy', what: t0 }],
          },
          {
            label: 'Counter target creature spell',
            targets: [{ what: 'spell', filter: { types: ['Creature'] } }],
            effects: [{ kind: 'counter', what: t0 }],
          },
        ],
      },
    ],
  },
  'Lotuslight Dancers': {
    abilities: [
      // "Search your library for a black card, a green card, and a blue card. Put those cards into your graveyard, then shuffle."
      onEnter(
        { kind: 'searchLibrary', filter: { colors: ['B'] }, to: 'graveyard', shuffle: false },
        { kind: 'searchLibrary', filter: { colors: ['G'] }, to: 'graveyard', shuffle: false },
        { kind: 'searchLibrary', filter: { colors: ['U'] }, to: 'graveyard' },
      ),
    ],
  },
  'Kheru Goldkeeper': {
    abilities: [
      // "Whenever one or more cards leave your graveyard during your turn" (once for the cards that leave together).
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        batch: true,
        condition: { kind: 'yourTurn' },
        targets: [],
        effects: [treasure],
      },
      renew(
        mana('{2}{B}{G}{U}'),
        [{ what: 'creature' }],
        [
          { kind: 'counters', to: t0, amount: 2 },
          { kind: 'namedCounters', name: 'flying', amount: 1, to: t0 },
        ],
      ),
    ],
  },
  'Lie in Wait': {
    spell: {
      targets: [
        { what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } },
        { what: 'creature' },
      ],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'damage', amount: { powerOfCard: t0 }, to: t1 },
      ],
    },
  },
  'Kotis, the Fangkeeper': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'castFreeFromTop',
        count: { event: 'amount' },
        from: 'opponents',
        maxManaValue: { event: 'amount' },
        rest: 'exile',
        more: true,
      }),
    ],
  },
  'Gurmag Nightwatch': {
    abilities: [
      onEnter({
        kind: 'lookAndTake',
        count: 3,
        filter: {},
        to: 'libraryTop',
        restToGraveyard: true,
      }),
    ],
  },

  // ---- Five colours ----
  'Call the Spirit Dragons': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Dragon' },
          power: 0,
          toughness: 0,
          keywords: ['indestructible'],
        },
      },
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('csdStart')),
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_CLANS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_CLANS_TOKENS: CardDefinition[] = [];
