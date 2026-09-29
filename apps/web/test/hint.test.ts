import { cardDb, deckById, deckIds } from '@mtg/cards';
import { createEngine } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { hintFor } from '../src/game/hint.ts';

const engine = createEngine(cardDb);
const decks = { p1: deckIds(deckById('cat-attack')), p2: deckIds(deckById('vampiric-hunger')) };

describe('hints', () => {
  it('advise on the opening hand, then point at a card to play', () => {
    let s = engine.newGame({ decks, seed: 3, startingPlayer: 'p1' });
    const opening = hintFor(s, 'p1')!;
    expect(opening.text).toMatch(/^(Keep|Mulligan)/);
    expect(hintFor(s, 'p2')).toBeNull();
    s = engine.applyAction(s, { type: 'keepHand', player: 'p1' }).state;
    while (s.decision.kind !== 'priority' || s.decision.player !== 'p1') {
      const d = s.decision;
      if (d.kind === 'gameOver') throw new Error('game over');
      const a =
        engine.getLegalActions(s, d.player).find((x) => x.type === 'keepHand') ??
        engine.getLegalActions(s, d.player)[0]!;
      s = engine.applyAction(s, a).state;
    }
    const play = hintFor(s, 'p1')!;
    expect(play.text).toMatch(/^(Play|Cast|Nothing)/);
    if (play.text.startsWith('Play')) expect(play.cards).toHaveLength(1);
  });
});
