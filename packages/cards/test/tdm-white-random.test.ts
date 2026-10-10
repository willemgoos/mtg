import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { TDM_WHITE } from '../src/tdm/white.ts';
import { engine, n } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b (white): random games over decks of the white cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const WHITE = Object.keys(TDM_WHITE).map(slug);
const deck = (offset: number): string[] => {
  const cards = [...WHITE.slice(offset), ...WHITE.slice(0, offset)];
  return [...n('plains', 24), ...cards, ...cards].slice(0, 60);
};

describe('random games with the white cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const decks = { p1: deck(seed % WHITE.length), p2: deck((seed * 5) % WHITE.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
