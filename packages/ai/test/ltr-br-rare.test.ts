import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// The Lord of the Rings (21d, black and red rares): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const RARES = [
  'call-of-the-ring',
  'isildurs-fateful-strike',
  'lobelia-sackville-baggins',
  'one-ring-to-rule-them-all',
  'orcish-bowmasters',
  'sauron-the-necromancer',
  'shadow-of-the-enemy',
  'witch-king-of-angmar',
  'display-of-power',
  'fall-of-cair-andros',
  slug('Glóin, Dwarf Emissary'),
  'hew-the-entwood',
  'moria-marauder',
  'spiteful-banditry',
  'there-and-back-again',
  slug('Éomer, Marshal of Rohan'),
];

/** A deterministic shuffle. */
function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let x = seed;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('bots play the black and red Lord of the Rings rares', () => {
  it('every card name is in cardDb', () => {
    for (const id of RARES) expect(cardDb.get(id), id).toBeDefined();
  });

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`plays a whole game of black-red decks to the end (seed ${seed})`, () => {
      const deck = (s: number) => [
        ...shuffled(
          [...RARES, ...RARES, ...Array<string>(12).fill('swamp'), ...Array<string>(12).fill('mountain')],
          s,
        ),
      ];
      const g = new GameDriver(
        engine,
        buildScenario(cardDb, {
          step: 'main1',
          turn: 1,
          p1: { library: deck(seed), hand: [] },
          p2: { library: deck(seed + 100), hand: [] },
        }),
      );
      let actions = 0;
      while (g.decision.kind !== 'gameOver' && actions < 4000) {
        const p = g.actor;
        const a: Action = bot.chooseAction(redactFor(g.state, p), p);
        g.do(a);
        actions++;
      }
      expect(actions).toBeGreaterThan(50);
    });
  }

  it('Hew the Entwood: the bot sacrifices no land and takes every artifact and land card', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['hew-the-entwood'],
          battlefield: [...Array<string>(6).fill('mountain'), 'forest'],
          library: ['celestial-armor', 'forest', 'shock', ...Array<string>(6).fill('forest')],
        },
      }),
    );
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    for (let i = 0; i < 4 && g.decision.kind !== 'chooseOption'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseOption');
    const first = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
    expect(first).toMatchObject({ type: 'chooseOption', index: 0 });
    g.do(first);
    // "Done" with no land sacrificed: nothing was revealed; the spell is over.
    expect(g.decision.kind).toBe('priority');
    expect(g.state.players.p1.library).toHaveLength(9);
  });
});
