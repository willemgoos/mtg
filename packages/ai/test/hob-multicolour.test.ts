import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// The Hobbit 20b (multicolour): the heuristic bots answer the new prompts (Silvan Rally's lands, Bolg's sacrifice) and play
// whole games with every card of the group.

const engine = createEngine(cardDb);
const bot = createHeuristicBot(cardDb);
const lands = (n: number, card: string) => Array<string>(n).fill(card);

/** Lets the bot act until the stack is empty and no choice is pending. */
function settle(g: GameDriver, player: 'p1' | 'p2' = 'p1'): void {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'priority' && g.state.stack.length === 0) return;
    if (d.kind === 'priority') {
      g.pass();
      continue;
    }
    const action = bot.chooseAction(g.state, player);
    g.do(action);
  }
}

describe('heuristic bots with the multicolour Hobbit cards', () => {
  it('Silvan Rally: the bot takes the lands milled', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['thranduil-sindarin-liege'],
          battlefield: lands(3, 'forest'),
          library: ['forest', 'island', 'llanowar-elves', 'savannah-lions', 'forest', 'forest'],
        },
      }),
    );
    const cast = g.legal().find((a) => a.type === 'castSpell' && a.back === true)!;
    g.do(cast);
    g.pass();
    g.pass();
    settle(g);
    const inHand = g.state.players.p1.hand.map((id) => g.obj(id).defId).sort();
    expect(inHand).toEqual(['forest', 'island']);
  });

  it('Bolg of the North: the bot finishes the prompt', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['bolg-of-the-north'],
          battlefield: [...lands(3, 'swamp'), ...lands(2, 'mountain'), 'savannah-lions'],
        },
        p2: { battlefield: ['llanowar-elves'] },
      }),
    );
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    g.pass();
    g.pass();
    settle(g);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
  });

  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/hob-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'multicolour')
      .map(([name]) => slug(name));
    const basics = ['plains', 'island', 'swamp', 'mountain', 'forest'];
    const deck = [...cards, ...cards.slice(0, 8), ...basics.flatMap((b) => lands(5, b))];
    for (let seed = 1; seed <= 2; seed++) {
      const r = playMatch(
        engine,
        { p1: deck, p2: deck },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { maxActions: 4000 },
      );
      expect(r.actions.length, `seed ${seed}`).toBeGreaterThan(50);
    }
  }, 120_000);
});
