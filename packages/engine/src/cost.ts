import type { ManaCost, ManaType } from './types.ts';

/** Mana value of a cost: generic + coloured + hybrid pips (X counts as 0). */
export function manaValue(cost: ManaCost): number {
  let n = cost.generic + (cost.hybrid?.length ?? 0);
  for (const v of Object.values(cost.colored)) n += v ?? 0;
  return n;
}

export function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const colored = { ...a.colored };
  for (const [k, v] of Object.entries(b.colored) as [ManaType, number][])
    colored[k] = (colored[k] ?? 0) + v;
  const hybrid = [...(a.hybrid ?? []), ...(b.hybrid ?? [])];
  return { generic: a.generic + b.generic, colored, ...(hybrid.length ? { hybrid } : {}) };
}

/**
 * The coloured requirements of a cost, one entry per pip: the types that can
 * pay it (one type, or two for a hybrid pip like {B/G}).
 */
export function pipsOf(cost: ManaCost): ManaType[][] {
  const out: ManaType[][] = [];
  for (const [type, n] of Object.entries(cost.colored) as [ManaType, number][])
    for (let i = 0; i < n; i++) out.push([type]);
  for (const h of cost.hybrid ?? []) out.push(h);
  return out;
}
