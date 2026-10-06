import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { isRemoval, pickSplash } from './deckCompletion.ts';
import { castable, colourPairList, LANDS_PER_40, scorePair } from './expedition.ts';
import { rateCard } from './limitedRating.ts';
import { colorsName } from './sealed.ts';

/** Cards in a Limited deck. */
const DECK = 40;

/** How good one colour pair is for a pool. */
export interface PairAdvice {
  colors: [Color, Color];
  /** Arena's guild name: Rakdos, Selesnya... */
  name: string;
  /** Castable cards worth playing (rated 2 or better), counting every copy. */
  playables: number;
  creatures: number;
  removal: number;
  /** The best two or three cards, best first. */
  standouts: string[];
  /** A third colour to splash to reach a full deck, when the pair alone has too few playables. */
  splash: Color | null;
  /** Strength of the best 23 spells (higher is better); what the pairs are ranked by. */
  score: number;
}

const info = (n: string) => scryfallById.get(slug(n));
const isLand = (n: string) => /\bLand\b/.test(info(n)?.typeLine ?? '');

/**
 * The best colour pairs for a Limited pool, strongest first. Each pair is scored
 * like `suggestDeck` scores it (the best 23 spells it can cast), so building the
 * pair gives the deck this advice describes. Lands (basics too) are ignored.
 */
export function colourPairs(
  pool: Readonly<Record<string, number>>,
  { top = 3, spells = DECK - LANDS_PER_40 }: { top?: number; spells?: number } = {},
): PairAdvice[] {
  const owned = Object.entries(pool).filter(([n, k]) => k > 0 && info(n) && !isLand(n));
  const copies = owned.flatMap(([n, k]) => Array<string>(k).fill(n));
  const all = Object.fromEntries(owned);
  return colourPairList()
    .map((pair): PairAdvice => {
      const castables = copies.filter((n) => castable(n, pair));
      const playable = castables.filter((n) => rateCard(n) >= 2);
      const { score } = scorePair(copies, all, pair, false);
      const names = [...new Set(castables)].sort((a, b) => rateCard(b) - rateCard(a));
      const splash = playable.length < spells ? pickSplash(all, pair) : null;
      // A splash adds a little: its cards replace filler.
      const bonus = splash
        ? 0.5 * splash.cards.reduce((a, n) => a + Math.max(0, rateCard(n) - 1.5), 0)
        : 0;
      return {
        colors: pair as [Color, Color],
        name: colorsName(pair),
        playables: playable.length,
        creatures: playable.filter((n) => /\bCreature\b/.test(info(n)!.typeLine)).length,
        removal: playable.filter(isRemoval).length,
        standouts: names.filter((n) => rateCard(n) >= 3).slice(0, 3),
        splash: splash?.color ?? null,
        score: score + bonus,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}
