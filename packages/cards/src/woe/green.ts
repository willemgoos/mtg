import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  EffectDef,
  Ref,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { food, gain, mana, onEnter, pump, t0, when, yourCreature, yours } from '../blb/helpers.ts';
import { chapter, mode } from '../fin/helpers.ts';
import {
  bargain,
  createRole,
  foodsYouControl,
  HAS_ADVENTURE,
  whenEnchantmentYouControlEnters,
  whenEntersIfBargained,
} from '../woe-vocab.ts';

/**
 * Wilds of Eldraine (23): green cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (Adventure spell side) is keyed
 * by its own name in WOE_GREEN_BACKS. See docs/wilds-of-eldraine-plan.md.
 */

/** The 1/1 white Human creature token (Return from the Wilds, Welcome to Sweettooth). */
const HUMAN = 'woe-green-human-token';
const human: EffectDef = { kind: 'createToken', token: HUMAN, count: 1 };

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const counter = (to: Ref, amount: Amount = 1): EffectDef => ({
  kind: 'counters',
  to,
  amount,
});
const destroy: EffectDef = { kind: 'destroy', what: t0 };
const castSpell5 = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 5 } }, targets, ...effects);

const CREATURE: CardFilter = { types: ['Creature'] };
const theirCreature: TargetSpec = { what: 'creature', controller: 'opponent' };
const COLORS = ['W', 'U', 'B', 'R', 'G'] as ('W' | 'U' | 'B' | 'R' | 'G')[];

/**
 * "Choose one or more": every non-empty combination of the modes, in printed order (Sentinel of Lost Lore), each mode's target
 * numbers moved past the targets of the modes before it. The modes' targets are their own instances of "target" (`ofMode`).
 */
const chooseOneOrMore = (modes: SpellDef[]): SpellDef[] => {
  const out: SpellDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const picked = modes.filter((_, i) => mask & (1 << i));
    const targets: TargetSpec[] = [];
    const effects: EffectDef[] = [];
    for (const [k, m] of picked.entries()) {
      const shift = targets.length;
      targets.push(...m.targets.map((t) => ({ ...t, ofMode: k })));
      effects.push(
        ...m.effects.map(
          (e) =>
            JSON.parse(
              JSON.stringify(e).replace(
                /"target":(\d+)/g,
                (_, n: string) => `"target":${Number(n) + shift}`,
              ),
            ) as EffectDef,
        ),
      );
    }
    out.push({ label: picked.map((m) => m.label).join(' + '), targets, effects });
  }
  return out;
};

/** "Choose two": every pair of modes in printed order (Return from the Wilds). */
const chooseTwo = (modes: SpellDef[]): SpellDef[] =>
  chooseOneOrMore(modes).filter((m) => (m.label ?? '').split(' + ').length === 2);

export const WOE_GREEN: Record<string, Behavior> = {
  // "Whenever one or more artifacts you control enter, put two +1/+1 counters on this creature. This ability triggers only once each
  // turn. Whenever one or more enchantments you control enter, draw a card. This ability triggers only once each turn."
  'Elvish Archivist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Artifact'] } },
        oncePerTurn: true,
        batch: true,
        targets: [],
        effects: [counter('self', 2)],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Enchantment'] } },
        oncePerTurn: true,
        batch: true,
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  },

  // "{1}, Sacrifice a Food: This creature gets +2/+2 until end of turn. Activate only once each turn."
  'Hollow Scavenger': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificePermanent: { subtype: 'Food' } },
        oncePerTurn: true,
        targets: [],
        effects: [pump('self', 2, 2)],
      },
    ],
  },

  'Beanstalk Wurm': {},

  // "{T}: Add {G}. {1}{G}, {T}, Discard a card: Return this creature to its owner's hand."
  'Bramble Familiar': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}'), tapSelf: true, discard: true },
        targets: [],
        effects: [{ kind: 'bounce', what: 'self' }],
      },
    ],
  },

  // "Defender. At the beginning of combat on your turn, if you control a creature with power 4 or greater, this creature gets +1/+0
  // until end of turn and can attack this turn as though it didn't have defender."
  'Territorial Witchstalker': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [{ ...pump('self', 1, 0), ignoreDefender: true } as EffectDef],
      },
    ],
  },

  // "I — Create a 3/3 green Beast creature token. II — You may sacrifice a creature. If you do, search your library for a creature or
  // basic land card, reveal it, put it into your hand, then shuffle. III — Up to two target creatures each get +2/+2 and gain
  // trample until end of turn."
  "The Huntsman's Redemption": {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'createToken', token: 'beast-3-token', count: 1 }),
      chapter([2], [], {
        kind: 'may',
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 1,
            filter: CREATURE,
            then: [
              {
                kind: 'searchLibrary',
                filter: { anyOf: [CREATURE, { types: ['Land'], supertypes: ['Basic'] }] },
                to: 'hand',
                reveal: true,
              },
            ],
          },
        ],
      }),
      chapter(
        [3],
        [
          { what: 'creature', optional: true },
          { what: 'creature', optional: true },
        ],
        pump(t0, 2, 2, ['trample']),
        pump({ target: 1 }, 2, 2, ['trample']),
      ),
    ],
  },

  // "Target creature gets +1/+3 and gains reach until end of turn. Untap it."
  'Leaping Ambush': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [pump(t0, 1, 3, ['reach']), { kind: 'untap', what: t0 }],
    },
  },

  // "When this enchantment enters, create a Food token. Foods you control have '{T}: Add {G}.' {5}{G}{G}, Sacrifice this
  // enchantment: Creatures you control get +X/+X until end of turn, where X is the number of Foods you control. Activate only as a
  // sorcery."
  "Night of the Sweets' Revenge": {
    abilities: [
      onEnter(food),
      {
        kind: 'static',
        effect: {
          kind: 'grantMana',
          filter: { subtype: 'Food' },
          produces: ['G'],
          otherPermanents: true,
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}{G}{G}'), sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [pump(yours, foodsYouControl, foodsYouControl)],
      },
    ],
  },

  // "When this enchantment enters and whenever you cast a spell with mana value 5 or greater, draw a card."
  'Up the Beanstalk': {
    abilities: [
      onEnter({ kind: 'draw', who: 'controller', amount: 1 }),
      castSpell5([], { kind: 'draw', who: 'controller', amount: 1 }),
    ],
  },

  // "Whenever an Aura you control enters, draw a card."
  'Tanglespan Lookout': {
    abilities: [
      whenEnchantmentYouControlEnters([{ kind: 'draw', who: 'controller', amount: 1 }], [], {
        subtype: 'Aura',
      }),
    ],
  },

  'Titanic Growth': { spell: { targets: [{ what: 'creature' }], effects: [pump(t0, 4, 4)] } },

  // "{T}: Add {G}. {1}, {T}: Add one mana of any color."
  'Rootrider Faun': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
      {
        kind: 'activated',
        manaAbility: true,
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [COLORS] }],
      },
    ],
  },

  // "Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the
  // rest on the bottom of your library in any order." The rest stay on top while the card is chosen, then go down one at a time.
  'Commune with Nature': { spell: { targets: [], effects: [custom('woeCommune')] } },

  // "Whenever an enchantment you control enters, you may pay {2}. If you do, return this card from your graveyard to your hand."
  'Redtooth Vanguard': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Enchantment'] } },
        fromGraveyard: true,
        targets: [],
        effects: [
          { kind: 'may', cost: mana('{2}'), effects: [{ kind: 'returnSource', to: 'hand' }] },
        ],
      },
    ],
  },

  // "Trample. Whenever you cast a spell with mana value 5 or greater, put a +1/+1 counter on this creature."
  'Tempest Hart': { abilities: [castSpell5([], counter('self'))] },

  // "Enchant creature. Enchanted creature gets +2/+2. {4}{G}: Return this card from your graveyard to your hand."
  'Bestial Bloodline': {
    enchant: { what: 'creature' },
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 2 } },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}') },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },

  // "Look at the top five cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your
  // library in a random order. You may cast the exiled card this turn. At the beginning of the next combat phase this turn, target
  // creature you control deals damage equal to its power to up to one target creature you don't control."
  'Feral Encounter': {
    spell: {
      targets: [],
      effects: [
        { kind: 'lookAndTake', count: 5, filter: CREATURE, exilePlayable: true },
        {
          kind: 'emblem',
          until: 'endOfTurn',
          once: true,
          label:
            "At the beginning of the next combat phase this turn, target creature you control deals damage equal to its power to up to one target creature you don't control.",
          ability: {
            kind: 'triggered',
            trigger: { on: 'beginningOfCombat', whose: 'yours' },
            targets: [yourCreature, { ...theirCreature, optional: true }],
            effects: [{ kind: 'damage', amount: { powerOf: t0 }, to: { target: 1 }, from: t0 }],
          },
        },
      ],
    },
  },

  // "When this creature enters, create a Food token. {2}{G}: Until end of turn, target noncreature artifact you control becomes a
  // 4/4 artifact creature. {2}, {T}, Sacrifice this creature: You gain 3 life."
  'Tough Cookie': {
    abilities: [
      onEnter(food),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        targets: [
          {
            what: 'permanent',
            controller: 'you',
            filter: { types: ['Artifact'], notTypes: ['Creature'] },
          },
        ],
        effects: [{ kind: 'animate', what: t0, power: 4, toughness: 4 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain(3)],
      },
    ],
  },

  // "Bargain. When this creature enters, if it was bargained, exile target artifact or enchantment an opponent controls."
  'Troublemaker Ouphe': {
    ...bargain(),
    abilities: [
      whenEntersIfBargained(
        [{ kind: 'exile', what: t0 }],
        [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Artifact', 'Enchantment'] },
          },
        ],
      ),
    ],
  },

  // "Bargain. If this spell was bargained, target land you control becomes a 3/3 Elemental creature with haste that's still a land.
  // Search your library for a basic land card, reveal it, put it into your hand, then shuffle."
  'Brave the Wilds': {
    ...bargain({
      spell: {
        targets: [{ what: 'permanent', controller: 'you', filter: { types: ['Land'] } }],
        effects: [
          {
            kind: 'animate',
            what: t0,
            power: 3,
            toughness: 3,
            subtype: 'Elemental',
            keywords: ['haste'],
            permanent: true,
          },
          { kind: 'searchLibrary', filter: 'basicLand', to: 'hand', reveal: true },
        ],
      },
    }),
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand', reveal: true }],
    },
  },

  // "Any number of target enchanted creatures you control and up to one other target creature you control each deal damage equal to
  // their power to target creature you don't control." The target you don't control is target 0; the creatures that deal the damage
  // follow it. Whether there is another creature besides the enchanted ones is chosen first (a mode each, as Rite of Renewal does),
  // so every target keeps its own restriction.
  'Graceful Takedown': {
    modes: [
      mode(
        'Any number of enchanted creatures and one other creature deal damage',
        [
          theirCreature,
          { what: 'creature', controller: 'you' },
          { what: 'creature', controller: 'you', filter: { enchanted: true }, anyNumber: true },
        ],
        custom('woeGracefulTakedown'),
      ),
      mode(
        'Any number of enchanted creatures deal damage',
        [
          theirCreature,
          { what: 'creature', controller: 'you', filter: { enchanted: true }, anyNumber: true },
        ],
        custom('woeGracefulTakedown'),
      ),
    ],
  },

  // "Create a Monster Role token attached to target creature you control. When you do, that creature fights up to one target
  // creature you don't control." (The reflexive trigger is ability 0.)
  'Curse of the Werefox': {
    spell: {
      targets: [yourCreature],
      effects: [createRole('Monster'), { kind: 'reflexiveTrigger', ability: 0, subject: t0 }],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ ...theirCreature, optional: true }],
        effects: [{ kind: 'fight', a: 'subject', b: t0 }],
      },
    ],
  },

  // "I — Create a 1/1 white Human creature token. II — Create a Food token. III — Put X +1/+1 counters on target creature you
  // control, where X is one plus the number of Foods you control."
  'Welcome to Sweettooth': {
    saga: 3,
    abilities: [
      chapter([1], [], human),
      chapter([2], [], food),
      chapter([3], [yourCreature], counter(t0, { sum: [1, foodsYouControl] })),
    ],
  },

  // "Bargain. Trample. When this creature enters, if it was bargained, it fights up to one target creature you don't control."
  "Agatha's Champion": {
    ...bargain(),
    abilities: [
      whenEntersIfBargained(
        [{ kind: 'fight', a: 'self', b: t0 }],
        [{ ...theirCreature, optional: true }],
      ),
    ],
  },

  // "Choose two — Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Create a 1/1 white
  // Human creature token. Create a Food token."
  'Return from the Wilds': {
    modes: chooseTwo([
      mode('Search for a basic land', [], {
        kind: 'searchLibrary',
        filter: 'basicLand',
        to: 'battlefieldTapped',
      }),
      mode('Create a 1/1 white Human', [], human),
      mode('Create a Food', [], food),
    ]),
  },

  // "When this creature enters, create a Royal Role token attached to another target creature you control."
  'Redtooth Genealogist': {
    abilities: [
      when({ on: 'etb' }, [{ ...yourCreature, filter: { other: true } }], createRole('Royal')),
    ],
  },

  // "Reach. Whenever you cast a spell with mana value 5 or greater, create a Food token."
  'Skybeast Tracker': { abilities: [castSpell5([], food)] },

  // "Bargain. This spell costs {2} less to cast if it's bargained. Trample. When this creature enters, you gain 3 life."
  'Hamlet Glutton': {
    ...bargain({ costReduction: 2 }),
    abilities: [onEnter(gain(3))],
  },

  // "When this creature enters, choose one or more — Return target card you own in exile that has an Adventure to your hand. Put
  // target card you don't own in exile that has an Adventure on the bottom of its owner's library. Exile target player's graveyard."
  'Sentinel of Lost Lore': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: chooseOneOrMore([
          mode(
            'Return target card you own in exile that has an Adventure to your hand',
            [{ what: 'exileCard', controller: 'you', filter: HAS_ADVENTURE }],
            custom('woeExileCardTo', { target: 0, to: 'hand' }),
          ),
          mode(
            "Put target card you don't own in exile that has an Adventure on the bottom of its owner's library",
            [{ what: 'exileCard', controller: 'opponent', filter: HAS_ADVENTURE }],
            custom('woeExileCardTo', { target: 0, to: 'libraryBottom' }),
          ),
          mode("Exile target player's graveyard", [{ what: 'player' }], {
            kind: 'exileGraveyard',
            who: t0,
          }),
        ]),
      },
    ],
  },

  'Ferocious Werefox': {},

  // "Bargain. Look at the top twenty cards of your library. You may reveal up to two creature cards from among them. If this spell
  // was bargained, put the revealed cards onto the battlefield. Otherwise, put the revealed cards into your hand. Then shuffle."
  'Thunderous Debut': {
    ...bargain({
      spell: {
        targets: [],
        effects: [
          {
            kind: 'lookAndTake',
            count: 20,
            filter: CREATURE,
            upTo: 2,
            reveal: true,
            to: 'battlefield',
          },
          custom('woeShuffle'),
        ],
      },
    }),
    spell: {
      targets: [],
      effects: [
        { kind: 'lookAndTake', count: 20, filter: CREATURE, upTo: 2, reveal: true },
        custom('woeShuffle'),
      ],
    },
  },

  // "This creature can't be blocked by creatures with power 2 or less."
  'Stormkeld Vanguard': {
    abilities: [{ kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { maxPower: 2 } } }],
  },

  // "{1}{G}: This creature can't be blocked by creatures with power 2 or less this turn."
  'Verdant Outrider': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}') },
        targets: [],
        effects: [{ ...pump('self', 0, 0), cantBeBlockedBy: { maxPower: 2 } } as EffectDef],
      },
    ],
  },

  // "Ward {2}. {3}{G}: Put a +1/+1 counter on this creature."
  'Toadstool Admirer': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}') },
        targets: [],
        effects: [counter('self')],
      },
    ],
  },

  // "Trample. When this creature enters, if it isn't a token, create two tokens that are copies of it. When this creature dies, put
  // a number of +1/+1 counters equal to its power on each creature you control named Gruff Triplets."
  'Gruff Triplets': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'sourceNotToken' },
        targets: [],
        effects: [{ kind: 'tokenCopy', of: 'self', count: 2 }],
      },
      when(
        { on: 'dies' },
        [],
        counter(
          { each: 'creature', controller: 'you', filter: { named: 'gruff-triplets' } },
          { powerOf: 'self' },
        ),
      ),
    ],
  },
};

/** Back faces: keyed by their own names. */
export const WOE_GREEN_BACKS: Record<string, Behavior> = {
  // "Create a Food token."
  'Bakery Raid': { spell: { targets: [], effects: [food] } },
  // "You may play an additional land this turn."
  'Plant Beans': { spell: { targets: [], effects: [custom('extraLandThisTurn')] } },
  // "Mill seven cards. Then put a creature, enchantment, or land card from among the milled cards onto the battlefield."
  'Fetch Quest': { spell: { targets: [], effects: [custom('woeFetchQuest')] } },
  // "Draw two cards, then discard two cards."
  'Scan the Clouds': {
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: 2 },
        { kind: 'discard', count: 2 },
      ],
    },
  },
  // "Create a Monster Role token attached to target creature you control."
  'Guard Change': { spell: { targets: [yourCreature], effects: [createRole('Monster')] } },
  // "Destroy target artifact or enchantment."
  'Bear Down': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
      effects: [destroy],
    },
  },
};

/** Tokens only this group's cards make. */
export const WOE_GREEN_TOKENS: CardDefinition[] = [
  // Return from the Wilds, Welcome to Sweettooth: "a 1/1 white Human creature token".
  {
    id: HUMAN,
    name: 'Human',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Human'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
