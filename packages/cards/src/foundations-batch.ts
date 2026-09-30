/** Foundations additions using supported, explicit rules primitives. */
import type {
  AbilityDef,
  CardFilter,
  EffectDef,
  Keyword,
  Ref,
  TargetSpec,
  TriggerDef,
} from '@mtg/engine';
import { parseManaCost, type Behavior } from './build.ts';

const target = { target: 0 } as const;
const creature: TargetSpec = { what: 'creature' };
const own: TargetSpec = { what: 'creature', controller: 'you' };
const artifactOrEnchantment: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Artifact', 'Enchantment'] },
};
const nonland: TargetSpec = { what: 'permanent', filter: { nonland: true } };
const ownGrave = (filter: CardFilter): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
});
const spell = (targets: TargetSpec[], ...effects: EffectDef[]): Behavior => ({
  spell: { targets, effects },
});
const trigger = (
  on: TriggerDef,
  targets: TargetSpec[],
  ...effects: EffectDef[]
): Extract<AbilityDef, { kind: 'triggered' }> => ({
  kind: 'triggered',
  trigger: on,
  targets,
  effects,
});
const etb = (...effects: EffectDef[]) => trigger({ on: 'etb' }, [], ...effects);
const draw: EffectDef = { kind: 'draw', who: 'controller', amount: 1 };
const loot: EffectDef[] = [draw, { kind: 'discard', count: 1 }];
const gain = (amount: number): EffectDef => ({ kind: 'gainLife', who: 'controller', amount });
const drain = (amount: number): EffectDef[] => [
  { kind: 'loseLife', who: 'eachOpponent', amount },
  gain(amount),
];
const pump = (to: Ref, power: number, toughness: number, keywords?: Keyword[]): EffectDef => ({
  kind: 'pump',
  to,
  power,
  toughness,
  ...(keywords ? { keywords } : {}),
});
const all = { each: 'creature', controller: 'you' } as const;
const prowess = trigger({ on: 'castSpell', filter: 'noncreature' }, [], pump('self', 1, 1));
const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost) },
  sorcerySpeed: true,
  targets: [own],
  effects: [{ kind: 'attach', to: target }],
});
const equipment = (cost: string, keywords: Keyword[]): Behavior => ({
  abilities: [
    { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, keywords } },
    equip(cost),
  ],
});
const aura = (power: number, toughness: number, keywords: Keyword[]): Behavior => ({
  enchant: creature,
  abilities: [{ kind: 'static', effect: { kind: 'attached', power, toughness, keywords } }],
});
const removal = (spec: TargetSpec, kind: 'destroy' | 'exile' | 'bounce') =>
  spell([spec], { kind, what: target });
const search = (
  filter: CardFilter | 'basicLand',
  to: 'hand' | 'battlefieldTapped' | 'graveyard' = 'hand',
): EffectDef => ({ kind: 'searchLibrary', filter, to });
const activated = (
  cost: string,
  targets: TargetSpec[],
  effects: EffectDef[],
  sacrificeSelf = false,
): Extract<AbilityDef, { kind: 'activated' }> => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost), ...(sacrificeSelf ? { sacrificeSelf: true } : {}) },
  targets,
  effects,
});
const reclaim = (types: CardFilter['types']) =>
  trigger({ on: 'etb' }, [ownGrave({ types })], { kind: 'returnToHand', what: target });
const raidDraw: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  condition: { kind: 'attackedThisTurn' },
  targets: [],
  effects: [draw],
};

export const FOUNDATIONS_BATCH_BEHAVIORS: Record<string, Behavior> = {
  'Armasaur Guide': {
    abilities: [
      {
        ...trigger({ on: 'youAttack' }, [own], { kind: 'counters', to: target, amount: 1 }),
        condition: { kind: 'controlsCreature', filter: { attacking: true }, count: 3 },
      },
    ],
  },
  'Evolving Wilds': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [search('basicLand', 'battlefieldTapped')],
      },
    ],
  },
  'Felidar Retreat': {
    abilities: [
      {
        ...trigger({ on: 'landfall' }, []),
        modes: [
          {
            label: 'Create a Cat Beast',
            targets: [],
            effects: [{ kind: 'createToken', token: 'cat-beast-token', count: 1 }],
          },
          {
            label: 'Counters and vigilance',
            targets: [],
            effects: [{ kind: 'counters', to: all, amount: 1 }, pump(all, 0, 0, ['vigilance'])],
          },
        ],
      },
    ],
  },
  'Linden, the Steadfast Queen': {
    abilities: [
      trigger({ on: 'creatureYouControlAttacks', filter: { colors: ['W'] } }, [], gain(1)),
    ],
  },
  'Maalfeld Twins': {
    abilities: [
      trigger({ on: 'dies' }, [], { kind: 'createToken', token: 'zombie-token', count: 2 }),
    ],
  },
  'Macabre Waltz': spell(
    [
      { ...ownGrave({ types: ['Creature'] }), optional: true },
      { ...ownGrave({ types: ['Creature'] }), optional: true },
    ],
    { kind: 'returnToHand', what: target },
    { kind: 'returnToHand', what: { target: 1 } },
    { kind: 'discard', count: 1 },
  ),
  'Make a Stand': spell([], pump(all, 1, 0, ['indestructible'])),
  'Make Your Move': removal(
    {
      what: 'permanent',
      filter: {
        anyOf: [{ types: ['Artifact', 'Enchantment'] }, { types: ['Creature'], minPower: 4 }],
      },
    },
    'destroy',
  ),
  'Mystical Teachings': {
    ...spell([], search({ anyOf: [{ types: ['Instant'] }, { hasKeyword: 'flash' }] })),
    flashback: parseManaCost('{5}{B}'),
  },
  'Offer Immortality': spell([creature], pump(target, 0, 0, ['deathtouch', 'indestructible'])),
  "Pirate's Cutlass": {
    abilities: [
      trigger({ on: 'etb' }, [{ ...own, filter: { subtype: 'Pirate' } }], {
        kind: 'attach',
        to: target,
      }),
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 1 } },
      equip('{2}'),
    ],
  },
  "Rogue's Passage": {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      {
        ...activated(
          '{4}',
          [creature],
          [{ kind: 'pump', to: target, power: 0, toughness: 0, cantBeBlocked: true }],
        ),
        cost: { mana: parseManaCost('{4}'), tapSelf: true },
      },
    ],
  },
  'Scrawling Crawler': {
    abilities: [
      trigger({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
        kind: 'draw',
        who: 'eachPlayer',
        amount: 1,
      }),
      trigger({ on: 'drawCard', whose: 'opponents' }, [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: 1,
      }),
    ],
  },
  'Sylvan Scavenging': {
    abilities: [
      {
        ...trigger({ on: 'beginningOfEndStep', whose: 'yours' }, []),
        modes: [
          {
            label: 'Put a counter on a creature',
            targets: [own],
            effects: [{ kind: 'counters', to: target, amount: 1 }],
          },
          {
            label: 'Create a Raccoon if you control power 4+',
            targets: [],
            effects: [
              {
                kind: 'if',
                condition: { kind: 'controlsCreature', filter: { minPower: 4 } },
                then: [{ kind: 'createToken', token: 'raccoon-token', count: 1 }],
              },
            ],
          },
        ],
      },
    ],
  },
  'Volley Veteran': {
    abilities: [
      trigger({ on: 'etb' }, [{ ...creature, controller: 'opponent' }], {
        kind: 'damage',
        to: target,
        amount: { count: 'creaturesYouControl', subtype: 'Goblin' },
      }),
    ],
  },
  'Voracious Greatshark': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'spell', filter: { types: ['Artifact', 'Creature'] } }], {
        kind: 'counter',
        what: target,
      }),
    ],
  },
  "An Offer You Can't Refuse": spell([{ what: 'spell', filter: { notTypes: ['Creature'] } }], {
    kind: 'counter',
    what: target,
    controllerTokens: { token: 'treasure-token', count: 2 },
  }),
  'Ancestor Dragon': {
    abilities: [
      trigger({ on: 'youAttack' }, [], {
        kind: 'gainLife',
        who: 'controller',
        amount: { count: 'creaturesYouControl', attacking: true },
      }),
    ],
  },
  'Archway Angel': {
    abilities: [
      etb({
        kind: 'gainLife',
        who: 'controller',
        amount: { multiply: 2, amount: { count: 'landsYouControl', subtype: 'Gate' } },
      }),
    ],
  },
  'Ballyrush Banneret': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { subtypes: ['Kithkin', 'Soldier'] }, amount: 1 },
      },
    ],
  },
  "Brass's Bounty": spell([], {
    kind: 'createToken',
    token: 'treasure-token',
    count: { count: 'landsYouControl' },
  }),
  'Cephalid Inkmage': {
    abilities: [
      etb({ kind: 'surveil', amount: 3 }),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'graveyardCount', min: 7 },
          power: 0,
          toughness: 0,
          cantBeBlocked: true,
        },
      },
    ],
  },
  'Corsair Captain': {
    abilities: [
      etb({ kind: 'createToken', token: 'treasure-token', count: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Pirate' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  },
  'Cryptic Caves': {
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      {
        ...activated('{1}', [], [draw], true),
        cost: { mana: parseManaCost('{1}'), tapSelf: true, sacrificeSelf: true },
        condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 5 },
      },
    ],
  },
  'Death Baron': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { anyOf: [{ subtype: 'Skeleton' }, { subtype: 'Zombie', other: true }] },
          power: 1,
          toughness: 1,
          keywords: ['deathtouch'],
        },
      },
    ],
  },
  Deathmark: removal({ what: 'creature', filter: { colors: ['G', 'W'] } }, 'destroy'),
  "Dragonlord's Servant": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { subtype: 'Dragon' }, amount: 1 },
      },
    ],
  },
  'Dragonmaster Outcast': {
    abilities: [
      {
        ...trigger({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 6 },
          then: [{ kind: 'createToken', token: 'dragon-5-token', count: 1 }],
        }),
        condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 6 },
      },
    ],
  },
  'Driver of the Dead': {
    abilities: [
      trigger({ on: 'dies' }, [ownGrave({ types: ['Creature'], maxManaValue: 2 })], {
        kind: 'returnToBattlefield',
        what: target,
      }),
    ],
  },
  'Dwynen, Gilt-Leaf Daen': {
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
      trigger({ on: 'attacks' }, [], {
        kind: 'gainLife',
        who: 'controller',
        amount: { count: 'creaturesYouControl', attacking: true, subtype: 'Elf' },
      }),
    ],
  },
  Flashfreeze: spell([{ what: 'spell', filter: { colors: ['R', 'G'] } }], {
    kind: 'counter',
    what: target,
  }),
  'Ghalta, Primal Hunger': { costReduction: { count: 'totalPowerOfCreaturesYouControl' } },
  'Goblin Oriflamme': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { attacking: true },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },
  'Goblin Smuggler': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', filter: { other: true, maxPower: 2 } }],
        effects: [{ kind: 'pump', to: target, power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Gnarlid Colony': {
    kicker: { cost: parseManaCost('{2}{G}') },
    entersWithCounters: 2,
    entersWithCountersIf: { kind: 'wasKicked' },
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
    ],
  },
  'Hare Apparent': {
    abilities: [
      etb({
        kind: 'createToken',
        token: 'rabbit-token',
        count: { count: 'creaturesYouControl', named: 'hare-apparent', other: true },
      }),
    ],
  },
  'Inspiring Call': spell(
    [],
    {
      kind: 'draw',
      who: 'controller',
      amount: { count: 'creaturesYouControl', minPlusOneCounters: 1 },
    },
    pump({ ...all, filter: { minPlusOneCounters: 1 } }, 0, 0, ['indestructible']),
  ),
  'Inspiring Paladin': {
    abilities: [
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
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { minPlusOneCounters: 1 },
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
    ],
  },
  'Jazal Goldmane': {
    abilities: [
      activated(
        '{3}{W}{W}',
        [],
        [
          {
            kind: 'pump',
            to: { ...all, filter: { attacking: true } },
            power: { count: 'creaturesYouControl', attacking: true },
            toughness: { count: 'creaturesYouControl', attacking: true },
          },
        ],
      ),
    ],
  },
  'Kargan Dragonrider': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsCreature', filter: { subtype: 'Dragon' } },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  'Kitesail Corsair': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'sourceAttacking' },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  'Prayer of Binding': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          { label: 'Gain 2 life', targets: [], effects: [gain(2)] },
          {
            label: 'Exile a nonland permanent and gain 2 life',
            targets: [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
            effects: [{ kind: 'exileUntilSourceLeaves', what: target }, gain(2)],
          },
        ],
      },
    ],
  },
  'Revenge of the Rats': {
    ...spell([], {
      kind: 'createToken',
      token: 'rat-token',
      count: { count: 'cardsInGraveyard', types: ['Creature'] },
      tapped: true,
    }),
    flashback: parseManaCost('{2}{B}{B}'),
  },
  "River's Rebuke": spell([{ what: 'player' }], {
    kind: 'bouncePlayerPermanents',
    who: target,
    nonland: true,
  }),
  "Seeker's Folly": {
    modes: [
      {
        label: 'Opponent discards two cards',
        targets: [{ what: 'player', controller: 'opponent' }],
        effects: [{ kind: 'discard', who: 'eachOpponent', count: 2 }],
      },
      {
        label: 'Opposing creatures get -1/-1',
        targets: [],
        effects: [pump({ each: 'creature', controller: 'opponent' }, -1, -1)],
      },
    ],
  },
  'Soul-Guide Lantern': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'graveyardCard' }], {
        kind: 'exileGraveyardCard',
        what: target,
      }),
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'exileGraveyard', who: 'eachOpponent' }],
      },
      {
        kind: 'activated',
        cost: { mana: parseManaCost('{1}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [draw],
      },
    ],
  },
  'Sphinx of the Final Word': {
    abilities: [{ kind: 'static', effect: { kind: 'instantsAndSorceriesUncounterable' } }],
  },
  'Starlight Snare': {
    enchant: creature,
    abilities: [
      etb({ kind: 'tap', what: 'attached' }),
      { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, doesntUntap: true } },
    ],
  },
  'Tempest Djinn': {
    powerEquals: { count: 'landsYouControl', subtype: 'Island', basicOnly: true },
  },
  'Adamant Will': spell([creature], pump(target, 2, 2, ['indestructible'])),
  'Adventuring Gear': {
    abilities: [trigger({ on: 'landfall' }, [], pump('attached', 2, 2)), equip('{1}')],
  },
  Aetherize: spell([], { kind: 'bounce', what: { each: 'creature', filter: { attacking: true } } }),
  'Ambush Wolf': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'graveyardCard', optional: true }], {
        kind: 'exileGraveyardCard',
        what: target,
      }),
    ],
  },
  'Angel of Finality': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'player' }], { kind: 'exileGraveyard', who: target }),
    ],
  },
  'Angelic Edict': removal(
    { what: 'permanent', filter: { types: ['Creature', 'Enchantment'] } },
    'exile',
  ),
  'Basilisk Collar': equipment('{2}', ['deathtouch', 'lifelink']),
  'Battle-Rattle Shaman': {
    abilities: [
      {
        ...trigger({ on: 'beginningOfCombat', whose: 'yours' }, [creature], pump(target, 2, 0)),
        optional: true,
      },
    ],
  },
  'Blanchwood Armor': {
    enchant: creature,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: { count: 'landsYouControl', subtype: 'Forest' },
          toughness: { count: 'landsYouControl', subtype: 'Forest' },
        },
      },
    ],
  },
  'Burglar Rat': { abilities: [etb({ kind: 'discard', who: 'eachOpponent', count: 1 })] },
  'Burrog Befuddler': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'creature', controller: 'opponent' }], pump(target, -1, 0)),
    ],
  },
  Cancel: spell([{ what: 'spell' }], { kind: 'counter', what: target }),
  'Cathar Commando': {
    abilities: [
      activated('{1}', [artifactOrEnchantment], [{ kind: 'destroy', what: target }], true),
    ],
  },
  'Crackling Cyclops': {
    abilities: [trigger({ on: 'castSpell', filter: 'noncreature' }, [], pump('self', 3, 0))],
  },
  'Crypt Feaster': {
    abilities: [
      {
        ...trigger({ on: 'attacks' }, [], {
          kind: 'if',
          condition: { kind: 'graveyardCount', min: 7 },
          then: [pump('self', 2, 0)],
        }),
        condition: { kind: 'graveyardCount', min: 7 },
      },
    ],
  },
  'Day of Judgment': spell([], { kind: 'destroy', what: { each: 'creature' } }),
  'Deadly Riposte': spell(
    [{ what: 'creature', filter: { tapped: true } }],
    { kind: 'damage', to: target, amount: 3 },
    gain(2),
  ),
  Disenchant: removal(artifactOrEnchantment, 'destroy'),
  'Drogskol Reaver': { abilities: [trigger({ on: 'youGainLife' }, [], draw)] },
  'Elementalist Adept': { abilities: [prowess] },
  'Elvish Regrower': { abilities: [reclaim(['Creature', 'Artifact', 'Enchantment', 'Land'])] },
  'Erudite Wizard': {
    abilities: [trigger({ on: 'drawSecondCard' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  },
  'Clinquant Skymage': {
    abilities: [
      trigger({ on: 'drawCard', whose: 'yours' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Expedition Map': {
    abilities: [
      {
        ...activated('{2}', [], [search({ types: ['Land'] })], true),
        cost: { mana: parseManaCost('{2}'), tapSelf: true, sacrificeSelf: true },
      },
    ],
  },
  'Felidar Cub': {
    abilities: [
      activated(
        '{0}',
        [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        [{ kind: 'destroy', what: target }],
        true,
      ),
    ],
  },
  'Fierce Empath': {
    abilities: [{ ...etb(search({ types: ['Creature'], minManaValue: 6 })), optional: true }],
  },
  Fireshrieker: equipment('{2}', ['doubleStrike']),
  'Fleeting Distraction': spell([creature], pump(target, -1, 0), draw),
  'Goblin Firebomb': {
    abilities: [
      {
        ...activated('{7}', [{ what: 'permanent' }], [{ kind: 'destroy', what: target }], true),
        cost: { mana: parseManaCost('{7}'), tapSelf: true, sacrificeSelf: true },
      },
    ],
  },
  'Guarded Heir': { abilities: [etb({ kind: 'createToken', token: 'knight-3-token', count: 2 })] },
  'Herald of Faith': { abilities: [trigger({ on: 'attacks' }, [], gain(2))] },
  'Hungry Ghoul': {
    abilities: [
      {
        kind: 'activated',
        cost: {
          mana: parseManaCost('{1}'),
          sacrificeCreature: true,
          sacrificeFilter: { other: true },
        },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  'Icewind Elemental': { abilities: [etb(...loot)] },
  'Impact Tremors': {
    abilities: [
      trigger({ on: 'otherCreatureEtb', controller: 'you' }, [], {
        kind: 'damage',
        to: 'eachOpponent',
        amount: 1,
      }),
    ],
  },
  'Into the Roil': {
    ...removal(nonland, 'bounce'),
    kicker: {
      cost: parseManaCost('{1}{U}'),
      spell: { targets: [nonland], effects: [{ kind: 'bounce', what: target }, draw] },
    },
  },
  'Joust Through': spell(
    [{ what: 'creature', filter: { attackingOrBlocking: true } }],
    { kind: 'damage', to: target, amount: 3 },
    gain(1),
  ),
  'Lightshell Duo': { abilities: [prowess, etb({ kind: 'surveil', amount: 2 })] },
  'Lathliss, Dragon Queen': {
    abilities: [
      trigger(
        {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { subtype: 'Dragon', nontoken: true },
        },
        [],
        { kind: 'createToken', token: 'dragon-5-token', count: 1 },
      ),
      activated('{1}{R}', [], [pump({ ...all, filter: { subtype: 'Dragon' } }, 1, 0)]),
    ],
  },
  'Marauding Blight-Priest': {
    abilities: [
      trigger({ on: 'youGainLife' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 1 }),
    ],
  },
  'Mentor of the Meek': {
    abilities: [
      {
        ...trigger(
          { on: 'otherCreatureEtb', controller: 'you', filter: { maxPower: 2 } },
          [],
          draw,
        ),
        cost: parseManaCost('{1}'),
        optional: true,
      },
    ],
  },
  'Meteor Golem': {
    abilities: [
      trigger({ on: 'etb' }, [{ ...nonland, controller: 'opponent' }], {
        kind: 'destroy',
        what: target,
      }),
    ],
  },
  Micromancer: {
    abilities: [
      { ...etb(search({ types: ['Instant', 'Sorcery'], manaValue: 1 })), optional: true },
    ],
  },
  'Mischievous Pup': {
    abilities: [
      trigger(
        { on: 'etb' },
        [{ what: 'permanent', controller: 'you', filter: { other: true }, optional: true }],
        { kind: 'bounce', what: target },
      ),
    ],
  },
  'Mocking Sprite': {
    abilities: [{ kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } }],
  },
  'Mystic Archaeologist': {
    abilities: [activated('{3}{U}{U}', [], [{ kind: 'draw', who: 'controller', amount: 2 }])],
  },
  Negate: spell([{ what: 'spell', filter: { notTypes: ['Creature'] } }], {
    kind: 'counter',
    what: target,
  }),
  'Nullpriest of Oblivion': {
    kicker: { cost: parseManaCost('{3}{B}') },
    abilities: [
      {
        ...trigger({ on: 'etb' }, [ownGrave({ types: ['Creature'] })], {
          kind: 'returnToBattlefield',
          what: target,
        }),
        condition: { kind: 'wasKicked' },
      },
    ],
  },
  'Prideful Parent': { abilities: [etb({ kind: 'createToken', token: 'cat-token', count: 1 })] },
  'Preposterous Proportions': spell([], pump(all, 10, 10, ['vigilance'])),
  'Pulse Tracker': {
    abilities: [
      trigger({ on: 'attacks' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 1 }),
    ],
  },
  'Rapacious Dragon': {
    abilities: [etb({ kind: 'createToken', token: 'treasure-token', count: 2 })],
  },
  'Reclamation Sage': {
    abilities: [
      {
        ...trigger({ on: 'etb' }, [artifactOrEnchantment], { kind: 'destroy', what: target }),
        optional: true,
      },
    ],
  },
  Refute: spell([{ what: 'spell' }], { kind: 'counter', what: target }, ...loot),
  'Rite of the Dragoncaller': {
    abilities: [
      trigger({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'createToken',
        token: 'dragon-5-token',
        count: 1,
      }),
    ],
  },
  'Rune-Scarred Demon': {
    abilities: [etb({ kind: 'searchLibrary', filter: {}, to: 'hand', required: true })],
  },
  'Rune-Sealed Wall': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
      },
    ],
  },
  'Shipwreck Dowser': { abilities: [prowess, reclaim(['Instant', 'Sorcery'])] },
  'Skeleton Archer': {
    abilities: [
      trigger({ on: 'etb' }, [{ what: 'any' }], { kind: 'damage', to: target, amount: 1 }),
    ],
  },
  'Skyship Buccaneer': { abilities: [raidDraw] },
  Slagstorm: {
    modes: [
      {
        label: 'Deal 3 damage to each creature',
        targets: [],
        effects: [{ kind: 'damage', to: { each: 'creature' }, amount: 3 }],
      },
      {
        label: 'Deal 3 damage to each player',
        targets: [],
        effects: [{ kind: 'damage', to: 'eachPlayer', amount: 3 }],
      },
    ],
  },
  'Solemn Simulacrum': {
    abilities: [
      { ...etb(search('basicLand', 'battlefieldTapped')), optional: true },
      { ...trigger({ on: 'dies' }, [], draw), optional: true },
    ],
  },
  'Sower of Chaos': {
    abilities: [
      activated(
        '{2}{R}',
        [creature],
        [{ kind: 'pump', to: target, power: 0, toughness: 0, cantBlock: true }],
      ),
    ],
  },
  'Storm Fleet Spy': { abilities: [raidDraw] },
  'Strix Lookout': {
    abilities: [
      { ...activated('{1}{U}', [], loot), cost: { mana: parseManaCost('{1}{U}'), tapSelf: true } },
    ],
  },
  'Swiftfoot Boots': equipment('{1}', ['hexproof', 'haste']),
  "Syr Alin, the Lion's Claw": {
    abilities: [trigger({ on: 'attacks' }, [], pump({ ...all, filter: { other: true } }, 1, 1))],
  },
  'Terror of Mount Velus': { abilities: [etb(pump(all, 0, 0, ['doubleStrike']))] },
  'Think Twice': { ...spell([], draw), flashback: parseManaCost('{2}{U}') },
  'Thrashing Brontodon': {
    abilities: [
      activated('{1}', [artifactOrEnchantment], [{ kind: 'destroy', what: target }], true),
    ],
  },
  'Twinblade Blessing': aura(0, 0, ['doubleStrike']),
  Unsummon: removal(creature, 'bounce'),
  'Untamed Hunger': aura(2, 1, ['menace']),
  'Vampire Interloper': { abilities: [{ kind: 'static', effect: { kind: 'cantBlock' } }] },
  'Vampire Soulcaller': {
    abilities: [{ kind: 'static', effect: { kind: 'cantBlock' } }, reclaim(['Creature'])],
  },
  'Vampire Spawn': { abilities: [etb(...drain(2))] },
  'Vampire Neonate': {
    abilities: [
      { ...activated('{2}', [], drain(1)), cost: { mana: parseManaCost('{2}'), tapSelf: true } },
    ],
  },
  'Vile Entomber': {
    abilities: [etb({ kind: 'searchLibrary', filter: {}, to: 'graveyard', required: true })],
  },
};

export const FOUNDATIONS_BATCH_VANILLA = [
  "Bishop's Soldier",
  'Highborn Vampire',
  'Leonin Skyhunter',
  'Swiftblade Vindicator',
  'Zetalpa, Primal Dawn',
];
