import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  Action,
  CardDefinition,
  EffectDef,
  GameState,
  Keyword,
  ManaCost,
  ObjectId,
  PlayerId,
} from '../src/types.ts';
import { ECL } from './ecl-fixtures.ts';
import { FIXTURES } from './helpers.ts';

// ---------------------------------------------------------------------------
// Tarkir: Dragonstorm (19a): omen, flurry, renew, endure, mobilize, harmonize, behold a Dragon, three-colour mana.
// ---------------------------------------------------------------------------

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});

function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: cost(0),
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}

function creature(
  id: string,
  p: number,
  t: number,
  extra: Partial<CardDefinition> = {},
  keywords: Keyword[] = [],
): CardDefinition {
  return card({ id, types: ['Creature'], power: p, toughness: t, keywords, ...extra });
}

const land = (id: string, produces: 'W' | 'U' | 'B' | 'R' | 'G') =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });

/** The Spirit token the endure effect makes (a 0/0 definition; endure sets its size). */
const SPIRIT = card({
  id: 'tdm-spirit-token',
  name: 'Spirit',
  isToken: true,
  colors: ['W'],
  types: ['Creature'],
  subtypes: ['Spirit'],
  power: 0,
  toughness: 0,
});
const WARRIOR = card({
  id: 'tdm-warrior-token',
  name: 'Warrior',
  isToken: true,
  colors: ['R'],
  types: ['Creature'],
  subtypes: ['Warrior'],
  power: 1,
  toughness: 1,
});

/** "Whenever you cast your second spell each turn, ..." */
const flurry = (effects: EffectDef[]) => ({
  kind: 'triggered' as const,
  trigger: { on: 'castSpell' as const, filter: 'second' as const },
  targets: [],
  effects,
});

const mobilize = (n: number) => ({
  kind: 'triggered' as const,
  trigger: { on: 'attacks' as const },
  targets: [],
  effects: [
    {
      kind: 'createToken' as const,
      token: 'tdm-warrior-token',
      count: n,
      tapped: true,
      attacking: true,
      sacrificeAt: 'nextEndStep' as const,
    },
  ],
});

export const TDM: CardDefinition[] = [
  land('plains', 'W'),
  land('swamp', 'B'),
  land('island', 'U'),
  SPIRIT,
  WARRIOR,
  // ---- Omen: Riling Dawnbreaker-like. The creature is {4}{W}; the Omen (sorcery) is {1}{W}: create a 2/2 Soldier.
  creature(
    't-dawnbreaker',
    3,
    3,
    {
      colors: ['W'],
      subtypes: ['Dragon'],
      manaCost: cost(4, { W: 1 }),
      adventure: true,
      back: 't-signaling-roar',
      abilities: [],
    },
    ['flying'],
  ),
  card({
    id: 't-signaling-roar',
    name: 'Signaling Roar',
    colors: ['W'],
    types: ['Sorcery'],
    subtypes: ['Omen'],
    manaCost: cost(1, { W: 1 }),
    spell: {
      targets: [],
      effects: [{ kind: 'gainLife', who: 'controller', amount: 4 }],
    },
  }),
  // An instant Omen that counters a spell (Chilling Screech): countered/fizzled, it goes to the graveyard.
  creature(
    't-screech-dragon',
    3,
    3,
    {
      colors: ['R'],
      subtypes: ['Dragon'],
      manaCost: cost(3, { R: 1 }),
      adventure: true,
      back: 't-chilling-screech',
    },
    ['flying'],
  ),
  card({
    id: 't-chilling-screech',
    name: 'Chilling Screech',
    colors: ['U'],
    types: ['Instant'],
    subtypes: ['Omen'],
    manaCost: cost(1, { U: 1 }),
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'destroy', what: { target: 0 } }] },
  }),
  card({
    id: 't-counterspell',
    name: 'Counterspell',
    colors: ['U'],
    types: ['Instant'],
    manaCost: cost(0, { U: 2 }),
    spell: { targets: [{ what: 'spell' }], effects: [{ kind: 'counter', what: { target: 0 } }] },
  }),
  // ---- Flurry
  creature('t-duelist', 2, 1, {
    colors: ['R'],
    manaCost: cost(1, { R: 1 }),
    abilities: [flurry([{ kind: 'damage', amount: 1, to: 'eachOpponent' }])],
  }),
  // ---- Renew: Champion of Dusan-like. {1}{G}, exile this card from your graveyard: +1/+1 counter and a trample counter.
  creature('t-renewer', 2, 2, {
    colors: ['G'],
    manaCost: cost(2, { G: 1 }),
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        sorcerySpeed: true,
        cost: { mana: cost(1, { G: 1 }), exileSelf: true },
        targets: [{ what: 'creature' }],
        effects: [
          { kind: 'counters', to: { target: 0 }, amount: 1 },
          { kind: 'namedCounters', name: 'trample', amount: 1, to: { target: 0 } },
        ],
      },
    ],
  }),
  // Kishla Skimmer: "Whenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn."
  creature('t-skimmer', 1, 1, {
    colors: ['U'],
    manaCost: cost(0, { U: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'cardsLeaveYourGraveyard' },
        condition: { kind: 'yourTurn' },
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // Kheru Goldkeeper's Treasure: "Whenever one or more cards leave your graveyard during your turn, create a Treasure token."
  // ---- Endure
  creature('t-kin-guard', 1, 1, {
    colors: ['W'],
    manaCost: cost(1, { W: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'endure', amount: 2 }],
      },
    ],
  }),
  // Krumar Initiate: "{X}{B}, {T}, Pay X life: This creature endures X. Activate only as a sorcery."
  creature('t-krumar', 1, 1, {
    colors: ['B'],
    manaCost: cost(1, { B: 1 }),
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: { generic: 0, colored: { B: 1 }, x: 1 }, tapSelf: true, lifeX: true },
        targets: [],
        effects: [{ kind: 'endure', amount: { x: true } }],
      },
    ],
  }),
  // Anafenza-like: whenever another nontoken creature you control dies, it endures 2 (she may be gone herself).
  creature('t-anafenza', 3, 3, {
    colors: ['W'],
    manaCost: cost(2, { W: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [{ kind: 'endure', amount: 2 }],
      },
    ],
  }),
  // Warden of the Grove-like: another creature that enters endures X, X the counters on this creature.
  creature('t-warden', 1, 1, {
    colors: ['G'],
    manaCost: cost(2, { G: 1 }),
    entersWithCounters: 2,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you' },
        targets: [],
        effects: [{ kind: 'endure', amount: { allCountersOn: 'self' }, what: 'subject' }],
      },
    ],
  }),
  // ---- Mobilize
  creature('t-mobilizer', 3, 3, {
    colors: ['R'],
    manaCost: cost(2, { R: 1 }),
    abilities: [mobilize(2)],
  }),
  creature('t-grave-mobilizer', 2, 2, {
    colors: ['B'],
    manaCost: cost(2, { B: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'tdm-warrior-token',
            count: { count: 'cardsInGraveyard', types: ['Creature'] },
            tapped: true,
            attacking: true,
            sacrificeAt: 'nextEndStep',
          },
        ],
      },
    ],
  }),
  // Zurgo-like: during your end step, Warrior tokens you control can't be sacrificed. Mobilize 2.
  creature('t-zurgo', 3, 3, {
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    abilities: [
      mobilize(2),
      {
        kind: 'static',
        effect: {
          kind: 'cantBeSacrificed',
          filter: { token: true, subtype: 'Warrior' },
          duringYourEndStep: true,
        },
      },
    ],
  }),
  // Bone-Cairn Butcher-like: attacking tokens you control have deathtouch.
  creature('t-butcher', 3, 3, {
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    abilities: [
      mobilize(2),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { attacking: true, token: true },
          power: 0,
          toughness: 0,
          keywords: ['deathtouch'],
        },
      },
    ],
  }),
  // Dalkovan Encampment: "{2}{W}, {T}: Whenever you attack this turn, create two 1/1 red Warrior creature tokens that are tapped
  // and attacking. Sacrifice them at the beginning of the next end step."
  card({
    id: 't-encampment',
    name: 'Dalkovan Encampment',
    types: ['Land'],
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      {
        kind: 'activated',
        cost: { mana: cost(2, { W: 1 }), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'emblem',
            until: 'endOfTurn',
            ability: {
              kind: 'triggered',
              trigger: { on: 'youAttack' },
              targets: [],
              effects: [
                {
                  kind: 'createToken',
                  token: 'tdm-warrior-token',
                  count: 2,
                  tapped: true,
                  attacking: true,
                  sacrificeAt: 'nextEndStep',
                },
              ],
            },
          },
        ],
      },
    ],
  }),
  // War Effort: "Creatures you control get +1/+0. Whenever you attack, create a 1/1 red Warrior creature token that's tapped and
  // attacking. Sacrifice it at the beginning of the next end step."
  card({
    id: 't-war-effort',
    name: 'War Effort',
    colors: ['R'],
    types: ['Enchantment'],
    manaCost: cost(3, { R: 1 }),
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 1, toughness: 0 },
      },
      {
        kind: 'triggered',
        trigger: { on: 'youAttack' },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'tdm-warrior-token',
            count: 1,
            tapped: true,
            attacking: true,
            sacrificeAt: 'nextEndStep',
          },
        ],
      },
    ],
  }),
  // ---- Harmonize
  card({
    id: 't-wild-ride',
    name: 'Wild Ride',
    colors: ['R'],
    types: ['Sorcery'],
    manaCost: cost(0, { R: 1 }),
    flashback: cost(4, { R: 1 }),
    harmonize: true,
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
    },
  }),
  // Nature's Rhythm-like: {X}{G}{G}, harmonize {X}{G}{G}{G}{G}.
  card({
    id: 't-rhythm',
    name: "Nature's Rhythm",
    colors: ['G'],
    types: ['Sorcery'],
    manaCost: { generic: 0, colored: { G: 2 }, x: 1 },
    flashback: { generic: 0, colored: { G: 4 }, x: 1 },
    harmonize: true,
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: { x: true } }] },
  }),
  // Songcrafter Mage-like: flash, "target instant or sorcery card in your graveyard gains harmonize until end of turn".
  creature('t-songcrafter', 2, 2, {
    colors: ['G', 'U', 'R'],
    manaCost: cost(0, { G: 1 }),
    keywords: ['flash'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [
          { what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } },
        ],
        effects: [{ kind: 'custom', handler: 'grantHarmonize' }],
      },
    ],
  }),
  creature('t-elf-mana', 3, 1, {
    colors: ['G'],
    manaCost: cost(0, { G: 1 }),
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'G' }],
  }),
  // ---- Decayed, and Rot-Curse Rakshasa's Renew: {X}{B}{B}, a decayed counter on each of X target creatures.
  creature('t-decayed', 2, 2, { colors: ['B'], manaCost: cost(0, { B: 1 }) }, ['decayed']),
  creature('t-rakshasa', 2, 2, {
    colors: ['B'],
    manaCost: cost(1, { B: 1 }),
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        sorcerySpeed: true,
        cost: { mana: { generic: 0, colored: { B: 2 }, x: 1 }, exileSelf: true },
        targets: [{ what: 'creature', xTargets: true }],
        effects: [{ kind: 'namedCounters', name: 'decayed', amount: 1, to: { targetsFrom: 0 } }],
      },
    ],
  }),
  // ---- Behold a Dragon
  creature(
    't-dragon',
    3,
    3,
    {
      colors: ['R'],
      subtypes: ['Dragon'],
      manaCost: cost(2, { R: 1 }),
    },
    ['flying'],
  ),
  // Sarkhan-like: when this enters, you may behold a Dragon. If you do, gain 3 life.
  creature('t-sarkhan', 1, 1, {
    colors: ['R'],
    manaCost: cost(1, { R: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'chooseCustom',
            handler: 'beholdThen',
            params: {
              filter: { subtype: 'Dragon' },
              then: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
            },
          },
        ],
      },
    ],
  }),
  // Caustic Exhale: "behold a Dragon or pay {1}. Target creature gets -3/-3."
  card({
    id: 't-caustic',
    name: 'Caustic Exhale',
    colors: ['B'],
    types: ['Instant'],
    manaCost: cost(0, { B: 1 }),
    beholdOrPay: { filter: { subtype: 'Dragon' }, pay: cost(1) },
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'pump', to: { target: 0 }, power: -3, toughness: -3 }],
    },
  }),
  // Osseous Exhale: "you may behold a Dragon. 5 damage to target attacking or blocking creature. If a Dragon was beheld, gain 2 life."
  card({
    id: 't-osseous',
    name: 'Osseous Exhale',
    colors: ['W'],
    types: ['Instant'],
    manaCost: cost(1, { W: 1 }),
    kicker: { cost: cost(0), behold: { subtype: 'Dragon' } },
    spell: {
      targets: [{ what: 'creature', filter: { attackingOrBlocking: true } }],
      effects: [
        { kind: 'damage', amount: 5, to: { target: 0 } },
        {
          kind: 'if',
          condition: { kind: 'wasKicked' },
          then: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
          else: [],
        },
      ],
    },
  }),
  // Molten Exhale: a sorcery that has flash if you behold a Dragon as an additional cost.
  card({
    id: 't-molten',
    name: 'Molten Exhale',
    colors: ['R'],
    types: ['Sorcery'],
    manaCost: cost(1, { R: 1 }),
    kicker: { cost: cost(0), behold: { subtype: 'Dragon' }, flash: true },
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'damage', amount: 4, to: { target: 0 } }],
    },
  }),
  // "If you control a Dragon" (Embermouth-like): gain 2 life if you control a Dragon.
  card({
    id: 't-dragon-check',
    name: 'Dragon Check',
    colors: ['G'],
    types: ['Sorcery'],
    manaCost: cost(0, { G: 1 }),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'controlsCreature', filter: { subtype: 'Dragon' } },
          then: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
          else: [],
        },
      ],
    },
  }),
  // ---- Siege: "As this enchantment enters, choose Abzan or Mardu." (what the cards package derives from `enterChoices`)
  card({
    id: 't-siege',
    name: 'Siege',
    colors: ['W'],
    types: ['Enchantment'],
    manaCost: cost(1, { W: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'choose',
            options: [
              {
                label: 'Abzan',
                effects: [{ kind: 'custom', handler: 'becomeVariant', params: { label: 'Abzan' } }],
              },
              {
                label: 'Mardu',
                effects: [{ kind: 'custom', handler: 'becomeVariant', params: { label: 'Mardu' } }],
              },
            ],
          },
        ],
      },
    ],
  }),
  card({
    id: 't-siege--abzan',
    name: 'Siege',
    colors: ['W'],
    types: ['Enchantment'],
    manaCost: cost(1, { W: 1 }),
    variantOf: 't-siege',
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'anthem', affects: 'creaturesYouControl', power: 1, toughness: 1 },
      },
    ],
  }),
  card({
    id: 't-siege--mardu',
    name: 'Siege',
    colors: ['W'],
    types: ['Enchantment'],
    manaCost: cost(1, { W: 1 }),
    variantOf: 't-siege',
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 1,
          toughness: 0,
          keywords: ['trample', 'haste'],
        },
      },
    ],
  }),
  card({
    id: 't-smite',
    name: 'Smite',
    colors: ['W'],
    types: ['Instant'],
    manaCost: cost(0, { W: 1 }),
    spell: {
      targets: [{ what: 'permanent' }],
      effects: [{ kind: 'destroy', what: { target: 0 } }],
    },
  }),
  // ---- Mardu Devotee-like: "{1}: Add {R}, {W}, or {B}. Activate only once each turn."
  creature('t-devotee', 1, 1, {
    colors: ['W'],
    manaCost: cost(0, { W: 1 }),
    abilities: [
      {
        kind: 'activated',
        manaAbility: true,
        oncePerTurn: true,
        cost: { mana: cost(1) },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['R', 'W', 'B']] }],
      },
    ],
  }),
  // ---- Ureni-like: protection from white and from black
  creature('t-ureni', 4, 4, { colors: ['G', 'U', 'R'], manaCost: cost(0, { G: 1 }) }, [
    'flying',
    'protectionWhite',
    'protectionBlack',
  ]),
  card({
    id: 't-white-zap',
    name: 'White Zap',
    colors: ['W'],
    types: ['Instant'],
    manaCost: cost(0, { W: 1 }),
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
    },
  }),
  card({
    id: 't-black-zap',
    name: 'Black Zap',
    colors: ['B'],
    types: ['Instant'],
    manaCost: cost(0, { B: 1 }),
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
    },
  }),
  // ---- Spells cast this turn
  // Focus the Mind: "This spell costs {2} less to cast if you've cast another spell this turn."
  card({
    id: 't-focus',
    name: 'Focus the Mind',
    colors: ['U'],
    types: ['Instant'],
    manaCost: cost(4, { U: 1 }),
    costReductionIf: { condition: { kind: 'spellsCastThisTurn', min: 1 }, amount: 2 },
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 1 }] },
  }),
  // Highspire Bell-Ringer: "The second spell you cast each turn costs {1} less to cast."
  creature('t-bell-ringer', 2, 3, {
    colors: ['U'],
    manaCost: cost(0, { U: 1 }),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLessIf',
          filter: {},
          condition: { kind: 'spellsCastThisTurn', min: 1, max: 1 },
          amount: 1,
        },
      },
    ],
  }),
  card({
    id: 't-two-mana',
    name: 'Two Mana',
    colors: ['U'],
    types: ['Instant'],
    manaCost: cost(1, { U: 1 }),
    spell: { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 1 }] },
  }),
  // Effortless Master: "This creature enters with two +1/+1 counters on it if you've cast two or more spells this turn."
  creature('t-master', 2, 2, {
    colors: ['U', 'R'],
    manaCost: cost(0, { U: 1 }),
    entersWithCountersAmount: {
      if: { kind: 'spellsCastThisTurn', min: 2 },
      then: 2,
      else: 0,
    },
  }),
  // Narset's end-step draw: "draw cards equal to the number of spells you've cast this turn."
  card({
    id: 't-count-draw',
    name: 'Count Draw',
    colors: ['U'],
    types: ['Sorcery'],
    manaCost: cost(0, { U: 1 }),
    spell: {
      targets: [],
      effects: [{ kind: 'draw', who: 'controller', amount: { count: 'spellsCastThisTurn' } }],
    },
  }),
  // Eshki Dragonclaw's condition: "you've cast both a creature spell and a noncreature spell this turn" (a beginning-of-combat check).
  card({
    id: 't-both-check',
    name: 'Both Check',
    colors: ['U'],
    types: ['Sorcery'],
    manaCost: cost(0, { U: 1 }),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: {
            kind: 'all',
            of: [
              { kind: 'spellsCastThisTurn', min: 1, filter: { types: ['Creature'] } },
              { kind: 'spellsCastThisTurn', min: 2, filter: { notTypes: ['Creature'] } },
            ],
          },
          then: [{ kind: 'gainLife', who: 'controller', amount: 5 }],
          else: [],
        },
      ],
    },
  }),
  // Sage of the Skies: "When you cast this spell, if you've cast another spell this turn, copy this spell."
  creature('t-sage', 2, 2, {
    colors: ['W'],
    manaCost: cost(0, { W: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSelf' },
        condition: { kind: 'spellsCastThisTurn', min: 2 },
        targets: [],
        effects: [{ kind: 'copySpell', what: 'subject' }],
      },
    ],
  }, ['flying', 'lifelink']),
  // Taigam, Master Opportunist: Flurry — copy it, then exile the spell you cast with four time counters on it.
  creature('t-taigam', 1, 2, {
    colors: ['U'],
    manaCost: cost(0, { U: 1 }),
    abilities: [
      flurry([
        { kind: 'copySpell', what: 'subject' },
        { kind: 'suspend', what: 'subject', time: 4 },
      ]),
    ],
  }),
  // ---- The Monuments: Abzan Monument ({1}{W}{B}{G}, {T}, sacrifice: an X/X white Spirit, X the greatest toughness among your
  // creatures; sorcery speed) and Mardu Monument (three Warriors with menace and haste until end of turn).
  card({
    id: 't-abzan-monument',
    name: 'Abzan Monument',
    types: ['Artifact'],
    manaCost: cost(2),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: {
              supertypes: ['Basic'],
              anyOf: [{ subtype: 'Plains' }, { subtype: 'Swamp' }, { subtype: 'Forest' }],
            },
            to: 'hand',
            reveal: true,
          },
        ],
      },
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: cost(1, { W: 1, B: 1, G: 1 }), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'tdm-spirit-token',
            count: 1,
            pt: { count: 'greatestToughnessYouControl' },
          },
        ],
      },
    ],
  }),
  card({
    id: 't-mardu-monument',
    name: 'Mardu Monument',
    types: ['Artifact'],
    manaCost: cost(2),
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: cost(2, { R: 1, W: 1, B: 1 }), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: 'tdm-warrior-token',
            count: 3,
            keywordsThisTurn: ['menace', 'haste'],
          },
        ],
      },
    ],
  }),
  // ---- Three colours
  card({
    id: 't-nomad-outpost',
    name: 'Nomad Outpost',
    types: ['Land'],
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'B' },
    ],
  }),
  card({
    id: 't-sandsteppe-citadel',
    name: 'Sandsteppe Citadel',
    types: ['Land'],
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'B' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'G' },
    ],
  }),
  // Defibrillating Current-like: {2/R}{2/W}{2/B}.
  card({
    id: 't-current',
    name: 'Defibrillating Current',
    colors: ['R', 'W', 'B'],
    types: ['Sorcery'],
    manaCost: { generic: 0, colored: {}, twoHybrid: ['R', 'W', 'B'] },
    spell: {
      targets: [{ what: 'creature' }],
      effects: [{ kind: 'damage', amount: 4, to: { target: 0 } }],
    },
  }),
  // A Mardu three-colour creature: {R}{W}{B}
  creature('t-tricolour', 3, 3, {
    colors: ['R', 'W', 'B'],
    manaCost: cost(0, { R: 1, W: 1, B: 1 }),
  }),
];

export const DB = new Map([...FIXTURES, ...ECL, ...TDM].map((c) => [c.id, c]));
export const engine = createEngine(DB);

export class Game extends GameDriver {
  constructor(state: GameState) {
    super(engine, state);
  }
}

export const scenario = (spec: ScenarioSpec = {}) => buildScenario(DB, spec);

export const casts = (g: Game, player: PlayerId, id: ObjectId) =>
  g
    .legal(player)
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && a.card === id,
    );

export const getPower = (g: Game, id: ObjectId) => getCharacteristics(g.state, DB, id).power;
export const getToughness = (g: Game, id: ObjectId) =>
  getCharacteristics(g.state, DB, id).toughness;
