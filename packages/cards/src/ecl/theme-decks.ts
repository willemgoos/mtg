import type {
  AbilityDef,
  CardDefinition,
  ConditionDef,
  EffectDef,
  TargetSpec,
  TriggerDef,
} from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, onEnter, pump, t0, when, yourCreature } from '../blb/helpers.ts';
import { cycling } from '../fin/helpers.ts';
import { crew } from '../msh/helpers.ts';

/**
 * Lorwyn Eclipsed (18c): the cards of Arena's two Theme Decks (Pirates and Angels) that the pool didn't have yet. Printed
 * characteristics come from Scryfall; this file has the rules text. See docs/lorwyn-eclipsed-plan.md.
 */

export const MAP = 'map-token';

const discardCards = (count: number): EffectDef => ({ kind: 'discard', count });
const createMaps = (count: number): EffectDef => ({ kind: 'createToken', token: MAP, count });
/** A triggered ability with extras (a condition, "one or more" batching). */
const trigger = (
  trigger: TriggerDef,
  targets: TargetSpec[],
  effects: EffectDef[],
  extra: { condition?: ConditionDef; batch?: boolean } = {},
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects, ...extra });
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };

/** "Whenever you discard one or more cards, <effects>": once for the cards discarded together (the amount is how many). */
const whenYouDiscard = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'youDiscard' },
  batch: true,
  targets,
  effects,
});

/** "Whenever you discard one or more cards, put that many +1/+1 counters on this creature." */
const discardCounters = whenYouDiscard([], {
  kind: 'counters',
  to: 'self',
  amount: { event: 'amount' },
});

export const ECL_THEME_DECK_CARDS: Record<string, Behavior> = {
  // ---------------------------------------------------------------- Pirates
  // Captain Howler, Sea Scourge: "Ward—{2}, Pay 2 life. Whenever you discard one or more cards, target creature gets +2/+0 until
  // end of turn for each card discarded this way. Whenever that creature deals combat damage to a player this turn, you draw a card."
  'Captain Howler, Sea Scourge': {
    abilities: [
      whenYouDiscard([{ what: 'creature' }], {
        kind: 'pump',
        to: t0,
        power: { multiply: 2, amount: { event: 'amount' } },
        toughness: 0,
        drawOnCombatDamage: true,
      }),
    ],
  },
  // Fearless Swashbuckler: "Haste. Vehicles you control have haste. Whenever you attack, if a Pirate and a Vehicle attacked this
  // combat, draw three cards, then discard two cards."
  'Fearless Swashbuckler': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Vehicle' },
          anyPermanent: true,
          power: 0,
          toughness: 0,
          keywords: ['haste'],
        },
      },
      trigger({ on: 'youAttack' }, [], [draw(3), discardCards(2)], {
        condition: {
          kind: 'all',
          of: [
            { kind: 'attackedThisCombat', filter: { subtype: 'Pirate' } },
            { kind: 'attackedThisCombat', filter: { subtype: 'Vehicle' } },
          ],
        },
      }),
    ],
  },
  // Inti, Seneschal of the Sun: "Whenever you attack, you may discard a card. When you do, put a +1/+1 counter on target
  // attacking creature. It gains trample until end of turn. Whenever you discard one or more cards, exile the top card of your
  // library. You may play that card until your next end step."
  'Inti, Seneschal of the Sun': {
    abilities: [
      when({ on: 'youAttack' }, [], {
        kind: 'may',
        effects: [{ kind: 'discard', count: 1, then: [{ kind: 'reflexiveTrigger', ability: 1 }] }],
      }),
      when(
        { on: 'reflexive' },
        [{ what: 'creature', filter: { attacking: true } }],
        { kind: 'counters', to: t0, amount: 1 },
        pump(t0, 0, 0, ['trample']),
      ),
      whenYouDiscard([], { kind: 'exileTopPlayable', count: 1, until: 'yourNextEndStep' }),
    ],
  },
  // Marauding Mako: "Whenever you discard one or more cards, put that many +1/+1 counters on this creature. Cycling {2}"
  'Marauding Mako': { abilities: [discardCounters, cycling('{2}')] },
  // Scrounging Skyray: "Flying. Whenever you discard one or more cards, put that many +1/+1 counters on this creature. Cycling {2}"
  'Scrounging Skyray': { abilities: [discardCounters, cycling('{2}')] },
  // Spyglass Siren: "Flying. When this creature enters, create a Map token."
  'Spyglass Siren': { abilities: [onEnter(createMaps(1))] },
  // Staunch Crewmate: "When this creature enters, look at the top four cards of your library. You may reveal an artifact or Pirate
  // card from among them and put it into your hand. Put the rest on the bottom of your library in a random order."
  'Staunch Crewmate': {
    abilities: [
      onEnter({
        kind: 'lookAndTake',
        count: 4,
        filter: { anyOf: [{ types: ['Artifact'] }, { subtype: 'Pirate' }] },
      }),
    ],
  },
  // Broadside Barrage: "Broadside Barrage deals 5 damage to target creature or planeswalker. Draw a card, then discard a card."
  'Broadside Barrage': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [{ kind: 'damage', amount: 5, to: t0 }, draw(1), discardCards(1)],
    },
  },
  // Gastal Thrillroller: "Trample, haste. When this Vehicle enters, it becomes an artifact creature until end of turn. Crew 2.
  // {2}{R}, Discard a card: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only as
  // a sorcery."
  'Gastal Thrillroller': {
    abilities: [
      onEnter({ kind: 'becomeCreature', what: 'self' }),
      crew(2),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}'), discard: true },
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', named: 'finality' }],
        label:
          '{2}{R}, Discard a card: Return this card from your graveyard to the battlefield with a finality counter on it',
      },
    ],
  },
  // Subterranean Schooner: "Whenever this Vehicle attacks, target creature that crewed it this turn explores. Crew 1"
  'Subterranean Schooner': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'creature', controller: 'you', filter: { crewedSource: true } }],
        { kind: 'explore', what: t0 },
      ),
      crew(1),
    ],
  },
  // Magmatic Galleon: "When this Vehicle enters, it deals 5 damage to target creature an opponent controls. Whenever one or more
  // creatures your opponents control are dealt excess noncombat damage, create a Treasure token. Crew 2"
  'Magmatic Galleon': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'creature', controller: 'opponent' }], {
        kind: 'damage',
        amount: 5,
        to: t0,
      }),
      trigger({ on: 'opponentCreaturesDealtExcessNoncombat' }, [], [treasure], { batch: true }),
      crew(2),
    ],
  },

  // ----------------------------------------------------------------- Angels
  // Lightstall Inquisitor: "Vigilance. When this creature enters, each opponent exiles a card from their hand and may play that
  // card for as long as it remains exiled. Each spell cast this way costs {1} more to cast. Each land played this way enters tapped."
  'Lightstall Inquisitor': {
    abilities: [
      onEnter({
        kind: 'chooseFromOpponentHand',
        then: 'exile',
        ownerChooses: { tax: 1, landsTapped: true },
      }),
    ],
  },
  // Starfield Shepherd: "Flying. When this creature enters, search your library for a basic Plains card or a creature card with mana
  // value 1 or less, reveal it, put it into your hand, then shuffle. Warp {1}{W}"
  'Starfield Shepherd': {
    // Warp {1}{W}: an alternative cost; it's exiled at the next end step and may be cast from exile later.
    kicker: { cost: mana('{1}{W}'), replacesCost: true, altLabel: 'Warp', handOnly: true },
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: {
          anyOf: [
            { subtype: 'Plains', supertypes: ['Basic'] },
            { types: ['Creature'], maxManaValue: 1 },
          ],
        },
        to: 'hand',
        reveal: true,
      }),
      trigger({ on: 'etb' }, [], [{ kind: 'custom', handler: 'warpSchedule' }], {
        condition: { kind: 'wasKicked' },
      }),
    ],
  },
  // Get Lost: "Destroy target creature, enchantment, or planeswalker. Its controller creates two Map tokens."
  'Get Lost': {
    spell: {
      targets: [
        { what: 'permanent', filter: { types: ['Creature', 'Enchantment', 'Planeswalker'] } },
      ],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'createToken', token: MAP, count: 2, forControllerOf: 0 },
      ],
    },
  },
  // Ride's End: "This spell costs {3} less to cast if it targets a tapped permanent. Exile target creature or Vehicle."
  "Ride's End": {
    costReductionIfTarget: { filter: { tapped: true }, amount: 3 },
    spell: {
      targets: [
        { what: 'permanent', filter: { anyOf: [{ types: ['Creature'] }, { subtype: 'Vehicle' }] } },
      ],
      effects: [{ kind: 'exile', what: t0 }],
    },
  },
  // Split Up: "Choose one — Destroy all tapped creatures. / Destroy all untapped creatures."
  'Split Up': {
    modes: [
      {
        label: 'Destroy all tapped creatures',
        targets: [],
        effects: [{ kind: 'destroyAll', filter: { tapped: true } }],
      },
      {
        label: 'Destroy all untapped creatures',
        targets: [],
        effects: [{ kind: 'destroyAll', filter: { tapped: false } }],
      },
    ],
  },
};

export const ECL_THEME_DECK_TOKENS: CardDefinition[] = [
  // A Map: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery."
  {
    id: MAP,
    name: 'Map',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact'],
    supertypes: [],
    subtypes: ['Map'],
    keywords: [],
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'explore', what: t0 }],
        label: '{1}, {T}, Sacrifice this token: Target creature you control explores',
      },
    ],
    isToken: true,
  },
];
