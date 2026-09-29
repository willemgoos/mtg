import { createEngine, playRandomGame } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, deckById, deckIds } from '../src/index.ts';

const engine = createEngine(cardDb);
const decks = {
  p1: deckIds(deckById('path-of-power')),
  p2: deckIds(deckById('might-of-the-legion')),
};

describe('random vs random', () => {
  it('plays full games to completion', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919, {
        onEvents: (events) => {
          for (const e of events)
            if (e.type === 'objectMoved' && e.to === 'battlefield') seen.add(e.defId);
          for (const e of events)
            if (e.type === 'spellCast' || e.type === 'abilityActivated') seen.add(e.type);
        },
      });
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.winner).not.toBeNull();
      expect(r.final.decision.kind).toBe('gameOver');
    }
    expect(seen.has('spellCast')).toBe(true);
    expect(seen.has('abilityActivated')).toBe(true);
  });

  it('plays two-colour games with lands that enter tapped and scry', () => {
    const gruul = {
      p1: deckIds(deckById('cat-attack')),
      p2: deckIds(deckById('vampiric-hunger')),
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const r = playRandomGame(engine, engine.newGame({ decks: gruul, seed }), seed * 104729, {
        onEvents: (events) => {
          for (const e of events) seen.add(e.type);
        },
      });
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
    expect(seen.has('scried')).toBe(true);
  });

  it('is fully reproducible from the seeds', () => {
    const a = playRandomGame(engine, engine.newGame({ decks, seed: 5 }), 99);
    const b = playRandomGame(engine, engine.newGame({ decks, seed: 5 }), 99);
    expect(b.actions).toEqual(a.actions);
    expect(b.final).toEqual(a.final);
  });

  it('replaying the recorded actions reproduces the game (with validation on)', () => {
    const initial = engine.newGame({ decks, seed: 11 });
    const r = playRandomGame(engine, initial, 3);
    let s = initial;
    for (const a of r.actions) s = engine.applyAction(s, a).state;
    expect(s).toEqual(r.final);
  });
});
