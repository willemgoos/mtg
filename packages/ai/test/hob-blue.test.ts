import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// The Hobbit (20b, blue): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const BLUE = [
  'wizards-staff',
  'uncover-the-moon-letters',
  'gandalf-wandering-wizard',
  'riddles-in-the-dark',
  'most-decrepit-old-bird',
  'elrond-moon-reader',
  'lake-town-mariners',
  'bilbo-thief-in-the-night',
  'old-fat-spider-cant-see-me',
  'bilbo-baggins-burglar',
  'fateful-discovery',
  'bilbo-luckwearer',
  'the-lord-of-the-eagles',
  'elvenkings-harper',
  'confusticate-and-bebother',
  'roll-roll-roll-roll',
  'lakeshore-apothecary',
  'ravenhill-flock',
  'enchanted-rivers-grasp',
  'mirkwood-meditator',
  'masters-councillors',
  'plunder-the-trollshaws',
  'great-gilded-boat',
  'elven-raft-steerer',
  'long-lake-nuisance',
  'sound-the-trumpets',
  'uneasy-partings',
  'thranduils-decree',
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

describe('bots play the blue Hobbit cards', () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`plays a whole game of blue Hobbit decks to the end (seed ${seed})`, () => {
      const deck = (s: number) => [
        ...shuffled([...BLUE, ...BLUE, ...Array<string>(24).fill('island')], s),
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
      const seen = new Set<string>();
      let actions = 0;
      while (g.decision.kind !== 'gameOver' && actions < 3000) {
        const p = g.actor;
        const a: Action = bot.chooseAction(redactFor(g.state, p), p);
        g.do(a);
        if (a.type === 'castSpell') seen.add(g.obj(a.card).defId);
        actions++;
      }
      // The bots cast a good share of the cards without any decision stalling or throwing.
      expect(seen.size).toBeGreaterThan(5);
      expect(actions).toBeGreaterThan(50);
    });
  }

  it('answers Riddles in the Dark (splits the piles, and the opponent picks one)', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          battlefield: ['island', 'island', 'island'],
          hand: ['riddles-in-the-dark'],
          library: ['shock', 'forest', 'island', 'savannah-lions', 'plains', 'plains'],
        },
      }),
    );
    for (
      let i = 0;
      i < 40 && g.state.players.p1.hand.length === 0 && g.decision.kind !== 'gameOver';
      i++
    ) {
      const p = g.actor;
      g.do(bot.chooseAction(redactFor(g.state, p), p));
    }
    expect(g.state.players.p1.hand.length).toBeGreaterThan(0);
  });
});
