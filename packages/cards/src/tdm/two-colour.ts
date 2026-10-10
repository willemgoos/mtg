import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, draw, gain, mana, pump, t0, when, yours } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { flurry, harmonize } from '../tdm-vocab.ts';

/**
 * Tarkir: Dragonstorm (19b): all two-colour (gold and hybrid) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_TWO_COLOUR_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const customCondition = (handler: string) => ({ kind: 'custom', handler }) as const;
/** An ability with extra fields (a condition, "once each turn"). */
const plus = (a: AbilityDef, extra: object): AbilityDef => ({ ...a, ...extra }) as AbilityDef;
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };

export const TDM_TWO_COLOUR: Record<string, Behavior> = {
  // "Return target card from your graveyard to your hand."
  'Auroral Procession': {
    spell: {
      targets: [{ what: 'graveyardCard', controller: 'you' }],
      effects: [{ kind: 'returnToHand', what: t0 }],
    },
  },
  // "As this enchantment enters, choose Abzan or Mardu."
  'Barrensteppe Siege': {
    enterChoices: [
      {
        // "At the beginning of your end step, put a +1/+1 counter on each creature you control."
        label: 'Abzan',
        abilities: [atYourEndStep(undefined, [], { kind: 'counters', to: yours, amount: 1 })],
      },
      {
        // "At the beginning of your end step, if a creature died under your control this turn, each opponent sacrifices a
        // creature of their choice."
        label: 'Mardu',
        abilities: [
          atYourEndStep(
            { kind: 'amountAtLeast', amount: { count: 'creaturesYouLostThisTurn' }, min: 1 },
            [],
            { kind: 'opponentSacrifices' },
          ),
        ],
      },
    ],
  },
  // "Flurry — Whenever you cast your second spell each turn, this creature deals 2 damage to each opponent and you gain 2 life."
  'Cori Mountain Stalwart': {
    abilities: [flurry([{ kind: 'damage', amount: 2, to: 'eachOpponent' }, gain(2)])],
  },
  // "This creature enters with two +1/+1 counters on it if you've cast two or more spells this turn."
  'Effortless Master': {
    entersWithCountersAmount: {
      if: { kind: 'spellsCastThisTurn', min: 2 },
      then: 2,
      else: 0,
    },
  },
  // "Choose one — Create two 1/1 red Goblin creature tokens. / Target creature gets +X/+X until end of turn, where X is the
  // number of creatures you control."
  'Frontline Rush': {
    modes: [
      mode('Create two 1/1 red Goblin creature tokens', [], {
        kind: 'createToken',
        token: 'goblin-token',
        count: 2,
      }),
      mode(
        'Target creature gets +X/+X until end of turn, where X is the number of creatures you control',
        [{ what: 'creature' }],
        pump(t0, { count: 'creaturesYouControl' }, { count: 'creaturesYouControl' }),
      ),
    ],
  },
  // "Draw a card, then you may discard a card. When you discard a nonland card this way, Glacial Dragonhunt deals 3 damage to
  // target creature. Harmonize {4}{U}{R}"
  'Glacial Dragonhunt': {
    spell: {
      targets: [],
      effects: [
        draw(1),
        { kind: 'may', effects: [{ kind: 'discard', count: 1, reflexiveOnNonland: 0 }] },
      ],
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: 3, to: t0 }],
      },
    ],
    ...harmonize(mana('{4}{U}{R}')),
  },
  // "As this enchantment enters, choose Temur or Sultai."
  'Glacierwood Siege': {
    enterChoices: [
      {
        // "Whenever you cast an instant or sorcery spell, target player mills four cards."
        label: 'Temur',
        abilities: [
          when({ on: 'castSpell', filter: 'instantOrSorcery' }, [{ what: 'player' }], {
            kind: 'mill',
            count: 4,
            who: t0,
          }),
        ],
      },
      {
        // "You may play lands from your graveyard."
        label: 'Sultai',
        abilities: [{ kind: 'static', effect: { kind: 'playLandsFromGraveyard' } }],
      },
    ],
  },
  // "{1}, Sacrifice a token: Draw a card."
  'Hardened Tactician': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificePermanent: { token: true } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // "As this enchantment enters, choose Sultai or Abzan."
  'Hollowmurk Siege': {
    enterChoices: [
      {
        // "Whenever a counter is put on a creature you control, draw a card. This ability triggers only once each turn."
        label: 'Sultai',
        abilities: [
          plus(when({ on: 'counterPutOnYourCreature' }, [], draw(1)), { oncePerTurn: true }),
        ],
      },
      {
        // "Whenever you attack, put a +1/+1 counter on target attacking creature. It gains menace until end of turn."
        label: 'Abzan',
        abilities: [
          when(
            { on: 'youAttack' },
            [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
            { kind: 'counters', to: t0, amount: 1 },
            pump(t0, 0, 0, ['menace']),
          ),
        ],
      },
    ],
  },
  // "This creature enters with two +1/+1 counters on it. Whenever this creature or another creature you control dies, if it had
  // counters on it, put its counters on up to one target creature you control."
  'Host of the Hereafter': {
    entersWithCounters: 2,
    abilities: [
      plus(
        when(
          { on: 'creatureYouControlDies' },
          [{ ...yourCreature, optional: true }],
          custom('tdmMoveCountersFromSubject'),
        ),
        { condition: customCondition('subjectHadCounters') },
      ),
    ],
  },
  // "Whenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn."
  'Kishla Skimmer': {
    abilities: [
      plus(when({ on: 'cardsLeaveYourGraveyard' }, [], draw(1)), {
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
      }),
    ],
  },
  // "Whenever you attack, target creature gets +X/+X until end of turn, where X is the number of attacking creatures."
  'Marshal of the Lost': {
    abilities: [
      when(
        { on: 'youAttack' },
        [{ what: 'creature' }],
        pump(
          t0,
          { count: 'creaturesYouControl', attacking: true },
          { count: 'creaturesYouControl', attacking: true },
        ),
      ),
    ],
  },
  // "Whenever one or more counters are put on a creature you control, if it's the first time counters have been put on that
  // creature this turn, put a +1/+1 counter on that creature."
  'Stalwart Successor': {
    abilities: [
      plus(
        when({ on: 'counterPutOnYourCreature' }, [], { kind: 'counters', to: 'subject', amount: 1 }),
        { condition: customCondition('subjectFirstAnyCounters') },
      ),
    ],
  },
  // "As this enchantment enters, choose Mardu or Jeskai."
  'Windcrag Siege': {
    enterChoices: [
      {
        // "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an
        // additional time."
        label: 'Mardu',
        abilities: [{ kind: 'static', effect: { kind: 'attackTriggersTwice' } }],
      },
      {
        // "At the beginning of your upkeep, create a 1/1 red Goblin creature token. It gains lifelink and haste until end of turn."
        label: 'Jeskai',
        abilities: [
          when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
            kind: 'createToken',
            token: 'goblin-token',
            count: 1,
            keywordsThisTurn: ['lifelink', 'haste'],
          }),
        ],
      },
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_TWO_COLOUR_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const TDM_TWO_COLOUR_TOKENS: CardDefinition[] = [];
