import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Tarkir: Dragonstorm 19b (red): the heuristic bots play whole games with every red card, answering the new prompts
// (Twin Bolt's divide, Breaching Dragonstorm's free cast, Seize Opportunity's targets, Magmatic Hellkite's search).

describe('heuristic bots with the Tarkir: Dragonstorm red cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/tdm-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'red')
      .map(([name]) => slug(name));
    const deck = [
      ...cards,
      ...cards.slice(0, 3),
      ...Array<string>(14).fill('mountain'),
      ...Array<string>(4).fill('island'),
      ...Array<string>(2).fill('evolving-wilds'),
    ];
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
