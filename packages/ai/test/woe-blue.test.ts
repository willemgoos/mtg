import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// Wilds of Eldraine (23b, blue): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const BLUE = [
  'aquatic-alchemist',
  'belunas-gatekeeper',
  'bitter-chill',
  'chancellor-of-tales',
  'elusive-otter',
  'farsight-ritual',
  'freeze-in-place',
  'gadwicks-first-duel',
  'galvanic-giant',
  'horned-loch-whale',
  'ice-out',
  'icewrought-sentry',
  'into-the-fae-court',
  'johanns-stopgap',
  'living-lectern',
  'misleading-motes',
  'obyras-attendants',
  'picklock-prankster',
  'rowdy-research',
  'sleep-cursed-faerie',
  'snaremaster-sprite',
  'spell-stutter',
  'splashy-spellcaster',
  'stormkeld-prowler',
  'storyteller-pixie',
  'succumb-to-the-cold',
  'talions-messenger',
  'tenacious-tomeseeker',
  'threadbind-clique',
  'vantress-transmuter',
  'water-wings',
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

describe('bots play the blue Wilds of Eldraine cards', () => {
  const everSeen = new Set<string>();
  for (const seed of [1, 2, 3, 4]) {
    it(`plays a whole game of blue decks to the end (seed ${seed})`, () => {
      const deck = (s: number) => [
        ...shuffled(
          [
            ...BLUE,
            ...BLUE,
            ...Array<string>(12).fill('island'),
            ...Array<string>(4).fill('plains'),
          ],
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
      const seen = new Set<string>();
      let actions = 0;
      while (g.decision.kind !== 'gameOver' && actions < 4000) {
        const p = g.actor;
        const a: Action = bot.chooseAction(redactFor(g.state, p), p);
        g.do(a);
        if (a.type === 'castSpell') seen.add(g.obj(a.card).defId);
        actions++;
      }
      for (const c of seen) everSeen.add(c);
      expect(seen.size).toBeGreaterThan(2);
    }, 120_000);
  }
  it('cast a good share of the cards between them', () => {
    expect(everSeen.size).toBeGreaterThan(12);
  });
});
