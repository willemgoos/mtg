import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import {
  atYourCombat,
  draw,
  gain,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
} from '../blb/helpers.ts';
import { spell } from '../fin/helpers.ts';
import {
  dragonWasBeheld,
  devoteeMana,
  endure,
  flurry,
  mayBeholdDragon,
  mobilize,
  returnWhenDragonEnters,
} from '../tdm-vocab.ts';
import { TDM_MONK, TDM_SOLDIER } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): white cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_WHITE_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const soldiers = (count: number): EffectDef => ({ kind: 'createToken', token: TDM_SOLDIER, count });
const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
/** "Another target creature you control". */
const otherYourCreature: TargetSpec = {
  what: 'creature',
  controller: 'you',
  filter: { other: true },
};
/** "{cost}: Creatures you control get +1/+1 until end of turn." */
const teamPump: EffectDef = pump({ each: 'creature', controller: 'you' }, 1, 1);

export const TDM_WHITE: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Anafenza, Unyielding Lineage': {
    abilities: [
      // "Whenever another nontoken creature you control dies, Anafenza endures 2."
      when({ on: 'otherCreatureDies', controller: 'you', nontoken: true }, [], endure(2)),
    ],
  },
  'Arashin Sunshield': {
    abilities: [
      // "When this creature enters, exile up to two target cards from a single graveyard."
      when(
        { on: 'etb' },
        [{ what: 'graveyardCard', anyNumber: true, maxTargets: 2, singleGraveyard: true }],
        custom('eclExileTargetCards'),
      ),
      // "{W}, {T}: Tap target creature."
      {
        kind: 'activated',
        cost: { mana: mana('{W}'), tapSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  },
  'Bearer of Glory': {
    abilities: [
      // "During your turn, this creature has first strike."
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
      // "{4}{W}: Creatures you control get +1/+1 until end of turn."
      {
        kind: 'activated',
        cost: { mana: mana('{4}{W}') },
        targets: [],
        effects: [teamPump],
      },
    ],
  },
  'Clarion Conqueror': {
    abilities: [
      // "Activated abilities of artifacts, creatures, and planeswalkers can't be activated."
      {
        kind: 'static',
        effect: {
          kind: 'noActivatedAbilities',
          filter: { types: ['Artifact', 'Creature', 'Planeswalker'] },
        },
      },
    ],
  },
  'Dalkovan Packbeasts': { abilities: [mobilize(3)] },
  'Descendant of Storms': {
    abilities: [
      // "Whenever this creature attacks, you may pay {1}{W}. If you do, it endures 1."
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        cost: mana('{1}{W}'),
        effects: [endure(1)],
      },
    ],
  },
  'Dragonback Lancer': { abilities: [mobilize(1)] },
  'Fortress Kin-Guard': {
    // "When this creature enters, it endures 1."
    abilities: [onEnter(endure(1))],
  },
  'Loxodon Battle Priest': {
    abilities: [
      // "At the beginning of combat on your turn, put a +1/+1 counter on another target creature you control."
      atYourCombat([otherYourCreature], { kind: 'counters', to: t0, amount: 1 }),
    ],
  },
  'Mardu Devotee': {
    abilities: [
      // "When this creature enters, scry 2."
      onEnter({ kind: 'scry', amount: 2 }),
      // "{1}: Add {R}, {W}, or {B}. Activate only once each turn."
      devoteeMana(['R', 'W', 'B']),
    ],
  },
  'Poised Practitioner': {
    abilities: [
      // "Flurry — Whenever you cast your second spell each turn, put a +1/+1 counter on this creature. Scry 1."
      flurry([{ kind: 'counters', to: 'self', amount: 1 }, { kind: 'scry', amount: 1 }]),
    ],
  },
  'Riling Dawnbreaker': {
    abilities: [
      // "At the beginning of combat on your turn, another target creature you control gets +1/+0 until end of turn."
      atYourCombat([otherYourCreature], pump(t0, 1, 0)),
    ],
  },
  'Sage of the Skies': {
    abilities: [
      // "When you cast this spell, if you've cast another spell this turn, copy this spell."
      {
        kind: 'triggered',
        trigger: { on: 'castSelf' },
        condition: { kind: 'spellsCastThisTurn', min: 2 },
        targets: [],
        effects: [{ kind: 'copySpell', what: 'subject' }],
      },
    ],
  },
  'Salt Road Packbeast': {
    // "Affinity for creatures"
    costReduction: { count: 'creaturesYouControl' },
    // "When this creature enters, draw a card."
    abilities: [onEnter(draw(1))],
  },
  'Starry-Eyed Skyrider': {
    abilities: [
      // "Whenever this creature attacks, another target creature you control gains flying until end of turn."
      when({ on: 'attacks' }, [otherYourCreature], pump(t0, 0, 0, ['flying'])),
      // "Attacking tokens you control have flying."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { attacking: true, token: true },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  'Sunpearl Kirin': {
    abilities: [
      // "When this creature enters, return up to one other target nonland permanent you control to its owner's hand. If it was a
      // token, draw a card."
      when(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            controller: 'you',
            optional: true,
            filter: { nonland: true, other: true },
          },
        ],
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { token: true } },
          then: [{ kind: 'bounce', what: t0, then: [draw(1)] }],
          else: [{ kind: 'bounce', what: t0 }],
        },
      ),
    ],
  },
  'Tempest Hawk': {
    abilities: [
      // "Whenever this creature deals combat damage to a player, you may search your library for a card named Tempest Hawk,
      // reveal it, put it into your hand, then shuffle."
      when(
        { on: 'combatDamageToPlayer' },
        [],
        {
          kind: 'may',
          effects: [
            {
              kind: 'searchLibrary',
              filter: { sameNameAsSource: true },
              to: 'hand',
              reveal: true,
            },
          ],
        },
      ),
    ],
  },
  'Twinmaw Stormbrood': {
    // "When this creature enters, you gain 5 life."
    abilities: [onEnter(gain(5))],
  },
  'Voice of Victory': {
    abilities: [
      mobilize(2),
      // "Your opponents can't cast spells during your turn."
      { kind: 'static', effect: { kind: 'opponentsCantCastDuringYourTurn' } },
    ],
  },
  'Wayspeaker Bodyguard': {
    abilities: [
      // "When this creature enters, return target nonland permanent card with mana value 2 or less from your graveyard to your hand."
      when(
        { on: 'etb' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: {
              nonland: true,
              types: ['Artifact', 'Creature', 'Enchantment', 'Planeswalker'],
              maxManaValue: 2,
            },
          },
        ],
        { kind: 'returnToHand', what: t0 },
      ),
      // "Flurry — Whenever you cast your second spell each turn, tap target creature an opponent controls."
      flurry([{ kind: 'tap', what: t0 }], [{ what: 'creature', controller: 'opponent' }]),
    ],
  },

  // ------------------------------------------------------------ noncreature
  'Coordinated Maneuver': {
    modes: [
      {
        // "Coordinated Maneuver deals damage equal to the number of creatures you control to target creature or planeswalker."
        label: 'Coordinated Maneuver deals damage equal to the number of creatures you control to target creature or planeswalker',
        targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
        effects: [{ kind: 'damage', amount: { count: 'creaturesYouControl' }, to: t0 }],
      },
      {
        // "Destroy target enchantment."
        label: 'Destroy target enchantment',
        targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Lightfoot Technique': spell(
    [{ what: 'creature' }],
    // "Put a +1/+1 counter on target creature. It gains flying and indestructible until end of turn."
    { kind: 'counters', to: t0, amount: 1 },
    pump(t0, 0, 0, ['flying', 'indestructible']),
  ),
  'Osseous Exhale': {
    // "As an additional cost to cast this spell, you may behold a Dragon."
    ...mayBeholdDragon(),
    spell: {
      // "Osseous Exhale deals 5 damage to target attacking or blocking creature. If a Dragon was beheld, you gain 2 life."
      targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      effects: [
        { kind: 'damage', amount: 5, to: t0 },
        { kind: 'if', condition: dragonWasBeheld, then: [gain(2)] },
      ],
    },
  },
  'Rally the Monastery': {
    // "This spell costs {2} less to cast if you've cast another spell this turn."
    costReductionIf: { condition: { kind: 'spellsCastThisTurn', min: 1 }, amount: 2 },
    modes: [
      {
        // "Create two 1/1 white Monk creature tokens with prowess."
        label: 'Create two 1/1 white Monk creature tokens with prowess',
        targets: [],
        effects: [{ kind: 'createToken', token: TDM_MONK, count: 2 }],
      },
      {
        // "Up to two target creatures you control each get +2/+2 until end of turn."
        label: 'Up to two target creatures you control each get +2/+2 until end of turn',
        targets: [
          { ...yourCreature, optional: true },
          { ...yourCreature, optional: true },
        ],
        effects: [pump(t0, 2, 2), pump({ target: 1 }, 2, 2)],
      },
      {
        // "Destroy target creature with power 4 or greater."
        label: 'Destroy target creature with power 4 or greater',
        targets: [{ what: 'creature', filter: { minPower: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Rebellious Strike': spell(
    // "Target creature gets +3/+0 until end of turn. Draw a card."
    [{ what: 'creature' }],
    pump(t0, 3, 0),
    draw(1),
  ),
  'Smile at Death': {
    abilities: [
      // "At the beginning of your upkeep, return up to two target creature cards with power 2 or less from your graveyard to the
      // battlefield. Put a +1/+1 counter on each of those creatures."
      when(
        { on: 'beginningOfUpkeep', whose: 'yours' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            anyNumber: true,
            maxTargets: 2,
            filter: { types: ['Creature'], maxPower: 2 },
          },
        ],
        custom('tdmSmileAtDeath'),
      ),
    ],
  },
  'Static Snare': {
    // "This spell costs {1} less to cast for each attacking creature."
    costReduction: { count: 'attackingCreatures' },
    abilities: [
      // "When this enchantment enters, exile target artifact or creature an opponent controls until this enchantment leaves the
      // battlefield."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { types: ['Artifact', 'Creature'] } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },
  'Stormbeacon Blade': {
    abilities: [
      // "Equipped creature gets +3/+0."
      { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 0 } },
      // "Whenever equipped creature attacks, draw a card if you control three or more attacking creatures."
      when({ on: 'equippedAttacks' }, [], {
        kind: 'if',
        condition: { kind: 'controlsCreature', filter: { attacking: true }, count: 3 },
        then: [draw(1)],
      }),
      // "Equip {2}"
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
    ],
  },
  'Stormplain Detainment': {
    abilities: [
      // "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the
      // battlefield."
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },
  'Teeming Dragonstorm': {
    abilities: [
      // "When this enchantment enters, create two 2/2 white Soldier creature tokens."
      onEnter(soldiers(2)),
      // "When a Dragon you control enters, return this enchantment to its owner's hand."
      returnWhenDragonEnters,
    ],
  },
  'United Battlefront': {
    // "Look at the top seven cards of your library. Put up to two noncreature, nonland permanent cards with mana value 3 or
    // less from among them onto the battlefield. Put the rest on the bottom of your library in a random order."
    spell: {
      targets: [],
      effects: [
        {
          kind: 'lookAndTake',
          count: 7,
          filter: {
            types: ['Artifact', 'Enchantment', 'Planeswalker'],
            notTypes: ['Creature', 'Land'],
            maxManaValue: 3,
          },
          to: 'battlefield',
          upTo: 2,
        },
      ],
    },
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_WHITE_BACKS: Record<string, Behavior> = {
  // "Create a 2/2 white Soldier creature token. (Then shuffle this card into its owner's library.)"
  'Signaling Roar': spell([], soldiers(1)),
  // "Charring Bite deals 5 damage to target creature without flying."
  'Charring Bite': spell(
    [{ what: 'creature', filter: { lacksKeyword: 'flying' } }],
    { kind: 'damage', amount: 5, to: t0 },
  ),
};

/** Tokens only this group's cards make. */
export const TDM_WHITE_TOKENS: CardDefinition[] = [];
