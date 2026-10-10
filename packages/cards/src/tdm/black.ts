import type { Amount, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, drain, mana, onEnter, pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import {
  beholdDragonOrPay,
  devoteeMana,
  DRAGON,
  endure,
  mobilize,
  renew,
  returnWhenDragonEnters,
} from '../tdm-vocab.ts';
import { TDM_WARRIOR, TDM_ZOMBIE_DRUID } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): black cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_BLACK_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const anyCreature: TargetSpec = { what: 'creature' };
const upToOneCreature: TargetSpec = { what: 'creature', optional: true };
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };

const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
const lose = (amount: Amount): EffectDef => ({ kind: 'loseLife', who: 'controller', amount });
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
/** A +1/+1 counter (or more) on a creature. */
const counters = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });
/** A keyword counter (Renew): it grants the keyword by itself. */
const keywordCounter = (
  name: 'flying' | 'lifelink' | 'trample' | 'deathtouch' | 'reach',
  to: Ref,
): EffectDef => ({ kind: 'namedCounters', name, amount: 1, to });

export const TDM_BLACK: Record<string, Behavior> = {
  // Flying, deathtouch, lifelink. "Renew — {2}{B}, Exile this card from your graveyard: Put a flying counter, a deathtouch
  // counter, and a lifelink counter on target creature. Activate only as a sorcery."
  'Qarsi Revenant': {
    abilities: [
      renew(
        mana('{2}{B}'),
        [anyCreature],
        [
          keywordCounter('flying', t0),
          keywordCounter('deathtouch', t0),
          keywordCounter('lifelink', t0),
        ],
      ),
    ],
  },

  // Flying. "Ward—Discard a card." (ward comes from the oracle text); the Omen is Exude Toxin.
  'Scavenger Regent': {},

  // Flying. "Whenever this creature attacks, if you control a creature with a counter on it, each opponent loses 1 life."
  'Delta Bloodflies': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'controlsCreature', filter: { hasCounters: true } },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
      },
    ],
  },

  // Menace. "When this creature enters, it endures 2."
  'Sandskitter Outrider': { abilities: [onEnter(endure(2))] },

  // Lifelink. "When this creature enters, it endures 1."
  'Kin-Tree Nurturer': { abilities: [onEnter(endure(1))] },

  // Trample, decayed. "Renew — {X}{B}{B}, Exile this card from your graveyard: Put a decayed counter on each of X target
  // creatures. Activate only as a sorcery."
  'Rot-Curse Rakshasa': {
    abilities: [
      renew(
        mana('{X}{B}{B}'),
        [{ what: 'creature', xTargets: true }],
        [{ kind: 'namedCounters', name: 'decayed', amount: 1, to: { targetsFrom: 0 } }],
      ),
    ],
  },

  // Flying. "Whenever this creature attacks, you lose 1 life and this creature endures 1."
  'Sinkhole Surveyor': {
    abilities: [when({ on: 'attacks' }, [], lose(1), endure(1))],
  },

  // Flying, ward—pay 2 life. "When this creature enters, remove all counters from up to one target creature."
  'Purging Stormbrood': {
    abilities: [
      when({ on: 'etb' }, [upToOneCreature], {
        kind: 'custom',
        handler: 'eclRemoveAllCounters',
        params: { target: 0 },
      }),
    ],
  },

  // "{2}, Sacrifice another creature: Put a +1/+1 counter on this creature."
  'Unburied Earthcarver': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [],
        effects: [counters('self')],
      },
    ],
  },

  // "{T}, Sacrifice a creature you control with mana value X other than Sidisi: Return target creature card with mana value X
  // plus 1 from your graveyard to the battlefield. Activate only as a sorcery."
  'Sidisi, Regent of the Mire': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: {
          tapSelf: true,
          sacrificeCreature: true,
          sacrificeFilter: { other: true },
          sacrificeForTargetManaValue: true,
        },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },

  // "As an additional cost to cast this spell, behold a Dragon or pay {1}." "Target creature gets -3/-3 until end of turn."
  'Caustic Exhale': {
    ...beholdDragonOrPay(mana('{1}')),
    ...spell([anyCreature], pump(t0, -3, -3)),
  },

  // Lifelink. "Renew — {1}{B}, Exile this card from your graveyard: Put a lifelink counter on target creature. Activate only
  // as a sorcery."
  "Alchemist's Assistant": {
    abilities: [renew(mana('{1}{B}'), [anyCreature], [keywordCounter('lifelink', t0)])],
  },

  // Flying, deathtouch. "When this creature enters, exile up to two target cards from a single graveyard." The Omen is Dusk Sight.
  'Feral Deathgorger': {
    abilities: [
      when(
        { on: 'etb' },
        // Up to two, picked one at a time, all from the same graveyard.
        [{ what: 'graveyardCard', anyNumber: true, maxTargets: 2, singleGraveyard: true }],
        { kind: 'custom', handler: 'eclExileTargetCards' },
      ),
    ],
  },

  // "Creature spells you cast cost {2} less to cast." "Whenever a creature you control enters, if you cast it, destroy that
  // creature, then create a 2/2 black Zombie Druid creature token."
  'The Sibsig Ceremony': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { types: ['Creature'] }, amount: 2 },
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        condition: { kind: 'subjectWasCast' },
        targets: [],
        effects: [
          { kind: 'destroy', what: 'subject' },
          { kind: 'createToken', token: TDM_ZOMBIE_DRUID, count: 1 },
        ],
      },
    ],
  },

  // Flash. "{1}, Sacrifice another creature: This creature gains indestructible until end of turn. Tap it."
  'Unrooted Ancestor': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [],
        effects: [pump('self', 0, 0, ['indestructible']), { kind: 'tap', what: 'self' }],
      },
    ],
  },

  // Deathtouch, mobilize 1. "When this creature enters, surveil 1."
  'Nightblade Brigade': {
    abilities: [mobilize(1), onEnter(surveil(1))],
  },

  // "{1}: Add {W}, {B}, or {G}. Activate only once each turn." "{2}{B}: Return this card from your graveyard to your hand."
  'Abzan Devotee': {
    abilities: [
      devoteeMana(['W', 'B', 'G']),
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{2}{B}') },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },

  // "Surveil 2, then draw two cards. You lose 2 life."
  'Cruel Truths': spell([], surveil(2), draw(2), lose(2)),

  // "This spell costs {2} more to cast if it targets a Dragon." "Destroy target creature."
  "Dragon's Prey": {
    costReductionIfTarget: { filter: DRAGON, amount: -2 },
    ...spell([anyCreature], { kind: 'destroy', what: t0 }),
  },

  // "Choose one — • Creatures target opponent controls get -1/-1 until end of turn. • Return up to two target creature cards
  // from your graveyard to your hand."
  'Wail of War': {
    modes: [
      mode('Creatures target opponent controls get -1/-1 until end of turn', [opponent], {
        kind: 'pump',
        to: { each: 'creature', targetPlayer: 0 },
        power: -1,
        toughness: -1,
      }),
      mode(
        'Return up to two target creature cards from your graveyard to your hand',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'] },
            optional: true,
          },
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'] },
            optional: true,
          },
        ],
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
      ),
    ],
  },

  // "Destroy target creature. Create two 1/1 red Warrior creature tokens. They gain haste until end of turn. Sacrifice them at
  // the beginning of the next end step."
  'Salt Road Skirmish': spell(
    [anyCreature],
    { kind: 'destroy', what: t0 },
    {
      kind: 'createToken',
      token: TDM_WARRIOR,
      count: 2,
      hasteThisTurn: true,
      sacrificeAt: 'nextEndStep',
    },
  ),

  // "Target opponent exiles a creature they control and their graveyard."
  'Strategic Betrayal': spell(
    [opponent],
    { kind: 'opponentSacrifices', exile: true },
    { kind: 'exileGraveyard', who: t0 },
  ),

  // "Target opponent reveals their hand. You choose a nonland card from it and exile that card. Put a +1/+1 counter on up to
  // one target creature you control."
  'Aggressive Negotiations': spell(
    [opponent, { what: 'creature', controller: 'you', optional: true }],
    { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'exile' },
    counters(t1),
  ),

  // Menace. "Whenever a creature you control with a counter on it deals combat damage to a player, you draw a card and you
  // lose 1 life."
  'Yathan Tombguard': {
    abilities: [
      when(
        {
          on: 'creatureYouControlDealsCombatDamage',
          toPlayer: true,
          filter: { hasCounters: true },
        },
        [],
        draw(1),
        lose(1),
      ),
    ],
  },

  // Mobilize 1. "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life."
  'Venerated Stormsinger': {
    abilities: [mobilize(1), when({ on: 'creatureYouControlDies' }, [], ...drain(1))],
  },

  // "When this enchantment enters, each opponent loses 2 life and you gain 2 life. Surveil 2." "When a Dragon you control
  // enters, return this enchantment to its owner's hand."
  'Corroding Dragonstorm': {
    abilities: [onEnter(...drain(2), surveil(2)), returnWhenDragonEnters],
  },

  // "Target creature you control gains deathtouch and indestructible until end of turn."
  "Alesha's Legacy": spell([yourCreature], pump(t0, 0, 0, ['deathtouch', 'indestructible'])),

  // "As an additional cost to cast this spell, sacrifice a creature." "Exile target creature or planeswalker."
  'Worthy Cost': {
    sacrificeCreatureToCast: true,
    ...spell([{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }], {
      kind: 'exile',
      what: t0,
    }),
  },

  // Deathtouch. "Mobilize X, where X is the number of creature cards in your graveyard."
  'Avenger of the Fallen': {
    abilities: [mobilize({ count: 'cardsInGraveyard', types: ['Creature'] })],
  },

  // "When this creature dies, create a 2/2 black Zombie Druid creature token." "Renew — {B}, Exile this card from your
  // graveyard: Put a +1/+1 counter on target creature. Activate only as a sorcery."
  'Adorned Crocodile': {
    abilities: [
      when({ on: 'dies' }, [], { kind: 'createToken', token: TDM_ZOMBIE_DRUID, count: 1 }),
      renew(mana('{B}'), [anyCreature], [counters(t0)]),
    ],
  },

  // "{X}{B}, {T}, Pay X life: This creature endures X. Activate only as a sorcery."
  'Krumar Initiate': {
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: mana('{X}{B}'), tapSelf: true, lifeX: true },
        targets: [],
        effects: [endure({ x: true })],
      },
    ],
  },

  // "Target creature gets +1/-1 until end of turn. When it dies under your control this turn, draw two cards."
  'Desperate Measures': spell([anyCreature], pump(t0, 1, -1), {
    kind: 'whenDiesThisTurn',
    what: t0,
    underYourControl: true,
    effects: [draw(2)],
  }),

  // "As long as there are three or more different kinds of counters among creatures you control, this creature gets +2/+4."
  // "You may cast this card from your graveyard. If you do, it enters with a finality counter on it."
  'Hundred-Battle Veteran': {
    castFromGraveyardFinality: true,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: {
            if: {
              kind: 'amountAtLeast',
              amount: { count: 'counterKindsAmongYourCreatures' },
              min: 3,
            },
            then: 2,
          },
          toughness: {
            if: {
              kind: 'amountAtLeast',
              amount: { count: 'counterKindsAmongYourCreatures' },
              min: 3,
            },
            then: 4,
          },
        },
      },
    ],
  },

  // Menace. "When this creature enters, target creature an opponent controls gets -2/-2 until end of turn and target creature
  // you control gets +2/+2 until end of turn."
  'Gurmag Rakshasa': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'creature', controller: 'opponent' }, yourCreature],
        pump(t0, -2, -2),
        pump(t1, 2, 2),
      ),
    ],
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_BLACK_BACKS: Record<string, Behavior> = {
  // Sorcery — Omen {X}{B}{B}: "Each non-Dragon creature gets -X/-X until end of turn."
  'Exude Toxin': spell([], {
    kind: 'pump',
    to: { each: 'creature', filter: { notSubtype: 'Dragon' } },
    power: { x: true, times: -1 },
    toughness: { x: true, times: -1 },
  }),

  // Instant — Omen {1}{W}: "Target creature gets +2/+2 and gains lifelink and hexproof until end of turn."
  'Absorb Essence': spell([anyCreature], pump(t0, 2, 2, ['lifelink', 'hexproof'])),

  // Sorcery — Omen {1}{B}: "Put a +1/+1 counter on up to one target creature. Draw a card."
  'Dusk Sight': spell([upToOneCreature], counters(t0), draw(1)),
};

/** Tokens only this group's cards make. */
export const TDM_BLACK_TOKENS: CardDefinition[] = [];
