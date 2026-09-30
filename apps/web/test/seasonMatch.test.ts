import { cardDb } from '@mtg/cards';
import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { createSeasonSave, replaySeasonMatch, SEASON_STARTERS } from '../src/game/season.ts';
import {
  finishSeasonMatch,
  queueSeasonMatch,
  recordSeasonAction,
  resumeSeasonGame,
} from '../src/game/seasonMatch.ts';
import { createSeasonRepository } from '../src/game/seasonStorage.ts';
import { passToTurn } from './seasonFixtures.ts';

const fresh = (seed = 7) => createSeasonSave('a', 'Season', SEASON_STARTERS[0]!.id, seed, 100);

describe('Season playable match integration', () => {
  it('samples skill and deck independently and keeps queueing reproducible', () => {
    const samples = Array.from({ length: 400 }, (_, i) => queueSeasonMatch(fresh(i), 101));
    const tally = { easy: 0, heuristic: 0, search: 0 };
    for (const s of samples) tally[s.match!.bot]++;
    expect(tally.easy).toBeGreaterThan(70);
    expect(tally.easy).toBeLessThan(130);
    expect(tally.heuristic).toBeGreaterThan(160);
    expect(tally.heuristic).toBeLessThan(240);
    expect(tally.search).toBeGreaterThan(70);
    expect(tally.search).toBeLessThan(130);
    expect(new Set(samples.map((s) => s.match!.opponentDeckId)).size).toBe(10);
    expect(queueSeasonMatch(fresh(), 101)).toEqual(queueSeasonMatch(fresh(), 101));
    expect(queueSeasonMatch(fresh(), 101).rng).not.toEqual(fresh().rng);
  });

  it('restores the same game with explicit custom cards and play order', () => {
    const begun = passToTurn(queueSeasonMatch(fresh(), 101), 3);
    const restored = resumeSeasonGame(begun);
    expect(restored.state).toEqual(replaySeasonMatch(begun.match!).state);
    expect(restored.choice.cards).toEqual(begun.match!.decks.p1);
    expect(restored.choice.options?.startingPlayer).toBe(begun.match!.startingPlayer);
    expect(restored.opponent).toBe(begun.match!.bot);
    expect(restored.seed).toBe(begun.match!.seed);
    expect(restored.log.length).toBeGreaterThan(0);
    expect(begun.match!.playerDeckName).toBe(begun.decks[0]!.name);
  });

  it('records concessions using the gate instead of treating them as ordinary losses', () => {
    const begun = queueSeasonMatch(fresh(), 101);
    const action = { type: 'concede', player: 'p1' } as const;
    expect(recordSeasonAction(begun, 1, action, 102).coins).toBe(400);
    const eligible = passToTurn(begun, 5);
    const resolved = recordSeasonAction(eligible, 1, action, 102);
    expect(resolved.coins).toBe(450);
    expect(resolved.lastResult?.outcome).toBe('concede');
    expect(recordSeasonAction(resolved, 1, action, 103)).toBe(resolved);
  });

  it('commits a terminal action and its reward together, and restores an unpaid imported result', () => {
    const engine = createEngine(cardDb);
    const begun = queueSeasonMatch(fresh(), 101);
    const played = playRandomGame(engine, replaySeasonMatch(begun.match!).state, 17);
    const finalAction = played.actions.at(-1)!;
    const before = { ...begun, match: { ...begun.match!, actions: played.actions.slice(0, -1) } };
    expect(replaySeasonMatch(before.match).state.winner).toBeNull();
    const values = new Map<string, string>();
    const repo = createSeasonRepository({
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
    });
    repo.create('a', 'Season', SEASON_STARTERS[0]!.id, 7, 100);
    repo.update('a', () => before);
    repo.update('a', (s) => recordSeasonAction(s, 1, finalAction, 102));
    const paid = repo.load().saves[0]!;
    expect(paid.match).toBeNull();
    expect(paid.coins).toBe(400 + (played.final.winner === 'p1' ? 100 : 50));
    const terminal = { ...begun, match: { ...begun.match!, actions: played.actions } };
    const settled = finishSeasonMatch(terminal, 102);
    expect(settled).toEqual(paid);
    expect(finishSeasonMatch(settled, 103)).toBe(settled);
  });
});
