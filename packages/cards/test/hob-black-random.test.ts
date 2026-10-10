import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { HOB_BLACK } from '../src/hob/black.ts';
import { engine, n } from './blb-helpers.ts';

// The Hobbit 20b (black): random games over decks of the black cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const BLACK = Object.keys(HOB_BLACK).map(slug);
const deck = (offset: number): string[] => {
  const cards = [...BLACK.slice(offset), ...BLACK.slice(0, offset)];
  return [...n('swamp', 24), ...cards, ...cards].slice(0, 60);
};

describe('random games with the black cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const decks = { p1: deck(seed % BLACK.length), p2: deck((seed * 5) % BLACK.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
