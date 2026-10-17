import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Wilds of Eldraine (23b white): the heuristic bots play whole games with every white card, answering the new prompts
// (Expel the Interlopers' number, Dutiful Griffin's two enchantments, bargain, Roles, the Princess Takes Flight).

describe('heuristic bots with Wilds of Eldraine white cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/woe-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'white')
      .map(([name]) => slug(name));
    const deck = [...cards, ...cards.slice(0, 4), ...Array<string>(21).fill('plains')];
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
  }, 180_000);
});
