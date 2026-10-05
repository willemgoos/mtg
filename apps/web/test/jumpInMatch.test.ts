import { deckById, jumpInPackets, PACKETS } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETUP,
  fillRandom,
  gameDone,
  isOver,
  nextGame,
  recordGame,
  scoreLine,
  setOf,
  startingPlayer,
  startSeries,
  winner,
} from '../src/game/jumpInMatch.ts';

const [a, b, c, d] = PACKETS.map((p) => p.id);

describe('Jump In matches', () => {
  it('fills empty slots at random, never with a packet already taken', () => {
    for (let i = 0; i < 50; i++) {
      const [x, y] = fillRandom([null, null], [a!, b!]);
      expect(x).not.toBe(y);
      expect([a, b]).not.toContain(x);
      expect([a, b]).not.toContain(y);
    }
    expect(fillRandom([c!, null], [])[0]).toBe(c);
  });

  it('starts from the lobby: your two packets, the bot’s chosen or random', () => {
    const s = startSeries({ ...DEFAULT_SETUP, you: [a!, b!], them: [c!, null] }, 7);
    expect(jumpInPackets(s.you)!.map((p) => p.id)).toEqual([a, b]);
    const them = jumpInPackets(s.them)!.map((p) => p.id);
    expect(them[0]).toBe(c);
    expect([a, b, c]).not.toContain(them[1]);
    expect(deckById(s.them).cards.reduce((n, [, k]) => n + k, 0)).toBe(40);
  });

  it('deals your empty slots too, and only packets of the chosen sets', () => {
    for (let i = 0; i < 50; i++) {
      const s = startSeries({ ...DEFAULT_SETUP, you: [null, null], sets: ['blb'] }, 1);
      const all = [...jumpInPackets(s.you)!, ...jumpInPackets(s.them)!];
      expect(new Set(all.map((p) => p.id)).size).toBe(4);
      for (const p of all) expect(p.set).toBe('blb');
    }
    const s = startSeries({ ...DEFAULT_SETUP, you: [a!, null], sets: ['fdn', 'stx'] }, 1);
    const [mine, other] = jumpInPackets(s.you)!;
    expect(mine!.id).toBe(a);
    expect(['fdn', 'stx']).toContain(setOf(other!));
  });

  it('a best of one is over after a game', () => {
    let s = startSeries({ ...DEFAULT_SETUP, you: [a!, b!], them: [c!, d!] }, 1);
    expect(isOver(s)).toBe(false);
    s = recordGame(s, 1, 'loss');
    expect(winner(s)).toBe('them');
    expect(nextGame(s, 2)).toBe(s);
  });

  it('a best of three: results count once, the loser plays first, two wins take it', () => {
    let s = startSeries({ ...DEFAULT_SETUP, you: [a!, b!], them: [c!, d!], bestOf: 3 }, 1);
    expect(startingPlayer(s, 'p1', 'p2')).toBeUndefined();
    s = recordGame(s, 1, 'win');
    s = recordGame(s, 1, 'win'); // a repeat of the same game
    s = recordGame(s, 99, 'loss'); // another game's seed
    expect(scoreLine(s)).toBe('You lead 1–0');
    expect(gameDone(s)).toBe(true);
    s = nextGame(s, 2);
    expect(startingPlayer(s, 'p1', 'p2')).toBe('p2');
    s = recordGame(s, 2, 'loss');
    expect(scoreLine(s)).toBe('Match tied 1–1');
    s = nextGame(s, 3);
    expect(startingPlayer(s, 'p1', 'p2')).toBe('p1');
    s = recordGame(s, 3, 'win');
    expect(isOver(s)).toBe(true);
    expect(scoreLine(s)).toBe('You win the match 2–1');
  });

  it('a drawn game is replayed', () => {
    let s = startSeries({ ...DEFAULT_SETUP, you: [a!, b!], them: [c!, d!], bestOf: 3 }, 1);
    s = recordGame(s, 1, 'draw');
    s = recordGame(nextGame(s, 2), 2, 'win');
    s = recordGame(nextGame(s, 3), 3, 'loss');
    expect(isOver(s)).toBe(false);
    s = recordGame(nextGame(s, 4), 4, 'win');
    expect(winner(s)).toBe('you');
  });
});
