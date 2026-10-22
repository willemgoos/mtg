import { describe, expect, it } from 'vitest';
import {
  bumpSide,
  fitSide,
  keepingSideboard,
  loadSideboard,
  saveSideboard,
} from '../src/game/sideboard.ts';

describe('sideboard', () => {
  it('shows only copies still outside the deck', () => {
    expect(fitSide({ A: 2, B: 1, C: 3 }, { A: 1, C: 3 })).toEqual({ A: 1, C: 3 });
  });

  it('adds and takes out copies', () => {
    expect(bumpSide({ A: 1 }, 'A', 1)).toEqual({ A: 2 });
    expect(bumpSide({ A: 1 }, 'A', -1)).toEqual({});
  });

  it('keeps sideboard cards out of a suggested deck and back in the pool', () => {
    const b = { main: { X: 1 }, side: { A: 2, B: 1 } };
    let seen: Record<string, number> = {};
    const out = keepingSideboard(b, { A: 1, Z: 4 }, (held) => {
      seen = { ...held.side };
      // A suggester that puts everything it sees in the deck.
      const main: Record<string, number> = { ...held.main };
      for (const [n, k] of Object.entries(held.side)) main[n] = (main[n] ?? 0) + k;
      return { main, side: {} };
    });
    expect(seen).toEqual({ A: 1, B: 1 });
    expect(out.main).toEqual({ X: 1, A: 1, B: 1 });
    expect(out.side).toEqual({ A: 1 });
  });

  it('saves per deck and drops empty sideboards', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;
    saveSideboard('sealed:a', { A: 2 });
    saveSideboard('sealed:b', { B: 1 });
    expect(loadSideboard('sealed:a')).toEqual({ A: 2 });
    saveSideboard('sealed:a', {});
    expect(loadSideboard('sealed:a')).toEqual({});
    expect(loadSideboard('sealed:b')).toEqual({ B: 1 });
  });
});
