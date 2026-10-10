import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
import { createHeuristicBot, playMatch } from '../../ai/src/index.ts';
import { cardDb } from '../src/index.ts';
import { THE_HOBBIT_BEHAVIORS } from '../src/the-hobbit.ts';
import { HOB_GREEN } from '../src/hob/green.ts';
import { cast, game, n, settle } from './blb-helpers.ts';
import { bf, done } from './tdm-green-helpers.ts';

// The Hobbit 20b, green: the bots and whole games.

describe('bots', () => {
  it('a bot takes every land with Through the Forest Gate', () => {
    const g = game({
      p1: {
        hand: ['through-the-forest-gate'],
        battlefield: n('forest', 8),
        library: ['island', 'ordinary-bear', 'mountain', ...n('shock', 17), 'plains'],
      },
    });
    cast(g, 'through-the-forest-gate');
    settle(g);
    const bot = createHeuristicBot(cardDb);
    for (let i = 0; i < 6 && g.decision.kind === 'chooseOption'; i++)
      g.do(bot.chooseAction(g.state, 'p1'));
    done(g);
    expect(bf(g, 'island')).toHaveLength(1);
    expect(bf(g, 'mountain')).toHaveLength(1);
    expect(g.life('p1')).toBe(28);
  });
});

describe('whole games with these cards', () => {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const ids = Object.keys(HOB_GREEN).map(slug);
  const lands = ['forest', 'forest', 'island', 'forest', 'mountain'];
  const deck = (offset: number): string[] => [
    ...ids,
    ...ids.slice(offset, offset + 8),
    ...Array.from({ length: 24 }, (_, i) => lands[(i + offset) % lands.length]!),
  ];
  const decks = { p1: deck(0), p2: deck(3) };
  const engine = createEngine(cardDb);

  it('has behaviour for all 28 cards in the merged table', () => {
    expect(Object.keys(HOB_GREEN)).toHaveLength(28);
    for (const name of Object.keys(HOB_GREEN)) expect(THE_HOBBIT_BEHAVIORS[name]).toBeDefined();
  });
  it('random players finish games without stalling', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 120_000);
  it('heuristic bots play whole games too', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const r = playMatch(
        engine,
        decks,
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { maxActions: 3000 },
      );
      expect(r.winner, `seed ${seed}`).not.toBeNull();
    }
  }, 120_000);
});
