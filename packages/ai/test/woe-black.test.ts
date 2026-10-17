import { readFileSync } from 'node:fs';
import { createEngine, redactFor } from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine 23b (black): the heuristic bots play whole games with every black card, answering the new prompts
// (Back for Seconds' battlefield choice, Rowan's Grim Search's cards put back, Ashiok's exile choice, the modal Butcher).

describe('heuristic bots with the Wilds of Eldraine black cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/woe-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'black')
      .map(([name]) => slug(name));
    const deck = [...cards, ...cards.slice(0, 6), ...Array<string>(20).fill('swamp')];
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 4; seed++) {
      const r = playMatch(
        engine,
        { p1: deck, p2: deck },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { maxActions: 4000 },
      );
      expect(r.actions.length, `seed ${seed}`).toBeGreaterThan(50);
    }
  }, 180_000);
});

describe('heuristic bots and the new prompts', () => {
  const engine = createEngine(cardDb);
  const game = (spec: ScenarioSpec) => new GameDriver(engine, buildScenario(cardDb, spec));
  const bot = createHeuristicBot(cardDb);
  const swamps = (n: number) => Array<string>(n).fill('swamp');
  const step = (g: GameDriver) => g.do(bot.chooseAction(redactFor(g.state, g.actor), g.actor));

  it('uses Ashiok, Wicked Manipulator in its main phase', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'ashiok-wicked-manipulator', loyalty: 5 }],
        library: ['serra-angel', 'savannah-lions', 'forest', 'forest'],
      },
    });
    const a = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
    expect(a.type).toBe('activateAbility');
    g.do(a);
    for (let i = 0; i < 10 && g.decision.kind !== 'priority'; i++) step(g);
    expect(g.obj(g.id('p1', 'ashiok-wicked-manipulator')).counters?.loyalty).not.toBe(5);
  });

  it("answers Back for Seconds' and Rowan's Grim Search's prompts", () => {
    const g = game({
      p1: {
        hand: ['back-for-seconds'],
        battlefield: [...swamps(3), 'food-token'],
        graveyard: ['savannah-lions', 'llanowar-elves'],
      },
    });
    for (let i = 0; i < 40; i++) {
      step(g);
      if (g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'back-for-seconds')) break;
    }
    for (let i = 0; i < 10 && g.decision.kind !== 'priority'; i++) step(g);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === 'back-for-seconds')).toBe(
      true,
    );
    expect(g.state.players.p1.hand.length + g.state.battlefield.length).toBeGreaterThan(4);
    const h = game({
      p1: {
        hand: ['rowans-grim-search'],
        battlefield: [...swamps(3), 'food-token'],
        library: [
          'serra-angel',
          'savannah-lions',
          'llanowar-elves',
          'shivan-dragon',
          'forest',
          'forest',
        ],
      },
    });
    for (let i = 0; i < 40; i++) {
      step(h);
      if (h.state.players.p1.graveyard.some((id) => h.obj(id).defId === 'rowans-grim-search'))
        break;
    }
    for (let i = 0; i < 10 && h.decision.kind !== 'priority'; i++) step(h);
    expect(h.state.players.p1.hand).toHaveLength(2);
  });
});
