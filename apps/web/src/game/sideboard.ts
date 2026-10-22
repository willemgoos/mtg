/*
 * The deck builder's sideboard: a "maybe" pile per deck, kept beside the deck while you build.
 * Games are best-of-one, so it never goes into a game. It lives in localStorage under one key,
 * per deck key (e.g. `sealed:<id>`), so no mode's own save has to change. Only the most
 * recently used sideboards are kept.
 */

/** Card name -> copies. */
export type Counts = Readonly<Record<string, number>>;

const KEY = 'mtg.sideboards.v1';
/** Sideboards kept; the least recently changed go first. */
const KEEP = 60;

type Store = Record<string, { at: number; cards: Counts }>;

function read(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Store) : {};
  } catch {
    return {};
  }
}

const clean = (c: unknown): Counts =>
  c && typeof c === 'object'
    ? Object.fromEntries(
        Object.entries(c).filter(([, k]) => Number.isSafeInteger(k) && (k as number) > 0),
      )
    : {};

/** The sideboard saved for a deck (empty when there is none). Never throws. */
export const loadSideboard = (key: string): Counts => clean(read()[key]?.cards);

/** Saves a deck's sideboard; an empty one is removed. */
export function saveSideboard(key: string, cards: Counts): void {
  try {
    const store = read();
    if (Object.keys(cards).length) store[key] = { at: Date.now(), cards };
    else delete store[key];
    const kept = Object.entries(store)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, KEEP);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage unavailable (private mode): the sideboard lasts for this visit.
  }
}

/** Adds `by` copies of `name` (negative takes them out). */
export function bumpSide(c: Counts, name: string, by: number): Counts {
  const n = (c[name] ?? 0) + by;
  const { [name]: _, ...rest } = c;
  return n > 0 ? { ...rest, [name]: n } : rest;
}

/** The sideboard limited to what is still outside the deck: never more copies than `pool` has. */
export function fitSide(side: Counts, pool: Counts): Counts {
  const out: Record<string, number> = {};
  for (const [n, k] of Object.entries(side)) {
    const m = Math.min(k, pool[n] ?? 0);
    if (m > 0) out[n] = m;
  }
  return out;
}

/**
 * Runs a "Suggest a deck" without touching the sideboard: its cards (those still in `b.side`)
 * are held out while `suggest` builds, then go back to the pool.
 */
export function keepingSideboard<B extends { main: Counts; side: Counts }>(
  b: B,
  sideboard: Counts,
  suggest: (b: B) => { main: Counts; side: Counts },
): { main: Counts; side: Counts } {
  const kept = fitSide(sideboard, b.side);
  let side = b.side;
  for (const [n, k] of Object.entries(kept)) side = bumpSide(side, n, -k);
  const out = suggest({ ...b, side });
  let rest = out.side;
  for (const [n, k] of Object.entries(kept)) rest = bumpSide(rest, n, k);
  return { main: out.main, side: rest };
}
