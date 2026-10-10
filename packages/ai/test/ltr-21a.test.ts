import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type EffectDef,
  type ManaCost,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, evaluate } from '../src/index.ts';

// The Lord of the Rings (21a): how the bots handle the Ring (choosing a Ring-bearer) and the Ring in the evaluation.

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
const etb = (...effects: EffectDef[]) => ({
  kind: 'triggered' as const,
  trigger: { on: 'etb' as const },
  targets: [],
  effects,
});

const DB = new Map(
  [
    land('swamp', 'B'),
    land('plains', 'W'),
    card({ id: 'ltr-the-ring', name: 'The Ring', isToken: true }),
    card({ id: 'tempt', types: ['Sorcery'], spell: { targets: [], effects: [{ kind: 'ringTempts' }] } }),
    creature('small', 1, 1, { manaCost: cost(1, { B: 1 }) }),
    creature('bear', 2, 2, { manaCost: cost(2, { B: 1 }) }),
    creature('big', 4, 4, { manaCost: cost(4, { B: 1 }) }),
    creature('giant', 5, 5, { manaCost: cost(5, { B: 1 }) }),
    creature('wall', 5, 5, { keywords: ['defender'] }),
    // Relentless Rohirrim: "When this creature enters, the Ring tempts you."
    creature('rohirrim', 3, 3, {
      manaCost: cost(3, { B: 1 }),
      abilities: [etb({ kind: 'ringTempts' })],
    }),
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

/** Casts the Ring spell (as `p`) and resolves it up to the Ring-bearer prompt. */
const toPrompt = (g: GameDriver, p: PlayerId = 'p1') => {
  const spell = g.id(p, 'tempt', 'hand');
  g.do(g.legal(p).find((a) => a.type === 'castSpell' && a.card === spell)!);
  for (let i = 0; i < 6 && g.decision.kind === 'priority'; i++) g.passBoth();
  expect(g.decision.kind).toBe('chooseObject');
};

describe('bots and the Ring', () => {
  it('chooses a Ring-bearer that can attack, with the most power, not a defender or a 1/1', () => {
    const g = game({
      p1: { hand: ['tempt'], battlefield: ['swamp', 'small', 'big', 'wall'] },
      p2: {},
    });
    toPrompt(g);
    const pick = choose(g);
    expect(pick).toMatchObject({ type: 'chooseCard', card: g.id('p1', 'big') });
    g.do(pick);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'big'));
  });

  it('with a similar choice takes the bigger creature', () => {
    const g = game({
      p1: { hand: ['tempt'], battlefield: ['swamp', 'bear', 'giant'] },
      p2: {},
    });
    toPrompt(g);
    g.do(choose(g));
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'giant'));
  });

  it('the opponent\'s bot chooses too (the prompt is its own)', () => {
    const g = game({
      p2: { hand: ['tempt'], battlefield: ['swamp', 'bear', 'big'] },
      p1: {},
      active: 'p2',
    });
    toPrompt(g, 'p2');
    expect(g.actor).toBe('p2');
    g.do(choose(g));
    expect(g.state.players.p2.ring?.bearer?.id).toBe(g.id('p2', 'big'));
  });

  it('plays creatures that tempt and the game goes on', () => {
    const g = game({
      p1: {
        hand: ['rohirrim', 'tempt', 'bear'],
        battlefield: ['swamp', 'swamp', 'swamp', 'swamp', 'swamp', 'swamp'],
      },
      p2: {},
    });
    playUntil(g, () => (g.state.players.p1.ring?.tempted ?? 0) >= 2, 120);
    expect(g.state.players.p1.ring?.tempted).toBeGreaterThanOrEqual(1);
    expect(g.decision.kind).not.toBe('gameOver');
  });
});

describe('the Ring in the evaluation', () => {
  it('a Ring with a level is worth something, and a good Ring-bearer more', () => {
    const base = game({ p1: { battlefield: ['big', 'wall'] }, p2: {} });
    const v0 = evaluate(base.state, DB, 'p1');
    const withRing = game({ p1: { battlefield: ['big', 'wall'] }, p2: {} });
    withRing.state.players.p1.ring = { tempted: 2 };
    const v1 = evaluate(withRing.state, DB, 'p1');
    expect(v1).toBeGreaterThan(v0);
    const bigBearer = game({ p1: { battlefield: ['big', 'wall'] }, p2: {} });
    bigBearer.state.players.p1.ring = {
      tempted: 2,
      bearer: { id: bigBearer.id('p1', 'big'), zcc: bigBearer.obj(bigBearer.id('p1', 'big')).zcc },
    };
    const wallBearer = game({ p1: { battlefield: ['big', 'wall'] }, p2: {} });
    wallBearer.state.players.p1.ring = {
      tempted: 2,
      bearer: { id: wallBearer.id('p1', 'wall'), zcc: wallBearer.obj(wallBearer.id('p1', 'wall')).zcc },
    };
    expect(evaluate(bigBearer.state, DB, 'p1')).toBeGreaterThan(v1);
    expect(evaluate(bigBearer.state, DB, 'p1')).toBeGreaterThan(evaluate(wallBearer.state, DB, 'p1'));
    // The other side's Ring counts against us.
    expect(evaluate(bigBearer.state, DB, 'p2')).toBeLessThan(evaluate(base.state, DB, 'p2'));
  });
});
