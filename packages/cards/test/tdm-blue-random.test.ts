import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { TDM_BLUE } from '../src/tdm/blue.ts';
import { engine, n } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b (blue): random games over decks of the blue cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const BLUE = Object.keys(TDM_BLUE).map(slug);
const deck = (offset: number): string[] => {
  const cards = [...BLUE.slice(offset), ...BLUE.slice(0, offset)];
  return [...n('island', 22), ...n('forest', 2), ...cards, ...cards].slice(0, 60);
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
