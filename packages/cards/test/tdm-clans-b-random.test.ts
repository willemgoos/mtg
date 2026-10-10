import { describe, expect, it } from 'vitest';
import { playRandomGame } from '@mtg/engine';
import { TDM_CLANS_B } from '../src/tdm/clans-b.ts';
import { engine, n } from './blb-helpers.ts';

// Tarkir: Dragonstorm 19b (Mardu and Temur): random games over three-colour decks of these cards (every legal action offered must be accepted).

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const ALL = Object.keys(TDM_CLANS_B).map(slug);
const lands = (a: string, b: string, c: string) => [...n(a, 8), ...n(b, 8), ...n(c, 8)];
const MARDU = ALL.filter((id) =>
  [
    'all-out-assault',
    'bone-cairn-butcher',
    'defibrillating-current',
    'inevitable-defeat',
    'neriv-heart-of-the-storm',
    'reigning-victor',
    'sonic-shrieker',
    'thunder-of-unity',
    'mardu-siegebreaker',
    'zurgo-thunders-decree',
  ].includes(id),
);
const TEMUR = ALL.filter((id) => !MARDU.includes(id));
const deck = (cards: string[], lands3: string[], offset: number): string[] => {
  const rotated = [...cards.slice(offset), ...cards.slice(0, offset)];
  return [...lands3, ...rotated, ...rotated, ...rotated].slice(0, 60);
};

describe('random games with the Mardu and Temur cards', () => {
  it('play to completion', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const decks = {
        p1: deck(MARDU, lands('mountain', 'plains', 'swamp'), seed % MARDU.length),
        p2: deck(TEMUR, lands('forest', 'island', 'mountain'), (seed * 3) % TEMUR.length),
      };
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 104729);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 180_000);
});
