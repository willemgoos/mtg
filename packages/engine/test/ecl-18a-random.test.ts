import { describe, expect, it } from 'vitest';
import { createRng, nextInt } from '../src/rng.ts';
import type { Action } from '../src/types.ts';
import { DB, ECL, engine } from './ecl-fixtures.ts';

// Random games over the Lorwyn Eclipsed fixtures: every action the engine offers must be accepted (applyAction
// validates it against the legal actions), nothing may throw, and a game must replay the same way.

const NONLAND = ECL.filter((c) => !c.types.includes('Land') && !c.noManaCost && !c.isToken).map(
  (c) => c.id,
);
const deck = (offset: number): string[] => {
  const cards = [...NONLAND.slice(offset), ...NONLAND.slice(0, offset)];
  return [
    ...Array<string>(8).fill('mountain'),
    ...Array<string>(8).fill('forest'),
    ...Array<string>(6).fill('swamp'),
    ...Array<string>(6).fill('plains'),
    ...Array<string>(6).fill('island'),
    ...cards,
    ...cards,
  ].slice(0, 60);
};

function play(seed: number): string {
  let state = engine.newGame({ decks: { p1: deck(seed), p2: deck(seed * 7 + 3) }, seed });
  const rng = createRng(seed + 1000);
  const log: string[] = [];
  for (let i = 0; i < 700 && !state.winner; i++) {
    const d = state.decision;
    if (d.kind === 'gameOver') break;
    const legal = engine.getLegalActions(state, d.player);
    expect(legal.length).toBeGreaterThan(0);
    const action: Action = legal[nextInt(rng, legal.length)]!;
    state = engine.applyAction(state, action).state;
    log.push(action.type);
  }
  return `${log.length}:${state.turn.number}:${state.players.p1.life}:${state.players.p2.life}`;
}

describe('random games over the Lorwyn Eclipsed fixtures', () => {
  it('only offers legal actions and replays the same way', () => {
    for (let seed = 1; seed <= 25; seed++) expect(play(seed)).toBe(play(seed));
    expect(DB.size).toBeGreaterThan(50);
  });
});
