import type { AbilityDef, CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, draw, drain, gain, mana, t0, when, yourCreature } from '../blb/helpers.ts';
import { tapFor, unlessTwoOrFewerLands, unlessYouControlType } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b, pair): the white-black (Killian) and green-blue (Zimone) cards of the
 * Brawl decks. Printed characteristics come from Scryfall; only rules text lives here. One-offs
 * are `custom` handlers in packages/engine/src/brawl-15b-pair-effects.ts.
 *
 * Already implemented elsewhere: Fracture (stx), Pterafractyl (sos), Hinterland Harbor (msc/staples.ts).
 */

const FRACTAL = 'stx-fractal-token';
const SPIRIT_FLYING = 'spirit-flying-token';
export const SERVO = 'soc-15b-pair-servo';
export const ANGEL_WARRIOR = 'soc-15b-pair-angel-warrior';
export const CONTRACT = 'soc-15b-pair-contract';

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const createToken = (token: string, count = 1): EffectDef => ({
  kind: 'createToken',
  token,
  count,
});

/** The 1/1 colourless Servo artifact creature, the 4/4 white Angel Warrior and the white Contract Aura. */
export const BRAWL_15B_PAIR_TOKENS: CardDefinition[] = [
  {
    id: SERVO,
    name: 'Servo',
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: ['Artifact', 'Creature'],
    supertypes: [],
    subtypes: ['Servo'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
  {
    id: ANGEL_WARRIOR,
    name: 'Angel Warrior',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Angel', 'Warrior'],
    power: 4,
    toughness: 4,
    keywords: ['flying', 'vigilance'],
    abilities: [],
    isToken: true,
  },
  {
    id: CONTRACT,
    name: 'Contract',
    manaCost: { generic: 0, colored: {} },
    colors: ['W'],
    types: ['Enchantment'],
    supertypes: [],
    subtypes: ['Aura'],
    keywords: [],
    enchant: { what: 'creature' },
    abilities: [
      // "Whenever enchanted creature attacks, it gets +2/+0 ... if it's attacking one of your opponents. Otherwise, its controller loses 2 life."
      when({ on: 'equippedAttacks' }, [], custom('contractAttack')),
    ],
    isToken: true,
  },
];

// ---------------------------------------------------------------- shared shapes

/** "{T}: Add {W} or {B}." */
const wb = [tapFor('W'), tapFor('B')];
const gu = [tapFor('G'), tapFor('U')];

/** Shock land: "As this enters, you may pay 2 life. If you don't, it enters tapped." */
const shockTrigger: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects: [{ kind: 'chooseCustom', handler: 'shockLand' }],
};
/** "When this land enters, surveil 1." */
const surveil1: AbilityDef = when({ on: 'etb' }, [], { kind: 'surveil', amount: 1 });

/** Painlands and Talismans: "{T}: Add {C}" and one coloured mana per tap that deals 1 damage to you. */
const painPair = (a: 'W' | 'G', b: 'B' | 'U'): AbilityDef[] => [
  tapFor('C'),
  tapFor(a, { pain: true }),
  tapFor(b, { pain: true }),
];

/** "{1}, {T}: Add {A}{B}." */
const signet = (a: 'W' | 'G', b: 'B' | 'U', label: string): Behavior => ({
  abilities: [
    {
      kind: 'activated',
      cost: { mana: mana('{1}'), tapSelf: true },
      targets: [],
      effects: [{ kind: 'addMana', mana: [[a], [b]] }],
      label,
    },
  ],
});

/** "Enchant creature. Enchanted creature gets +N/+N and has flying and lifelink." */
const lifelinkAura = (n: number): Behavior => ({
  enchant: { what: 'creature' },
  abilities: [
    {
      kind: 'static',
      effect: { kind: 'attached', power: n, toughness: n, keywords: ['flying', 'lifelink'] },
    },
  ],
});

const anyCreatureOrEnchantmentCard: TargetSpec = {
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature', 'Enchantment'] },
};

/** The number of Auras you control. */
const aurasYouControl = { count: 'permanentsYouControl', filter: { subtype: 'Aura' } } as const;

export const BRAWL_15B_PAIR: Record<string, Behavior> = {
  // ------------------------------------------------------------ white-black creatures
  'Killian, Decisive Mentor': {
    abilities: [
      when(
        { on: 'otherPermanentEtb', filter: { types: ['Enchantment'] } },
        [{ what: 'creature', optional: true }],
        { kind: 'tap', what: t0 },
        { kind: 'mustAttack', what: t0 },
      ),
      // "Whenever one or more creatures that are enchanted by an Aura you control attack": once per combat.
      when({ on: 'youAttack', filter: { enchantedByYourAura: true } }, [], draw(1)),
    ],
  },
  'Eriette of the Charmed Apple': {
    abilities: [
      // In a two-player game a creature that can't attack you or your planeswalkers can't attack at all.
      {
        kind: 'static',
        effect: { kind: 'cantAttackYou', filter: { enchantedByYourAura: true } },
      },
      atYourEndStep(
        undefined,
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: aurasYouControl },
        gain(aurasYouControl),
      ),
    ],
  },
  'Neva, Stalked by Nightmares': {
    abilities: [
      when({ on: 'etb' }, [anyCreatureOrEnchantmentCard], { kind: 'returnToHand', what: t0 }),
      when(
        { on: 'permanentYouControlDies', filter: { types: ['Enchantment'] } },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'scry', amount: 1 },
      ),
    ],
  },
  'Scriv, the Obligator': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'creature', controller: 'opponent' }], custom('scrivContract')),
      when(
        { on: 'attacks' },
        [{ what: 'creature', controller: 'opponent' }],
        custom('scrivContract'),
      ),
    ],
  },
  'Cruel Celebrant': {
    abilities: [
      when(
        { on: 'permanentYouControlDies', filter: { types: ['Creature', 'Planeswalker'] } },
        [],
        ...drain(1),
      ),
    ],
  },
  'Elas il-Kor, Sadistic Pilgrim': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you' }, [], gain(1)),
      when({ on: 'otherCreatureDies', controller: 'you' }, [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: 1,
      }),
    ],
  },
  // ------------------------------------------------------------ white-black spells and permanents
  'Gift of Orzhova': lifelinkAura(1),
  'Glasswing Grace': { ...lifelinkAura(2), back: 'age-graced-chapel' },
  Damn: {
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'destroy', what: t0 }] },
    // Overload {2}{W}{W}: an alternative cost.
    kicker: {
      cost: mana('{2}{W}{W}'),
      as: 'overload',
      replacesCost: true,
      altLabel: 'overload',
      spell: {
        targets: [],
        effects: [{ kind: 'destroy', what: { each: 'creature' } }],
      },
    },
  },
  'Lingering Souls': {
    spell: { targets: [], effects: [createToken(SPIRIT_FLYING, 2)] },
    flashback: mana('{1}{B}'),
  },
  'Rite of Oblivion': {
    sacrificeCreatureToCast: true,
    sacrificeToCastNonland: true,
    spell: {
      targets: [{ what: 'permanent', filter: { nonland: true } }],
      effects: [{ kind: 'exile', what: t0 }],
    },
    flashback: mana('{2}{W}{B}'),
  },
  'Hidden Stockpile': {
    abilities: [
      atYourEndStep({ kind: 'revolt' }, [], createToken(SERVO)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeCreature: true },
        targets: [],
        effects: [{ kind: 'scry', amount: 1 }],
        label: '{1}, Sacrifice a creature: scry 1',
      },
    ],
  },
  // ------------------------------------------------------------ white-black mana
  'Orzhov Signet': signet('W', 'B', '{1}, {T}: Add {W}{B}'),
  'Talisman of Hierarchy': { abilities: painPair('W', 'B') },
  'Caves of Koilos': { abilities: painPair('W', 'B') },
  'Bleachbone Verge': {
    abilities: [
      tapFor('B'),
      tapFor('W', {
        condition: {
          kind: 'controlsPermanents',
          filter: { types: ['Land'], subtypes: ['Plains', 'Swamp'] },
          min: 1,
        },
      }),
    ],
  },
  'Godless Shrine': { entersTapped: true, abilities: [...wb, shockTrigger] },
  'Isolated Chapel': { entersTappedIf: unlessYouControlType('W', 'B'), abilities: wb },
  'Shadowy Backstreet': { entersTapped: true, abilities: [...wb, surveil1] },
  'Sunlit Marsh': { entersTapped: true, abilities: wb },
  'Great Hall of Starnheim': {
    entersTapped: true,
    abilities: [
      tapFor('B'),
      {
        kind: 'activated',
        cost: {
          mana: mana('{W}{W}{B}'),
          tapSelf: true,
          sacrificeSelf: true,
          sacrificeCreature: true,
        },
        sorcerySpeed: true,
        targets: [],
        effects: [createToken(ANGEL_WARRIOR)],
        label: '{W}{W}{B}, {T}, Sacrifice this land and a creature: create a 4/4 Angel Warrior',
      },
    ],
  },
  // ------------------------------------------------------------ green-blue creatures
  'Zimone, Infinite Analyst': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { hasX: true },
          amount: { countersOn: 'self' },
          firstXOnly: true,
        },
      },
      when({ on: 'castSpell', filter: 'firstXSpell' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 2,
      }),
    ],
  },
  'Altered Ego': { entersAsCopy: { anyMV: true, xCounters: true } },
  'Hydroid Krasis': {
    entersWithXCounters: true,
    abilities: [when({ on: 'castSelf' }, [], custom('krasisCast'))],
  },
  'Maraleaf Pixie': { abilities: gu },
  'Primo, the Unbounded': {
    entersWithXCounters: 2,
    abilities: [
      {
        ...when(
          { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: { basePowerZero: true } },
          [],
          { kind: 'createToken', token: FRACTAL, count: 1, counters: { event: 'amount' } },
        ),
        batch: true,
      } as AbilityDef,
    ],
  },
  'Troyan, Gutsy Explorer': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['G'], ['U']], onlyFor: 'BigSpell' }],
        label: '{T}: Add {G}{U} (spells with mana value 5 or greater or with {X})',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{U}'), tapSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
        label: '{U}, {T}: draw a card, then discard a card',
      },
    ],
  },
  // ------------------------------------------------------------ green-blue spells
  'Growth Spiral': {
    spell: {
      targets: [],
      effects: [
        draw(1),
        { kind: 'putFromHandOrGraveyard', filter: { types: ['Land'] }, handOnly: true },
      ],
    },
  },
  'Planar Genesis': {
    spell: {
      targets: [],
      effects: [{ kind: 'chooseCustom', handler: 'planarGenesis' }],
    },
  },
  'Repulsive Mutation': {
    spell: {
      targets: [yourCreature, { what: 'spell', optional: true }],
      effects: [
        { kind: 'counters', to: t0, amount: { x: true } },
        {
          kind: 'counterUnlessPays',
          what: { target: 1 },
          cost: { generic: 0, colored: {} },
          genericAmount: { count: 'greatestPowerYouControl' },
        },
      ],
    },
  },
  'Ornate Imitations': {
    minX: 1,
    spell: { targets: [], effects: [custom('ornateImitations')] },
  },
  'Simic Charm': {
    modes: [
      {
        label: 'Target creature gets +3/+3 until end of turn',
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: 3, toughness: 3 }],
      },
      {
        label: 'Permanents you control gain hexproof until end of turn',
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: { each: 'permanent', controller: 'you' },
            power: 0,
            toughness: 0,
            keywords: ['hexproof'],
          },
        ],
      },
      {
        label: "Return target creature to its owner's hand",
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Make Your Own Luck': {
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'makeYourOwnLuck' }] },
  },
  'Unexpected Results': {
    spell: { targets: [], effects: [{ kind: 'chooseCustom', handler: 'unexpectedResults' }] },
  },
  'Urban Evolution': {
    spell: { targets: [], effects: [draw(3), custom('extraLandDrop')] },
  },
  // ------------------------------------------------------------ green-blue mana
  'Simic Signet': signet('G', 'U', '{1}, {T}: Add {G}{U}'),
  'Talisman of Curiosity': { abilities: painPair('G', 'U') },
  'Yavimaya Coast': { abilities: painPair('G', 'U') },
  'Botanical Sanctum': { entersTappedIf: unlessTwoOrFewerLands, abilities: gu },
  'Breeding Pool': { entersTapped: true, abilities: [...gu, shockTrigger] },
  'Lakeside Shack': {
    // "Enters tapped unless a player has 13 or less life."
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'anyPlayerLifeAtMost', max: 13 },
    },
    abilities: gu,
  },
};

/** The back faces: Age-Graced Chapel, the land side of Glasswing Grace. */
export const BRAWL_15B_PAIR_BACKS: Record<string, Behavior> = {
  'Age-Graced Chapel': { entersTapped: true, abilities: wb },
};
