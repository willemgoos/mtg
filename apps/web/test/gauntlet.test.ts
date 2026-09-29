import { PLAYABLE_DECKS } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  type GauntletState,
  LIVES,
  newRun,
  recordResult,
  ROUNDS,
  roundOf,
  startMatch,
  startRun,
  statusOf,
} from '../src/game/gauntlet.ts';

const deck = PLAYABLE_DECKS.find((d) => d.series === 'starter')!.id;
const empty: GauntletState = { run: null, records: {} };

/** Plays the current round with the given outcome. */
function play(s: GauntletState, outcome: 'win' | 'loss' | 'draw', seed = 7): GauntletState {
  return recordResult(startMatch(s, seed), seed, outcome);
}

describe('gauntlet', () => {
  it('builds a fixed ladder of other decks from the same series', () => {
    const run = newRun(deck, 42);
    expect(run.opponents).toHaveLength(ROUNDS.length);
    expect(run.opponents).not.toContain(deck);
    expect(newRun(deck, 42).opponents).toEqual(run.opponents);
    const series = PLAYABLE_DECKS.find((d) => d.id === deck)!.series;
    for (const id of run.opponents) {
      expect(PLAYABLE_DECKS.find((d) => d.id === id)!.series).toBe(series);
    }
  });

  it('advances on a win and replays the same opponent after a loss', () => {
    let s = startRun(empty, deck, 1);
    s = play(s, 'win');
    expect(roundOf(s.run!)).toBe(1);
    s = play(s, 'loss');
    expect(roundOf(s.run!)).toBe(1);
    s = play(s, 'draw');
    expect(s.run!.results).toEqual(['win', 'loss']);
  });

  it('ends after three losses, keeping the best record', () => {
    let s = startRun(empty, deck, 1);
    s = play(s, 'win');
    s = play(s, 'win');
    for (let i = 0; i < LIVES; i++) s = play(s, 'loss');
    expect(statusOf(s.run!)).toBe('out');
    expect(s.records[deck]).toEqual({ runs: 1, clears: 0, best: 2 });
    // Nothing more counts once the run is over.
    expect(play(s, 'win').run!.results).toEqual(s.run!.results);
  });

  it('counts a clear after winning every round', () => {
    let s = startRun(empty, deck, 1);
    for (let i = 0; i < ROUNDS.length; i++) s = play(s, 'win');
    expect(statusOf(s.run!)).toBe('cleared');
    expect(s.records[deck]).toEqual({ runs: 1, clears: 1, best: ROUNDS.length });
  });

  it('ignores results from a match the run is not waiting on', () => {
    const s = startMatch(startRun(empty, deck, 1), 5);
    expect(recordResult(s, 6, 'win')).toBe(s);
    const once = recordResult(s, 5, 'win');
    expect(recordResult(once, 5, 'win')).toBe(once);
  });
});
