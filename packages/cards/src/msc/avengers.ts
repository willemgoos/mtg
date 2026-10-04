import type { AbilityDef, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  mana,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
  yourCreatureCard,
} from '../blb/helpers.ts';
import { COLORS, combos, cycling, equip, tapFor } from './helpers.ts';

/**
 * Avengers Assemble (W/U/R), the Marvel Commander precon led by Captain
 * America, Team Leader (9b in docs/marvel-plan.md).
 */

const hero: CardFilter = { subtype: 'Hero' };
const self = 'self' as const;
const counter = (to: Ref, amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const commander: CardFilter = { commander: true };
const artifactOrEnchantment: CardFilter = { types: ['Artifact', 'Enchantment'] };
const permanent = (filter: CardFilter, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  what: 'permanent',
  filter,
  ...extra,
});
const anyColorFor = (onlyFor: string): AbilityDef[] => COLORS.map((c) => tapFor(c, { onlyFor }));
const chooseType: AbilityDef = onEnter({ kind: 'chooseCreatureType' });
const destroyAll = (filter: CardFilter, permanents = false): EffectDef => ({
  kind: 'destroyAll',
  filter,
  ...(permanents ? { permanents: true } : {}),
});

export const AVENGERS: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Captain America, Team Leader': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: hero },
        [],
        pump('subject', 0, 0, ['vigilance', 'haste']),
        counter('subject'),
        counter(self),
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Falcon and Redwing': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'createToken', token: 'bird-token', count: { event: 'amount' } },
        counter(self),
      ),
    ],
  },
  'Hercules, Olympian Hero': {
    abilities: [
      when({ on: 'attacks' }, [], counter(self), pump(self, 0, 0, ['indestructible'])),
      {
        ...when({ on: 'dealtDamage' }, [], {
          kind: 'counters',
          to: self,
          amount: { event: 'amount' },
        }),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Winter Soldier, Reborn Avenger': {
    abilities: [
      when(
        { on: 'attacks' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 'sourcePower' },
          },
        ],
        { kind: 'returnToBattlefield', what: t0, countersIf: { filter: hero, count: 1 } },
      ),
    ],
  },
  'Iron Man, Armored Avenger': {
    abilities: [
      when({ on: 'drawCard', whose: 'yours' }, [creature], counter(t0)),
      when(
        { on: 'attacks' },
        [],
        pump(
          {
            each: 'creature',
            controller: 'you',
            filter: { attacking: true, modified: true, other: true },
          },
          0,
          0,
          ['flying'],
        ),
      ),
    ],
  },
  "Jarvis, Earth's Mightiest Butler": {
    abilities: [when({ on: 'castSpell', filter: 'any', spell: hero }, [], draw(1))],
  },
  'Professor Hulk': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'draw',
        who: 'controller',
        amount: { event: 'amount' },
      }),
    ],
  },
  'The Wasp, Winsome Avenger': {
    abilities: [
      onEnterTargeting([{ what: 'creature', filter: hero }], pump(t0, 0, 0, ['hexproof'])),
      when({ on: 'attacks' }, [{ what: 'creature', controller: 'opponent' }], {
        kind: 'tap',
        what: t0,
      }),
    ],
  },
  'Firebird, Blazing Ranger': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        pump(
          { each: 'creature', controller: 'you', filter: { attacking: true, other: true } },
          { powerOf: self },
          0,
        ),
      ),
    ],
  },
  'Photon, Mighty Marvel': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'addMana',
        // "Any one color": each mana may be a different colour here (a simplification).
        mana: [[...COLORS]],
        count: { event: 'amount' },
        untilEndOfTurn: true,
      }),
    ],
  },
  'She-Hulk, Wallbreaker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: hero,
          power: 0,
          toughness: 0,
          keywords: ['trample'],
        },
      },
      when({ on: 'creatureYouControlBecomesBlocked', filter: hero }, [], {
        kind: 'counters',
        to: 'subject',
        amount: { event: 'amount' },
      }),
    ],
  },
  'War Machine, Avenging Arsenal': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        pump(
          { each: 'creature', controller: 'you', filter: { attacking: true, modified: true } },
          0,
          0,
          ['doubleStrike'],
        ),
      ),
    ],
  },
  'Ant-Man, Elusive Avenger': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'cantBeBlockedBy', filter: { greaterPowerThanSource: true } },
      },
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: { event: 'amount' },
      }),
    ],
  },
  'Black Widow, Agile Avenger': {
    abilities: [when({ on: 'drawSecondCard', whose: 'opponents' }, [], counter(self), draw(1))],
  },
  'Captain Marvel, Apex Avenger': {
    abilities: [
      when({ on: 'youPutCounters', other: true, filter: { notSubtype: 'Kree' } }, [], {
        kind: 'may',
        effects: [{ kind: 'counters', to: self, amount: { event: 'amount' } }],
      }),
    ],
  },
  'Director Nick Fury': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: hero, amount: 1 } },
      when({ on: 'youAttack' }, [], { kind: 'lookAndTake', count: 4, filter: hero }),
    ],
  },
  'Hawkeye, Avenging Archer': {
    abilities: [
      {
        ...when({ on: 'otherCreatureDies', controller: 'opponent' }, [], draw(1)),
        condition: { kind: 'sourceDamagedSubject' },
      } as AbilityDef,
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
    ],
  },
  "Thor, Asgard's Avenger": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'damageBonus', amount: 1, toOpponents: true, otherSources: true },
      },
    ],
  },
  'Quicksilver, Speedster': {
    abilities: [
      { kind: 'static', effect: { kind: 'flashForAll', condition: { kind: 'sourceTapped' } } },
    ],
  },
  'Scarlet Witch, Chaotic Avenger': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'exileTopWithSource', count: 2 },
        {
          kind: 'castFree',
          what: self,
          from: 'exiledWithSource',
          filter: { anyOf: [hero, { notTypes: ['Creature'] }] },
        },
      ),
    ],
  },
  'Shang-Chi and the Ten Rings': {
    abilities: [
      when({ on: 'drawCard', whose: 'yours' }, [], counter(self), {
        // "When the tenth +1/+1 counter is put on Shang-Chi": checked as each one arrives.
        kind: 'if',
        condition: {
          kind: 'all',
          of: [
            { kind: 'sourceCounters', min: 10 },
            { kind: 'not', condition: { kind: 'sourceCounters', min: 11 } },
          ],
        },
        then: [draw(5), { kind: 'gainLife', who: 'controller', amount: 5 }],
      }),
    ],
  },
  'Jocasta, Automaton Avenger': {
    abilities: [
      when(
        { on: 'creatureYouControlDealsCombatDamage', toPlayer: true, filter: commander },
        [],
        counter(self),
      ),
      {
        kind: 'triggered',
        trigger: { on: 'youAttack', filter: commander },
        fromGraveyard: true,
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true, attacking: true }],
          },
        ],
      },
    ],
  },
  'Vision, Synthezoid Avenger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', anyPlayerOffTurn: true },
        targets: [],
        effects: [],
        modes: [
          { label: 'Put a +1/+1 counter on Vision', targets: [], effects: [counter(self)] },
          { label: 'Vision phases out', targets: [], effects: [{ kind: 'phaseOut', what: self }] },
        ],
      },
    ],
  },
  'Bastion Protector': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: commander,
          power: 2,
          toughness: 2,
          keywords: ['indestructible'],
        },
      },
    ],
  },
  'Metallic Mimic': {
    abilities: [
      onEnter({ kind: 'chooseCreatureType' }, { kind: 'custom', handler: 'addChosenSubtype' }),
      {
        kind: 'static',
        effect: { kind: 'othersEnterWithCounter', filter: { chosenTypeOfSource: true } },
      },
    ],
  },
  'Captain Mar-Vell, Space-Born': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'flashForAll', condition: { kind: 'opponentCastSpellThisTurn' } },
      },
    ],
  },
  'Patriot, Shield Wielder': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [pump(t0, 2, 0, ['hexproof'])],
      },
    ],
  },
  'Speed, Young Avenger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        cost: mana('{1}'),
        targets: [{ what: 'creature', filter: { hasKeyword: 'haste' } }],
        effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlockedExcept: 'haste' }],
      },
    ],
  },
  'Captain America, Living Legend': {
    abilities: [
      when({ on: 'creatureYouControlFirstTappedOnYourTurn' }, [], {
        kind: 'untap',
        what: 'subject',
      }),
    ],
  },
  'Rescue, Pepper Potts': {
    abilities: [
      onEnterTargeting(
        [
          permanent(
            { types: ['Artifact', 'Creature'], other: true },
            { controller: 'you', optional: true },
          ),
        ],
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { types: ['Artifact'] } },
          then: [counter(self)],
        },
        { kind: 'bounce', what: t0 },
      ),
    ],
  },
  // ------------------------------------------------------------ artifacts and enchantments
  'Avengers Quinjet': {
    abilities: [
      ...(['etb', 'attacks'] as const).map((on): AbilityDef => ({
        kind: 'triggered',
        trigger: { on },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Put a Hero creature card from your hand onto the battlefield',
            targets: [],
            effects: [
              {
                kind: 'putFromHandOrGraveyard',
                filter: { types: ['Creature'], subtype: 'Hero' },
                handOnly: true,
              },
            ],
          },
          {
            label: 'Return a Hero creature card from your graveyard to your hand',
            targets: [
              {
                what: 'graveyardCard',
                controller: 'you',
                filter: { types: ['Creature'], subtype: 'Hero' },
              },
            ],
            effects: [{ kind: 'returnToHand', what: t0 }],
          },
        ],
      })),
      {
        kind: 'activated',
        cost: { crew: 3 },
        targets: [],
        effects: [{ kind: 'becomeCreature', what: self }],
        label: 'Crew 3',
      },
    ],
  },
  'Hulkbuster Armor': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, keywords: ['flying'], basePT: [9, 9] },
      },
      equip('{3}', hero, 'Equip Hero {3}'),
      equip('{6}'),
    ],
  },
  "Hero's Blade": {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 2 } },
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { supertypes: ['Legendary'] } },
        [],
        {
          kind: 'may',
          effects: [{ kind: 'attach', to: 'subject' }],
        },
      ),
      equip('{4}'),
    ],
  },
  'Tome of Legends': {
    abilities: [
      onEnter({ kind: 'namedCounters', name: 'page', amount: 1 }),
      when({ on: 'otherCreatureEtb', controller: 'you', filter: commander }, [], {
        kind: 'namedCounters',
        name: 'page',
        amount: 1,
      }),
      when({ on: 'creatureYouControlAttacks', filter: commander }, [], {
        kind: 'namedCounters',
        name: 'page',
        amount: 1,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true, removeCounters: { name: 'page', count: 1 } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  "Herald's Horn": {
    abilities: [
      chooseType,
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { types: ['Creature'], chosenTypeOfSource: true },
          amount: 1,
        },
      },
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
        kind: 'lookAndTake',
        count: 1,
        filter: { types: ['Creature'], chosenTypeOfSource: true },
        restOnTop: true,
      }),
    ],
  },
  'Door of Destinies': {
    abilities: [
      chooseType,
      when({ on: 'castSpell', filter: 'any', spell: { chosenTypeOfSource: true } }, [], {
        kind: 'namedCounters',
        name: 'charge',
        amount: 1,
      }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { chosenTypeOfSource: true },
          power: { namedCountersOnSource: 'charge' },
          toughness: { namedCountersOnSource: 'charge' },
        },
      },
    ],
  },
  'Kindred Discovery': {
    abilities: [
      chooseType,
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { chosenTypeOfSource: true } },
        [],
        draw(1),
      ),
      when({ on: 'creatureYouControlAttacks', filter: { chosenTypeOfSource: true } }, [], draw(1)),
    ],
  },
  'Relic of Legends': {
    abilities: [
      ...COLORS.map((c) => tapFor(c)),
      {
        kind: 'static',
        effect: {
          kind: 'grantMana',
          filter: { types: ['Creature'], supertypes: ['Legendary'] },
          produces: [...COLORS],
          sourcesAbility: true,
        },
      },
    ],
  },
  'Reconnaissance Mission': {
    abilities: [
      when({ on: 'creatureYouControlDealsCombatDamage', toPlayer: true }, [], {
        kind: 'may',
        effects: [draw(1)],
      }),
      cycling('{2}'),
    ],
  },
  'Love on the Battlefield': {
    abilities: [
      {
        ...when(
          { on: 'youAttack' },
          [],
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you', filter: { attacking: true } },
            power: 0,
            toughness: 0,
            keywords: ['firstStrike'],
            counterOnCombatDamage: true,
          },
          draw(1),
        ),
        // "Exactly two creatures".
        condition: {
          kind: 'all',
          of: [
            {
              kind: 'amountAtLeast',
              amount: { count: 'creaturesYouControl', attacking: true },
              min: 2,
            },
            {
              kind: 'not',
              condition: {
                kind: 'amountAtLeast',
                amount: { count: 'creaturesYouControl', attacking: true },
                min: 3,
              },
            },
          ],
        },
      } as AbilityDef,
    ],
  },
  'Gift of Immortality': {
    enchant: creature,
    abilities: [when({ on: 'attachedDies' }, [], { kind: 'returnEnchantedThenAura' })],
  },
  'Folk Hero': {
    abilities: [
      {
        ...when(
          { on: 'castSpell', filter: 'any', spell: { sharesTypeWithCommander: true } },
          [],
          draw(1),
        ),
        // The ability is the commander's: it works while it's on the battlefield.
        condition: { kind: 'controlsCreature', filter: commander },
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  // ------------------------------------------------------------ instants and sorceries
  Avenge: {
    costReductionIf: { condition: { kind: 'opponentAttackedLastTurn' }, amount: 2 },
    spell: { targets: [], effects: [{ kind: 'destroyAll', gainPerDestroyed: 1 }] },
  },
  'Heroic Return': {
    costReductionIf: { condition: { kind: 'beingAttacked' }, amount: 2 },
    spell: {
      targets: [yourCreatureCard()],
      effects: [{ kind: 'returnToBattlefield', what: t0, countersIf: { filter: hero, count: 2 } }],
    },
  },
  'Heroic Sacrifice': {
    spell: {
      targets: [yourCreature],
      effects: [
        {
          kind: 'redirectDamage',
          to: t0,
          // "Put its counters on up to one target creature you control and draw a card."
          onDies: [
            {
              kind: 'chooseYourPermanent',
              filter: { types: ['Creature'] },
              then: [{ kind: 'counters', to: 'chosen', amount: { countersOn: self } }],
            },
            draw(1),
          ],
        },
      ],
    },
  },
  'Methods of the Mighty': {
    modes: combos(
      [
        {
          label: 'Destroy target artifact',
          targets: [permanent({ types: ['Artifact'] })],
          effects: [{ kind: 'destroy', what: t0 }],
        },
        {
          label: 'Destroy target tapped creature',
          targets: [{ what: 'creature', filter: { tapped: true } }],
          effects: [{ kind: 'destroy', what: t0 }],
        },
        {
          label: 'A +1/+1 counter on each creature you control',
          targets: [],
          effects: [{ kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 }],
        },
      ],
      [1, 2, 3],
    ),
  },
  'West Coast Expansion': {
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: { x: true } },
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { x: true }, min: 5 },
          then: [{ kind: 'castFree', what: self, from: 'hand', filter: hero }],
        },
      ],
    },
  },
  'Austere Command': {
    modes: combos(
      [
        {
          label: 'Destroy all artifacts',
          targets: [],
          effects: [destroyAll({ types: ['Artifact'] }, true)],
        },
        {
          label: 'Destroy all enchantments',
          targets: [],
          effects: [destroyAll({ types: ['Enchantment'] }, true)],
        },
        {
          label: 'Destroy all creatures with mana value 3 or less',
          targets: [],
          effects: [destroyAll({ maxManaValue: 3 })],
        },
        {
          label: 'Destroy all creatures with mana value 4 or greater',
          targets: [],
          effects: [destroyAll({ minManaValue: 4 })],
        },
      ],
      [2],
    ),
  },
  'Dismantling Wave': {
    spell: {
      targets: [permanent(artifactOrEnchantment, { controller: 'opponent', optional: true })],
      effects: [{ kind: 'destroy', what: t0 }],
    },
    abilities: [
      {
        ...cycling('{6}{W}{W}'),
        // "When you cycle this card, destroy all artifacts and enchantments."
        effects: [draw(1), destroyAll(artifactOrEnchantment, true)],
      } as AbilityDef,
    ],
  },
  'Raise the Palisade': {
    spell: {
      targets: [],
      effects: [
        { kind: 'chooseCreatureType' },
        { kind: 'bounce', what: { each: 'creature', filter: { notChosenTypeOfSource: true } } },
      ],
    },
  },
  'Swords to Plowshares': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'gainLife', who: { controllerOf: 0 }, amount: { powerOf: t0 } },
        { kind: 'exile', what: t0 },
      ],
    },
  },
  'Rip Apart': {
    modes: [
      {
        label: '3 damage to target creature or planeswalker',
        targets: [permanent({ types: ['Creature', 'Planeswalker'] })],
        effects: [{ kind: 'damage', amount: 3, to: t0 }],
      },
      {
        label: 'Destroy target artifact or enchantment',
        targets: [permanent(artifactOrEnchantment)],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Destroy Evil': {
    modes: [
      {
        label: 'Destroy target creature with toughness 4 or greater',
        targets: [{ what: 'creature', filter: { minToughness: 4 } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        label: 'Destroy target enchantment',
        targets: [permanent({ types: ['Enchantment'] })],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  'Arcane Denial': {
    spell: {
      targets: [{ what: 'spell' }],
      effects: [
        { kind: 'counter', what: t0 },
        {
          // Its controller draws two ("up to two": always two, a simplification); you draw one.
          kind: 'atNextUpkeep',
          effects: [
            { kind: 'draw', who: 'eachOpponent', amount: 2 },
            { kind: 'draw', who: 'controller', amount: 1 },
          ],
        },
      ],
    },
  },
  // ------------------------------------------------------------ lands
  'Avengers Tower': {
    abilities: [
      tapFor('C'),
      ...anyColorFor('Hero'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'lookAndTake', count: 3, filter: hero }],
      },
    ],
  },
  'Plaza of Heroes': {
    abilities: [
      tapFor('C'),
      ...anyColorFor('Legendary'),
      ...COLORS.map((c) => tapFor(c, { colorFrom: 'legendaries' })),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), tapSelf: true, exileSelf: true },
        targets: [{ what: 'creature', filter: { supertypes: ['Legendary'] } }],
        effects: [pump(t0, 0, 0, ['hexproof', 'indestructible'])],
      },
    ],
  },
};

/** "When this enters, ..." with targets. */
function onEnterTargeting(targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef {
  return { kind: 'triggered', trigger: { on: 'etb' }, targets, effects };
}
