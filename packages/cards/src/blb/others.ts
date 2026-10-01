import type { AbilityDef, Amount, CardFilter, EffectDef, ManaType, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  atYourCombat,
  classCard,
  creature,
  draw,
  food,
  gain,
  gift,
  mana,
  mayForage,
  offspring,
  onEnter,
  pump,
  rabbit,
  t0,
  t1,
  theirCreature,
  valiant,
  when,
  yourCreature,
} from './helpers.ts';

// Bloomburrow's other cards: artifacts, lands, Classes and rares outside the
// ten decks' cores.

const upTo = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
const permanentCard: CardFilter = { notTypes: ['Instant', 'Sorcery'] };
const yourGraveyardCard = (filter: CardFilter, optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
  ...(optional ? { optional: true } : {}),
});
const artifactOrEnchantment: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Artifact', 'Enchantment'] },
};
/** One mana of any color. */
const anyMana: ManaType[][] = [['W', 'U', 'B', 'R', 'G']];
const colorless: AbilityDef = { kind: 'mana', cost: { tapSelf: true }, produces: 'C' };
/** A Village's "{T}: Add {X}. Spend this mana only to cast a creature spell." */
const creatureMana = (produces: 'W' | 'U' | 'B' | 'R' | 'G'): AbilityDef => ({
  kind: 'mana',
  cost: { tapSelf: true },
  produces,
  onlyFor: 'Creature',
});
const sacrificeLand = (
  cost: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), tapSelf: true, sacrificeSelf: true },
  targets,
  effects,
});
const fish: EffectDef = { kind: 'createToken', token: 'fish-token', count: 1 };
/** Valley Rotcaller: the other Squirrels, Bats, Lizards and Rats you control. */
const otherCritters: Amount = {
  count: 'permanentsYouControl',
  filter: { types: ['Creature'], subtypes: ['Squirrel', 'Bat', 'Lizard', 'Rat'] },
  other: true,
};
const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const otter: EffectDef = { kind: 'createToken', token: 'otter-token', count: 1 };
const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
});

export const OTHERS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ artifacts
  'Barkform Harvester': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [yourGraveyardCard({})],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'bottom' }],
      },
    ],
  },
  "Bumbleflower's Sharepot": {
    abilities: [
      onEnter(food),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'permanent', filter: { nonland: true } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Fountainport Bell': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'libraryTop' }],
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Three Tree Mascot': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'addMana', mana: anyMana }],
      },
    ],
  },
  'Heirloom Epic': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true, convoke: true },
        sorcerySpeed: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Patchwork Banner': {
    abilities: [
      onEnter({ kind: 'chooseCreatureType' }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { chosenTypeOfSource: true },
          power: 1,
          toughness: 1,
        },
      },
      ...anyColor(),
    ],
  },
  'Short Bow': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['reach', 'vigilance'] },
      },
      equip('{1}'),
    ],
  },
  'Starforged Sword': {
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      gift: { ...fish, tapped: true, forOpponent: true },
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasKicked' },
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
      {
        kind: 'static',
        effect: { kind: 'attached', power: 3, toughness: 3, loseKeywords: ['flying'] },
      },
      equip('{3}'),
    ],
  },
  'Tangle Tumbler': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true },
        targets: [creature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { tapTokens: 2 },
        targets: [],
        effects: [{ kind: 'becomeCreature', what: 'self' }],
        label: 'Tap two tokens: become a creature',
      },
    ],
  },
  'Stocking the Pantry': {
    abilities: [
      when({ on: 'youPutCounters' }, [], { kind: 'namedCounters', name: 'supply', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), removeCounters: { name: 'supply', count: 1 } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Sugar Coat': {
    enchant: {
      what: 'permanent',
      filter: { anyOf: [{ types: ['Creature'] }, { subtype: 'Food' }] },
    },
    abilities: [{ kind: 'static', effect: { kind: 'enchantedIsFood' } }],
  },

  // ------------------------------------------------------------------ lands
  'Hidden Grotto': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: anyMana }],
        label: '{1}, {T}: one mana of any color',
      },
    ],
  },
  'Uncharted Haven': {
    entersTapped: true,
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
    ],
  },
  'Lilypad Village': {
    abilities: [
      colorless,
      creatureMana('U'),
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), tapSelf: true },
        condition: {
          kind: 'controlsPermanents',
          filter: { enteredThisTurn: true, subtypes: ['Bird', 'Frog', 'Otter', 'Rat'] },
          min: 1,
        },
        targets: [],
        effects: [{ kind: 'surveil', amount: 2 }],
      },
    ],
  },
  'Lupinflower Village': {
    abilities: [
      colorless,
      creatureMana('W'),
      sacrificeLand('{1}{W}', [], {
        kind: 'lookAndTake',
        count: 6,
        filter: { subtypes: ['Bat', 'Bird', 'Mouse', 'Rabbit'] },
      }),
    ],
  },
  'Mudflat Village': {
    abilities: [
      colorless,
      creatureMana('B'),
      sacrificeLand(
        '{1}{B}',
        [yourGraveyardCard({ subtypes: ['Bat', 'Lizard', 'Rat', 'Squirrel'] })],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Oakhollow Village': {
    abilities: [
      colorless,
      creatureMana('G'),
      {
        kind: 'activated',
        cost: { mana: mana('{G}'), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: {
              each: 'creature',
              controller: 'you',
              filter: {
                enteredThisTurn: true,
                subtypes: ['Frog', 'Rabbit', 'Raccoon', 'Squirrel'],
              },
            },
            amount: 1,
          },
        ],
      },
    ],
  },
  'Rockface Village': {
    abilities: [
      colorless,
      creatureMana('R'),
      {
        kind: 'activated',
        cost: { mana: mana('{R}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [
          {
            what: 'creature',
            controller: 'you',
            filter: { subtypes: ['Lizard', 'Mouse', 'Otter', 'Raccoon'] },
          },
        ],
        effects: [pump(t0, 1, 0, ['haste'])],
      },
    ],
  },
  'Fabled Passage': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', untapIfLands: 4 },
        ],
      },
    ],
  },
  Fountainport: {
    abilities: [
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificePermanent: { token: true } },
        targets: [],
        effects: [draw(1)],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, life: 1 },
        targets: [],
        effects: [fish],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [treasure],
      },
    ],
  },
  'Three Tree City': {
    abilities: [
      onEnter({ kind: 'chooseCreatureType' }),
      colorless,
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: anyMana, count: { count: 'creaturesOfChosenType' } }],
        label: '{2}, {T}: mana for each creature of the chosen type',
      },
    ],
  },

  // ------------------------------------------------------------------ commons and uncommons
  'Cache Grab': {
    spell: {
      targets: [],
      effects: [{ kind: 'millThenTake', count: 4, filter: permanentCard, squirrelFood: true }],
    },
  },
  'Corpseberry Cultivator': {
    abilities: [
      atYourCombat([], mayForage()),
      when({ on: 'youForage' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Early Winter': {
    modes: [
      { label: 'Exile a creature', targets: [creature], effects: [{ kind: 'exile', what: t0 }] },
      {
        label: 'Opponent exiles an enchantment',
        targets: [],
        effects: [{ kind: 'opponentSacrifices', filter: { types: ['Enchantment'] }, exile: true }],
      },
    ],
  },
  'Head of the Homestead': { abilities: [onEnter(rabbit(2))] },
  'Bonecache Overseer': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, life: 1 },
        condition: { kind: 'graveyardLeftOrFoodSacrificed' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Dewdrop Cure': gift(
    'card',
    {
      targets: [
        yourGraveyardCard({ types: ['Creature'], maxManaValue: 2 }, true),
        yourGraveyardCard({ types: ['Creature'], maxManaValue: 2 }, true),
      ],
      effects: [
        { kind: 'returnToBattlefield', what: t0 },
        { kind: 'returnToBattlefield', what: t1 },
      ],
    },
    {
      targets: [
        yourGraveyardCard({ types: ['Creature'], maxManaValue: 2 }, true),
        yourGraveyardCard({ types: ['Creature'], maxManaValue: 2 }, true),
        yourGraveyardCard({ types: ['Creature'], maxManaValue: 2 }, true),
      ],
      effects: [
        { kind: 'returnToBattlefield', what: t0 },
        { kind: 'returnToBattlefield', what: t1 },
        { kind: 'returnToBattlefield', what: { target: 2 } },
      ],
    },
  ),
  'Downwind Ambusher': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          { label: '-1/-1 to a creature', targets: [theirCreature], effects: [pump(t0, -1, -1)] },
          {
            label: 'Destroy a damaged creature',
            targets: [{ what: 'creature', controller: 'opponent', filter: { damaged: true } }],
            effects: [{ kind: 'destroy', what: t0 }],
          },
        ],
      },
    ],
  },
  'Flamecache Gecko': {
    abilities: [
      {
        ...onEnter({ kind: 'addMana', mana: [['B'], ['R']] }),
        condition: { kind: 'lifeThisTurn', who: 'opponent', lost: true },
      } as AbilityDef,
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), discard: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Huskburster Swarm': { costReduction: { count: 'creatureCardsInExileAndGraveyard' } },
  'Jolly Gerbils': { abilities: [when({ on: 'youGiveGift' }, [], draw(1))] },
  'Peerless Recycling': gift(
    'card',
    { targets: [yourGraveyardCard(permanentCard)], effects: [{ kind: 'returnToHand', what: t0 }] },
    {
      targets: [yourGraveyardCard(permanentCard), yourGraveyardCard(permanentCard)],
      effects: [
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
      ],
    },
  ),
  'Ruthless Negotiation': {
    spell: {
      targets: [],
      effects: [{ kind: 'discard', count: 1, who: 'eachOpponent', exile: true }],
    },
    // "If this spell was cast from a graveyard, draw a card."
    flashbackSpell: {
      targets: [],
      effects: [{ kind: 'discard', count: 1, who: 'eachOpponent', exile: true }, draw(1)],
    },
    flashback: mana('{4}{B}'),
  },
  Stargaze: {
    spell: {
      targets: [],
      effects: [
        { kind: 'lookTakeRestGraveyard', count: { x: true, times: 2 }, take: { x: true } },
        { kind: 'loseLife', who: 'controller', amount: { x: true } },
      ],
    },
  },
  'Wear Down': gift(
    'card',
    { targets: [artifactOrEnchantment], effects: [{ kind: 'destroy', what: t0 }] },
    {
      targets: [artifactOrEnchantment, artifactOrEnchantment],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'destroy', what: t1 },
      ],
    },
  ),
  'Wildfire Howl': gift(
    'card',
    {
      targets: [],
      effects: [{ kind: 'damage', amount: 2, to: { each: 'creature' } }],
    },
    {
      targets: [{ what: 'any' }],
      effects: [
        { kind: 'damage', amount: 1, to: t0 },
        { kind: 'damage', amount: 2, to: { each: 'creature' } },
      ],
    },
  ),

  // ------------------------------------------------------------------ Classes
  "Bandit's Talent": classCard(
    [
      onEnter({
        kind: 'choose',
        opponent: true,
        options: [
          {
            label: 'Discard a nonland card',
            effects: [
              {
                kind: 'if',
                condition: { kind: 'opponentHandHas', filter: { nonland: true } },
                then: [
                  { kind: 'discard', count: 1, who: 'eachOpponent', filter: { nonland: true } },
                ],
                else: [{ kind: 'discard', count: 2, who: 'eachOpponent' }],
              },
            ],
          },
          {
            label: 'Discard two cards',
            effects: [{ kind: 'discard', count: 2, who: 'eachOpponent' }],
          },
        ],
      }),
    ],
    {
      cost: '{B}',
      abilities: [
        {
          ...when({ on: 'beginningOfUpkeep', whose: 'opponents' }, [], {
            kind: 'loseLife',
            who: 'eachOpponent',
            amount: 2,
          }),
          condition: { kind: 'opponentHandAtMost', max: 1 },
        } as AbilityDef,
      ],
    },
    {
      cost: '{3}{B}',
      abilities: [
        {
          ...when({ on: 'beginningOfDraw' }, [], draw(1)),
          condition: { kind: 'opponentHandAtMost', max: 1 },
        } as AbilityDef,
      ],
    },
  ),
  "Blacksmith's Talent": classCard(
    [onEnter({ kind: 'createToken', token: 'sword-token', count: 1 })],
    {
      cost: '{2}{R}',
      abilities: [
        atYourCombat(
          [
            { what: 'permanent', controller: 'you', filter: { subtype: 'Equipment' } },
            upTo(yourCreature),
          ],
          { kind: 'attach', what: t0, to: t1 },
        ),
      ],
    },
    {
      cost: '{3}{R}',
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'creaturesYouControl',
            filter: { equipped: true },
            condition: { kind: 'yourTurn' },
            power: 0,
            toughness: 0,
            keywords: ['doubleStrike', 'haste'],
          },
        },
      ],
    },
  ),
  "Builder's Talent": classCard(
    [onEnter({ kind: 'createToken', token: 'wall-token', count: 1 })],
    {
      cost: '{W}',
      abilities: [
        {
          ...when(
            { on: 'otherPermanentEtb', filter: { nonland: true, notTypes: ['Creature'] } },
            [yourCreature],
            { kind: 'counters', to: t0, amount: 1 },
          ),
          batch: true,
        } as AbilityDef,
      ],
    },
    {
      cost: '{4}{W}',
      abilities: [
        when(
          { on: 'becomesLevel', level: 3 },
          [yourGraveyardCard({ nonland: true, notTypes: ['Creature', 'Instant', 'Sorcery'] })],
          { kind: 'returnToBattlefield', what: t0 },
        ),
      ],
    },
  ),
  "Gossip's Talent": classCard(
    [when({ on: 'otherCreatureEtb', controller: 'you' }, [], { kind: 'surveil', amount: 1 })],
    {
      cost: '{1}{U}',
      abilities: [
        when(
          { on: 'youAttack' },
          [{ what: 'creature', controller: 'you', filter: { attacking: true, maxPower: 3 } }],
          { kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true },
        ),
      ],
    },
    {
      cost: '{3}{U}',
      abilities: [
        when({ on: 'creatureYouControlDealsCombatDamage', toPlayer: true }, [], {
          kind: 'may',
          effects: [{ kind: 'blink', what: 'subject' }],
        }),
      ],
    },
  ),
  "Caretaker's Talent": classCard(
    [
      {
        ...when({ on: 'otherPermanentEtb', filter: { token: true } }, [], draw(1)),
        batch: true,
        oncePerTurn: true,
      } as AbilityDef,
    ],
    {
      cost: '{W}',
      abilities: [
        when(
          { on: 'becomesLevel', level: 2 },
          [{ what: 'permanent', controller: 'you', filter: { token: true } }],
          { kind: 'tokenCopy', of: t0 },
        ),
      ],
    },
    {
      cost: '{3}{W}',
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'creaturesYouControl',
            filter: { token: true },
            power: 2,
            toughness: 2,
          },
        },
      ],
    },
  ),
  "Innkeeper's Talent": classCard(
    [atYourCombat([yourCreature], { kind: 'counters', to: t0, amount: 1 })],
    {
      cost: '{G}',
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'creaturesYouControl',
            filter: { hasCounters: true },
            power: 0,
            toughness: 0,
            keywords: ['wardOne'],
          },
        },
      ],
    },
    { cost: '{3}{G}', abilities: [{ kind: 'static', effect: { kind: 'doubleCounters' } }] },
  ),
  "Artist's Talent": classCard(
    [
      {
        ...when({ on: 'castSpell', filter: 'noncreature' }, [], {
          kind: 'if',
          condition: { kind: 'handSize', min: 1 },
          then: [{ kind: 'discard', count: 1 }, draw(1)],
        }),
        optional: true,
      } as AbilityDef,
    ],
    {
      cost: '{2}{R}',
      abilities: [
        {
          kind: 'static',
          effect: { kind: 'spellsCostLessIf', filter: { notTypes: ['Creature'] }, amount: 1 },
        },
      ],
    },
    {
      cost: '{2}{R}',
      abilities: [
        {
          kind: 'static',
          effect: { kind: 'damageBonus', amount: 2, noncombat: true, toOpponents: true },
        },
      ],
    },
  ),
  "Stormchaser's Talent": classCard(
    [onEnter(otter)],
    {
      cost: '{3}{U}',
      abilities: [
        when(
          { on: 'becomesLevel', level: 2 },
          [yourGraveyardCard({ types: ['Instant', 'Sorcery'] })],
          { kind: 'returnToHand', what: t0 },
        ),
      ],
    },
    {
      cost: '{5}{U}',
      abilities: [when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], otter)],
    },
  ),

  // ------------------------------------------------------------------ rares and mythics
  'Beza, the Bounding Spring': {
    abilities: [
      onEnter(
        { kind: 'if', condition: { kind: 'opponentHasMore', what: 'lands' }, then: [treasure] },
        { kind: 'if', condition: { kind: 'opponentHasMore', what: 'life' }, then: [gain(4)] },
        {
          kind: 'if',
          condition: { kind: 'opponentHasMore', what: 'creatures' },
          then: [{ kind: 'createToken', token: 'fish-token', count: 2 }],
        },
        { kind: 'if', condition: { kind: 'opponentHasMore', what: 'cards' }, then: [draw(1)] },
      ),
    ],
  },
  'Lumra, Bellow of the Woods': {
    ptEquals: { count: 'landsYouControl' },
    abilities: [onEnter({ kind: 'mill', count: 4 }, { kind: 'returnLandsFromGraveyard' })],
  },
  'Valley Questcaller': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtypes: ['Rabbit', 'Bat', 'Bird', 'Mouse'] },
          power: 1,
          toughness: 1,
        },
      },
      {
        ...when(
          {
            on: 'otherCreatureEtb',
            controller: 'you',
            filter: { subtypes: ['Rabbit', 'Bat', 'Bird', 'Mouse'] },
          },
          [],
          { kind: 'scry', amount: 1 },
        ),
        batch: true,
      } as AbilityDef,
    ],
  },
  'Valley Rotcaller': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: otherCritters },
        { kind: 'gainLife', who: 'controller', amount: otherCritters },
      ),
    ],
  },
  'Whiskervale Forerunner': {
    abilities: [
      valiant([], {
        kind: 'lookAndTake',
        count: 5,
        filter: { types: ['Creature'], maxManaValue: 3 },
        battlefieldOnYourTurn: true,
      }),
    ],
  },
  'Darkstar Augur': offspring(
    '{B}',
    when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'revealTopToHandLoseLife' }),
  ),
  "Dawn's Truce": gift(
    'card',
    {
      targets: [],
      effects: [
        { kind: 'playerHexproof' },
        pump({ each: 'permanent', controller: 'you' }, 0, 0, ['hexproof']),
      ],
    },
    {
      targets: [],
      effects: [
        { kind: 'playerHexproof' },
        pump({ each: 'permanent', controller: 'you' }, 0, 0, ['hexproof', 'indestructible']),
      ],
    },
  ),
  'Fecund Greenshell': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 10 },
          power: 2,
          toughness: 2,
        },
      },
      when({ on: 'selfOrCreatureEtb', filter: { toughnessGreaterThanPower: true } }, [], {
        kind: 'topCardLandOrHand',
      }),
    ],
  },
  'Coiling Rebirth': gift(
    'card',
    {
      targets: [yourGraveyardCard({ types: ['Creature'] })],
      effects: [{ kind: 'returnToBattlefield', what: t0 }],
    },
    {
      targets: [yourGraveyardCard({ types: ['Creature'] })],
      effects: [
        { kind: 'returnToBattlefield', what: t0 },
        { kind: 'tokenCopy', of: 'chosen', pt: [1, 1], nonlegendary: true },
      ],
    },
  ),
  Scrapshooter: {
    kicker: {
      cost: { generic: 0, colored: {} },
      as: 'gift',
      gift: { kind: 'draw', who: 'eachOpponent', amount: 1 },
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasKicked' },
        targets: [{ ...artifactOrEnchantment, controller: 'opponent' }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Pawpatch Recruit': offspring(
    '{2}',
    when(
      { on: 'yourCreatureTargetedByOpponent' },
      [{ what: 'creature', controller: 'you', filter: { notSubject: true } }],
      { kind: 'counters', to: t0, amount: 1 },
    ),
  ),
  'Thornvault Forager': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
      {
        kind: 'activated',
        cost: { tapSelf: true, forage: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [...anyMana, ...anyMana] }],
        label: '{T}, forage: two mana in any colors',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'searchLibrary', filter: { subtype: 'Squirrel' }, to: 'hand' }],
      },
    ],
  },
  'Sunspine Lynx': {
    abilities: [
      { kind: 'static', effect: { kind: 'noLifeGain' } },
      { kind: 'static', effect: { kind: 'damageCantBePrevented' } },
      onEnter({ kind: 'damageEachPlayerByNonbasics' }),
    ],
  },
  'Keen-Eyed Curator': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'exiledCardTypes', min: 4 },
          power: 4,
          toughness: 4,
          keywords: ['trample'],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'exileGraveyardCard', what: t0, track: true }],
      },
    ],
  },
};
