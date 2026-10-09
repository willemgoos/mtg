import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { ECL_RED } from '../src/ecl/red.ts';
import { engine, n } from './blb-helpers.ts';

// Lorwyn Eclipsed 18b (red): random games over decks of the red cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const RED = Object.keys(ECL_RED).map(slug);
const deck = (offset: number): string[] => {
  const cards = [...RED.slice(offset), ...RED.slice(0, offset)];
  return [...n('mountain', 24), ...cards, ...cards].slice(0, 60);
};

describe('random games with the red cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const decks = { p1: deck(seed % RED.length), p2: deck((seed * 5) % RED.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
