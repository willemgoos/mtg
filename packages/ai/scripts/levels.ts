/**
 * Win rates of the easy bot's levels (EASY_LEVELS) against the heuristic bot,
 * to check each level is a step up from the one before.
 *
 *   pnpm --filter @mtg/ai levels        # 40 games per level
 *   pnpm --filter @mtg/ai levels 100
 *
 * Decks are random starter-deck pairings, alternating who starts.
 */
import { createEngine } from '@mtg/engine';
import { cardDb, deckIds, PLAYABLE_DECKS } from '@mtg/cards';
import {
  type Bot,
  createEasyBot,
  createHeuristicBot,
  EASY_LEVELS,
  playMatch,
} from '../src/index.ts';

const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 40);
const engine = createEngine(cardDb);
const starters = PLAYABLE_DECKS.filter((d) => d.series === 'starter');

const levels: { name: string; make: (seed: number) => Bot }[] = [
  ...EASY_LEVELS.map((opts, i) => ({
    name: `Level ${i + 1}`,
    make: (seed: number) => createEasyBot(cardDb, { seed, ...opts }),
  })),
  { name: 'Novice (easy)', make: (seed: number) => createEasyBot(cardDb, { seed }) },
  { name: 'Apprentice', make: () => createHeuristicBot(cardDb) },
];

for (const level of levels) {
  let wins = 0;
  let draws = 0;
  for (let g = 0; g < n; g++) {
    const a = starters[(g * 7) % starters.length]!;
    const b = starters[(g * 3 + 1) % starters.length]!;
    const result = playMatch(
      engine,
      { p1: deckIds(a), p2: deckIds(b) },
      { p1: level.make(g + 1), p2: createHeuristicBot(cardDb) },
      1000 + g,
      { startingPlayer: g % 2 ? 'p1' : 'p2' },
    );
    if (result.winner === 'p1') wins++;
    else if (result.winner === 'draw' || !result.winner) draws++;
  }
  console.log(
    `${level.name.padEnd(14)} wins ${String(wins).padStart(3)}/${n}  (${Math.round((100 * wins) / n)}%)${draws ? `  draws ${draws}` : ''}`,
  );
}
