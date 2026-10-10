import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// The Lord of the Rings (21b, blue): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const BLUE = [
  'ioreth-of-the-healing-house',
  'willow-wind',
  'knights-of-dol-amroth',
  'l-rien-revealed',
  'sarumans-trickery',
  'saruman-the-white',
  'bill-ferny-bree-swindler',
  'nimrodel-watcher',
  'elrond-lord-of-rivendell',
  'arwens-gift',
  'isolation-at-orthanc',
  'councils-deliberation',
  'pelargir-survivor',
  'meneldor-swift-savior',
  'ithilien-kingfisher',
  'glorious-gale',
  'bewitching-leechcraft',
  'elvish-mariner',
  'minas-tirith-garrison',
  'the-bath-song',
  'captain-of-umbar',
  'horses-of-the-bruinen',
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

describe('bots play the blue Lord of the Rings cards', () => {
  it('every card name is in cardDb', () => {
    for (const id of BLUE) expect(cardDb.get(id), id).toBeDefined();
  });

  for (const seed of [1, 2, 3, 4]) {
    it(`plays a whole game of blue decks to the end (seed ${seed})`, () => {
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
      expect(seen.size).toBeGreaterThan(3);
      expect(actions).toBeGreaterThan(50);
    });
  }
});
