import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type ManaCost,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, evaluate } from '../src/index.ts';

// The Hobbit (20a): how the bots handle amass, recruit, the enduring story and typecycling.

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
const land = (id: string, produces: 'W' | 'B' | 'R' | 'G') =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, colors: ['B'], ...extra });
const etb = (...effects: import('@mtg/engine').EffectDef[]) => ({
  kind: 'triggered' as const,
  trigger: { on: 'etb' as const },
  targets: [],
  effects,
});

const DB = new Map(
  [
    land('mountain', 'R'),
    land('swamp', 'B'),
    land('plains', 'W'),
    land('forest', 'G'),
    creature('ogre', 3, 3, { manaCost: cost(2, { B: 1 }) }),
    creature('goblin-army', 0, 0, { isToken: true, subtypes: ['Goblin', 'Army'] }),
    creature('hob-human-soldier-token', 1, 1, {
      isToken: true,
      colors: ['W'],
      subtypes: ['Human', 'Soldier'],
    }),
    // Goblin-town Flunkies: amass Goblins 2 when it enters.
    creature('flunkies', 2, 1, {
      manaCost: cost(1, { B: 1 }),
      subtypes: ['Goblin'],
      abilities: [etb({ kind: 'amass', subtype: 'Goblin', amount: 2, token: 'goblin-army' })],
    }),
    creature('big-army', 4, 4, { subtypes: ['Army'] }),
    creature('small-army', 1, 1, { subtypes: ['Army'] }),
    // Patient Instructor: recruit.
    creature('instructor', 2, 2, {
      manaCost: cost(1, { W: 1 }),
      colors: ['W'],
      abilities: [etb({ kind: 'recruit' })],
    }),
    // Spare nonland cards.
    creature('bear', 2, 2, { manaCost: cost(2, { B: 1 }) }),
    creature('titan', 8, 8, { manaCost: cost(6, { B: 2 }) }),
    // Landcycling {2}.
    card({
      id: 'land-cycler',
      types: ['Creature'],
      power: 5,
      toughness: 5,
      manaCost: cost(7),
      abilities: [
        {
          kind: 'activated',
          cost: { mana: cost(2), discardSelf: true },
          fromHand: true,
          targets: [],
          effects: [
            { kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'hand', reveal: true },
          ],
        },
      ],
    }),
    // Storied: a legendary Dwarf with +1/+1 to creatures once there is an enduring story.
    creature('fili', 3, 3, {
      supertypes: ['Legendary'],
      subtypes: ['Dwarf'],
      manaCost: cost(2, { B: 1 }),
      abilities: [
        { kind: 'static', effect: { kind: 'storied' } },
        {
          kind: 'static',
          effect: {
            kind: 'anthem',
            affects: 'creaturesYouControl',
            condition: { kind: 'enduringStory' },
            power: 1,
            toughness: 1,
          },
        },
      ],
    }),
    card({ id: 'relic', types: ['Artifact'], manaCost: cost(1) }),
    card({ id: 'relic-2', types: ['Artifact'], manaCost: cost(1) }),
  ].map((c) => [c.id, c]),
);

const engine = createEngine(DB);
const bot = createHeuristicBot(DB);
const game = (spec: ScenarioSpec) =>
  new GameDriver(
    engine,
    buildScenario(DB, {
      ...spec,
      p1: { library: Array<string>(10).fill('swamp'), ...spec.p1 },
      p2: { library: Array<string>(10).fill('swamp'), ...spec.p2 },
    }),
  );
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);

/** The bot plays (for whoever has to act) until `done` holds, at most `n` actions. */
const playUntil = (g: GameDriver, done: () => boolean, n = 60) => {
  for (let i = 0; i < n && !done() && g.decision.kind !== 'gameOver'; i++) g.do(choose(g));
};

describe('bots and amass', () => {
  it('amasses on its own: casts the creature, the Army is made and the game goes on', () => {
    const g = game({ p1: { hand: ['flunkies'], battlefield: ['swamp', 'swamp'] }, p2: {} });
    g.do(choose(g));
    for (let i = 0; i < 6 && g.state.stack.length > 0; i++) g.passBoth();
    const army = g.state.battlefield.find((id) => g.state.objects[id]!.defId === 'goblin-army');
    expect(army).toBeDefined();
    expect(g.state.objects[army!]!.plusOneCounters).toBe(2);
    expect(g.decision.kind).toBe('priority');
  });

  it('chooses which of several Armies gets the counters (and carries on)', () => {
    const g = game({
      p1: { hand: ['flunkies'], battlefield: ['swamp', 'swamp', 'big-army', 'small-army'] },
      p2: {},
    });
    g.do(choose(g));
    for (let i = 0; i < 6 && g.decision.kind === 'priority' && g.state.stack.length > 0; i++)
      g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    const pick = choose(g);
    expect(pick.type).toBe('chooseOption');
    g.do(pick);
    const big = g.state.objects[g.id('p1', 'big-army')]!.plusOneCounters;
    const small = g.state.objects[g.id('p1', 'small-army')]!.plusOneCounters;
    expect(big + small).toBe(2);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('bots and recruit', () => {
  it('draws, then discards the card it wants least', () => {
    // Flooded: six lands in play, a land and a castable creature in hand, a land on top. Recruit discards a land.
    const g = game({
      p1: {
        hand: ['instructor', 'swamp', 'bear'],
        library: ['swamp', 'swamp'],
        battlefield: Array<string>(6).fill('plains'),
      },
      p2: {},
    });
    playUntil(g, () => g.decision.kind === 'discard');
    expect(g.decision.kind).toBe('discard');
    const pick = choose(g);
    expect(pick.type).toBe('discard');
    g.do(pick);
    expect(g.decision.kind).toBe('priority');
    const gy = g.state.players.p1.graveyard.map((id) => g.state.objects[id]!.defId);
    expect(gy).toEqual(['swamp']);
    // The bear stayed in hand, and no token came of a land.
    expect(g.state.players.p1.hand.map((id) => g.state.objects[id]!.defId)).toContain('bear');
  });

  it('with nothing but spells it can use, still discards one (the choice is forced) and takes the token', () => {
    const g = game({
      p1: {
        hand: ['instructor', 'titan'],
        library: ['titan'],
        battlefield: ['plains', 'plains'],
      },
      p2: {},
    });
    playUntil(g, () => g.decision.kind === 'discard');
    expect(g.decision.kind).toBe('discard');
    g.do(choose(g));
    expect(
      g.state.battlefield.filter((id) => g.state.objects[id]!.defId === 'hob-human-soldier-token'),
    ).toHaveLength(1);
  });
});

describe('bots and typecycling', () => {
  it('cycles a card it cannot cast for a land when it is short of lands', () => {
    const g = game({
      p1: {
        hand: ['land-cycler'],
        library: ['plains', 'swamp', 'swamp'],
        battlefield: ['swamp', 'swamp'],
      },
      p2: {},
    });
    const cycler = g.id('p1', 'land-cycler', 'hand');
    playUntil(
      g,
      () =>
        g.zoneOf(cycler) !== 'hand' && g.state.stack.length === 0 && g.decision.kind === 'priority',
      80,
    );
    // The 7-mana creature is discarded to the cost, a land came to the hand (and may be played).
    expect(g.zoneOf(cycler)).toBe('graveyard');
    const landsSeen = [...g.state.players.p1.hand, ...g.state.battlefield]
      .map((id) => g.state.objects[id]!)
      .filter((o) => o.controller === 'p1' && DB.get(o.defId)!.types.includes('Land'));
    expect(landsSeen.length).toBeGreaterThanOrEqual(3);
  });
});

describe('bots and typecycling: when not to', () => {
  it('keeps a card it can cast soon, and does not search for lands it does not need', () => {
    const g = game({
      p1: {
        hand: ['land-cycler'],
        library: ['plains', 'swamp'],
        battlefield: Array<string>(6).fill('swamp'),
      },
      p2: {},
    });
    const cycler = g.id('p1', 'land-cycler', 'hand');
    // The 7-mana card is castable next turn with a seventh land: not dead, so it stays (the bot may cast it).
    playUntil(g, () => g.state.turn.number > 3 && g.state.turn.activePlayer === 'p2', 30);
    expect(g.state.objects[cycler]!.zone).not.toBe('graveyard');
  });
});

describe('the enduring story in the evaluation', () => {
  it('having it is worth more than not, and a Storied permanent with progress more than without', () => {
    const base = game({ p1: { battlefield: ['fili'] }, p2: {} });
    const one = game({ p1: { battlefield: ['fili', 'relic'] }, p2: {} });
    const withStory = game({ p1: { battlefield: ['fili', 'relic', 'relic-2'] }, p2: {} });
    const flagged = game({ p1: { battlefield: ['fili'] }, p2: {} });
    flagged.state.players.p1.enduringStory = true;
    const v = (g: GameDriver) => evaluate(g.state, DB, 'p1');
    expect(v(one)).toBeGreaterThan(v(base));
    expect(v(withStory)).toBeGreaterThan(v(one));
    expect(v(flagged)).toBeGreaterThan(v(base));
    // The opponent having it is bad for us.
    const theirs = game({ p1: { battlefield: ['fili'] }, p2: {} });
    theirs.state.players.p2.enduringStory = true;
    expect(v(theirs)).toBeLessThan(v(base));
  });

  it('casts the artifact that completes the story over doing nothing', () => {
    const g = game({
      p1: { hand: ['relic-2'], battlefield: ['fili', 'relic', 'swamp', 'swamp'] },
      p2: {},
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
  });
});
