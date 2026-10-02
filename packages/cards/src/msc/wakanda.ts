import type { AbilityDef, CardFilter, CostDef, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, onEnter, pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { COLORS, equip, tapFor } from './helpers.ts';

/**
 * Wakanda Forever (G/W), the Marvel Commander precon led by T'Challa, the
 * Black Panther (9c in docs/marvel-plan.md): artifacts, Equipment, Vehicles,
 * Vibranium tokens and the monarch.
 */

const self = 'self' as const;
const commander: CardFilter = { commander: true };
const youControlCommander = { kind: 'controlsCreature', filter: commander } as const;
const artifact: CardFilter = { types: ['Artifact'] };
const bigArtifact: CardFilter = { types: ['Artifact'], minManaValue: 4 };
const monarch: EffectDef = { kind: 'becomeMonarch', who: 'controller' };
const vibranium: EffectDef = {
  kind: 'createToken',
  token: 'vibranium-token',
  count: 1,
  tapped: true,
};
const counters = (to: Ref, amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const permanent = (filter: CardFilter, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  what: 'permanent',
  filter,
  ...extra,
});
const yours = { each: 'creature', controller: 'you' } as const;
const activated = (cost: CostDef, targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'activated',
  cost,
  targets,
  effects,
});
/** "{T}: Add N mana of any one color" (each mana may be a different colour here). */
const anyColorTimes = (amount: number): AbilityDef[] => COLORS.map((c) => tapFor(c, { amount }));
const crew = (n: number): AbilityDef => ({
  kind: 'activated',
  cost: { crew: n },
  targets: [],
  effects: [{ kind: 'becomeCreature', what: self }],
  label: `Crew ${n}`,
});
const enterOrAttack = (...effects: EffectDef[]): AbilityDef[] => [
  onEnter(...effects),
  when({ on: 'attacks' }, [], ...effects),
];
const attached = (power: number, toughness: number, extra: object = {}): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'attached', power, toughness, ...extra },
});

export const WAKANDA: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  "T'Challa, the Black Panther": {
    abilities: [
      ...enterOrAttack(vibranium),
      when({ on: 'castSpell', filter: 'any', spell: bigArtifact }, [], counters(self, 2)),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Birds of Paradise': { abilities: COLORS.map((c) => tapFor(c)) },
  'Queen Mother Ramonda': {
    abilities: [
      onEnter(monarch),
      {
        kind: 'static',
        effect: {
          kind: 'cantAttackYou',
          filter: { maxPower: 2 },
          condition: { kind: 'monarch', who: 'you' },
        },
      },
    ],
  },
  'Loyal Guardian': {
    abilities: [
      {
        ...when({ on: 'beginningOfCombat', whose: 'yours' }, [], counters(yours)),
        condition: youControlCommander,
      } as AbilityDef,
    ],
  },
  'Storm, Queen of Wakanda': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'creature', filter: { attacking: true, other: true } }],
        pump(t0, { powerOf: self }, 0, ['flying']),
      ),
      when({ on: 'opponentCreatureAttacks', filter: { hasKeyword: 'flying' } }, [], {
        kind: 'damage',
        amount: { powerOf: self },
        to: 'subject',
      }),
    ],
  },
  'Fleecemane Lion': {
    abilities: [
      activated({ mana: mana('{3}{G}{W}') }, [], { kind: 'monstrosity', amount: 1 }),
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'monstrous' },
          power: 0,
          toughness: 0,
          keywords: ['hexproof', 'indestructible'],
        },
      },
    ],
  },
  'Okoye, Mighty and Adored': {
    abilities: [
      onEnter(monarch),
      when({ on: 'beginningOfCombat', whose: 'yours' }, [creature], counters(t0), {
        // "Whenever that creature attacks the monarch this turn": double strike and trample from
        // the start of combat if an opponent is the monarch (a simplification).
        kind: 'if',
        condition: { kind: 'monarch', who: 'opponent' },
        then: [pump(t0, 0, 0, ['doubleStrike', 'trample'])],
      }),
    ],
  },
  'Shuri, the Black Panther': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: artifact, min: 3 },
          then: [draw(1)],
        },
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: artifact, min: 6 },
          then: [pump(yours, 2, 2)],
        },
      ),
    ],
  },
  'Dora Milaje Elite': {
    abilities: [
      {
        ...onEnter(vibranium),
        condition: { kind: 'opponentHasMore', what: 'lands' },
      } as AbilityDef,
      activated({ sacrificeSelf: true }, [], {
        kind: 'pump',
        to: { each: 'permanent', controller: 'you', filter: { supertypes: ['Legendary'] } },
        power: 0,
        toughness: 0,
        keywords: ['indestructible'],
      }),
    ],
  },
  "M'Baku, Jabari Chieftain": {
    abilities: [
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], {
          kind: 'becomeMonarch',
          who: 'eachOpponent',
        }),
        condition: { kind: 'monarch', who: 'none' },
      } as AbilityDef,
      {
        ...when({ on: 'creatureYouControlAttacks' }, [], pump('subject', 1, 1, ['trample'])),
        condition: { kind: 'monarch', who: 'opponent' },
      } as AbilityDef,
    ],
  },
  "T'Chaka, Venerable King": {
    abilities: [
      onEnter({
        kind: 'millThenTake',
        count: 3,
        filter: { types: ['Artifact', 'Land'] },
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{3}'), exileSelf: true },
        fromGraveyard: true,
        condition: youControlCommander,
        targets: [],
        effects: [monarch],
      },
    ],
  },
  'Ingenious Smith': {
    abilities: [
      onEnter({ kind: 'lookAndTake', count: 4, filter: artifact }),
      {
        ...when({ on: 'otherPermanentEtb', filter: artifact }, [], counters(self)),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Palace Jailer': {
    abilities: [
      onEnter(monarch),
      when({ on: 'etb' }, [{ what: 'creature', controller: 'opponent' }], {
        kind: 'exileUntilOpponentMonarch',
        what: t0,
      }),
    ],
  },
  'Loyal Retainers': {
    abilities: [
      {
        kind: 'activated',
        cost: { sacrificeSelf: true },
        // "Only during your turn, before attackers are declared."
        condition: { kind: 'yourStep', steps: ['upkeep', 'draw', 'main1', 'beginCombat'] },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], supertypes: ['Legendary'] },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },
  'Bast, Panther Goddess': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'not',
            condition: { kind: 'controlsCreature', filter: {}, count: 3 },
          },
          power: 0,
          toughness: 0,
          cantAttackOrBlock: true,
        },
      },
      when({ on: 'youAttack' }, [{ what: 'creature', filter: { attacking: true } }], {
        kind: 'pump',
        to: t0,
        power: { count: 'creaturesYouControl' },
        toughness: { count: 'creaturesYouControl' },
      }),
    ],
  },
  'Metalwork Colossus': {
    costReduction: {
      count: 'totalManaValue',
      filter: { types: ['Artifact'], notTypes: ['Creature'] },
    },
    abilities: [
      {
        kind: 'activated',
        cost: { sacrificeArtifacts: 2 },
        fromGraveyard: true,
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  },
  'Nakia, Wakandan Operative': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you', filter: commander }, [], monarch),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [permanent({ anyOf: [{ types: ['Creature'] }, { subtype: 'Vehicle' }] })],
        effects: [counters(t0, 2)],
      },
    ],
  },
  'Panther Robot': {
    costReduction: { count: 'permanentsYouControl', filter: artifact },
  },
  'Everett K. Ross, Hapless Attaché': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: commander,
          power: 1,
          toughness: 1,
          keywords: ['lifelink'],
        },
      },
      when({ on: 'opponentAttacks', min: 2 }, [], draw(1)),
    ],
  },
  "W'Kabi, Shield of the Nation": {
    abilities: [
      {
        ...when({ on: 'youAttack', filter: commander }, [], {
          kind: 'createToken',
          token: 'rhino-token',
          count: 1,
        }),
        condition: { kind: 'controlsPermanents', filter: bigArtifact, min: 1 },
      } as AbilityDef,
    ],
  },
  'Hatut Zeraze Strike Force': {
    abilities: [
      when({ on: 'castSelf' }, [], {
        kind: 'copySpell',
        what: 'subject',
        count: { count: 'commanderCasts' },
      }),
      when({ on: 'etb' }, [permanent({ types: ['Artifact', 'Enchantment'] }, { optional: true })], {
        kind: 'destroy',
        what: t0,
      }),
    ],
  },
  'Zuri, Warrior of Wakanda': {
    abilities: [when({ on: 'castSpell', filter: 'any', spell: bigArtifact }, [], counters(yours))],
  },
  // ------------------------------------------------------------ artifacts
  'Sword of the Animist': {
    abilities: [
      attached(1, 1),
      when({ on: 'equippedAttacks' }, [], {
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      }),
      equip('{2}'),
    ],
  },
  'Trading Post': {
    abilities: [
      activated({ mana: mana('{1}'), tapSelf: true, discard: true }, [], {
        kind: 'gainLife',
        who: 'controller',
        amount: 4,
      }),
      activated({ mana: mana('{1}'), tapSelf: true, life: 1 }, [], {
        kind: 'createToken',
        token: 'goat-token',
        count: 1,
      }),
      activated(
        { mana: mana('{1}'), tapSelf: true, sacrificeCreature: true },
        [{ what: 'graveyardCard', controller: 'you', filter: artifact }],
        { kind: 'returnToHand', what: t0 },
      ),
      activated({ mana: mana('{1}'), tapSelf: true, sacrificePermanent: artifact }, [], draw(1)),
    ],
  },
  'Whispersilk Cloak': {
    abilities: [attached(0, 0, { keywords: ['shroud'], cantBeBlocked: true }), equip('{2}')],
  },
  'Coveted Jewel': {
    abilities: [
      onEnter(draw(3)),
      ...anyColorTimes(3),
      when(
        { on: 'opponentAttackersUnblocked' },
        [],
        { kind: 'draw', who: 'eachOpponent', amount: 3 },
        { kind: 'giveControl', what: self, to: 'eachOpponent' },
      ),
    ],
  },
  "N'Yami-Class Mother Ship": {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], { kind: 'topCardLandOrHand', permanent: true }),
      crew(3),
    ],
  },
  "Mind's Eye": {
    abilities: [
      when({ on: 'drawCard', whose: 'opponents' }, [], {
        kind: 'may',
        cost: mana('{1}'),
        effects: [draw(1)],
      }),
    ],
  },
  'Gilded Lotus': { abilities: anyColorTimes(3) },
  'Panther Habit': {
    abilities: [attached(0, 0, { damageToCounters: true }), equip('{2}')],
  },
  'Kimoyo Beads': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        targets: [],
        effects: [],
        modesOnce: true,
        modes: [
          { label: 'AV Bead: draw a card', targets: [], effects: [draw(1)] },
          {
            label: 'Communication Bead: two 1/1 Soldiers',
            targets: [],
            effects: [{ kind: 'createToken', token: 'soldier-token', count: 2 }],
          },
          {
            label: 'Prime Bead: gain 3 life, then blink this',
            targets: [],
            effects: [
              { kind: 'gainLife', who: 'controller', amount: 3 },
              { kind: 'blink', what: self },
            ],
          },
        ],
      },
    ],
  },
  'Thran Dynamo': { abilities: [tapFor('C', { amount: 3 })] },
  'Heart-Shaped Herb': {
    abilities: [
      { kind: 'static', effect: { kind: 'preventDamageToYou', amount: 1 } },
      activated(
        { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        [],
        {
          // "You may sacrifice a creature. If you do, return it with three +1/+1 counters."
          kind: 'chooseYourPermanent',
          filter: { types: ['Creature'] },
          then: [{ kind: 'blink', what: 'chosen', counters: 3 }],
        },
        monarch,
      ),
    ],
  },
  'Helm of the Host': {
    abilities: [
      when({ on: 'beginningOfCombat', whose: 'yours' }, [], {
        kind: 'tokenCopy',
        of: 'attached',
        notLegendaryWithHaste: true,
      }),
      equip('{5}'),
    ],
  },
  'Conduit of Worlds': {
    abilities: [
      { kind: 'static', effect: { kind: 'playLandsFromGraveyard' } },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        // "If you haven't cast a spell this turn."
        condition: { kind: 'not', condition: { kind: 'youCastSpellThisTurn' } },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { nonland: true, notTypes: ['Instant', 'Sorcery'] },
          },
        ],
        effects: [{ kind: 'castFromGraveyardThisTurn', what: t0 }],
      },
    ],
  },
  'Vibranium Mining Mech': {
    abilities: [
      ...enterOrAttack(vibranium),
      activated({ mana: mana('{2}') }, [], pump(self, 1, 0)),
      crew(2),
    ],
  },
  'Vibranium Strike Gauntlets': {
    abilities: [
      when({ on: 'etb' }, [yourCreature], { kind: 'attach', to: t0 }),
      attached(3, 0, { keywords: ['trample'] }),
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], draw(1)),
      equip('{3}'),
    ],
  },
  'Hammer of Nazahn': {
    abilities: [
      when({ on: 'etb' }, [{ ...yourCreature, optional: true }], { kind: 'attach', to: t0 }),
      when(
        { on: 'otherPermanentEtb', filter: { subtype: 'Equipment' } },
        [{ ...yourCreature, optional: true }],
        { kind: 'attach', to: t0, what: 'subject' },
      ),
      attached(2, 0, { keywords: ['indestructible'] }),
      equip('{4}'),
    ],
  },
  'Midnight Angel Armor': {
    abilities: [
      onEnter(
        { kind: 'createToken', token: 'soldier-token', count: 1 },
        { kind: 'attach', to: 'chosen' },
      ),
      attached(3, 3, { keywords: ['flying', 'vigilance'] }),
      equip('{3}'),
    ],
  },
  "King Solomon's Frogs": {
    abilities: [
      when(
        { on: 'etb' },
        [permanent({ minManaValue: 3 }, { controller: 'opponent', optional: true })],
        { kind: 'exile', what: t0 },
        { kind: 'draw', who: { controllerOf: 0 }, amount: 1 },
      ),
      activated({ mana: mana('{3}'), tapSelf: true, exileSelf: true }, [], monarch),
    ],
  },
  "Shuri's Fabricator": {
    abilities: [
      onEnter({ ...vibranium, count: 2 } as EffectDef),
      {
        kind: 'activated',
        cost: { mana: mana('{6}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'graveyardCard', controller: 'you', filter: artifact }],
        effects: [{ kind: 'returnToBattlefield', what: t0, counter: 'finality' }],
      },
    ],
  },
  Scourglass: {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeSelf: true },
        condition: { kind: 'yourStep', steps: ['upkeep'] },
        targets: [],
        effects: [
          {
            kind: 'destroyAll',
            permanents: true,
            filter: { notTypes: ['Artifact', 'Land'] },
          },
        ],
      },
    ],
  },
  'The Spear of Bashenga': {
    abilities: [
      { ...onEnter(monarch), condition: { kind: 'monarch', who: 'none' } } as AbilityDef,
      attached(2, 2, { keywords: ['vigilance'] }),
      {
        ...when(
          { on: 'equippedAttacks' },
          [permanent({ tapped: true, nonland: true }, { controller: 'opponent' })],
          { kind: 'destroy', what: t0 },
        ),
        condition: { kind: 'monarch', who: 'opponent' },
      } as AbilityDef,
      equip('{2}'),
    ],
  },
  'Royal Talon Fighter Jet': {
    entersWithXCounters: true,
    abilities: [
      ...enterOrAttack({
        kind: 'createToken',
        token: 'soldier-token',
        count: { countersOn: self },
      }),
      crew(2),
    ],
  },
  // ------------------------------------------------------------ enchantments
  'Greater Good': {
    abilities: [
      activated(
        { sacrificeCreature: true },
        [],
        { kind: 'draw', who: 'controller', amount: { sacrificedPower: true } },
        { kind: 'discard', count: 3 },
      ),
    ],
  },
  'Divine Visitation': {
    abilities: [
      { kind: 'static', effect: { kind: 'creatureTokensBecome', token: 'angel-4-4-token' } },
    ],
  },
  // ------------------------------------------------------------ instants and sorceries
  Harmonize: { spell: { targets: [], effects: [draw(3)] } },
  'Beast Within': {
    spell: {
      targets: [permanent({})],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'createToken', token: 'beast-3-token', count: 1, forControllerOf: 0 },
      ],
    },
  },
  'Generous Gift': {
    spell: {
      targets: [permanent({})],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'createToken', token: 'elephant-token', count: 1, forControllerOf: 0 },
      ],
    },
  },
  "Nature's Lore": {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: { subtype: 'Forest' }, to: 'battlefield' }],
    },
  },
  'Vanquish the Horde': {
    costReduction: { count: 'creaturesOnBattlefield' },
    spell: { targets: [], effects: [{ kind: 'destroyAll' }] },
  },
  Dispatch: {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'tap', what: t0 },
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: artifact, min: 3 },
          then: [{ kind: 'exile', what: t0 }],
        },
      ],
    },
  },
  'Fight for the Throne': {
    spell: {
      targets: [yourCreature, { what: 'creature', controller: 'opponent' }],
      effects: [
        counters(t0),
        { kind: 'fight', a: t0, b: t1 },
        {
          kind: 'whenDiesThisTurn',
          what: t1,
          effects: [{ kind: 'if', condition: youControlCommander, then: [monarch] }],
        },
      ],
    },
  },
  'Overwhelming Stampede': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'pump',
          to: yours,
          power: { count: 'greatestPowerYouControl' },
          toughness: { count: 'greatestPowerYouControl' },
          keywords: ['trample'],
        },
      ],
    },
  },
  'Martial Coup': {
    spell: {
      targets: [],
      effects: [
        // "If X is 5 or more, destroy all other creatures": before the Soldiers arrive.
        {
          kind: 'if',
          condition: { kind: 'amountAtLeast', amount: { x: true }, min: 5 },
          then: [{ kind: 'destroyAll' }],
        },
        { kind: 'createToken', token: 'soldier-token', count: { x: true } },
      ],
    },
  },
  'Wakanda Forever!': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'revealPutAndTake',
          count: 6,
          filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] },
          counter: 'indestructible',
        },
      ],
    },
  },
  'Ancestral Communion': {
    spell: {
      targets: [
        {
          what: 'graveyardCard',
          controller: 'you',
          filter: { types: ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'] },
        },
      ],
      effects: [{ kind: 'returnToHand', what: t0 }],
    },
    abilities: [
      {
        ...when({ on: 'castSelf' }, [], { kind: 'copySpell', what: 'subject', retarget: true }),
        condition: youControlCommander,
      } as AbilityDef,
    ],
  },
  // ------------------------------------------------------------ lands
  'The Great Mound': {
    abilities: [
      tapFor('C'),
      activated({ mana: mana('{3}'), tapSelf: true }, [], vibranium),
      activated({ mana: mana('{6}'), tapSelf: true }, [], draw(1)),
    ],
  },
  'Throne of the High City': {
    abilities: [
      tapFor('C'),
      activated({ mana: mana('{4}'), tapSelf: true, sacrificeSelf: true }, [], monarch),
    ],
  },
};
