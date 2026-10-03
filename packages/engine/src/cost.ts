import type { ManaCost, ManaType } from './types.ts';

/** Mana value of a cost: generic + coloured + hybrid pips (X counts as 0). */
export function manaValue(cost: ManaCost): number {
  let n = cost.generic + (cost.hybrid?.length ?? 0) + 2 * (cost.twoHybrid?.length ?? 0);
  for (const v of Object.values(cost.colored)) n += v ?? 0;
  return n;
}

export function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const colored = { ...a.colored };
  for (const [k, v] of Object.entries(b.colored) as [ManaType, number][])
    colored[k] = (colored[k] ?? 0) + v;
  const hybrid = [...(a.hybrid ?? []), ...(b.hybrid ?? [])];
  // Secrets of Strixhaven (14b): {2/R} pips.
  const twoHybrid = [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])];
  return {
    generic: a.generic + b.generic,
    colored,
    ...(hybrid.length ? { hybrid } : {}),
    ...(twoHybrid.length ? { twoHybrid } : {}),
  };
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

/**
 * A cost reduced by another cost (power-up: "reduce the cost by its mana cost").
 * Coloured pips take off matching pips, then generic (rule 118.7c); hybrid pips
 * take off a matching hybrid pip, then a pip of either colour, then generic.
 */
export function reduceCost(cost: ManaCost, by: ManaCost): ManaCost {
  const colored = { ...cost.colored };
  const hybrid = [...(cost.hybrid ?? [])];
  let generic = cost.generic - by.generic;
  for (const [k, v] of Object.entries(by.colored) as [ManaType, number][]) {
    const off = Math.min(v, colored[k] ?? 0);
    if (off) colored[k] = colored[k]! - off;
    generic -= v - off;
  }
  for (const [a, b] of by.hybrid ?? []) {
    const i = hybrid.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (i >= 0) hybrid.splice(i, 1);
    else if (colored[a]) colored[a]!--;
    else if (colored[b]) colored[b]!--;
    else generic--;
  }
  for (const k of Object.keys(colored) as ManaType[]) if (!colored[k]) delete colored[k];
  return {
    generic: Math.max(0, generic),
    colored,
    ...(hybrid.length ? { hybrid } : {}),
    ...(cost.twoHybrid?.length ? { twoHybrid: cost.twoHybrid } : {}),
    ...(cost.x ? { x: cost.x } : {}),
  };
}
