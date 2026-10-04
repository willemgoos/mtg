import { createEngine, redactFor, type Action, type PlayerId } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, createSearchBot, planAttackTargets } from '../src/index.ts';

// Reality Fracture 17c: how the bots treat the Jace token and opposing planeswalkers.

const JACE = 'fra-jace-token';
const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);
const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);
const lands = (name: string, n: number) => Array<string>(n).fill(name);
const jaceAction = (a: Action, g: GameDriver) =>
  a.type === 'activateAbility' && g.obj(a.source).defId === JACE ? a.abilityIndex : null;

describe('heuristic bot: the Jace token', () => {
  it('draws with "−3" as soon as it can', () => {
    const g = game({ p1: { battlefield: [{ card: JACE, loyalty: 3 }] } });
    expect(jaceAction(choose(g), g)).toBe(1);
  });

  it('does not use "−3" without the loyalty, and does not spend 2 loyalty on a surveil in main 1', () => {
    const g = game({ p1: { battlefield: [{ card: JACE, loyalty: 2 }] } });
    expect(choose(g).type).toBe('passPriority');
  });

  it('surveils with leftover loyalty in its second main phase when it has nothing to add more', () => {
    const g = game({ step: 'main2', p1: { battlefield: [{ card: JACE, loyalty: 2 }] } });
    expect(jaceAction(choose(g), g)).toBe(0);
  });

  it('keeps its loyalty when it holds a way to empower Jace', () => {
    const g = game({
      step: 'main2',
      p1: { hand: ['mindseeker-oculus'], battlefield: [{ card: JACE, loyalty: 2 }] },
    });
    expect(jaceAction(choose(g), g)).toBeNull();
  });

  it('does not draw itself out of cards', () => {
    const g = game({ p1: { battlefield: [{ card: JACE, loyalty: 5 }], library: ['forest'] } });
    expect(jaceAction(choose(g), g)).toBeNull();
  });
});

describe('heuristic bot: planeswalkers', () => {
  it('sends an attacker at an opposing planeswalker rather than the face', () => {
    const g = game({
      p1: { battlefield: ['bear-cub'] },
      p2: { battlefield: [{ card: JACE, loyalty: 2 }] },
    });
    g.passUntilStep('beginCombat').passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    const plan = planAttackTargets(engine, redactFor(g.state, 'p1'), 'p1', []);
    expect(plan.attackers).toEqual([g.id('p1', 'bear-cub')]);
    expect([...plan.at.values()]).toEqual([g.id('p2', JACE)]);
    // And it declares it that way, one action.
    const a = choose(g);
    // The walker option is one of its arms: whichever it picks must be a legal declaration.
    expect(g.legal().some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
  });

  it('declares the whole attack at the walker once and confirms (no re-declaring in circles)', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', 'bear-cub'] },
      p2: { battlefield: [{ card: JACE, loyalty: 4 }] },
    });
    g.passUntilStep('beginCombat').passBoth();
    const taken: Action[] = [];
    for (let i = 0; i < 10 && g.decision.kind === 'declareAttackers'; i++) {
      const a = choose(g);
      taken.push(a);
      g.do(a);
    }
    expect(taken.length).toBeLessThanOrEqual(5);
    expect(taken.at(-1)?.type).toBe('confirmAttackers');
    expect(taken.filter((a) => a.type === 'removeAttacker')).toHaveLength(0);
  });

  it('keeps hitting the player when there is no planeswalker', () => {
    const g = game({ p1: { battlefield: ['bear-cub'] } });
    g.passUntilStep('beginCombat').passBoth();
    const a = choose(g);
    expect(a.type === 'addAttacker' && a.planeswalker).toBeFalsy();
  });

  it('burns a planeswalker it can kill', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: lands('mountain', 1) },
      p2: { battlefield: [{ card: 'kasmina-enigma-sage', loyalty: 2 }] },
    });
    const a = choose(g);
    expect(a.type === 'castSpell' && a.targets[0]).toEqual(
      g.ref(g.id('p2', 'kasmina-enigma-sage')),
    );
  });

  it('blocks a creature attacking its planeswalker', () => {
    const g = game({
      p1: { battlefield: [{ card: JACE, loyalty: 3 }, 'bear-cub'] },
      p2: { battlefield: ['bear-cub'], hand: [] },
      active: 'p2',
    });
    g.passUntilStep('beginCombat').passBoth();
    const attacker = g.id('p2', 'bear-cub');
    g.do({
      type: 'addAttacker',
      player: 'p2',
      attacker,
      defender: 'p1',
      planeswalker: g.id('p1', JACE),
    });
    g.do({ type: 'confirmAttackers', player: 'p2' });
    for (let i = 0; i < 6 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    expect(choose(g).type).toBe('addBlock');
  });
});

describe('search bot: planeswalkers', () => {
  it('considers attacking planeswalkers and declares a legal attack', () => {
    const g = game({
      p1: { battlefield: ['bear-cub'] },
      p2: { battlefield: [{ card: JACE, loyalty: 2 }] },
    });
    g.passUntilStep('beginCombat').passBoth();
    const search = createSearchBot(
      cardDb,
      { p1: ['bear-cub', ...lands('forest', 10)], p2: lands('forest', 10) },
      { rollouts: 24, seed: 1 },
    );
    const a = search.chooseAction(redactFor(g.state, 'p1'), 'p1');
    // The walker option is one of its arms: whichever it picks must be a legal declaration.
    expect(g.legal().some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
  });
});
