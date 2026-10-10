import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// The Lord of the Rings (21d, multicolour rares): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const MULTI = [
  'aragorn-company-leader',
  'aragorn-the-uniter',
  'arwen-mortal-queen',
  'doors-of-durin',
  'elrond-master-of-healing',
  'faramir-prince-of-ithilien',
  'flame-of-anor',
  'galadriel-of-lothl-rien',
  'gandalf-the-grey',
  'gimli-mournful-avenger',
  'king-of-the-oathbreakers',
  'lotho-corrupt-shirriff',
  'merry-esquire-of-rohan',
  'pippin-guard-of-the-citadel',
  'samwise-gamgee',
  'saruman-of-many-colors',
  'saurons-ransom',
  'sauron-the-dark-lord',
  'shagrat-loot-bearer',
  'sharkey-tyrant-of-the-shire',
  'shelob-child-of-ungoliant',
  'sm-agol-helpful-guide',
  'the-balrog-durins-bane',
  'tom-bombadil',
  'owyn-fearless-knight',
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

const LANDS = [
  ...Array<string>(6).fill('plains'),
  ...Array<string>(6).fill('island'),
  ...Array<string>(6).fill('swamp'),
  ...Array<string>(6).fill('mountain'),
  ...Array<string>(6).fill('forest'),
];

describe('bots play the multicolour rare Lord of the Rings cards', () => {
  it('every card name is in cardDb', () => {
    for (const id of MULTI) expect(cardDb.get(id), id).toBeDefined();
  });

  for (const seed of [1, 2, 4]) {
    it(`plays a whole game to the end (seed ${seed})`, () => {
      const deck = (s: number) => shuffled([...MULTI, ...MULTI.slice(0, 10), ...LANDS], s);
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

  it('Sauron’s Ransom: the bot separates the cards evenly, and takes the better pile', () => {
    const library = ['serra-angel', 'savannah-lions', 'shock', 'plains', 'forest', 'forest'];
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: { hand: ['saurons-ransom'], battlefield: ['island', 'swamp', 'island'], library },
      }),
    );
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    for (let i = 0; i < 6 && g.decision.kind !== 'splitPiles'; i++) g.pass();
    expect(g.decision.kind).toBe('splitPiles');
    const cards = (g.decision as { cards: string[] }).cards;
    // p2 splits: the Angel (the strongest card) is not alone against the rest.
    const split = bot.chooseAction(redactFor(g.state, 'p2'), 'p2');
    expect(split.type).toBe('splitPiles');
    g.do(split);
    expect(g.decision.kind).toBe('choosePile');
    const faceUp = (g.decision as { faceUp: string[] }).faceUp;
    const faceDown = (g.decision as { faceDown: string[] }).faceDown;
    expect(faceUp.length + faceDown.length).toBe(cards.length);
    const ids = (list: string[]) => list.map((id) => g.obj(id).defId);
    expect(ids(faceUp).includes('serra-angel') && ids(faceDown).includes('serra-angel')).toBe(
      false,
    );
    // p1 chooses a pile.
    const pick = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
    expect(pick.type).toBe('choosePile');
    g.do(pick);
    expect(g.state.players.p1.hand.length).toBeGreaterThan(0);
  });

  it('Pippin: the bot picks Creature when the opponent has creatures, else Instant', () => {
    const run = (theirs: string[]) => {
      const g = new GameDriver(
        engine,
        buildScenario(cardDb, {
          p1: { battlefield: ['pippin-guard-of-the-citadel', 'savannah-lions'] },
          p2: { battlefield: theirs },
        }),
      );
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'pippin-guard-of-the-citadel'),
        abilityIndex: 0,
        targets: [g.ref(g.id('p1', 'savannah-lions'))],
      } as never);
      for (let i = 0; i < 6 && g.decision.kind !== 'chooseOption'; i++) g.pass();
      expect(g.decision.kind).toBe('chooseOption');
      const a = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
      expect(a.type).toBe('chooseOption');
      const d = g.decision as { options: { label: string }[] };
      return d.options[(a as { index: number }).index]!.label;
    };
    expect(run(['serra-angel'])).toBe('Creature');
    expect(run(['forest'])).toBe('Instant');
  });
});
