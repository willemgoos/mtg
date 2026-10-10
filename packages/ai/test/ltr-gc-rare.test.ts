import { createEngine, redactFor, type Action } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// The Lord of the Rings (21d, green and colorless rares): the bots play the cards (every new decision gets an answer).

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);

const CARDS = [
  'delighted-halfling',
  'elven-chorus',
  'fall-of-gil-galad',
  'fangorn-tree-shepherd',
  'last-march-of-the-ents',
  'legolas-master-archer',
  'radagast-the-brown',
  'the-ring-goes-south',
  'and-ril-flame-of-the-west',
  'barad-d-r',
  'glamdring',
  'horn-of-gondor',
  'horn-of-the-mark',
  'minas-tirith',
  'mines-of-moria',
  'mithril-coat',
  'mount-doom',
  'palant-r-of-orthanc',
  'phial-of-galadriel',
  'rivendell',
  'sting-the-glinting-dagger',
  'the-one-ring',
  'the-shire',
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

describe('bots play the green and colorless Lord of the Rings rares', () => {
  it('every card name is in cardDb', () => {
    for (const id of CARDS) expect(cardDb.get(id), id).toBeDefined();
  });

  for (const seed of [1, 2, 3, 4]) {
    it(`plays a whole game of decks full of them to the end (seed ${seed})`, () => {
      const fillers = [
        ...Array<string>(8).fill('forest'),
        ...Array<string>(4).fill('swamp'),
        ...Array<string>(4).fill('mountain'),
        ...Array<string>(4).fill('plains'),
        ...Array<string>(4).fill('island'),
        'enraged-huorn',
        'enraged-huorn',
        'savannah-lions',
        'savannah-lions',
        'ordinary-bear',
        'meriadoc-brandybuck',
        'glorfindel-dauntless-rescuer',
        'shock',
        'giant-growth',
      ];
      const deck = (s: number) => shuffled([...CARDS, ...CARDS, ...fillers], s);
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
      expect(seen.size).toBeGreaterThan(1);
      expect(actions).toBeGreaterThan(50);
    });
  }

  it('Last March of the Ents: puts its most expensive creature card onto the battlefield first, until none is left', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['last-march-of-the-ents', 'savannah-lions', 'ordinary-bear', 'enraged-huorn'],
          battlefield: [
            'forest',
            'forest',
            'forest',
            'forest',
            'forest',
            'forest',
            'forest',
            'forest',
            'ordinary-bear',
          ],
        },
      }),
    );
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'last-march-of-the-ents', 'hand'),
      targets: [],
    });
    const picked: string[] = [];
    for (let i = 0; i < 20 && g.decision.kind !== 'gameOver'; i++) {
      const d = g.decision;
      if (d.kind === 'chooseOption') {
        const a = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
        if (a.type === 'chooseOption') picked.push(d.options[a.index]!.label);
        g.do(a);
      } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(picked).toEqual(['Enraged Huorn', 'Ordinary Bear', 'Savannah Lions']);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'enraged-huorn')).toHaveLength(1);
  });

  it("Mount Doom: the bot keeps its own best creatures and never an opponent's", () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          battlefield: [
            'mount-doom',
            'mithril-coat',
            'savannah-lions',
            'ordinary-bear',
            'enraged-huorn',
            ...Array<string>(4).fill('swamp'),
            ...Array<string>(3).fill('mountain'),
          ],
        },
        p2: { battlefield: ['serra-angel', 'fog-bank'] },
      }),
    );
    const doom = g.id('p1', 'mount-doom');
    const act = g
      .legal()
      .find((a) => a.type === 'activateAbility' && a.source === doom && a.abilityIndex === 3);
    expect(act).toBeDefined();
    g.do(act!);
    const picked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = g.decision;
      if (d.kind === 'chooseOption') {
        const a = bot.chooseAction(redactFor(g.state, 'p1'), 'p1');
        if (a.type === 'chooseOption') picked.push(d.options[a.index]!.label);
        g.do(a);
      } else if (d.kind === 'priority' && g.state.stack.length) g.pass();
      else break;
    }
    expect(picked).toEqual(['Enraged Huorn (yours)', 'Ordinary Bear (yours)']);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'enraged-huorn')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'serra-angel')).toHaveLength(0);
    expect(g.state.battlefield.filter((id) => g.obj(id).defId === 'savannah-lions')).toHaveLength(
      0,
    );
  });
});
