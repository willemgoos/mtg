import { def, makeCtx } from '../src/context.ts';
import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  AbilityDef,
  Action,
  CardDefinition,
  ConditionDef,
  EffectDef,
  GameState,
  Keyword,
  ManaCost,
  ObjectId,
  PlayerId,
  TriggerDef,
} from '../src/types.ts';
import { DB as BASE } from './hob-fixtures.ts';

// ---------------------------------------------------------------------------
// The Lord of the Rings (21a): the Ring tempts you, the Ring-bearer, scry and token triggers.
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
  keywords: Keyword[] = [],
): CardDefinition => card({ id, types: ['Creature'], power: p, toughness: t, keywords, ...extra });

const when = (
  trigger: TriggerDef,
  effects: EffectDef[],
  extra: Partial<Extract<AbilityDef, { kind: 'triggered' }>> = {},
): AbilityDef => ({ kind: 'triggered', trigger, targets: [], effects, ...extra });

const etb = (...effects: EffectDef[]): AbilityDef => when({ on: 'etb' }, effects);
const tempt: EffectDef = { kind: 'ringTempts' };
const not = (condition: ConditionDef): ConditionDef => ({ kind: 'not', condition });

export const ORC_ARMY = 'ltr-orc-army-token';
export const SOLDIER = 'l-soldier-token';

export const LTR: CardDefinition[] = [
  // The Ring (the stack shows its abilities as this), and tokens.
  card({ id: 'ltr-the-ring', name: 'The Ring', isToken: true }),
  card({
    id: ORC_ARMY,
    name: 'Orc Army',
    isToken: true,
    colors: ['B'],
    types: ['Creature'],
    subtypes: ['Orc', 'Army'],
    power: 0,
    toughness: 0,
  }),
  card({
    id: SOLDIER,
    name: 'Human Soldier',
    isToken: true,
    colors: ['W'],
    types: ['Creature'],
    subtypes: ['Human', 'Soldier'],
    power: 1,
    toughness: 1,
  }),

  // ---- Creatures to bear the Ring
  creature('l-bear', 2, 2, { manaCost: cost(2) }),
  creature('l-bear-2', 2, 2, { name: 'l-bear', manaCost: cost(2) }),
  creature('l-bear-legend', 2, 2, { name: 'l-bear', supertypes: ['Legendary'], manaCost: cost(2) }),
  creature('l-small', 1, 1, { manaCost: cost(1) }),
  creature('l-wall', 0, 5, { manaCost: cost(2) }),
  creature('l-big', 4, 4, { manaCost: cost(4) }),
  creature('l-giant', 5, 5, { manaCost: cost(5) }),
  creature('l-flyer', 2, 2, { manaCost: cost(3) }, ['flying']),
  creature('l-legend', 3, 3, { supertypes: ['Legendary'], manaCost: cost(3) }),

  // Esquire of the King-like: "As long as you control a legendary creature, this gets +1/+1."
  creature('l-esquire', 1, 1, {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsCreature', filter: { supertypes: ['Legendary'] } },
          power: 1,
          toughness: 1,
        },
      },
    ],
  }),

  // ---- Spells that tempt
  // Sam's Desperate Rescue-like: "The Ring tempts you."
  card({
    id: 'l-tempt',
    types: ['Sorcery'],
    spell: { targets: [], effects: [tempt] },
  }),
  // "Draw a card. The Ring tempts you." (more effects follow the temptation)
  card({
    id: 'l-tempt-draw',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [tempt, { kind: 'draw', who: 'controller', amount: 1 }],
    },
  }),
  // Relentless Rohirrim: "When this creature enters, the Ring tempts you."
  creature('l-rohirrim', 3, 3, { manaCost: cost(0), abilities: [etb(tempt)] }),
  // Took Reaper-like: "When this creature dies, the Ring tempts you."
  creature('l-reaper', 1, 1, {
    abilities: [when({ on: 'dies' }, [tempt])],
  }),
  // Faramir, Field Commander (the Ring half): "Whenever the Ring tempts you, if you chose a creature other than Faramir as your
  // Ring-bearer, create a 1/1 white Human Soldier creature token."
  creature('l-faramir', 2, 2, {
    supertypes: ['Legendary'],
    abilities: [
      when({ on: 'ringTempts' }, [{ kind: 'createToken', token: SOLDIER, count: 1 }], {
        condition: { kind: 'ringBearerChosenOther' },
      }),
    ],
  }),
  // Call of the Ring: "Whenever you choose a creature as your Ring-bearer, draw a card" (the real card asks for 2 life).
  card({
    id: 'l-call',
    types: ['Enchantment'],
    abilities: [when({ on: 'ringBearerChosen' }, [{ kind: 'draw', who: 'controller', amount: 1 }])],
  }),
  // Nazgûl: "When this creature enters, the Ring tempts you. Whenever the Ring tempts you, put a +1/+1 counter on each Wraith you
  // control."
  creature('l-nazgul', 2, 2, {
    subtypes: ['Wraith', 'Knight'],
    abilities: [
      etb(tempt),
      when({ on: 'ringTempts' }, [
        {
          kind: 'counters',
          to: { each: 'creature', controller: 'you', filter: { subtype: 'Wraith' } },
          amount: 1,
        },
      ]),
    ],
  }),
  // Ringwraiths: "When the Ring tempts you, return this card from your graveyard to your hand."
  creature('l-ringwraiths', 6, 6, {
    subtypes: ['Wraith'],
    abilities: [
      when({ on: 'ringTempts' }, [{ kind: 'returnSource', to: 'hand' }], { fromGraveyard: true }),
    ],
  }),
  // Galadriel of Lothlórien (the Ring half): a Ring-bearer other than her makes her draw a card (stand-in for scry 3).
  creature('l-galadriel', 2, 2, {
    supertypes: ['Legendary'],
    abilities: [
      when({ on: 'ringTempts' }, [{ kind: 'draw', who: 'controller', amount: 1 }], {
        condition: { kind: 'ringBearerChosenOther' },
      }),
    ],
  }),
  // Sauron, the Necromancer-like: "gets +2/+0 as long as it is your Ring-bearer".
  creature('l-necromancer', 3, 3, {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'while', condition: { kind: 'isRingBearer' }, power: 2, toughness: 0 },
      },
    ],
  }),
  // Dúnedain Rangers: "Landfall - Whenever a land you control enters, if you don't control a Ring-bearer, the Ring tempts you."
  creature('l-dunedain', 3, 3, {
    abilities: [when({ on: 'landfall' }, [tempt], { condition: not({ kind: 'hasRingBearer' }) })],
  }),
  // Frodo-like: "If the Ring has tempted you four or more times this game, lose 5 life. Otherwise, the Ring tempts you."
  card({
    id: 'l-frodo',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [
        {
          kind: 'if',
          condition: { kind: 'ringTemptedAtLeast', min: 4 },
          then: [{ kind: 'loseLife', who: 'controller', amount: 5 }],
          else: [tempt],
        },
      ],
    },
  }),
  // One Ring to Rule Them All (chapter I): "The Ring tempts you, then each player mills cards equal to your Ring-bearer's power."
  card({
    id: 'l-one-ring',
    types: ['Sorcery'],
    spell: {
      targets: [],
      effects: [tempt, { kind: 'mill', who: 'eachPlayer', count: { powerOf: 'ringBearer' } }],
    },
  }),
  // "Your Ring-bearer gets +3/+3 until end of turn" (a Ref to the Ring-bearer).
  card({
    id: 'l-bearer-pump',
    types: ['Instant'],
    spell: {
      targets: [],
      effects: [{ kind: 'pump', to: 'ringBearer', power: 3, toughness: 3 }],
    },
  }),
  // A creature stolen: "gain control of target creature".
  card({
    id: 'l-steal',
    types: ['Sorcery'],
    spell: {
      targets: [{ what: 'creature', controller: 'opponent' }],
      effects: [{ kind: 'gainControl', what: { target: 0 }, permanent: true }],
    },
  }),
  // "Exile target creature you control, then return it" (blink).
  card({
    id: 'l-blink',
    types: ['Instant'],
    spell: {
      targets: [{ what: 'creature', controller: 'you' }],
      effects: [{ kind: 'blink', what: { target: 0 } }],
    },
  }),
  // Kill a creature.
  card({
    id: 'l-kill',
    types: ['Instant'],
    spell: { targets: [{ what: 'creature' }], effects: [{ kind: 'destroy', what: { target: 0 } }] },
  }),

  // ---- Scry
  card({ id: 'l-scry-2', types: ['Sorcery'], spell: { targets: [], effects: [{ kind: 'scry', amount: 2 }] } }),
  card({ id: 'l-surveil-2', types: ['Sorcery'], spell: { targets: [], effects: [{ kind: 'surveil', amount: 2 }] } }),
  // Chance-Met Elves-like: "Whenever you scry, put a +1/+1 counter on this creature."
  creature('l-scry-elf', 1, 1, {
    abilities: [when({ on: 'youScry' }, [{ kind: 'counters', to: 'self', amount: 1 }])],
  }),
  // Celeborn-like: "Whenever you scry, draw a card for each card looked at while scrying this way."
  creature('l-scry-draw', 1, 1, {
    abilities: [
      when({ on: 'youScry' }, [{ kind: 'draw', who: 'controller', amount: { event: 'amount' } }]),
    ],
  }),
  // Matoya-like (scry or surveil): put a +1/+1 counter.
  creature('l-scry-or-surveil', 1, 1, {
    abilities: [when({ on: 'youScryOrSurveil' }, [{ kind: 'counters', to: 'self', amount: 1 }])],
  }),

  // ---- Tokens
  // Make two Human Soldier tokens.
  card({
    id: 'l-two-tokens',
    types: ['Sorcery'],
    spell: { targets: [], effects: [{ kind: 'createToken', token: SOLDIER, count: 2 }] },
  }),
  // Rosie Cotton-like: "Whenever you create a token, put a +1/+1 counter on this creature."
  creature('l-rosie', 1, 1, {
    abilities: [when({ on: 'youCreateToken' }, [{ kind: 'counters', to: 'self', amount: 1 }])],
  }),
  // Mirkwood Bats-like: "Whenever you create a token, each opponent loses 1 life."
  creature('l-bats', 2, 2, {
    abilities: [when({ on: 'youCreateToken' }, [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }])],
  }),
  // Only creature tokens named by the filter: "Whenever you create a Treasure token ..." stand-in: a non-creature token.
  creature('l-token-fan', 1, 1, {
    abilities: [
      when(
        { on: 'youCreateToken', filter: { types: ['Artifact'] } },
        [{ kind: 'counters', to: 'self', amount: 1 }],
      ),
    ],
  }),
  // A Treasure-like artifact token.
  card({ id: 'l-treasure-token', name: 'Treasure', isToken: true, types: ['Artifact'], subtypes: ['Treasure'] }),
  card({
    id: 'l-make-treasure',
    types: ['Sorcery'],
    spell: { targets: [], effects: [{ kind: 'createToken', token: 'l-treasure-token', count: 1 }] },
  }),

  // ---- Amass Orcs
  // Mordor Muster: "You draw a card and you lose 1 life. Amass Orcs 1."
  card({
    id: 'l-muster',
    types: ['Sorcery'],
    colors: ['B'],
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: 1 },
        { kind: 'loseLife', who: 'controller', amount: 1 },
        { kind: 'amass', subtype: 'Orc', amount: 1, token: ORC_ARMY },
      ],
    },
  }),
  // Shagrat-like: amass Orcs X where X is the number of Equipment attached to this creature.
  creature('l-shagrat', 3, 3, {
    subtypes: ['Orc', 'Soldier'],
    abilities: [
      when({ on: 'attacks' }, [
        {
          kind: 'amass',
          subtype: 'Orc',
          amount: {
            count: 'permanentsYouControl',
            filter: { subtype: 'Equipment', attachedToSource: true },
          },
          token: ORC_ARMY,
        },
      ]),
    ],
  }),
  card({ id: 'l-sword', types: ['Artifact'], subtypes: ['Equipment'] }),
  // Foray of Orcs: "Amass Orcs 2. When you do, this deals X damage to target creature an opponent controls, where X is the amassed
  // Army's power."
  card({
    id: 'l-foray',
    types: ['Sorcery'],
    colors: ['R'],
    spell: {
      targets: [],
      effects: [
        { kind: 'amass', subtype: 'Orc', amount: 2, token: ORC_ARMY },
        { kind: 'reflexiveTrigger', ability: 0, subject: 'chosen' },
      ],
    },
    abilities: [
      when({ on: 'reflexive' }, [{ kind: 'damage', amount: { powerOf: 'subject' }, to: { target: 0 } }], {
        targets: [{ what: 'creature', controller: 'opponent' }],
      }),
    ],
  }),
  // Assault on Osgiliath: "Amass Orcs X, then Goblins and Orcs you control gain double strike and haste until end of turn."
  card({
    id: 'l-assault',
    types: ['Sorcery'],
    colors: ['R'],
    manaCost: cost(0),
    spell: {
      targets: [],
      effects: [
        { kind: 'amass', subtype: 'Orc', amount: 3, token: ORC_ARMY },
        {
          kind: 'pump',
          to: { each: 'creature', controller: 'you', filter: { subtypes: ['Goblin', 'Orc'] } },
          power: 0,
          toughness: 0,
          keywords: ['doubleStrike', 'haste'],
        },
      ],
    },
  }),
  // Saruman the White-like: "Whenever you cast your second spell each turn, amass Orcs 2."
  creature('l-saruman', 3, 4, {
    abilities: [
      when({ on: 'castSpell', filter: 'second' }, [
        { kind: 'amass', subtype: 'Orc', amount: 2, token: ORC_ARMY },
      ]),
    ],
  }),
  // A creature that dies: Easterling Vanguard.
  creature('l-vanguard', 2, 2, {
    abilities: [
      when({ on: 'dies' }, [{ kind: 'amass', subtype: 'Orc', amount: 1, token: ORC_ARMY }]),
    ],
  }),
];

export const DB = new Map([...BASE, ...LTR.map((c): [string, CardDefinition] => [c.id, c])]);
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
/** The supertypes it has now (the Ring-bearer is legendary). */
export const supertypes = (g: Game, id: ObjectId) => def(makeCtx(g.state, DB), id).supertypes;

/** Gives `player` the Ring: tempted `tempted` times, with `bearer` (an object id) as the Ring-bearer. */
export const withRing = (
  state: GameState,
  player: PlayerId,
  tempted: number,
  bearer?: ObjectId,
): GameState => {
  state.players[player].ring = {
    tempted,
    ...(bearer !== undefined ? { bearer: { id: bearer, zcc: state.objects[bearer]!.zcc } } : {}),
  };
  return state;
};

/** The id of the first object with this card in a zone (setup, before a Game exists). */
export const find = (state: GameState, player: PlayerId, defId: string): ObjectId =>
  state.battlefield.find((id) => state.objects[id]!.defId === defId && state.objects[id]!.controller === player)!;
