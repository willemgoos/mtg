import { CONSTRUCTED_OPPONENT_DECKS, deckIds, scryfallById } from '@mtg/cards';
import { isRemoval } from './deckCompletion.ts';
import { manaValue } from './deckView.ts';
import { rateCard } from './limitedRating.ts';

/*
 * A rough 0-100 strength score for a 60-card deck, so Season can pair you with
 * opponents near your deck's level. It adds four parts, each read from the
 * card data (see limitedRating for the per-card rating):
 *
 *   card quality  up to 60   average rating of the non-land cards
 *   removal       up to 20   2 points per removal spell in 60 cards, 10 at most
 *   rares         up to 10   rares and mythics, full marks at a third of the spells
 *   curve         up to 10   points off for too few or too many lands, too few
 *                            cheap plays and too many expensive ones
 */

/** Card id -> copies. */
type Counts = Readonly<Record<string, number>>;

export interface DeckStrength {
  /** 0-100, the sum of the parts below. */
  score: number;
  quality: number;
  removal: number;
  rares: number;
  curve: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function deckStrength(cards: Counts): DeckStrength {
  let total = 0;
  let lands = 0;
  let rated = 0;
  let removal = 0;
  let rares = 0;
  let cheap = 0;
  let expensive = 0;
  for (const [id, n] of Object.entries(cards)) {
    const c = scryfallById.get(id);
    total += n;
    if (!c) continue;
    if (/\bLand\b/.test(c.typeLine ?? '') && !c.adventure) {
      lands += n;
      continue;
    }
    rated += rateCard(c.name) * n;
    if (isRemoval(c.name)) removal += n;
    if (c.rarity === 'rare' || c.rarity === 'mythic') rares += n;
    const mv = manaValue(c.manaCost ?? '');
    if (mv <= 2) cheap += n;
    if (mv >= 5) expensive += n;
  }
  const spells = total - lands;
  if (spells <= 0) return { score: 0, quality: 0, removal: 0, rares: 0, curve: 0 };
  const per60 = 60 / total;
  const quality = clamp(((rated / spells - 2.3) / 1.2) * 60, 0, 60);
  const removalPoints = clamp(removal * per60 * 2, 0, 20);
  const rarePoints = clamp((rares / spells) * 30, 0, 10);
  // 24 of 60 lands is par; a land or two either way is normal.
  const landsOff = Math.max(0, Math.abs(lands * per60 - 24) - 2);
  const curve = clamp(
    10 -
      landsOff * 1.5 -
      Math.max(0, 0.3 - cheap / spells) * 30 -
      Math.max(0, expensive / spells - 0.2) * 30,
    0,
    10,
  );
  const parts = { quality, removal: removalPoints, rares: rarePoints, curve };
  const score = Math.round(quality + removalPoints + rarePoints + curve);
  return { score, ...parts };
}

/** How quickly a deck's odds drop as its strength moves away from yours. */
const SPREAD = 8;
/** Every deck keeps some chance, so a match now and then is an upset either way. */
const FLOOR = 0.03;

let opponents: { id: string; cards: string[]; score: number }[] | undefined;
/** The 60-card opponents with their scores, worked out once. */
export function scoredOpponents() {
  opponents ??= CONSTRUCTED_OPPONENT_DECKS.map((d) => {
    const cards = deckIds(d);
    const counts: Record<string, number> = {};
    for (const id of cards) counts[id] = (counts[id] ?? 0) + 1;
    return { id: d.id, cards: cards.sort(), score: deckStrength(counts).score };
  });
  return opponents;
}

/**
 * A Season opponent near `yours` in strength. Odds fall off on a bell curve
 * around your score, with a floor so any deck can turn up. The exact same list
 * as yours (an unchanged starter) is left out, since it would be the closest.
 * `int(n)` is the caller's random integer below n, so picks follow its seed.
 */
export function pickSeasonOpponent(int: (n: number) => number, yours: Counts): string {
  const mine = deckStrength(yours).score;
  const list = Object.entries(yours)
    .flatMap(([id, n]) => Array<string>(n).fill(id))
    .sort()
    .join();
  const pool = scoredOpponents().filter((o) => o.cards.join() !== list);
  const weights = pool.map((o) =>
    Math.round(1000 * (Math.exp(-0.5 * ((o.score - mine) / SPREAD) ** 2) + FLOOR)),
  );
  let roll = int(weights.reduce((a, b) => a + b, 0));
  return pool[weights.findIndex((w) => (roll -= w) < 0)]!.id;
}
