import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { TDM_CLANS } from '../src/tdm/clans.ts';
import { engine, n } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b (clans): random games over three-colour decks of the clans cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const CLANS = Object.keys(TDM_CLANS).map(slug);
const BASICS = ['plains', 'island', 'swamp', 'mountain', 'forest'];
const deck = (offset: number): string[] => {
  const cards = [...CLANS.slice(offset), ...CLANS.slice(0, offset)];
  const lands = BASICS.flatMap((b) => n(b, 5));
  return [...lands, ...cards, ...cards].slice(0, 60);
};

describe('random games with the clans cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const decks = { p1: deck(seed % CLANS.length), p2: deck((seed * 7) % CLANS.length) };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 240_000);
});
