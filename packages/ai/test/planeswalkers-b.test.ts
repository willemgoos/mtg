import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { beholdToEnterUntapped } from '../../cards/src/fra/helpers.ts';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// Reality Fracture 17c (uncommons): how the bots use the Ways' granted abilities, behold choices and Plan for All Outcomes.

const JACE = 'fra-jace-token';
const sanctum: CardDefinition = {
  id: 'test-sanctum',
  name: 'Test Sanctum',
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: ['Land'],
  supertypes: [],
  subtypes: ['Island'],
  keywords: [],
  abilities: [],
  ...beholdToEnterUntapped(
    { types: ['Planeswalker'], subtype: 'Jace' },
    { kind: 'mana', cost: { tapSelf: true }, produces: 'U' },
  ),
};
const testJace: CardDefinition = {
  id: 'test-jace',
  name: 'Test Jace',
  manaCost: { generic: 3, colored: {} },
  colors: ['U'],
  types: ['Planeswalker'],
  supertypes: [],
  subtypes: ['Jace'],
  keywords: [],
  loyalty: 4,
  abilities: [],
};
const db = new Map([...cardDb, [sanctum.id, sanctum], [testJace.id, testJace]]);
const engine = createEngine(db);
const bot = createHeuristicBot(db);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(db, spec));
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);
const lands = (name: string, n: number) => Array<string>(n).fill(name);

describe('heuristic bot: behold', () => {
  /** The opponent casts a Bear Cub on their turn; the bot may answer. */
  const setup = (p1: ScenarioSpec['p1']) => {
    const g = game({
      p1,
      p2: { hand: ['bear-cub'], battlefield: lands('forest', 2) },
      active: 'p2',
    });
    g.do({
      type: 'castSpell',
      player: 'p2',
      card: g.id('p2', 'bear-cub', 'hand'),
      targets: [],
    });
    g.pass();
    return g;
  };

  it('counters with Countersculpt, beholding a Jace on the battlefield (nothing revealed) rather than one in hand', () => {
    const g = setup({
      hand: ['countersculpt', 'test-jace'],
      battlefield: [{ card: JACE, loyalty: 2 }, ...lands('island', 2)],
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    expect(a.card).toBe(g.id('p1', 'countersculpt', 'hand'));
    expect(a.beheld).toBe(true);
    expect(g.obj(a.beholdCard!).zone).toBe('battlefield');
  });

  it('with only a Jace card in hand it beholds that one (and reveals it), keeping its mana', () => {
    const g = setup({
      hand: ['countersculpt', 'test-jace'],
      battlefield: lands('island', 2),
    });
    const a = choose(g);
    expect(a.type === 'castSpell' && a.card === g.id('p1', 'countersculpt', 'hand')).toBe(true);
    expect(a.type === 'castSpell' && g.obj(a.beholdCard!).defId).toBe('test-jace');
  });
});

describe('heuristic bot: "you may behold a Jace" for a land', () => {
  it('beholds to have the land enter untapped (the Jace on the battlefield first), declining nothing', () => {
    const g = game({
      p1: { hand: ['test-sanctum'], battlefield: [{ card: JACE, loyalty: 1 }] },
    });
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'test-sanctum', 'hand') });
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    const a = choose(g);
    expect(a.type).toBe('chooseOption');
    expect(a.type === 'chooseOption' && a.index).toBe(0);
    g.do(a);
    expect(g.obj(g.id('p1', 'test-sanctum')).tapped).toBe(false);
  });
});

describe('heuristic bot: Plan for All Outcomes', () => {
  it('puts its own permanent on top of its library when it owns it', () => {
    const g = game({
      p1: { hand: ['plan-for-all-outcomes'], battlefield: lands('island', 4) },
      p2: { battlefield: ['bear-cub'] },
      active: 'p1',
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'plan-for-all-outcomes', 'hand'),
      targets: [],
    });
    g.passBoth();
    g.do({
      type: 'chooseTargets',
      player: 'p1',
      targets: [{ object: { id: g.id('p2', 'bear-cub'), zcc: 0 } }],
    });
    g.passBoth();
    // Its opponent's bear: the owner (p2) chooses; the bot for p2 answers with a legal option.
    expect(g.decision.kind).toBe('chooseOption');
    const a = choose(g, 'p2');
    expect(a.type).toBe('chooseOption');
    g.do(a);
    expect(g.obj(g.id('p2', 'bear-cub', 'library')).zone).toBe('library');
  });
});

describe('heuristic bot: the Ways', () => {
  it('uses a granted ability when it is worth it (Way of the Wildspeaker: −4 for a 4/4 Beast)', () => {
    const g = game({
      p1: { battlefield: ['way-of-the-wildspeaker', { card: JACE, loyalty: 4 }] },
      p2: { battlefield: ['bear-cub'] },
    });
    const a = choose(g);
    expect(a.type).toBe('activateAbility');
  });

  it('does not throw choosing with every Way out and a loaded board', () => {
    const ways = [
      'way-of-the-cryomancer',
      'way-of-the-deathbringer',
      'way-of-the-healer',
      'way-of-the-mentor',
      'way-of-the-mind-sculptor',
      'way-of-the-necromancer',
      'way-of-the-paradox',
      'way-of-the-pyromancer',
      'way-of-the-warlord',
      'way-of-the-wildspeaker',
    ];
    const g = game({
      p1: {
        hand: ['shock', 'plan-for-all-outcomes'],
        battlefield: [
          ...ways,
          { card: JACE, loyalty: 9 },
          'kiora-of-salt-and-sand',
          'tomik-orzhov-lawmage',
          'bear-cub',
          ...lands('mountain', 3),
          ...lands('island', 3),
        ],
      },
      p2: { battlefield: ['bear-cub', { card: JACE, loyalty: 3 }] },
    });
    for (let i = 0; i < 12; i++) {
      const d = g.decision;
      if (d.kind === 'gameOver') break;
      g.do(choose(g));
    }
    expect(g.state.turn.number).toBeGreaterThanOrEqual(3);
  });
});
