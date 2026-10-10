import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  AbilityDef,
  Action,
  Amount,
  CardDefinition,
  EffectDef,
  GameState,
  ManaCost,
  ObjectId,
  PlayerId,
  Ref,
} from '../src/types.ts';
import { DB as BASE } from './tdm-fixtures.ts';

// ---------------------------------------------------------------------------
// The Hobbit (20a): amass, recruit, Storied and the enduring story, typecycling.
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

const creature = (
  id: string,
  p: number,
  t: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => card({ id, types: ['Creature'], power: p, toughness: t, ...extra });

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
): CardDefinition =>
  card({ id, name, isToken: true, colors, types: ['Creature'], subtypes, power: p, toughness: t });

/** What the cards package's `amass(subtype, amount)` builds. */
const amass = (subtype: string, amount: Amount, token: string, who?: Ref): EffectDef => ({
  kind: 'amass',
  subtype,
  amount,
  token,
  ...(who ? { who } : {}),
});
const GOBLIN_ARMY = 'hob-goblin-army-token';
const ORC_ARMY = 'hob-orc-army-token';
const recruit: EffectDef = { kind: 'recruit' };
const storied: AbilityDef = { kind: 'static', effect: { kind: 'storied' } };
const enduringStory = { kind: 'enduringStory' } as const;

const etb = (...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects,
});

/** "Typecycling {cost}", as the cards package builds it. */
const typecycling = (
  search: 'basicLand' | NonNullable<Extract<EffectDef, { kind: 'searchLibrary' }>['filter']>,
  c: ManaCost,
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: c, discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: search, to: 'hand', reveal: true }],
});

export const HOB: CardDefinition[] = [
  token(GOBLIN_ARMY, 'Goblin Army', ['B'], ['Goblin', 'Army'], 0, 0),
  token(ORC_ARMY, 'Orc Army', ['B'], ['Orc', 'Army'], 0, 0),
  token('hob-human-soldier-token', 'Human Soldier', ['W'], ['Human', 'Soldier'], 1, 1),

  // ---- Amass
  // Goblin-town Flunkies: "When this creature enters, amass Goblins 1."
  creature('h-flunkies', 2, 1, {
    colors: ['R'],
    manaCost: cost(1, { R: 1 }),
    subtypes: ['Goblin', 'Soldier'],
    abilities: [etb(amass('Goblin', 1, GOBLIN_ARMY))],
  }),
  // Rage into the Valley: "You draw a card and lose 1 life. Amass Goblins 2."
  card({
    id: 'h-rage',
    types: ['Sorcery'],
    colors: ['B'],
    manaCost: cost(2, { B: 1 }),
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: 1 },
        { kind: 'loseLife', who: 'controller', amount: 1 },
        amass('Goblin', 2, GOBLIN_ARMY),
      ],
    },
  }),
  // An amass of Orcs (Amass Orcs 3).
  card({
    id: 'h-orc-amass',
    types: ['Sorcery'],
    colors: ['B'],
    manaCost: cost(1, { B: 1 }),
    spell: { targets: [], effects: [amass('Orc', 3, ORC_ARMY)] },
  }),
  // Amass Goblins 0 (X = 0).
  card({
    id: 'h-amass-zero',
    types: ['Sorcery'],
    colors: ['B'],
    manaCost: cost(0, { B: 1 }),
    spell: { targets: [], effects: [amass('Goblin', 0, GOBLIN_ARMY)] },
  }),
  // Tidings of War: "Amass Goblins 1. If this spell was cast from a graveyard, amass Goblins 3 instead. Flashback {3}{R}"
  card({
    id: 'h-tidings',
    types: ['Sorcery'],
    colors: ['R'],
    manaCost: cost(0, { R: 1 }),
    flashback: cost(3, { R: 1 }),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'castFromGraveyard' },
          then: [amass('Goblin', 3, GOBLIN_ARMY)],
          else: [amass('Goblin', 1, GOBLIN_ARMY)],
        },
      ],
    },
  }),
  // Azog, Moria's Ruin: "destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's
  // power. If you controlled that creature, draw a card."
  creature('h-azog', 3, 3, {
    colors: ['B'],
    manaCost: cost(2, { B: 1 }),
    supertypes: ['Legendary'],
    subtypes: ['Goblin', 'Soldier'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', filter: { other: true }, optional: true }],
        effects: [
          { kind: 'destroy', what: { target: 0 } },
          amass('Goblin', { powerOf: { target: 0 } }, GOBLIN_ARMY, { controllerOf: 0 }),
        ],
      },
    ],
  }),
  // Goblin Plate Mail: "When this Equipment enters, amass Goblins 1, then attach this Equipment to the amassed Army."
  card({
    id: 'h-plate-mail',
    types: ['Artifact'],
    subtypes: ['Equipment'],
    colors: ['B'],
    manaCost: cost(2),
    abilities: [
      etb(amass('Goblin', 1, GOBLIN_ARMY), { kind: 'attach', to: 'chosen' }),
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 0 } },
    ],
  }),
  // Fearsome Goblin Pair: "When this creature dies, amass Goblins 4."
  creature('h-pair', 3, 3, {
    colors: ['B'],
    manaCost: cost(2, { B: 1 }),
    subtypes: ['Goblin', 'Soldier'],
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [amass('Goblin', 4, GOBLIN_ARMY)],
      },
    ],
  }),
  // A creature with changeling is an Army too.
  creature('h-shapeshifter', 1, 1, { keywords: ['changeling'], subtypes: [] }),
  // A plain Army creature (not a token).
  creature('h-army', 2, 2, { subtypes: ['Human', 'Army'] }),
  // Bard, King of Dale-like: "If one or more tokens would be created under your control, twice that many are created instead."
  creature('h-doubler', 4, 4, {
    abilities: [{ kind: 'static', effect: { kind: 'doubleTokens' } }],
  }),

  // ---- Recruit
  // Patient Instructor: "When this creature enters, recruit."
  creature('h-instructor', 2, 2, {
    colors: ['W'],
    manaCost: cost(1, { W: 1 }),
    abilities: [etb(recruit)],
  }),
  // Lake-town Lookout: "When this creature dies, recruit."
  creature('h-lookout', 1, 1, {
    colors: ['W'],
    manaCost: cost(0, { W: 1 }),
    abilities: [{ kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: [recruit] }],
  }),
  // A spell that draws first: library empty tests, and a land for the hand.
  card({ id: 'h-spare-land', types: ['Land'], abilities: [] }),
  card({
    id: 'h-spare-spell',
    types: ['Sorcery'],
    manaCost: cost(5),
    spell: { targets: [], effects: [] },
  }),

  // ---- Storied
  // Artifacts, legendaries and Sagas to count.
  card({ id: 'h-relic', types: ['Artifact'], manaCost: cost(1) }),
  card({ id: 'h-relic-2', types: ['Artifact'], manaCost: cost(1) }),
  creature('h-legend', 1, 1, { supertypes: ['Legendary'], manaCost: cost(1) }),
  creature('h-legend-artifact', 1, 1, {
    supertypes: ['Legendary'],
    types: ['Artifact', 'Creature'],
    manaCost: cost(1),
  }),
  card({ id: 'h-saga', types: ['Enchantment'], subtypes: ['Saga'], manaCost: cost(1) }),
  // A legendary creature with 0 toughness: it's gone as soon as state-based actions are checked.
  creature('h-doomed-legend', 1, 0, { supertypes: ['Legendary'], manaCost: cost(1) }),
  // Ori, Keeper of Songs: "Storied. As long as you have an enduring story, Ori gets +1/+0 and has vigilance."
  creature('h-ori', 2, 3, {
    colors: ['W'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Bard'],
    manaCost: cost(2, { W: 1 }),
    abilities: [
      storied,
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: enduringStory,
          power: 1,
          toughness: 0,
          keywords: ['vigilance'],
        },
      },
    ],
  }),
  // Fíli the Pathfinder: "Storied. As long as you have an enduring story, creatures you control get +1/+1."
  creature('h-fili', 3, 3, {
    colors: ['W'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Scout'],
    manaCost: cost(3, { W: 1 }),
    abilities: [
      storied,
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          condition: enduringStory,
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),
  // Dáin, Lord of the Iron Hills: "Storied. As long as you have an enduring story, creatures can't attack you unless their
  // controller pays {1} for each of those creatures."
  creature('h-dain', 2, 2, {
    colors: ['W'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Noble'],
    manaCost: cost(1, { W: 1 }),
    abilities: [
      storied,
      { kind: 'static', effect: { kind: 'attackTax', amount: 1, condition: enduringStory } },
    ],
  }),
  // Bombur, Gentle Dreamer: "Storied. Bombur doesn't untap during your untap step unless you have an enduring story."
  creature('h-bombur', 3, 3, {
    colors: ['R'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Bard'],
    manaCost: cost(2, { R: 1 }),
    abilities: [
      storied,
      { kind: 'static', effect: { kind: 'doesntUntap', unless: enduringStory } },
    ],
  }),
  // Thorin Oakenshield: "Storied. As long as you have an enduring story, artifacts and creatures you control have ward {1}."
  creature('h-thorin', 2, 2, {
    colors: ['R'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Noble'],
    manaCost: cost(0, { R: 1 }),
    abilities: [
      storied,
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          anyPermanent: true,
          filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
          condition: enduringStory,
          power: 0,
          toughness: 0,
          keywords: ['wardOne'],
        },
      },
    ],
  }),
  // Bifur, Melodic Rider (the triggered-twice half): "As long as you have an enduring story, if a triggered ability of a Dwarf you
  // control triggers, that ability triggers an additional time."
  creature('h-bifur', 2, 2, {
    colors: ['R'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Bard'],
    manaCost: cost(2, { R: 1 }),
    abilities: [
      storied,
      {
        kind: 'static',
        effect: { kind: 'subtypeTriggersTwice', subtype: 'Dwarf', condition: enduringStory },
      },
    ],
  }),
  // A Dwarf with an enters trigger (Dwarven Provisioner-like): draw a card.
  creature('h-dwarf-drawer', 1, 1, {
    colors: ['W'],
    subtypes: ['Dwarf'],
    manaCost: cost(1, { W: 1 }),
    abilities: [etb({ kind: 'draw', who: 'controller', amount: 1 })],
  }),
  // A Storied permanent that is no Dwarf and draws nothing, for "no Storied permanent".
  // Balin, Loremaster (the story half): "...Balin deals X damage to each opponent" if you have an enduring story.
  creature('h-balin', 3, 3, {
    colors: ['R'],
    supertypes: ['Legendary'],
    subtypes: ['Dwarf', 'Bard'],
    manaCost: cost(3, { R: 2 }),
    abilities: [
      storied,
      etb({
        kind: 'if',
        condition: enduringStory,
        then: [{ kind: 'loseLife', who: 'eachOpponent', amount: 3 }],
        else: [{ kind: 'draw', who: 'controller', amount: 1 }],
      }),
    ],
  }),
  // A copy of the legend rule: another card named like h-legend.
  // ---- Typecycling
  // Hobbit Hole: "Halflingcycling {4}"
  card({
    id: 'h-hobbit-hole',
    types: ['Land'],
    abilities: [typecycling({ subtype: 'Halfling' }, cost(4))],
  }),
  // Last Light of Durin's Day: "Mountaincycling {2}"
  card({
    id: 'h-last-light',
    types: ['Enchantment'],
    colors: ['R'],
    manaCost: cost(1, { R: 1 }),
    abilities: [typecycling({ subtype: 'Mountain' }, cost(2))],
  }),
  // A card with Landcycling {2}, one with Basic landcycling {1}.
  card({
    id: 'h-landcycler',
    types: ['Creature'],
    power: 2,
    toughness: 2,
    manaCost: cost(4),
    abilities: [typecycling({ types: ['Land'] }, cost(2))],
  }),
  card({
    id: 'h-basic-cycler',
    types: ['Creature'],
    power: 2,
    toughness: 2,
    manaCost: cost(4),
    abilities: [typecycling('basicLand', cost(1))],
  }),
  creature('h-halfling', 1, 1, { subtypes: ['Halfling', 'Rogue'], manaCost: cost(1) }),
  creature('h-halfling-2', 1, 1, { subtypes: ['Halfling'], manaCost: cost(1) }),
  // A nonbasic land that is a Mountain (Mountaincycling finds it), a non-Mountain land.
  card({ id: 'h-mountain-land', types: ['Land'], subtypes: ['Mountain'], abilities: [] }),
  card({ id: 'h-plain-land', types: ['Land'], subtypes: ['Plains'], abilities: [] }),
  card({
    id: 'h-basic-mountain',
    types: ['Land'],
    supertypes: ['Basic'],
    subtypes: ['Mountain'],
    abilities: [],
  }),
];

export const DB = new Map([...BASE, ...HOB.map((c): [string, CardDefinition] => [c.id, c])]);
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
