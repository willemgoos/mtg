import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { WOE_BLUE } from '../src/woe/blue.ts';
import { engine, n } from './blb-helpers.ts';

// Wilds of Eldraine (23b, blue): random games over decks of the blue cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const BLUE = Object.keys(WOE_BLUE).map(slug);
const deck = (offset: number): string[] => {
  const cards = [...BLUE.slice(offset), ...BLUE.slice(0, offset)];
  return [...n('island', 12), ...n('plains', 4), ...n('forest', 4), ...cards, ...cards].slice(
    0,
    60,
  );
};

describe('random games with the blue cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const decks = { p1: deck(seed % BLUE.length), p2: deck((seed * 5) % BLUE.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
