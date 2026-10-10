import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { TDM_COLORLESS } from '../src/tdm/colorless.ts';
import { TDM_TWO_COLOUR } from '../src/tdm/two-colour.ts';
import { engine, n } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b (two-colour and colorless): random games over decks of these cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const CARDS = [...Object.keys(TDM_TWO_COLOUR), ...Object.keys(TDM_COLORLESS)].map(slug);
const BASICS = ['plains', 'island', 'swamp', 'mountain', 'forest'];
const deck = (offset: number): string[] => {
  const cards = [...CARDS.slice(offset), ...CARDS.slice(0, offset)];
  const lands = BASICS.flatMap((b) => n(b, 5));
  // Dragons for the Dragon cards, and spells to count.
  const filler = ['firespitter-whelp', 'sol-ring', 'llanowar-elves', 'giant-growth', 'think-twice'];
  return [...lands, ...cards, ...cards.slice(0, 6), ...filler.flatMap((f) => n(f, 2))].slice(0, 60);
};

describe('random games with the two-colour and colorless cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const decks = { p1: deck(seed % CARDS.length), p2: deck((seed * 7) % CARDS.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
