import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine 23b (red): the heuristic bots play whole games with every red card, answering the prompts (Charming
// Scoundrel's modes, Merry Bards' payment, Stolen Goodies' divide, Redcap Gutter-Dweller's sacrifice, bargain, Role targets).

describe('heuristic bots with the Wilds of Eldraine red cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/woe-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'red')
      .map(([name]) => slug(name));
    expect(cards).toHaveLength(37);
    const deck = [
      ...cards,
      ...cards.slice(0, 3),
      ...Array<string>(12).fill('mountain'),
      ...Array<string>(4).fill('plains'),
      ...Array<string>(2).fill('island'),
      ...Array<string>(2).fill('forest'),
    ];
    const engine = createEngine(cardDb);
    for (let seed = 1; seed <= 4; seed++) {
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
