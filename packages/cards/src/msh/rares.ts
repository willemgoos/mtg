import type { AbilityDef, EffectDef, ManaType } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  connive,
  creature,
  crew,
  draw,
  drain,
  mana,
  onEnter,
  powerUp,
  t0,
  t1,
  t2,
  theirCreature,
  villain,
  yourCreature,
} from './helpers.ts';

/**
 * Marvel Super Heroes (MSH) rares not in our decks. Printed characteristics
 * come from Scryfall; only rules text lives here.
 */

const hero = { subtype: 'Hero' };

const equip = (cost: string, filter?: { supertypes: ['Legendary'] }): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [{ ...yourCreature, ...(filter ? { filter } : {}) }],
  effects: [{ kind: 'attach', to: t0 }],
  label: `Equip ${cost}`,
});

/** Plans: a plan counter each time; at `n`, sacrifice it and do the rest. */
const planCounter = (n: number, ...payoff: EffectDef[]): EffectDef[] => [
  { kind: 'namedCounters', name: 'plan', amount: 1, to: 'self' },
  {
    kind: 'if',
    condition: { kind: 'amountAtLeast', amount: { namedCountersOnSource: 'plan' }, min: n },
    then: [{ kind: 'sacrifice', what: 'self' }, ...payoff],
  },
];

/** "{T}: Add {C}. {T}: Add {a} or {b}. Activate only if this land entered this turn or if you control a basic land." */
const fastLand = (a: ManaType, b: ManaType): Behavior => ({
  abilities: [
    { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
    ...[a, b].map((produces): AbilityDef => ({
      kind: 'mana',
      cost: { tapSelf: true },
      produces,
      condition: {
        kind: 'any',
        of: [{ kind: 'sourceEnteredThisTurn' }, { kind: 'controlsBasicLand' }],
      },
    })),
  ],
});

export const MSH_RARES: Record<string, Behavior> = {
  'Elektra, Daughter of the Hand': {
    sneak: mana('{1}{B}{B}'),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'opponent', filter: { maxPower: 3 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // "You may begin the game with him on the battlefield": always.
  'Quicksilver, Brash Blur': {
    beginsOnBattlefield: true,
    abilities: [
      powerUp(
        '{4}{R}',
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'namedCounters', name: 'doubleStrike', amount: 1, to: 'self' },
      ),
    ],
  },
  'Ares, God of War': {
    abilities: [
      { kind: 'static', effect: { kind: 'attacksEachCombat' } },
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', filter: { leftAttacking: true } },
        targets: [],
        effects: [{ kind: 'returnToHand', what: 'subject' }],
      },
    ],
  },
  'Thunderbolts Conspiracy': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', filter: { subtype: 'Villain' } },
        targets: [],
        effects: [
          { kind: 'returnToBattlefield', what: 'subject', counter: 'finality', addSubtype: 'Hero' },
        ],
      },
    ],
  },
  'Arc Reactor': {
    improvise: true,
    entersTapped: true,
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'C', amount: 3 }],
  },
  'Ironheart, Clever Champion': {
    improvise: true,
    abilities: [{ kind: 'static', effect: { kind: 'noncreatureSpellsHaveImprovise' } }],
  },
  'The Kingpin of Crime': {
    abilities: [
      // Extort.
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        optional: true,
        cost: mana('{W/B}'),
        targets: [],
        effects: drain(1),
      },
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        optional: true,
        lifeCost: 2,
        cost: mana(''),
        targets: [],
        effects: [{ kind: 'assignToughness' }],
      },
    ],
  },
  'Leader, Super-Genius': {
    abilities: [
      { kind: 'static', effect: { kind: 'conniveDrawsFirst' } },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [yourCreature],
        effects: [{ kind: 'connive', what: t0 }],
      },
    ],
  },
  'Dark Fortress': fastLand('B', 'R'),
  'Gathering Place': fastLand('G', 'W'),
  'Gleaming Bastion': fastLand('W', 'U'),
  'Hidden Lair': fastLand('U', 'B'),
  'Training Compound': fastLand('R', 'G'),
  'Castle Doom': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        onlyFor: 'Artifact',
      })),
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: {
          mana: mana('{3}'),
          tapSelf: true,
          sacrificePermanent: { types: ['Artifact'] },
        },
        targets: [],
        effects: [{ kind: 'createToken', token: 'doombot-token', count: 1 }],
      },
    ],
  },
  'Agent Phil Coulson': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'counters',
            to: { each: 'creature', controller: 'you', filter: { ...hero, other: true } },
            amount: 1,
          },
        ],
      },
    ],
  },
  'Captain America, Wings of Freedom': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { ...hero, other: true } },
            power: { toughnessOf: 'self' },
            toughness: { toughnessOf: 'self' },
          },
        ],
      },
    ],
  },
  'Mole Man, Moloid Master': {
    abilities: [
      { kind: 'static', effect: { kind: 'playLandsFromGraveyard' } },
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'moloid-token', count: 1 }],
      },
    ],
  },
  // "Base power and toughness become 6/6": +4/+4 on the printed 2/2.
  'Moon Girl and Devil Dinosaur': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 4, toughness: 4, keywords: ['trample'] }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { types: ['Artifact'] } },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Super-Skrull': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [{ kind: 'createToken', token: 'wall-token', count: 1 }],
        label: '{2}{W}: Create a 0/4 Wall',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{G}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 4, toughness: 4 }],
        label: '{3}{G}: +4/+4',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}') },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'damage', amount: 4, to: t0 }],
        label: '{4}{R}: 4 damage to a creature',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}{U}') },
        targets: [{ what: 'player' }],
        effects: [{ kind: 'draw', who: t0, amount: 4 }],
        label: '{5}{U}: A player draws four',
      },
    ],
  },
  'The Mighty Thor, Jane Foster': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [
          {
            what: 'permanent',
            filter: {
              nontoken: true,
              anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }],
            },
            optional: true,
          },
        ],
        effects: [{ kind: 'blink', what: t0, tapped: true }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { subtype: 'Equipment' } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'The Unbeatable Squirrel Girl': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'squirrel-token', count: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [{ kind: 'createToken', token: 'squirrel-token', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}{G}{G}') },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'squirrel-token',
            count: { count: 'creaturesYouControl', subtype: 'Squirrel' },
          },
        ],
      },
    ],
  },
  'S.H.I.E.L.D. Flying Car': {
    abilities: [
      crew(1),
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ ...yourCreature, optional: true }],
        effects: [{ kind: 'exileUntilEndStep', what: t0 }],
      },
    ],
  },
  // "Its controller may search for a basic land" is not modelled.
  'Avengers Disassembled': {
    modes: [
      {
        targets: [],
        effects: [{ kind: 'damage', amount: 3, to: { each: 'creature' } }],
        label: '3 damage to each creature',
      },
      {
        targets: [{ what: 'permanent', filter: { types: ['Land'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
        label: 'Destroy target land',
      },
      {
        targets: [{ what: 'permanent', filter: { types: ['Land'] } }],
        effects: [
          { kind: 'damage', amount: 3, to: { each: 'creature' } },
          { kind: 'destroy', what: t0 },
        ],
        label: 'Both',
      },
    ],
  },
  'The Sentry, Golden Guardian': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'the-void-token', count: 1, forOpponent: true }),
    ],
  },
  'Alien Invasion': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'alien-token',
            count: 1,
            counters: { namedCountersOnSource: 'invasion' },
          },
          { kind: 'namedCounters', name: 'invasion', amount: 1, to: 'self' },
        ],
      },
    ],
  },
  "Captain America's Shield": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 8, keywords: ['vigilance'] },
      },
      {
        kind: 'triggered',
        trigger: { on: 'equippedAttacks' },
        targets: [theirCreature],
        effects: [{ kind: 'tap', what: t0 }],
      },
      equip('{2}'),
    ],
  },
  'Epic Fight': {
    modes: [
      {
        targets: [creature],
        effects: [{ kind: 'pump', to: t0, power: { powerOf: t0 }, toughness: { toughnessOf: t0 } }],
        label: "Double target creature's power and toughness",
      },
      {
        targets: [yourCreature, theirCreature],
        effects: [{ kind: 'fight', a: t0, b: t1 }],
        label: 'Your creature fights their creature',
      },
      {
        targets: [creature, yourCreature, theirCreature],
        effects: [
          { kind: 'pump', to: t0, power: { powerOf: t0 }, toughness: { toughnessOf: t0 } },
          { kind: 'fight', a: t1, b: t2 },
        ],
        label: 'Both',
      },
    ],
  },
  // "Choose up to that many target creatures": one target creature each time.
  'Heroic Feast': {
    abilities: [
      onEnter({ kind: 'createToken', token: 'food-token', count: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'youGainLife' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  },
  // "Remove any number of +1/+1 counters": all of them.
  'The Astonishing Ant-Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawCard', whose: 'yours' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{G}'), tapSelf: true },
        targets: [],
        effects: [
          { kind: 'createToken', token: 'insect-token', count: { countersOn: 'self' } },
          { kind: 'removePlusOneCounters', from: 'self' },
        ],
      },
    ],
  },
  'The Scarlet Witch': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { types: ['Instant', 'Sorcery'], minManaValue: 4 },
          amount: { powerOf: 'self' },
        },
      },
    ],
  },
  // "Choose one that hasn't been chosen this turn": any mode each time.
  'The Vision': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [],
        modes: [
          {
            targets: [],
            effects: [
              { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['doubleStrike'] },
            ],
            label: 'Solar Beam: double strike',
          },
          {
            targets: [],
            effects: [
              { kind: 'pump', to: 'self', power: 0, toughness: 0, keywords: ['indestructible'] },
            ],
            label: 'Density Control: indestructible',
          },
          { targets: [], effects: [draw(1)], label: 'Technopathy: draw a card' },
        ],
      },
    ],
  },
  'The Wondrous Wasp': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ ...creature, optional: true }],
        effects: [
          { kind: 'tap', what: t0 },
          { kind: 'loseAbilities', what: t0, whileSource: true },
        ],
      },
    ],
  },
  // "Then you may attach an Equipment you control to him" is not modelled.
  'Winter Soldier, Icy Assassin': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: {
            multiply: 2,
            amount: {
              count: 'permanentsYouControl',
              filter: { subtype: 'Equipment', attachedToSource: true },
            },
          },
          toughness: 0,
        },
      },
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{3}{W}{B}') },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', named: 'finality' }],
      },
    ],
  },
  'Wolverine, Fierce Fighter': {
    abilities: [
      { kind: 'static', effect: { kind: 'damageDoesntAccumulate' } },
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', filter: { other: true }, optional: true }],
        effects: [{ kind: 'fight', a: 'self', b: t0 }],
      },
    ],
  },
  // Her base power becoming the number of cards in your hand is not modelled.
  'Ms. Marvel, Kamala Khan': {
    abilities: [
      { kind: 'static', effect: { kind: 'noMaxHandSize' } },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsYourCreature' },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // Trick Arrows: only Explosive, once, when he attacks.
  'Hawkeye, Master Marksman': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        optional: true,
        cost: mana('{1}'),
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'damage', amount: 2, to: t0 }],
      },
    ],
  },
  'Fin Fang Foom': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorceryTargetingArtifactOrLand' },
        targets: [],
        effects: [
          { kind: 'copySpell', what: 'subject' },
          { kind: 'counters', to: 'self', amount: 2 },
        ],
      },
    ],
  },
  // Being a legendary Soldier and attaching Equipment as it attacks or blocks are not modelled.
  'Super-Soldier Serum': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 2,
          toughness: 2,
          keywords: ['firstStrike', 'vigilance'],
        },
      },
    ],
  },
  // Giving flying to creatures your spells target is not modelled.
  'Storm, Windrider': {
    abilities: [
      { kind: 'static', effect: { kind: 'flyersCantBlockYours' } },
      { kind: 'static', effect: { kind: 'cantAttackYou', filter: { hasKeyword: 'flying' } } },
    ],
  },
  // Its ward ("get five poison counters") is not modelled.
  'The Serpent Society': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', filter: { hasKeyword: 'deathtouch' } },
        targets: [],
        effects: [{ kind: 'opponentSacrifices', filter: { nontoken: true } }],
      },
    ],
  },
  // "You control target opponent during their next turn": you take an extra turn instead.
  'Construct a Cosmic Cube': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'drawSecondCard' },
        targets: [],
        effects: [villain(), ...planCounter(7, { kind: 'extraTurn' })],
      },
    ],
  },
  // Boast is not modelled.
  'Baron Helmut Zemo': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: { colors: ['B'] } },
        targets: [],
        effects: [connive],
      },
    ],
  },
  // A card exiled from their hand stays exiled (not only until Cloak and Dagger leave).
  'Cloak and Dagger, Entwined': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          { what: 'player', controller: 'opponent' },
          { what: 'creature', controller: 'opponent', optional: true },
        ],
        effects: [
          {
            kind: 'choose',
            options: [
              {
                label: 'Exile the chosen creature until Cloak and Dagger leave',
                effects: [{ kind: 'exileUntilSourceLeaves', what: t1 }],
              },
              {
                label: 'Exile a nonland card from their hand',
                effects: [
                  { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'exile' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  // Radar Sense (looking at the top card any time) is not shown.
  'Daredevil, Man Without Fear': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [
              {
                kind: 'exileTopPlayable',
                count: 1,
                until: 'endOfTurn',
                ifExiled: {
                  filter: { subtype: 'Hero' },
                  then: [{ kind: 'pump', to: 'self', power: 2, toughness: 1 }],
                },
              },
            ],
          },
        ],
      },
    ],
  },
  // "Cast up to two spells": one.
  'Doom Reigns Supreme': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Villain' } },
        targets: [],
        effects: [
          ...drain(1),
          ...planCounter(5, {
            kind: 'castFreeFromTop',
            count: 5,
            from: 'opponents',
            rest: 'exile',
          }),
        ],
      },
    ],
  },
  'Loki, God of Mischief': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youTargetWithAbility' },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  // It copies the topmost such ability rather than a target one.
  'Scientist Supreme of A.I.M.': {
    abilities: [
      {
        kind: 'activated',
        cost: { life: 2 },
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'copyArtifactAbility' }],
        label: 'Pay 2 life: copy an ability of your artifact',
      },
    ],
  },
  'Super-Adaptoid': {
    powerEquals: {
      count: 'permanentsYouControl',
      filter: { types: ['Creature'], supertypes: ['Legendary'] },
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', filter: { other: true } }],
        effects: [{ kind: 'keywordCountersFrom', what: t0 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [{ what: 'creature', filter: { other: true } }],
        effects: [{ kind: 'keywordCountersFrom', what: t0 }],
      },
    ],
  },
  // "Choose up to X": one mode; "destroy target token" is not offered.
  'The Ruinous Wrecking Crew': {
    entersWithXCounters: true,
    abilities: [
      onEnter({
        kind: 'choose',
        options: [
          {
            label: 'Discard a card, then draw a card',
            effects: [{ kind: 'discard', count: 1 }, draw(1)],
          },
          {
            label: 'Each opponent loses 2 life',
            effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 2 }],
          },
          {
            label: 'Each player sacrifices a creature',
            effects: [{ kind: 'eachPlayerSacrifices' }],
          },
        ],
      }),
    ],
  },
  'Vision Quest': {
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'visionQuest' }] },
  },
  'Worlds Within Worlds': {
    spell: { targets: [], effects: [{ kind: 'custom', handler: 'worldsWithinWorlds' }] },
  },
  // Copies (Stream A's "becomes a copy"). His name and legendary status aren't kept.
  'Absorbing Man': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [
          {
            what: 'permanent',
            filter: {
              anyOf: [
                { types: ['Artifact'] },
                { types: ['Enchantment'], notSubtype: 'Aura' },
                { types: ['Land'] },
              ],
            },
            optional: true,
          },
        ],
        effects: [
          {
            kind: 'becomeCopy',
            of: t0,
            until: 'yourNextTurn',
            asCreature: {
              power: 4,
              toughness: 4,
              subtypes: ['Human', 'Villain'],
              keywords: ['vigilance'],
            },
          },
        ],
      },
    ],
  },
  // A creature card in a graveyard can't be chosen; his name and types aren't kept.
  'Taskmaster, Mercenary Mimic': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [{ what: 'creature', filter: { other: true }, optional: true }],
        effects: [{ kind: 'becomeCopy', of: t0, until: 'yourNextTurn' }],
      },
    ],
  },
  // The enchanted creature's ward {2} is not modelled.
  'Secret Invasion': {
    enchant: { what: 'creature', controller: 'you' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', filter: { notAttachedHost: true }, optional: true }],
        effects: [
          { kind: 'becomeCopy', what: 'attached', of: t0, until: 'whileSource' },
          { kind: 'exileUntilSourceLeaves', what: t0 },
        ],
      },
    ],
  },
};
