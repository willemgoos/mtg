import { readFileSync } from 'node:fs';
import { createEngine } from '@mtg/engine';
import { cardDb, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Tarkir: Dragonstorm 19b (green): the heuristic bots play whole games with every green card (Ainok Wayfarer's land choice, Rite of
// Renewal's targets one at a time, Claim Territory's search, Traveling Botanist's top card, the endure choices).

describe('heuristic bots with the Tarkir: Dragonstorm green cards', () => {
  it('finish games without errors', () => {
    const groups: Record<string, string> = JSON.parse(
      readFileSync(new URL('../../cards/scripts/data/tdm-groups.json', import.meta.url), 'utf8'),
    );
    const cards = Object.entries(groups)
      .filter(([, g]) => g === 'green')
      .map(([name]) => slug(name));
    const deck = [...cards, ...cards.slice(0, 8), ...Array<string>(20).fill('forest')];
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
  }, 180_000);
});
