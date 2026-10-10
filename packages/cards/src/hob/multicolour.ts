import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, t0, when, yourCreature } from '../blb/helpers.ts';
import { equip } from '../msc/helpers.ts';
import { amassGoblins, enduringStory, recruit, storied, storyTriggersTwice } from '../hob-vocab.ts';
import { HOB_ELF, HOB_WOLF } from './tokens.ts';

/**
 * The Hobbit (20b): multicolour (gold and hybrid) cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An adventure card's spell side is keyed by its own
 * name in HOB_MULTICOLOUR_BACKS. See docs/the-hobbit-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const anyCreature: TargetSpec = { what: 'creature' };
const lose = (amount: number): EffectDef => ({ kind: 'loseLife', who: 'controller', amount });
const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });
const youControlOther = (subtype: string, min: number) =>
  ({ kind: 'controlsPermanents', filter: { subtype, other: true }, min }) as const;
/** "<keyword> as long as you control another <subtype>" (Dáin's Company, Bolg's Company). */
const keywordWhileOther = (keyword: 'lifelink' | 'haste', subtype: string): AbilityDef => ({
  kind: 'static',
  effect: {
    kind: 'while',
    condition: youControlOther(subtype, 1),
    power: 0,
    toughness: 0,
    keywords: [keyword],
  },
});
const goblinOrcOrArmy: CardFilter = {
  anyOf: [{ subtype: 'Goblin' }, { subtype: 'Orc' }, { subtype: 'Army' }],
};

export const HOB_MULTICOLOUR: Record<string, Behavior> = {
  // "Reach. Whenever you draw your second card each turn, put a +1/+1 counter on target creature. It gains lifelink until end of turn."
  'Bard the Bowman': {
    abilities: [
      when(
        { on: 'drawSecondCard' },
        [anyCreature],
        { kind: 'counters', to: t0, amount: 1 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['lifelink'] },
      ),
    ],
  },
  // "Reach, vigilance. If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.
  // If one or more tokens would be created under your control, twice that many of those tokens are created instead."
  'Bard, King of Dale': {
    abilities: [
      { kind: 'static', effect: { kind: 'everyExtraDrawBecomes', count: 2 } },
      { kind: 'static', effect: { kind: 'doubleTokens' } },
    ],
  },
  // "You may cast this spell as though it had flash if you control a Human. Other creatures you control get +1/+1. Whenever this
  // creature enters or attacks, recruit."
  "Bard's Company": {
    flashIf: { kind: 'controlsPermanents', filter: { subtype: 'Human' }, min: 1 },
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'otherCreaturesYouControl', power: 1, toughness: 1 },
      },
      when({ on: 'etb' }, [], recruit),
      when({ on: 'attacks' }, [], recruit),
    ],
  },
  // "Storied. Whenever Bifur enters or attacks, put a +1/+1 counter on target creature. As long as you have an enduring story, if a
  // triggered ability of a Dwarf you control triggers, that ability triggers an additional time."
  'Bifur, Melodic Rider': {
    abilities: [
      storied,
      when({ on: 'etb' }, [anyCreature], { kind: 'counters', to: t0, amount: 1 }),
      when({ on: 'attacks' }, [anyCreature], { kind: 'counters', to: t0, amount: 1 }),
      storyTriggersTwice('Dwarf'),
    ],
  },
  // "When Bolg enters, you may sacrifice another creature. When you do, Bolg deals damage equal to that creature's power to another
  // target creature. If excess damage was dealt this way, amass Goblins X, where X is that excess damage."
  'Bolg of the North': {
    abilities: [
      when({ on: 'etb' }, [], custom('hobBolgSacrifice', { ability: 1 })),
      when(
        { on: 'reflexive' },
        [{ what: 'creature', filter: { other: true } }],
        custom('hobBolgDamage'),
      ),
    ],
  },
  // "This creature has haste as long as you control another Goblin. {T}, Sacrifice another Goblin: Add {B}{R}."
  "Bolg's Company": {
    abilities: [
      keywordWhileOther('haste', 'Goblin'),
      {
        kind: 'activated',
        manaAbility: true,
        cost: {
          tapSelf: true,
          sacrificeCreature: true,
          sacrificeFilter: { subtype: 'Goblin', other: true },
        },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['B'], ['R']] }],
      },
    ],
  },
  // "Trample. This creature can't attack unless you control two or more other Wolves. At the beginning of your upkeep, create a 2/2
  // green Wolf creature token."
  "Chief Warg's Company": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'cantAttackUnless', condition: youControlOther('Wolf', 2) },
      },
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], token(HOB_WOLF)),
    ],
  },
  // "This creature has lifelink as long as you control another Dwarf. When this creature enters, look at the top four cards of your
  // library. You may reveal a Dwarf or Equipment card from among them and put it into your hand. Put the rest on the bottom of your
  // library in a random order."
  "Dáin's Company": {
    abilities: [
      keywordWhileOther('lifelink', 'Dwarf'),
      when({ on: 'etb' }, [], {
        kind: 'lookAndTake',
        count: 4,
        filter: { anyOf: [{ subtype: 'Dwarf' }, { subtype: 'Equipment' }] },
        reveal: true,
      }),
    ],
  },
  // "This creature can't be blocked by tokens. When this creature enters, put a +1/+1 counter on target creature."
  'Duskwatch Hunter': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlockedBy', filter: { token: true } } },
      when({ on: 'etb' }, [anyCreature], { kind: 'counters', to: t0, amount: 1 }),
    ],
  },
  // "First strike. Whenever Dwalin enters or attacks, put a hone counter on each Equipment you control." (A hone counter grants
  // +1/+0 to the equipped creature: characteristics.ts.)
  'Dwalin, Weaponmaster': {
    abilities: [
      when({ on: 'etb' }, [], honeCounters()),
      when({ on: 'attacks' }, [], honeCounters()),
    ],
  },
  // "Enchant creature. Enchanted creature gets +2/+2 and has flying. {2}{W/U}{W/U}: Return this card from your graveyard to the
  // battlefield attached to target creature you control with power 1 or less. Activate only as a sorcery."
  "Eagle's Rescue": {
    enchant: anyCreature,
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 2, keywords: ['flying'] },
      },
      {
        kind: 'activated',
        fromGraveyard: true,
        sorcerySpeed: true,
        cost: { mana: mana('{2}{W/U}{W/U}') },
        targets: [{ what: 'creature', controller: 'you', filter: { maxPower: 1 } }],
        effects: [custom('hobAuraFromGraveyard')],
      },
    ],
  },
  // "When this creature dies, amass Goblins 4."
  'Fearsome Goblin Pair': { abilities: [when({ on: 'dies' }, [], amassGoblins(4))] },
  // "When this Equipment enters, amass Goblins 1, then attach this Equipment to the amassed Army. Equipped creature gets +1/+0 and
  // has menace. Equip {4}"
  'Goblin Plate Mail': {
    abilities: [
      when({ on: 'etb' }, [], amassGoblins(1), { kind: 'attach', to: 'chosen' }),
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['menace'] },
      },
      equip('{4}'),
    ],
  },
  // "Reach, trample, haste"
  'Large Bear': {},
  // "When this creature enters, return up to one other target permanent you control to its owner's hand. If you do, put a +1/+1
  // counter on this creature."
  'Mirkwood Nurturer': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'you', optional: true, filter: { other: true } }],
        { kind: 'bounce', what: t0, then: [{ kind: 'counters', to: 'self', amount: 1 }] },
      ),
    ],
  },
  // "Whenever Nori attacks, target attacking creature gains first strike until end of turn."
  'Nori, Teller of Tales': {
    abilities: [
      when({ on: 'attacks' }, [{ what: 'creature', filter: { attacking: true } }], {
        kind: 'pump',
        to: t0,
        power: 0,
        toughness: 0,
        keywords: ['firstStrike'],
      }),
    ],
  },
  // "Vigilance. When this creature enters, recruit."
  'Patient Instructor': { abilities: [when({ on: 'etb' }, [], recruit)] },
  // "When this creature enters, draw a card, then discard a card. If you discard a land card this way, put it from your graveyard
  // onto the battlefield tapped. Landfall — Whenever a land you control enters, you may pay {1}{G}{U}. If you do, return this card
  // from your graveyard to your hand."
  'Silvan Reveler': {
    abilities: [
      when({ on: 'etb' }, [], draw(1), {
        kind: 'discard',
        count: 1,
        landToBattlefieldTapped: true,
      }),
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        fromGraveyard: true,
        cost: mana('{1}{G}{U}'),
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  // "Flying. When Smaug enters, create X tapped Treasure tokens, where X is the number of artifacts your opponents control.
  // Whenever you cast a spell, if mana from a Treasure was spent to cast it, you draw a card and lose 1 life."
  'Smaug, Wicked Worm': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: { count: 'permanentsOpponentsControl', filter: { types: ['Artifact'] } },
        tapped: true,
      }),
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'treasureManaSpent' },
        targets: [],
        effects: [draw(1), lose(1)],
      },
    ],
  },
  // "Menace. Ferocious — Whenever you attack while you control a creature with power 4 or greater, you draw a card and lose 1 life."
  'The Chief Warg': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
        targets: [],
        effects: [draw(1), lose(1)],
      },
    ],
  },
  // "Whenever you put one or more counters on a Goblin, Orc, or Army you control, The Great Goblin deals 2 damage to target opponent.
  // Whenever another Goblin, Orc, or Army you control dies, exile the top card of your library. You may play it until the end of your
  // next turn."
  'The Great Goblin': {
    abilities: [
      when(
        { on: 'counterPutOnYourCreature', filter: goblinOrcOrArmy, byYou: true },
        [{ what: 'player', controller: 'opponent' }],
        { kind: 'damage', amount: 2, to: t0 },
      ),
      when({ on: 'permanentYouControlDies', filter: goblinOrcOrArmy, other: true }, [], {
        kind: 'exileTopPlayable',
        count: 1,
        until: 'endOfNextTurn',
      }),
    ],
  },
  // "Trample. Storied. As long as you have an enduring story, artifacts and creatures you control have ward {1}."
  'Thorin Oakenshield': {
    abilities: [
      storied,
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          anyPermanent: true,
          filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
          condition: enduringStory,
          power: 0,
          toughness: 0,
          keywords: ['wardOne'],
        },
      },
    ],
  },
  // "Other Elves you control get +1/+1. Landfall — Whenever a land you control enters, create a 1/1 green Elf creature token."
  'Thranduil, Sindarin Liege': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Elf' },
          power: 1,
          toughness: 1,
        },
      },
      when({ on: 'landfall' }, [], token(HOB_ELF)),
    ],
  },
  // "Thranduil has all activated abilities of all Elf cards in your graveyard. Whenever another legendary Elf you control enters,
  // draw two cards, then discard a card."
  'Thranduil, the Elvenking': {
    abilities: [
      { kind: 'static', effect: { kind: 'graveyardElfAbilities' } },
      when(
        {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { subtype: 'Elf', supertypes: ['Legendary'] },
        },
        [],
        draw(2),
        { kind: 'discard', count: 1 },
      ),
    ],
  },
  // "As long as you control another Elf, you may play an additional land on each of your turns. Landfall — Whenever a land you
  // control enters, put two +1/+1 counters on target creature you control. It gains vigilance until end of turn."
  "Thranduil's Company": {
    abilities: [
      { kind: 'static', effect: { kind: 'extraLandDrop', condition: youControlOther('Elf', 1) } },
      when(
        { on: 'landfall' },
        [yourCreature],
        { kind: 'counters', to: t0, amount: 2 },
        { kind: 'pump', to: t0, power: 0, toughness: 0, keywords: ['vigilance'] },
      ),
    ],
  },
  // "{1}, Sacrifice another creature: Draw cards equal to the sacrificed creature's power, then discard a card. When Tom, Bert, and
  // William die, if they were a creature, return them to the battlefield. They're an artifact. (They're no longer a creature.)"
  'Tom, Bert, and William': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeCreature: true, sacrificeFilter: { other: true } },
        targets: [],
        effects: [
          { kind: 'draw', who: 'controller', amount: { sacrificedPower: true } },
          { kind: 'discard', count: 1 },
        ],
      },
      when({ on: 'dies' }, [], custom('hobReturnAsArtifact')),
    ],
  },
};

/** "Put a hone counter on each Equipment you control." */
function honeCounters(): EffectDef {
  return {
    kind: 'namedCounters',
    name: 'hone',
    amount: 1,
    to: { each: 'permanent', controller: 'you', filter: { subtype: 'Equipment' } },
  };
}

/** Back faces: the Adventure spell sides of adventure creatures, keyed by their own names. */
export const HOB_MULTICOLOUR_BACKS: Record<string, Behavior> = {
  // "Mill four cards, then put up to two land cards from among them into your hand."
  'Silvan Rally': { spell: { targets: [], effects: [custom('hobSilvanRally')] } },
};

/** Tokens only this group's cards make. */
export const HOB_MULTICOLOUR_TOKENS: CardDefinition[] = [];
