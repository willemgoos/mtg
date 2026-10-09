import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Lorwyn Eclipsed 18b (black): the heuristic bots play whole games with every black card, answering the new prompts
// (Taster of Wares' reveal, Twilight Diviner's copy, Mornsong Aria's search, Bloodline Bidding's type).

describe('heuristic bots with the Lorwyn Eclipsed black cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/ecl-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'black')
      .map(([name]) => slug(name));
    const deck = [...cards, ...cards.slice(0, 3), ...Array<string>(20).fill('swamp')];
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 3; seed++) {
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
