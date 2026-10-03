import type {
  Amount,
  AbilityDef,
  CardDefinition,
  CardFilter,
  CardType,
  ConditionDef,
  EffectDef,
  TargetSpec,
  TriggerDef,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { crew } from '../msh/helpers.ts';
import {
  chapter,
  draw,
  equip,
  equipped,
  hero,
  jobSelect,
  mana,
  mayRummage,
  onEnter,
  returnTransformed,
  t0,
  t1,
  tapFor,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) 11c, group 2: the red, green, multicoloured and land
 * rares and mythics, and the meld pair (Vanille and Fang into Ragnarok).
 * Printed characteristics come from Scryfall; only rules text lives here.
 */

const when = (trigger: TriggerDef, targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger,
  targets,
  effects,
});
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const may = (...effects: EffectDef[]): EffectDef => ({ kind: 'may', effects });
const transformSelf: EffectDef = { kind: 'transform', what: 'self' };
/** "Whenever this enters or attacks, ..." as two abilities. */
const entersOrAttacks = (...effects: EffectDef[]): AbilityDef[] => [
  onEnter(...effects),
  when({ on: 'attacks' }, [], ...effects),
];
const atYourEndStep = (
  targets: TargetSpec[],
  effects: EffectDef[],
  condition?: ConditionDef,
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfEndStep', whose: 'yours' },
  targets,
  effects,
  ...(condition ? { condition } : {}),
});
const atYourCombat = (
  targets: TargetSpec[],
  effects: EffectDef[],
  condition?: ConditionDef,
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfCombat', whose: 'yours' },
  targets,
  effects,
  ...(condition ? { condition } : {}),
});
const stat = (effect: Extract<AbilityDef, { kind: 'static' }>['effect']): AbilityDef => ({
  kind: 'static',
  effect,
});

const towns = {
  count: 'permanentsYouControl',
  filter: { types: ['Land'], subtype: 'Town' },
} satisfies Amount;
const PERMANENT_TYPES: CardType[] = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
const permanentCard: CardFilter = { types: PERMANENT_TYPES };
const legendary: CardFilter = { supertypes: ['Legendary'] };
const treasures = (count: number): EffectDef => ({
  kind: 'createToken',
  token: 'treasure-token',
  count,
  tapped: true,
});
/** "Whenever a creature you control attacks alone, it gains double strike until end of turn." */
const attacksAloneDoubleStrike = when({ on: 'creatureYouControlAttacks', alone: true }, [], {
  kind: 'pump',
  to: 'subject',
  power: 0,
  toughness: 0,
  keywords: ['doubleStrike'],
});
/** "The first legendary creature spell you cast each turn costs {2} less to cast." */
const legendDiscount = stat({
  kind: 'spellsCostLessIf',
  filter: { types: ['Creature'], ...legendary },
  amount: 2,
  condition: { kind: 'noneCastThisTurn', filter: { types: ['Creature'], ...legendary } },
});
/** "Add {W}{W}, {U}{U}, ..." */
const addMana = (...colors: ('W' | 'U' | 'B' | 'R' | 'G')[]): EffectDef => ({
  kind: 'addMana',
  mana: colors.map((c) => [c]),
});

export const RARES_2: Record<string, Behavior> = {
  // Red
  'Seifer Almasy': {
    abilities: [
      attacksAloneDoubleStrike,
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer' },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Instant', 'Sorcery'], maxManaValue: 3 },
            optional: true,
          },
        ],
        effects: [{ kind: 'castFree', what: t0, exileAfter: true }],
      },
    ],
  },
  'Zell Dincht': {
    abilities: [
      stat({ kind: 'extraLandDrop' }),
      stat({ kind: 'boost', power: { count: 'landsYouControl' }, toughness: 0 }),
      atYourEndStep(
        [],
        [
          {
            kind: 'chooseYourPermanent',
            filter: { types: ['Land'] },
            then: [{ kind: 'returnToHand', what: 'chosen' }],
          },
        ],
      ),
    ],
  },
  'Gilgamesh, Master-at-Arms': { abilities: entersOrAttacks(custom('gilgameshEquipment')) },
  'Raubahn, Bull of Ala Mhigo': {
    wardCost: { mana: { generic: 0, colored: {} }, lifeEqualsPower: true },
    abilities: [
      when(
        { on: 'attacks' },
        [
          {
            what: 'permanent',
            controller: 'you',
            filter: { subtype: 'Equipment' },
            optional: true,
          },
          { what: 'creature', filter: { attacking: true } },
        ],
        { kind: 'attach', what: t0, to: t1 },
      ),
    ],
  },
  'Nibelheim Aflame': (() => {
    const blast: EffectDef = {
      kind: 'damage',
      amount: { powerOf: t0 },
      to: { each: 'creature' },
      from: t0,
      exceptFrom: true,
    };
    const targets: TargetSpec[] = [{ what: 'creature', controller: 'you' }];
    return {
      spell: { targets, effects: [blast] },
      flashback: mana('{5}{R}{R}'),
      flashbackSpell: { targets, effects: [blast, { kind: 'discardHand' }, draw(4)] },
    };
  })(),
  "Clive, Ifrit's Dominant": {
    abilities: [
      onEnter(
        may(
          { kind: 'discardHand' },
          { kind: 'draw', who: 'controller', amount: { count: 'devotion', color: 'R' } },
        ),
      ),
      returnTransformed('{4}{R}{R}', true),
    ],
  },
  'Vaan, Street Thief': {
    abilities: [
      when(
        {
          on: 'creaturesYouControlDealCombatDamageToPlayer',
          filter: { subtypes: ['Scout', 'Pirate', 'Rogue'] },
        },
        [],
        custom('vaanExile'),
      ),
      when({ on: 'castSpell', filter: 'any', notOwned: true }, [], {
        kind: 'counters',
        to: {
          each: 'creature',
          controller: 'you',
          filter: { subtypes: ['Scout', 'Pirate', 'Rogue'] },
        },
        amount: 1,
      }),
    ],
  },
  'The Fire Crystal': {
    abilities: [
      stat({ kind: 'spellsCostLess', filter: { colors: ['R'] }, amount: 1 }),
      stat({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        power: 0,
        toughness: 0,
        keywords: ['haste'],
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{R}{R}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'tokenCopy', of: t0, sacrificeAt: 'nextEndStep' }],
      },
    ],
  },
  'Triple Triad': {
    abilities: [when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('tripleTriad'))],
  },
  'Firion, Wild Rose Warrior': {
    abilities: [
      stat({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { equipped: true },
        power: 0,
        toughness: 0,
        keywords: ['haste'],
      }),
      when({ on: 'otherPermanentEtb', filter: { subtype: 'Equipment', nontoken: true } }, [], {
        kind: 'tokenCopy',
        of: 'subject',
        equipDiscount: 2,
        sacrificeAt: 'nextUpkeep',
      }),
    ],
  },
  'Summon: Brynhildr': {
    saga: 3,
    abilities: [
      chapter([1], [], custom('brynhildrExile')),
      chapter([2, 3], [], custom('brynhildrReplay'), {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: when(
          { on: 'castSpell', filter: 'creature' },
          [],
          custom('hasteOnEntryForSubject'),
        ),
      }),
    ],
  },
  'Summon: G.F. Cerberus': {
    saga: 3,
    abilities: [
      chapter([1], [], { kind: 'surveil', amount: 1 }),
      chapter([2], [], {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
          kind: 'copySpell',
          what: 'subject',
        }),
      }),
      chapter([3], [], {
        kind: 'emblem',
        until: 'nextSpellThisTurn',
        ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
          kind: 'copySpell',
          what: 'subject',
          count: 2,
        }),
      }),
    ],
  },

  // Green
  'A Realm Reborn': {
    abilities: [
      stat({
        kind: 'grantMana',
        filter: {},
        produces: ['W', 'U', 'B', 'R', 'G'],
        otherPermanents: true,
      }),
    ],
  },
  'Traveling Chocobo': {
    abilities: [
      stat({ kind: 'playFromTop', filter: { anyOf: [{ types: ['Land'] }, { subtype: 'Bird' }] } }),
      stat({
        kind: 'etbTriggersTwice',
        filter: { anyOf: [{ types: ['Land'] }, { subtype: 'Bird' }] },
      }),
    ],
  },
  'Tifa Lockhart': {
    abilities: [
      when({ on: 'landfall' }, [], {
        kind: 'pump',
        to: 'self',
        power: { powerOf: 'self' },
        toughness: 0,
      }),
    ],
  },
  'Bartz and Boko': {
    costReduction: { count: 'creaturesYouControl', subtype: 'Bird' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [custom('birdsDamageTarget')],
      },
    ],
  },
  'Ancient Adamantoise': {
    abilities: [
      stat({ kind: 'damageStays' }),
      stat({ kind: 'absorbDamage' }),
      when({ on: 'dies' }, [], custom('exileSourceFromGraveyard'), treasures(10)),
    ],
  },
  'The Earth Crystal': {
    abilities: [
      stat({ kind: 'spellsCostLess', filter: { colors: ['G'] }, amount: 1 }),
      stat({ kind: 'doubleCounters', plusOneOnCreatures: true }),
      {
        kind: 'activated',
        cost: { mana: mana('{4}{G}{G}'), tapSelf: true },
        targets: [
          { what: 'creature', controller: 'you' },
          { what: 'creature', controller: 'you', optional: true },
        ],
        effects: [
          // Two on the first target, or one on each of two.
          {
            kind: 'counters',
            to: t0,
            amount: { if: { kind: 'targetMatches', target: 1, filter: {} }, then: 1, else: 2 },
          },
          { kind: 'counters', to: t1, amount: 1 },
        ],
      },
    ],
  },
  "Summoner's Grimoire": {
    abilities: [
      jobSelect,
      equipped(0, 0, 'Shaman'),
      when({ on: 'equippedAttacks' }, [], {
        kind: 'putFromHandOrGraveyard',
        filter: { types: ['Creature'] },
        handOnly: true,
        attackingIf: { types: ['Enchantment'] },
      }),
      equip('{3}', undefined, 'Abraxas — Equip {3}'),
    ],
  },
  'Jumbo Cactuar': {
    abilities: [
      when({ on: 'attacks' }, [], { kind: 'pump', to: 'self', power: 9999, toughness: 0 }),
    ],
  },

  // Multicoloured
  'Kuja, Genome Sorcerer': {
    abilities: [
      atYourEndStep(
        [],
        [
          { kind: 'createToken', token: 'fin-wizard-token', count: 1, tapped: true },
          {
            kind: 'if',
            condition: { kind: 'controlsCreature', filter: { subtype: 'Wizard' }, count: 4 },
            then: [transformSelf],
          },
        ],
      ),
    ],
  },
  "Joshua, Phoenix's Dominant": {
    abilities: [onEnter(mayRummage, mayRummage), returnTransformed('{3}{R}{W}', true)],
  },
  'Kefka, Court Mage': {
    abilities: [
      ...entersOrAttacks(custom('kefkaDiscard')),
      {
        kind: 'activated',
        cost: { mana: mana('{8}') },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'opponentSacrifices', filter: permanentCard }, transformSelf],
      },
    ],
  },
  "Sin, Spira's Punishment": { abilities: entersOrAttacks(custom('sinExile')) },
  'Hope Estheim': { abilities: [atYourEndStep([], [custom('millByLifeGained')])] },
  'Lightning, Army of One': {
    abilities: [when({ on: 'combatDamageToPlayer' }, [], custom('stagger'))],
  },
  'Terra, Magical Adept': {
    abilities: [
      onEnter({ kind: 'millThenTake', count: 5, filter: { types: ['Enchantment'] } }),
      returnTransformed('{4}{R}{G}', true),
    ],
  },
  'Vivi Ornitier': {
    abilities: [
      {
        kind: 'activated',
        cost: {},
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'addMana', mana: [['U', 'R']], count: { powerOf: 'self' } }],
        label: 'Add X mana ({U} and/or {R})',
      },
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'damage', amount: 1, to: 'eachOpponent' },
      ),
    ],
  },
  'Tellah, Great Sage': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [],
        hero(),
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { manaValueOfSubject: true }, min: 4 },
          then: [draw(2)],
        },
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { manaValueOfSubject: true }, min: 8 },
          then: [
            { kind: 'damage', amount: { manaValueOfSubject: true }, to: 'eachOpponent' },
            { kind: 'sacrifice', what: 'self' },
          ],
        },
      ),
    ],
  },
  'Emet-Selch, Unsundered': {
    abilities: [
      ...entersOrAttacks(draw(1), { kind: 'discard', count: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        condition: { kind: 'graveyardCount', min: 14 },
        targets: [],
        effects: [may(transformSelf)],
      },
    ],
  },
  'Noctis, Prince of Lucis': {
    abilities: [stat({ kind: 'castArtifactsFromGraveyard', life: 3 })],
  },
  'Choco, Seeker of Paradise': {
    abilities: [
      when({ on: 'youAttack', filter: { subtype: 'Bird' } }, [], custom('chocoLook')),
      when({ on: 'landfall' }, [], { kind: 'pump', to: 'self', power: 1, toughness: 0 }),
    ],
  },
  'Jenova, Ancient Calamity': {
    abilities: [
      atYourCombat(
        [{ what: 'creature', filter: { other: true }, optional: true }],
        [{ kind: 'counters', to: t0, amount: { powerOf: 'self' } }, custom('becomeMutant')],
      ),
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', filter: { subtype: 'Mutant' } },
        condition: { kind: 'yourTurn' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: { powerOf: 'subject' } }],
      },
    ],
  },
  'Yuna, Hope of Spira': {
    abilities: [
      stat({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { anyOf: [{ types: ['Enchantment'] }, { sameNameAsSource: true }] },
        condition: { kind: 'yourTurn' },
        power: 0,
        toughness: 0,
        keywords: ['trample', 'lifelink', 'ward'],
      }),
      atYourEndStep(
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Enchantment'] },
            optional: true,
          },
        ],
        [{ kind: 'returnToBattlefield', what: t0, counter: 'finality' }],
      ),
    ],
  },
  'Absolute Virtue': {
    abilities: [
      stat({ kind: 'youHaveHexproof' }),
      stat({ kind: 'preventDamageToYou', amount: 999 }),
    ],
  },
  'Squall, SeeD Mercenary': {
    abilities: [
      attacksAloneDoubleStrike,
      when(
        { on: 'combatDamageToPlayer' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { ...permanentCard, maxManaValue: 3 },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
    ],
  },
  'Serah Farron': {
    abilities: [
      legendDiscount,
      atYourCombat([], [may(transformSelf)], {
        kind: 'controlsCreature',
        filter: { ...legendary, other: true },
        count: 2,
      }),
    ],
  },
  'Balthier and Fran': {
    abilities: [
      stat({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { subtype: 'Vehicle' },
        power: 1,
        toughness: 1,
        keywords: ['reach', 'vigilance'],
      }),
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlAttacks', filter: { subtype: 'Vehicle' } },
        condition: {
          kind: 'all',
          of: [{ kind: 'subjectCrewedBySource' }, { kind: 'firstCombatPhase' }],
        },
        cost: mana('{1}{R}{G}'),
        targets: [],
        effects: [{ kind: 'extraCombat' }],
      },
    ],
  },
  'The Wandering Minstrel': {
    abilities: [
      stat({ kind: 'landsEnterUntapped' }),
      atYourCombat([], [{ kind: 'createToken', token: 'fin-elemental-token', count: 1 }], {
        kind: 'amountAtLeast',
        amount: towns,
        min: 5,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{W}{U}{B}{R}{G}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { other: true } },
            power: towns,
            toughness: towns,
          },
        ],
      },
    ],
  },
  'Golbez, Crystal Collector': {
    abilities: [
      when({ on: 'otherPermanentEtb', filter: { types: ['Artifact'] } }, [], {
        kind: 'surveil',
        amount: 1,
      }),
      atYourEndStep(
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
        [custom('golbezReturn')],
        { kind: 'controlsPermanents', filter: { types: ['Artifact'] }, min: 4 },
      ),
    ],
  },

  // Lands
  'Balamb Garden, SeeD Academy': {
    entersTapped: true,
    abilities: [
      ...tapFor('G', 'U'),
      {
        kind: 'activated',
        cost: { mana: mana('{5}{G}{U}'), tapSelf: true },
        costReduction: { ...towns, other: true },
        targets: [],
        effects: [transformSelf],
        label: 'Transform',
      },
    ],
  },
  "Clive's Hideaway": {
    abilities: [
      onEnter({ kind: 'hideaway', count: 4 }),
      ...tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'controlsCreature', filter: legendary, count: 4 },
            then: [
              custom('hideawayLand'),
              { kind: 'castFree', what: 'self', from: 'exiledWithSource' },
            ],
          },
        ],
        label: 'Play the hidden card',
      },
    ],
  },
  'Starting Town': {
    entersTappedIf: { kind: 'not', condition: { kind: 'yourEarlyTurn', max: 3 } },
    abilities: [
      ...tapFor('C'),
      // "{T}, Pay 1 life": 1 damage to you as the coloured mana is spent (like a Talisman).
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        pain: true,
      })),
    ],
  },

  // Meld
  "Vanille, Cheerful l'Cie": {
    abilities: [
      onEnter({ kind: 'mill', count: 2 }, { kind: 'returnFromGraveyard', types: PERMANENT_TYPES }),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        condition: {
          kind: 'controlsCreature',
          filter: { named: 'fang-fearless-lcie' },
        },
        cost: mana('{3}{B}{G}'),
        targets: [],
        effects: [
          custom('meld', { partner: 'fang-fearless-lcie', into: 'ragnarok-divine-deliverance' }),
        ],
      },
    ],
  },
  "Fang, Fearless l'Cie": {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1), { kind: 'loseLife', who: 'controller', amount: 1 }],
      },
    ],
  },
};

/** Back faces (not cards of their own). */
export const RARES_2_BACKS: Record<string, Behavior> = {
  'Ifrit, Warden of Inferno': {
    saga: 3,
    abilities: [
      chapter([1], [{ what: 'creature', filter: { other: true }, optional: true }], {
        kind: 'fight',
        a: 'self',
        b: t0,
      }),
      chapter([2], [], addMana('R', 'R', 'R', 'R')),
      // III: three lore counters, so it's exiled and returns (front face up).
      chapter([3], [], addMana('R', 'R', 'R', 'R'), { kind: 'blink', what: 'self' }),
    ],
  },
  'Phoenix, Warden of Fire': {
    saga: 3,
    abilities: [
      chapter([1, 2], [], { kind: 'damage', amount: 2, to: 'eachOpponent' }),
      chapter([3], [], custom('phoenixReturn'), { kind: 'blink', what: 'self' }),
    ],
  },
  'Kefka, Ruler of Ruin': {
    abilities: [
      when({ on: 'opponentLosesLife', duringYourTurn: true }, [], {
        kind: 'draw',
        who: 'controller',
        amount: { event: 'amount' },
      }),
    ],
  },
  'Trance Kuja, Fate Defied': {
    abilities: [stat({ kind: 'doubleDamage', source: { subtype: 'Wizard' } })],
  },
  'Esper Terra': {
    saga: 4,
    abilities: [
      chapter(
        [1, 2, 3],
        [
          {
            what: 'permanent',
            controller: 'you',
            filter: { types: ['Enchantment'], notSupertypes: ['Legendary'] },
          },
        ],
        {
          kind: 'tokenCopy',
          of: t0,
          nonlegendary: true,
          haste: true,
          lore: 3,
          sacrificeAt: 'yourNextEndStep',
        },
      ),
      chapter([4], [], addMana('W', 'W', 'U', 'U', 'B', 'B', 'R', 'R', 'G', 'G'), {
        kind: 'blink',
        what: 'self',
      }),
    ],
  },
  'Hades, Sorcerer of Eld': {
    abilities: [
      stat({ kind: 'playFromGraveyard', condition: { kind: 'yourTurn' } }),
      stat({ kind: 'graveyardToExile' }),
    ],
  },
  'Crystallized Serah': {
    abilities: [
      legendDiscount,
      stat({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: legendary,
        power: 2,
        toughness: 2,
      }),
    ],
  },
  'Balamb Garden, Airborne': {
    abilities: [when({ on: 'attacks' }, [], draw(1)), crew(1)],
  },
  'Ragnarok, Divine Deliverance': {
    abilities: [
      when(
        { on: 'dies' },
        [
          { what: 'permanent' },
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { ...permanentCard, notSupertypes: ['Legendary'] },
          },
        ],
        { kind: 'destroy', what: t0 },
        { kind: 'returnToBattlefield', what: t1 },
      ),
    ],
  },
};

/** "Create a 2/2 Elemental creature token that's all colors" (The Wandering Minstrel). */
export const RARES_2_TOKENS: CardDefinition[] = [
  {
    id: 'fin-elemental-token',
    name: 'Elemental',
    manaCost: { generic: 0, colored: {} },
    colors: ['W', 'U', 'B', 'R', 'G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Elemental'],
    power: 2,
    toughness: 2,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
