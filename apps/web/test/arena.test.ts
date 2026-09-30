import { afterEach, describe, expect, it, vi } from 'vitest';
import { arenaBatchGate, arenaReactions, loadArenaDetail } from '../src/game/arena.ts';

describe('arena presentation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('ignores historical and repeated batches', () => {
    const accept = arenaBatchGate(5);
    expect(accept(0)).toBe(false);
    expect(accept(5)).toBe(false);
    expect(accept(6)).toBe(true);
    expect(accept(6)).toBe(false);
    expect(accept(7)).toBe(true);
    expect(arenaBatchGate(7)(7)).toBe(false);
  });

  it('does not celebrate fizzles or add reactions for foreground-only cues', () => {
    expect(
      arenaReactions([
        { kind: 'resolve', id: 'spell', hue: 'U', fizzled: true },
        { kind: 'mana', id: 'land', hue: 'G' },
        { kind: 'attack', id: 'creature', defender: 'p2' },
      ]),
    ).toEqual([]);
  });

  it('colors casts and resolutions and waits for permanent arrival', () => {
    expect(
      arenaReactions([
        { kind: 'cast', id: 'spell', hue: 'U' },
        { kind: 'resolve', id: 'spell', hue: 'U', fizzled: false },
        { kind: 'land', id: 'creature', hue: 'G', weight: 30, flew: true },
      ]),
    ).toMatchObject([
      { kind: 'runes', hue: 'U', delay: 0, duration: 450 },
      { kind: 'surface', hue: 'U', delay: 0 },
      { kind: 'impact', target: { object: 'creature' }, strength: 0.22, delay: 470 },
    ]);
  });

  it('caps combat pulses and maps both player and creature targets', () => {
    expect(
      arenaReactions([
        { kind: 'hit', source: 'a', to: { player: 'p2' }, amount: 100, hue: 'G', combat: true },
        {
          kind: 'hit',
          source: 'a',
          to: { object: { id: 'b', zcc: 0 } },
          amount: 1,
          hue: 'G',
          combat: true,
        },
        { kind: 'hit', source: 'a', to: { player: 'p2' }, amount: 3, hue: 'R', combat: false },
      ]),
    ).toMatchObject([
      { kind: 'impact', target: { player: 'p2' }, strength: 0.24, duration: 350 },
      { kind: 'impact', target: { object: 'b' }, hue: 'R' },
    ]);
  });

  it('defaults safely when browser storage is unavailable', () => {
    expect(loadArenaDetail()).toBe('balanced');
  });

  it('restores valid preferences and ignores unknown values', () => {
    for (const value of ['balanced', 'low', 'static', 'invalid', null]) {
      vi.stubGlobal('localStorage', { getItem: () => value });
      expect(loadArenaDetail()).toBe(value === 'low' || value === 'static' ? value : 'balanced');
    }
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage blocked');
      },
    });
    expect(loadArenaDetail()).toBe('balanced');
  });
});
