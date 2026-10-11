import type { AbilityDef, Amount, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { draw, food, pump, t0, theirCreature, when } from '../blb/helpers.ts';
import { mode, tapFor } from '../fin/helpers.ts';
import { equip } from '../msc/helpers.ts';

/**
 * The Lord of the Rings: Tales of Middle-earth Starter Kit (22): the cards of its two decks, Fellowship of the Ring (G/W)
 * and Might of Mordor (B/R), that the pool didn't have: the ten exclusive rares and mythics, the two common reprints and
 * Graypelt Refuge. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const yourCreatures = { each: 'creature', controller: 'you' } as const;
const yourOtherCreatures = {
  each: 'creature',
  controller: 'you',
  filter: { other: true },
} as const;
const otherCreaturesYouControl: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Creature'] },
  other: true,
};

/** "Whenever <this> enters or attacks, <effects>": two triggers. */
const entersOrAttacks = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef[] => [
  when({ on: 'etb' }, targets, ...effects),
  when({ on: 'attacks' }, targets, ...effects),
];

/** Galadriel's three modes, for "enters or attacks". */
const galadrielModes = (on: 'etb' | 'attacks'): AbilityDef => ({
  kind: 'triggered',
  trigger: { on },
  targets: [],
  effects: [],
  modes: [
    mode(
      'Put a +1/+1 counter on another target creature',
      [{ what: 'creature', filter: { other: true } }],
      { kind: 'counters', to: t0, amount: 1 },
    ),
    mode('Create a Food token', [], food),
    mode('Create a Treasure token', [], { kind: 'createToken', token: 'treasure-token', count: 1 }),
  ],
});

export const LTR_STARTER_KIT: Record<string, Behavior> = {
  // Vigilance is printed.
  'Aragorn and Arwen, Wed': {
    // "Whenever Aragorn and Arwen enters or attacks, put a +1/+1 counter on each other creature you control. You gain 1 life
    // for each other creature you control."
    abilities: entersOrAttacks(
      [],
      { kind: 'counters', to: yourOtherCreatures, amount: 1 },
      { kind: 'gainLife', who: 'controller', amount: otherCreaturesYouControl },
    ),
  },
  'Frodo, Determined Hero': {
    abilities: [
      // "Whenever Frodo enters or attacks, you may attach target Equipment you control with mana value 2 or 3 to Frodo."
      ...entersOrAttacks(
        [
          {
            what: 'permanent',
            controller: 'you',
            optional: true,
            filter: { subtype: 'Equipment', minManaValue: 2, maxManaValue: 3 },
          },
        ],
        { kind: 'attach', to: 'self', what: t0 },
      ),
      // "During your turn, prevent all damage that would be dealt to Frodo."
      { kind: 'static', effect: { kind: 'preventDamageToSelf', condition: { kind: 'yourTurn' } } },
    ],
  },
  // Vigilance is printed.
  'Gandalf, White Rider': {
    abilities: [
      // "Whenever you cast a spell, creatures you control get +1/+0 until end of turn. Scry 1."
      when({ on: 'castSpell', filter: 'any' }, [], pump(yourCreatures, 1, 0), {
        kind: 'scry',
        amount: 1,
      }),
      // "When Gandalf dies, you may put it into its owner's library fifth from the top."
      when({ on: 'dies' }, [], { kind: 'may', effects: [custom('ltrFifthFromTop')] }),
    ],
  },
  'Galadriel, Gift-Giver': {
    // "Whenever Galadriel enters or attacks, choose one — • Put a +1/+1 counter on another target creature. • Create a Food
    // token. • Create a Treasure token."
    abilities: [galadrielModes('etb'), galadrielModes('attacks')],
  },
  "Bilbo's Ring": {
    abilities: [
      // "During your turn, equipped creature has hexproof and can't be blocked."
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          yourTurnKeywords: ['hexproof'],
          yourTurnCantBeBlocked: true,
        },
      },
      // "Whenever equipped creature attacks alone, you draw a card and you lose 1 life."
      when({ on: 'equippedAttacks', alone: true }, [], draw(1), {
        kind: 'loseLife',
        who: 'controller',
        amount: 1,
      }),
      // "Equip Halfling {1}"
      equip('{1}', { subtype: 'Halfling' }, 'Equip Halfling {1}'),
      // "Equip {4}"
      equip('{4}'),
    ],
  },
  'Gollum, Scheming Guide': {
    abilities: [
      // "Whenever Gollum attacks, look at the top two cards of your library, put them back in any order, then choose land or
      // nonland. An opponent guesses whether the top card of your library is the chosen kind. Reveal that card. If they
      // guessed right, remove Gollum from combat. Otherwise, you draw a card and Gollum can't be blocked this turn."
      when(
        { on: 'attacks' },
        [],
        { kind: 'chooseCustom', handler: 'ltrGollumOrder' },
        { kind: 'chooseCustom', handler: 'ltrGollumKind' },
      ),
    ],
  },
  // Flying is printed.
  'Witch-king, Bringer of Ruin': {
    // "Whenever Witch-king attacks, defending player sacrifices a creature with the least power among creatures they control."
    abilities: [when({ on: 'attacks' }, [], { kind: 'opponentSacrifices', leastPower: true })],
  },
  // Trample is printed.
  'The Balrog, Flame of Udûn': {
    abilities: [
      // "When a legendary creature an opponent controls dies, put The Balrog on the bottom of its owner's library."
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'opponent' },
        condition: { kind: 'subjectWasLegendary' },
        targets: [],
        effects: [{ kind: 'putInLibrary', what: 'self', position: 'bottom' }],
      },
    ],
  },
  'Sauron, the Lidless Eye': {
    abilities: [
      // "When Sauron enters, gain control of target creature an opponent controls until end of turn. Untap it. It gains haste
      // until end of turn."
      when(
        { on: 'etb' },
        [theirCreature],
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        pump(t0, 0, 0, ['haste']),
      ),
      // "{1}{B}{R}: Creatures you control get +2/+0 until end of turn. Each opponent loses 2 life."
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}{R}') },
        targets: [],
        effects: [pump(yourCreatures, 2, 0), { kind: 'loseLife', who: 'eachOpponent', amount: 2 }],
      },
    ],
  },
  'Fires of Mount Doom': {
    abilities: [
      // "When Fires of Mount Doom enters, it deals 2 damage to target creature an opponent controls. Destroy all Equipment
      // attached to that creature."
      when(
        { on: 'etb' },
        [theirCreature],
        { kind: 'damage', amount: 2, to: t0 },
        custom('ltrDestroyEquipmentOnTarget'),
      ),
      // "{2}{R}: Exile the top card of your library. You may play that card this turn. When you play a card this way, Fires of
      // Mount Doom deals 2 damage to each player." (The "when you play" is ability 2.)
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}') },
        targets: [],
        effects: [custom('ltrFiresExile', { ability: 2 })],
      },
      when({ on: 'reflexive' }, [], { kind: 'damage', amount: 2, to: 'eachPlayer' }),
    ],
  },
  // A 3/2 with no abilities (the Starter Kit's common reprint).
  'Knight of the Keep': {},
  // A 2/2 with no abilities (the Starter Kit's common reprint).
  'Goblin Assailant': {},
  // "This land enters tapped. When this land enters, you gain 1 life. {T}: Add {G} or {W}."
  'Graypelt Refuge': {
    entersTapped: true,
    abilities: [
      when({ on: 'etb' }, [], { kind: 'gainLife', who: 'controller', amount: 1 }),
      ...tapFor('G', 'W'),
    ],
  },
};

export const LTR_STARTER_KIT_BACKS: Record<string, Behavior> = {};
export const LTR_STARTER_KIT_TOKENS: CardDefinition[] = [];
