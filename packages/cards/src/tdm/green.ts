import type { Amount, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourEndStep,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  t1,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import {
  DRAGON,
  devoteeMana,
  dragonWasBeheld,
  endure,
  harmonize,
  mayBeholdDragon,
  renew,
  returnWhenDragonEnters,
} from '../tdm-vocab.ts';

/**
 * Tarkir: Dragonstorm (19b): green cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_GREEN_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

/** The 4/4 Dragon token Dragonbroods' Relic makes. */
const RELIQUARY_DRAGON = 'tdm-green-reliquary-dragon-token';

const counter = (to: Ref, amount: Amount = 1): EffectDef => ({
  kind: 'counters',
  to,
  amount,
});
const named = (name: string, to: { target: number }): EffectDef => ({
  kind: 'namedCounters',
  name,
  amount: 1,
  to,
});
const destroy: EffectDef = { kind: 'destroy', what: t0 };
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const artifactOrEnchantment: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Artifact', 'Enchantment'] },
};
/** "Creatures you control with a counter on them" / "a creature with a counter on it". */
const hasCounters = { hasCounters: true } as const;
const youControlCreatureWithCounter = {
  kind: 'controlsCreature',
  filter: hasCounters,
} as const;
const yourGraveyardPermanent: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'] },
};
const anyColorMana: EffectDef = { kind: 'addMana', mana: [['W', 'U', 'B', 'R', 'G']] };

export const TDM_GREEN: Record<string, Behavior> = {
  // "When this creature enters, mill three cards. You may put a land card from among them into your hand. If you don't, put a
  // +1/+1 counter on this creature."
  'Ainok Wayfarer': { abilities: [onEnter(custom('tdmAinokMill'))] },
  // "Whenever one or more cards leave your graveyard during your turn" (once for the cards that leave together).
  'Attuned Hunter': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        condition: { kind: 'yourTurn' },
        targets: [],
        effects: [counter('self')],
        batch: true,
      },
    ],
  },
  'Bloomvine Regent': {
    abilities: [
      // "Whenever this creature or another Dragon you control enters, you gain 3 life."
      onEnter(gain(3)),
      when({ on: 'otherCreatureEtb', controller: 'you', filter: DRAGON }, [], gain(3)),
    ],
  },
  'Champion of Dusan': {
    abilities: [
      renew(mana('{1}{G}'), [creature], [counter(t0), named('trample', t0)]),
    ],
  },
  // "Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control."
  'Craterhoof Behemoth': {
    abilities: [
      onEnter(
        pump(
          { each: 'creature', controller: 'you' },
          { count: 'creaturesYouControl' },
          { count: 'creaturesYouControl' },
          ['trample'],
        ),
      ),
    ],
  },
  'Disruptive Stormbrood': {
    abilities: [
      when({ on: 'etb' }, [{ ...artifactOrEnchantment, optional: true }], destroy),
    ],
  },
  'Dragon Sniper': {},
  'Dragonbroods\' Relic': {
    abilities: [
      // "{T}, Tap an untapped creature you control: Add one mana of any color." A mana ability.
      {
        kind: 'activated',
        manaAbility: true,
        cost: { tapSelf: true, tapUntapped: { count: 1, filter: { types: ['Creature'] } } },
        targets: [],
        effects: [anyColorMana],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{W}{U}{B}{R}{G}'), sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'createToken', token: RELIQUARY_DRAGON, count: 1 }],
      },
    ],
  },
  'Dusyut Earthcarver': { abilities: [onEnter(endure(3))] },
  'Encroaching Dragonstorm': {
    abilities: [
      onEnter({ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', upTo: 2 }),
      returnWhenDragonEnters,
    ],
  },
  'Formation Breaker': {
    abilities: [
      // "Creatures with power less than this creature's power can't block it."
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { lesserPowerThanSource: true } } },
      // "As long as you control a creature with a counter on it, this creature gets +1/+2."
      {
        kind: 'static',
        effect: { kind: 'while', condition: youControlCreatureWithCounter, power: 1, toughness: 2 },
      },
    ],
  },
  'Herd Heirloom': {
    abilities: [
      // "{T}: Add one mana of any color. Spend this mana only to cast a creature spell."
      ...(['W', 'U', 'B', 'R', 'G'] as const).map(
        (produces) =>
          ({ kind: 'mana', cost: { tapSelf: true }, produces, onlyFor: 'Creature' }) as const,
      ),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { minPower: 4 } }],
        effects: [
          pump(t0, 0, 0, ['trample']),
          {
            kind: 'grantAbility',
            to: t0,
            ability: when({ on: 'combatDamageToPlayer' }, [], draw(1)),
          },
        ],
      },
    ],
  },
  'Heritage Reclamation': {
    modes: [
      mode('Destroy target artifact', [{ what: 'permanent', filter: { types: ['Artifact'] } }], destroy),
      mode(
        'Destroy target enchantment',
        [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        destroy,
      ),
      mode(
        'Exile up to one target card from a graveyard. Draw a card.',
        [{ what: 'graveyardCard', optional: true }],
        { kind: 'exileGraveyardCard', what: t0 },
        draw(1),
      ),
    ],
  },
  'Inspirited Vanguard': {
    abilities: [onEnter(endure(2)), when({ on: 'attacks' }, [], endure(2))],
  },
  'Krotiq Nestguard': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}') },
        targets: [],
        effects: [{ ...pump('self', 0, 0), ignoreDefender: true } as EffectDef],
      },
    ],
  },
  'Lasyd Prowler': {
    abilities: [
      onEnter({ kind: 'may', effects: [{ kind: 'mill', count: { count: 'landsYouControl' } }] }),
      renew(
        mana('{1}{G}'),
        [creature],
        [counter(t0, { count: 'cardsInGraveyard', types: ['Land'] })],
      ),
    ],
  },
  'Nature\'s Rhythm': {
    ...harmonize(mana('{X}{G}{G}{G}{G}')),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { types: ['Creature'], maxManaValue: 'x' },
          to: 'battlefield',
        },
      ],
    },
  },
  'Piercing Exhale': {
    ...mayBeholdDragon(),
    spell: {
      targets: [yourCreature, { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [
        { kind: 'damage', amount: { powerOf: t0 }, to: t1, from: t0 },
        { kind: 'if', condition: dragonWasBeheld, then: [{ kind: 'surveil', amount: 2 }], else: [] },
      ],
    },
  },
  'Rainveil Rejuvenator': {
    abilities: [
      onEnter({ kind: 'may', effects: [{ kind: 'mill', count: 3 }] }),
      // "{T}: Add an amount of {G} equal to this creature's power."
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G', perPower: true },
    ],
  },
  // "Return up to two target permanent cards from your graveyard to your hand. Target player shuffles up to four target cards from
  // their graveyard into their library. Exile Rite of Renewal." The number of permanent cards is chosen first (a mode per number,
  // so the targets keep their places); the cards for the shuffle are picked one at a time after the player.
  'Rite of Renewal': {
    afterResolving: 'exile',
    modes: [0, 1, 2].map((k) =>
      mode(
        ['Return no permanent card', 'Return one permanent card', 'Return two permanent cards'][k]! +
          ' from your graveyard to your hand',
        [
          ...Array<TargetSpec>(k).fill(yourGraveyardPermanent),
          { what: 'player' },
          { what: 'graveyardCard', anyNumber: true, maxTargets: 4, inGraveyardOfTarget: k },
        ],
        ...Array.from({ length: k }, (_, i): EffectDef => ({ kind: 'returnToHand', what: { target: i } })),
        custom('tdmRiteShuffle', { player: k }),
      ),
    ),
  },
  'Roamer\'s Routine': {
    ...harmonize(mana('{4}{G}')),
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
    },
  },
  'Sage of the Fang': {
    abilities: [
      when({ on: 'etb' }, [creature], counter(t0)),
      renew(
        mana('{3}{G}'),
        [creature],
        [counter(t0), counter(t0, { countersOn: t0 })],
      ),
    ],
  },
  'Sagu Pummeler': {
    abilities: [renew(mana('{4}{G}'), [creature], [counter(t0, 2), named('reach', t0)])],
  },
  'Sagu Wildling': { abilities: [onEnter(gain(3))] },
  'Sarkhan\'s Resolve': {
    modes: [
      mode('Target creature gets +3/+3 until end of turn', [creature], pump(t0, 3, 3)),
      mode(
        'Destroy target creature with flying',
        [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        destroy,
      ),
    ],
  },
  'Sultai Devotee': { abilities: [devoteeMana(['B', 'G', 'U'])] },
  'Surrak, Elusive Hunter': {
    abilities: [when({ on: 'creatureOrSpellTargetedByOpponent' }, [], draw(1))],
  },
  // "Distribute two +1/+1 counters among one or two target creatures you control": two targets get one each, one gets both.
  'Synchronized Charge': {
    ...harmonize(mana('{4}{G}')),
    spell: {
      targets: [yourCreature, { ...yourCreature, optional: true }],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'targetChosen', target: 1 },
          then: [counter(t0), counter(t1)],
          else: [counter(t0, 2)],
        },
        pump({ each: 'creature', controller: 'you', filter: hasCounters }, 0, 0, ['vigilance', 'trample']),
      ],
    },
  },
  // "If you don't draw a card this way, put a +1/+1 counter on this creature."
  'Trade Route Envoy': {
    abilities: [
      onEnter({
        kind: 'if',
        condition: youControlCreatureWithCounter,
        then: [draw(1)],
        else: [counter('self')],
      }),
    ],
  },
  // "Look at the top card of your library. If it's a land card, you may reveal it and put it into your hand. If you don't put the
  // card into your hand, you may put it into your graveyard."
  'Traveling Botanist': {
    abilities: [
      when({ on: 'becomesTapped' }, [], {
        kind: 'lookAndTake',
        count: 1,
        filter: { types: ['Land'] },
        restOnTop: true,
        canBin: true,
        reveal: true,
      }),
    ],
  },
  'Undergrowth Leopard': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [artifactOrEnchantment],
        effects: [destroy],
      },
    ],
  },
  'Warden of the Grove': {
    abilities: [
      atYourEndStep(undefined, [], counter('self')),
      // "Whenever another nontoken creature you control enters, it endures X, where X is the number of counters on this creature."
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { nontoken: true } },
        [],
        endure({ allCountersOn: 'self' }, 'subject'),
      ),
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_GREEN_BACKS: Record<string, Behavior> = {
  // "Search your library for up to two basic Forest cards, reveal them, put one onto the battlefield tapped and the other into
  // your hand, then shuffle. (Also shuffle this card.)"
  'Claim Territory': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { subtype: 'Forest', supertypes: ['Basic'] },
          to: 'battlefieldTapped',
          thenTo: 'hand',
          upTo: 2,
          reveal: true,
        },
      ],
    },
  },
  'Petty Revenge': {
    spell: {
      targets: [{ what: 'creature', filter: { maxPower: 3 } }],
      effects: [destroy],
    },
  },
  'Roost Seek': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand', reveal: true }],
    },
  },
};

/** Tokens only this group's cards make. */
export const TDM_GREEN_TOKENS: CardDefinition[] = [
  // Dragonbroods' Relic: "a 4/4 Dragon creature token named Reliquary Dragon that's all colors. It has flying, lifelink, and
  // 'When this token enters, it deals 3 damage to any target.'"
  {
    id: RELIQUARY_DRAGON,
    name: 'Reliquary Dragon',
    manaCost: { generic: 0, colored: {} },
    colors: ['W', 'U', 'B', 'R', 'G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Dragon'],
    power: 4,
    toughness: 4,
    keywords: ['flying', 'lifelink'],
    abilities: [
      when({ on: 'etb' }, [{ what: 'any' }], { kind: 'damage', amount: 3, to: t0 }),
    ],
    isToken: true,
  },
];
