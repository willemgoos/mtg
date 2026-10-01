import type { ObjectId } from '@mtg/engine';

/** Keep the chosen order, remove departed cards, and append newly drawn cards. */
export function reconcileHandOrder(hand: ObjectId[], order: ObjectId[]): ObjectId[] {
  const remaining = new Set(hand);
  const result = order.filter((id) => remaining.delete(id));
  return [...result, ...remaining];
}

export function moveHandCard(hand: ObjectId[], id: ObjectId, index: number): ObjectId[] {
  if (!hand.includes(id)) return hand;
  const result = hand.filter((card) => card !== id);
  result.splice(Math.max(0, Math.min(result.length, index)), 0, id);
  return result;
}

/** Fixed slot centres keep animated neighbours from changing the insertion point. */
export function handIndexAt(centres: number[], x: number): number {
  for (let i = 0; i < centres.length - 1; i++) {
    if (x < (centres[i]! + centres[i + 1]!) / 2) return i;
  }
  return Math.max(0, centres.length - 1);
}
