import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { combineSpells } from '../src/spells.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  Action,
  CardDefinition,
  GameState,
  Keyword,
  ManaCost,
  ObjectId,
  PlayerId,
} from '../src/types.ts';
import { FIXTURES } from './helpers.ts';

// ---------------------------------------------------------------------------
// Lorwyn Eclipsed (18a): blight, vivid, evoke, persist, wither, conspire, first-main-phase transform,
// behold-and-exile, all creature types.
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

export const ECL: CardDefinition[] = [
  card({
    id: 'plains',
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'W' }],
  }),
  card({
    id: 'swamp',
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'B' }],
  }),
  card({
    id: 'island',
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'U' }],
  }),
  // Coloured bodies for vivid and conspire.
  creature('red-guy', 2, 2, { colors: ['R'], manaCost: cost(1, { R: 1 }) }),
  creature('green-guy', 2, 2, { colors: ['G'], manaCost: cost(1, { G: 1 }) }),
  creature('white-guy', 2, 2, { colors: ['W'], manaCost: cost(1, { W: 1 }) }),
  creature('big-red', 4, 4, { colors: ['R'], manaCost: cost(3, { R: 1 }) }),
  creature('thin', 1, 1, { colors: ['R'], manaCost: cost(0, { R: 1 }) }),
  // Cinder Strike: "As an additional cost to cast this spell, you may blight 1. 2 damage to target creature; 4 instead if paid."
  card({
    id: 'cinder-strike',
    types: ['Sorcery'],
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    kicker: { cost: cost(0), blight: 1 },
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'wasKicked' },
          then: [{ kind: 'damage', amount: 4, to: { target: 0 } }],
          else: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
        },
      ],
    },
  }),
  // Bogslither's Embrace: "As an additional cost to cast this spell, blight 1 or pay {3}. Exile target creature."
  card({
    id: 'bogslither',
    types: ['Sorcery'],
    colors: ['B'],
    manaCost: cost(1, { B: 1 }),
    blightOrPay: { amount: 1, pay: cost(3) },
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'exile', what: { target: 0 } }] },
  }),
  // Mandatory blight 2 to cast (a "Fell Rite"-like fixture).
  card({
    id: 'fell-rite',
    types: ['Instant'],
    colors: ['B'],
    manaCost: cost(0, { B: 1 }),
    blightToCast: 2,
    spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 2 }] },
  }),
  // Soul Immolation: "blight X. X can't be greater than the greatest toughness among creatures you control.
  // X damage to each opponent and each creature they control."
  card({
    id: 'soul-immolation',
    types: ['Sorcery'],
    colors: ['R'],
    manaCost: cost(3, { R: 2 }),
    blightX: true,
    spell: {
      targets: [],
      effects: [
        { kind: 'damage', amount: { x: true }, to: 'eachOpponent' },
        { kind: 'damage', amount: { x: true }, to: { each: 'creature', controller: 'opponent' } },
      ],
    },
  }),
  // Pyrrhic Strike: "you may blight 2. Choose one. If the additional cost was paid, choose both instead."
  card({
    id: 'pyrrhic',
    types: ['Instant'],
    colors: ['W'],
    manaCost: cost(2, { W: 1 }),
    modes: [
      {
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
        label: 'Gain 3 life',
      },
      {
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'destroy', what: { target: 0 } }],
        label: 'Destroy target creature',
      },
    ],
    kicker: {
      cost: cost(0),
      blight: 2,
      spell: combineSpells([
        { targets: [], effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }] },
        {
          targets: [{ what: 'creature', controller: 'opponent' }],
          effects: [{ kind: 'destroy', what: { target: 0 } }],
        },
      ]),
    },
  }),
  // Gristle Glutton: "{T}, Blight 1: Draw a card."
  creature('gristle', 2, 2, {
    colors: ['R'],
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, blight: 1 },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // Evershrike's Gift-like: "{1}{W}, Blight 2: Return this card from your graveyard to your hand."
  card({
    id: 'gift',
    types: ['Enchantment'],
    colors: ['W'],
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        sorcerySpeed: true,
        cost: { mana: cost(1, { W: 1 }), blight: 2 },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'hand' }],
      },
    ],
  }),
  // Dream Seizer: "When this creature enters, you may blight 1. If you do, each opponent discards a card."
  creature('seizer', 2, 2, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'blight',
            amount: 1,
            optional: true,
            then: [{ kind: 'discard', who: 'eachOpponent', count: 1 }],
          },
        ],
      },
    ],
  }),
  // Gutsplitter Gang: "At the beginning of your first main phase, you may blight 2. If you don't, you lose 3 life."
  creature('gutsplitter', 3, 3, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [
          {
            kind: 'blight',
            amount: 2,
            optional: true,
            otherwise: [{ kind: 'loseLife', who: 'controller', amount: 3 }],
          },
        ],
      },
    ],
  }),
  // High Perfect Morcant: "each opponent blights 1" (mandatory, by the opponent).
  creature('morcant', 3, 3, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'blight', amount: 1, who: 'eachOpponent' }],
      },
    ],
  }),
  // Grub-like: "may blight 1. If you do, gain life equal to the blighted creature's toughness" (the blighted creature is 'chosen').
  creature('grubby', 2, 2, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'blight',
            amount: 1,
            optional: true,
            then: [{ kind: 'gainLife', who: 'controller', amount: { toughnessOf: 'chosen' } }],
          },
        ],
      },
    ],
  }),
  // Wither and persist.
  creature('witherer', 3, 3, { colors: ['B'] }, ['wither']),
  creature('persister', 2, 2, { colors: ['B'], manaCost: cost(2) }, ['persist']),
  creature('one-persist', 1, 1, { colors: ['B'] }, ['persist']),
  // Isilu: "Each other nontoken creature you control has persist."
  creature('isilu', 3, 3, {
    colors: ['W'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { nontoken: true },
          power: 0,
          toughness: 0,
          keywords: ['persist'],
        },
      },
    ],
  }),
  // Vivid.
  creature('vivid-drake', 3, 3, {
    colors: ['U'],
    manaCost: cost(5, { U: 1 }),
    costReduction: { count: 'vivid' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: { count: 'vivid' } }],
      },
    ],
  }),
  creature('squawk', 0, 4, { colors: ['R'], powerEquals: { count: 'vivid' } }),
  // Vibrance: a hybrid Elemental Incarnation with evoke.
  creature('vibrance', 4, 4, {
    colors: ['R', 'G'],
    manaCost: {
      generic: 3,
      colored: {},
      hybrid: [
        ['R', 'G'],
        ['R', 'G'],
      ],
    },
    evoke: {
      generic: 0,
      colored: {},
      hybrid: [
        ['R', 'G'],
        ['R', 'G'],
      ],
    },
    subtypes: ['Elemental', 'Incarnation'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'manaSpentColors', colors: { R: 2 } },
        targets: [{ what: 'any' }],
        effects: [{ kind: 'damage', amount: 3, to: { target: 0 } }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'manaSpentColors', colors: { G: 2 } },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 2 }],
      },
    ],
  }),
  // Conspire.
  card({
    id: 'zap',
    types: ['Instant'],
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 1, to: { target: 0 } }],
    },
  }),
  card({
    id: 'conspiring-zap',
    types: ['Instant'],
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    conspire: true,
    spell: {
      targets: [{ what: 'any' }],
      effects: [{ kind: 'damage', amount: 1, to: { target: 0 } }],
    },
  }),
  card({
    id: 'raiding-schemes',
    types: ['Enchantment'],
    colors: ['R', 'G'],
    abilities: [{ kind: 'static', effect: { kind: 'noncreatureSpellsHaveConspire' } }],
  }),
  // Spinerock Tyrant-like: wither on the spell and its copy.
  card({
    id: 'wither-copier',
    types: ['Creature'],
    colors: ['R'],
    power: 5,
    toughness: 5,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
        targets: [],
        optional: true,
        effects: [{ kind: 'copySpell', what: 'subject', withWither: true, newTargets: true }],
      },
    ],
  }),
  // A two-faced legend: "At the beginning of your first main phase, you may pay {G}. If you do, transform this."
  creature('brigid', 3, 3, {
    colors: ['W'],
    manaCost: cost(2, { W: 1 }),
    back: 'brigid-back',
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etbOrTransforms' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        cost: cost(0, { G: 1 }),
        effects: [{ kind: 'transform', what: 'self' }],
      },
    ],
  }),
  creature('brigid-back', 4, 4, {
    colors: ['W'],
    noManaCost: true,
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'transforms' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 5 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        cost: cost(0, { W: 1 }),
        effects: [{ kind: 'transform', what: 'self' }],
      },
    ],
  }),
  // Champion of the Clachan: "behold a Kithkin and exile it ... When this leaves the battlefield, return the exiled card."
  creature('kithkin', 1, 1, { colors: ['W'], subtypes: ['Kithkin'], manaCost: cost(0, { W: 1 }) }),
  creature('champion', 4, 4, {
    colors: ['W'],
    subtypes: ['Kithkin', 'Knight'],
    manaCost: cost(2, { W: 1 }),
    beholdExile: { subtype: 'Kithkin' },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'leavesBattlefield' },
        targets: [],
        effects: [{ kind: 'returnBeholdExiled' }],
      },
    ],
  }),
  // All creature types.
  creature('typeshifter', 1, 1, {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'allCreatureTypes', what: { target: 0 }, duration: 'permanent' }],
      },
    ],
  }),
  creature('goblin-lord', 2, 2, {
    subtypes: ['Goblin'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Goblin' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  card({
    id: 'inversion',
    types: ['Instant'],
    colors: ['B'],
    manaCost: cost(0, { B: 1 }),
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'pump', to: { target: 0 }, power: 3, toughness: -3 },
        { kind: 'loseCreatureTypes', what: { target: 0 } },
      ],
    },
  }),
  card({
    id: 'dagger',
    types: ['Artifact'],
    subtypes: ['Equipment'],
    manaCost: cost(2),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 1,
          toughness: 1,
          allCreatureTypes: true,
        },
      },
    ],
  }),
  creature('kithkin-lord', 2, 2, {
    subtypes: ['Kithkin'],
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Kithkin' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  // "Enters with two -1/-1 counters", "{1}{R}, Remove a counter from this creature: Draw a card. Activate only as a sorcery."
  creature('burdened', 4, 4, {
    colors: ['R'],
    entersWithNamedCounters: { '-1/-1': 2 },
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: cost(1, { R: 1 }), removeAnyCounters: 1 },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: cost(0, { R: 2 }), removeAnyCounters: 2 },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 2 }],
      },
    ],
  }),
  // Heirloom Auntie: "Whenever another creature you control dies, remove a -1/-1 counter from this creature."
  creature('auntie', 3, 3, {
    colors: ['B'],
    entersWithNamedCounters: { '-1/-1': 2 },
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureDies', controller: 'you' },
        targets: [],
        effects: [{ kind: 'removeCounters', from: 'self', name: '-1/-1' }],
      },
    ],
  }),
  // Rhys, the Evermore: "{W}, {T}: Remove any number of counters from target creature you control."
  creature('rhys', 2, 2, {
    colors: ['W'],
    abilities: [
      {
        kind: 'activated',
        sorcerySpeed: true,
        cost: { mana: cost(0, { W: 1 }), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [{ kind: 'removeAnyNumberOfCounters', from: { target: 0 } }],
      },
    ],
  }),
  // Retched Wretch-like: "When this creature dies, if it had a -1/-1 counter on it, you gain 3 life."
  creature('wretch', 2, 2, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        condition: { kind: 'sourceHadNamedCounter', name: '-1/-1' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
      },
    ],
  }),
  // Lasting Tarfire: "At the beginning of each end step, if you put a counter on a creature this turn, 2 damage to each opponent."
  card({
    id: 'tarfire',
    types: ['Enchantment'],
    colors: ['R'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'putCounterOnCreatureThisTurn' },
        targets: [],
        effects: [{ kind: 'damage', amount: 2, to: 'eachOpponent' }],
      },
    ],
  }),
  // Eirdu, Carrier of Dawn: "Creature spells you cast have convoke."
  card({
    id: 'eirdu',
    types: ['Creature'],
    colors: ['W'],
    power: 3,
    toughness: 3,
    abilities: [{ kind: 'static', effect: { kind: 'creatureSpellsHaveConvoke' } }],
  }),
  creature('convoker', 3, 3, { colors: ['W'], manaCost: cost(2, { W: 2 }) }),
  creature('elemental', 1, 1, {
    colors: ['R'],
    subtypes: ['Elemental'],
    manaCost: cost(0, { R: 1 }),
  }),
  // Kindle the Inner Flame: "Flashback—{R}, Behold three Elementals."
  card({
    id: 'kindle',
    types: ['Sorcery'],
    colors: ['R'],
    manaCost: cost(3, { R: 1 }),
    flashback: cost(0, { R: 1 }),
    flashbackBehold: { filter: { subtype: 'Elemental' }, count: 3 },
    spell: { targets: [], effects: [{ kind: 'draw', who: 'controller', amount: 1 }] },
  }),
  // Shadow Urchin: "Whenever a creature you control with one or more counters on it dies, gain that much life" (that many).
  creature('urchin', 1, 3, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creatureYouControlDies', filter: { hasCounters: true } },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: { event: 'amount' } }],
      },
    ],
  }),
  // An Elemental with evoke {R}: "When it enters, if it was evoked, gain 5 life. When it enters, if it wasn't, draw a card."
  creature('evoker', 3, 3, {
    colors: ['R'],
    manaCost: cost(2, { R: 1 }),
    evoke: cost(0, { R: 1 }),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'wasEvoked' },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 5 }],
      },
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        condition: { kind: 'not', condition: { kind: 'wasEvoked' } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // Celestial Reunion: "you may choose a creature type and behold two creatures of that type. Search your library for a creature
  // card with mana value X or less ... If the additional cost was paid and it is the chosen type, put it onto the battlefield."
  card({
    id: 'reunion',
    types: ['Sorcery'],
    colors: ['G'],
    manaCost: { generic: 0, colored: { G: 1 }, x: 1 },
    kicker: { cost: cost(0), beholdChosenType: 2 },
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { types: ['Creature'], maxManaValue: 'x' },
          to: 'hand',
          battlefieldIfChosenType: true,
          reveal: true,
        },
      ],
    },
  }),
  creature('shifter', 1, 1, {
    colors: ['G'],
    keywords: ['changeling'],
    manaCost: cost(1, { G: 1 }),
  }),
  // Dawnhand Dissident: "{T}, Blight 2: Exile target card from a graveyard. During your turn, you may cast creature spells from
  // among cards you own exiled with this creature by removing three counters from among creatures you control."
  creature('dissident', 1, 3, {
    colors: ['B'],
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true, blight: 2 },
        targets: [{ what: 'graveyardCard' }],
        effects: [{ kind: 'exileGraveyardCard', what: { target: 0 }, track: true }],
      },
      {
        kind: 'static',
        effect: {
          kind: 'castExiledWithSelf',
          filter: { types: ['Creature'] },
          removeCounters: 3,
          yourTurnOnly: true,
        },
      },
    ],
  }),
  // Chaos Spewer: "When this creature enters, you may pay {2}. If you don't, blight 2."
  creature('spewer', 3, 3, {
    colors: ['B'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [
          {
            kind: 'payOrElse',
            who: 'controller',
            cost: cost(2),
            otherwise: [{ kind: 'blight', amount: 2 }],
          },
        ],
      },
    ],
  }),
  // Warren Torchmaster: "At the beginning of combat on your turn, you may blight 1. When you do, target creature gains haste."
  creature('torchmaster', 2, 2, {
    colors: ['R'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        targets: [],
        effects: [
          {
            kind: 'blight',
            amount: 1,
            optional: true,
            then: [{ kind: 'reflexiveTrigger', ability: 1 }],
          },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: { target: 0 }, power: 0, toughness: 0, keywords: ['haste'] }],
      },
    ],
  }),
];

export const DB = new Map([...FIXTURES, ...ECL].map((c) => [c.id, c]));
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

/** The casts of `id` that target `target` (or nothing, if omitted). */
export const castsAt = (g: Game, player: PlayerId, id: ObjectId, target?: ObjectId) =>
  casts(g, player, id).filter((a) =>
    target === undefined
      ? a.targets.length === 0
      : a.targets.some((t) => 'object' in t && t.object.id === target),
  );

export const counters = (g: Game, id: ObjectId) => g.obj(id).counters?.['-1/-1'] ?? 0;

export const getPower = (g: Game, id: ObjectId) => getCharacteristics(g.state, DB, id).power;
