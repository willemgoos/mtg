import { describe, expect, it } from 'vitest';
import { handIndexAt, moveHandCard, reconcileHandOrder } from '../src/game/handOrder.ts';

describe('hand arrangement', () => {
  it('moves cards in both directions, including the ends', () => {
    const hand = ['a', 'b', 'c', 'd'];
    expect(moveHandCard(hand, 'b', 3)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveHandCard(hand, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(hand).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the chosen order across plays and draws, without duplicate or stale ids', () => {
    expect(reconcileHandOrder(['a', 'c', 'd'], ['c', 'b', 'c', 'a'])).toEqual(['c', 'a', 'd']);
    expect(reconcileHandOrder([], ['a'])).toEqual([]);
    expect(moveHandCard(['a'], 'departed', 0)).toEqual(['a']);
  });

  it('uses fixed midpoint boundaries for insertion, clamping to the hand ends', () => {
    const centres = [100, 180, 260, 340];
    expect(handIndexAt(centres, -100)).toBe(0);
    expect(handIndexAt(centres, 139)).toBe(0);
    expect(handIndexAt(centres, 141)).toBe(1);
    expect(handIndexAt(centres, 240)).toBe(2);
    expect(handIndexAt(centres, 1000)).toBe(3);
    expect(handIndexAt([100], 200)).toBe(0);
  });
});
