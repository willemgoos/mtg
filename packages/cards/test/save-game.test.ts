import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, DECKS, deckIds, isPlayable } from '../src/index.ts';

const engine = createEngine(cardDb);
const playable = DECKS.filter(isPlayable);

// The web app saves the game to localStorage as JSON and resumes from it.
describe('saved games', () => {
  it('resume from a JSON round trip exactly where they left off', () => {
    for (let seed = 1; seed <= playable.length; seed++) {
      const decks = {
        p1: deckIds(playable[seed - 1]!),
        p2: deckIds(playable[(seed * 3) % playable.length]!),
      };
      const initial = engine.newGame({ decks, seed });
      const r = playRandomGame(engine, initial, seed * 7919);
      let state = initial;
      r.actions.forEach((action, i) => {
        if (i % 7 === 0) state = JSON.parse(JSON.stringify(state));
        state = engine.applyAction(state, action).state;
      });
      expect(JSON.stringify(state), `seed ${seed}`).toBe(JSON.stringify(r.final));
    }
  }, 30_000); // one game per playable deck
});
