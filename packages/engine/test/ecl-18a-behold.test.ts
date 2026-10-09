import { describe, expect, it } from 'vitest';
import { casts, Game, scenario } from './ecl-fixtures.ts';

describe('flashback that beholds several cards (Kindle the Inner Flame)', () => {
  it('beholds three Elementals from the battlefield and your hand; the ones in hand are revealed', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['kindle'],
          hand: ['elemental', 'elemental'],
          battlefield: ['mountain', 'elemental'],
        },
      }),
    );
    const kindle = g.id('p1', 'kindle', 'graveyard');
    const options = casts(g, 'p1', kindle);
    // Three Elementals in all: one choice, the permanent first and both in hand.
    expect(options).toHaveLength(1);
    expect(options[0]!.beholdCards).toHaveLength(3);
    g.do(options[0]!);
    expect(g.events.filter((e) => e.type === 'cardsRevealed')).toHaveLength(2);
    // Flashback exiles it afterwards.
    g.passBoth();
    expect(g.zoneOf(kindle)).toBe('exile');
    // The beholding changed nothing about the cards.
    expect(g.state.players.p1.hand).toHaveLength(3);
  });

  it("can't be flashed back with fewer than three Elementals", () => {
    const g = new Game(
      scenario({
        p1: { graveyard: ['kindle'], hand: ['elemental'], battlefield: ['mountain', 'elemental'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 'kindle', 'graveyard'))).toHaveLength(0);
  });

  it('offers each distinct way of choosing when there are more than three', () => {
    const g = new Game(
      scenario({
        p1: {
          graveyard: ['kindle'],
          hand: ['elemental', 'bear'],
          battlefield: ['mountain', 'elemental', { card: 'elemental', tapped: true }, 'elemental'],
        },
      }),
    );
    const options = casts(g, 'p1', g.id('p1', 'kindle', 'graveyard'));
    // Untapped x2, tapped x1 and one in hand: choose 3 of those four kinds of Elemental, counting alike ones once.
    expect(options.length).toBeGreaterThan(1);
    expect(options.length).toBeLessThanOrEqual(4);
  });
});
