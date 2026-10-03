/**
 * Bot vs bot matches with win rates, alternating who starts.
 *
 *   pnpm arena            # 20 games per pairing
 *   pnpm arena -- 100
 *   pnpm arena -- --log 3   # play-by-play of one heuristic mirror game (seed 3)
 *   pnpm arena -- 20 --search --rollouts=96   # search bot vs heuristic bot
 *
 * Plays every pairing of the playable decks, then the Brawl decks among
 * themselves (`--brawl`: only those).
 */
import { createEngine } from '@mtg/engine';
import {
  cardDb,
  type Decklist,
  deckGameOptions,
  deckIds,
  describeEvent,
  deckById,
  PLAYABLE_BRAWL_DECKS,
  PLAYABLE_DECKS,
} from '@mtg/cards';
import {
  type Bot,
  createHeuristicBot,
  createRandomBot,
  createSearchBot,
  playMatch,
} from '../src/index.ts';

const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 20);
const engine = createEngine(cardDb);
// The pairing used by --log.
const red = deckIds(deckById('path-of-power'));
const green = deckIds(deckById('might-of-the-legion'));

type Decks = { p1: string[]; p2: string[] };
type Maker = (seed: number, decks: Decks) => Bot;
const heuristic: Maker = () => createHeuristicBot(cardDb);
const random: Maker = (seed) => createRandomBot(cardDb, seed);
const rollouts = Number(process.argv.find((x) => x.startsWith('--rollouts='))?.split('=')[1] ?? 96);
const search: Maker = (seed, decks) => createSearchBot(cardDb, decks, { seed, rollouts });

function run(
  label: string,
  p1: Maker,
  p2: Maker,
  decks: Decks,
  brawl?: ReturnType<typeof deckGameOptions>,
) {
  let w1 = 0;
  let w2 = 0;
  let turns = 0;
  let decisions = 0;
  let ms = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= n; seed++) {
    const r = playMatch(engine, decks, { p1: p1(seed, decks), p2: p2(seed + 1000, decks) }, seed, {
      startingPlayer: seed % 2 ? 'p1' : 'p2',
      ...(brawl?.format ? { brawl: { format: brawl.format, commanders: brawl.commanders } } : {}),
      ...(brawl?.sideboards ? { sideboards: brawl.sideboards } : {}),
    });
    if (r.winner === 'p1') w1++;
    else if (r.winner === 'p2') w2++;
    turns += r.turns;
    decisions += r.actions.length;
    ms += r.thinkMs.p1 + r.thinkMs.p2;
  }
  const secs = (performance.now() - t0) / 1000;
  console.log(
    `${label.padEnd(64)} p1 ${String(w1).padStart(3)} – ${String(w2).padEnd(3)} p2` +
      `  avg ${(turns / n).toFixed(1)} turns, ${(ms / decisions).toFixed(2)} ms/decision, ${secs.toFixed(1)}s`,
  );
}

const decks0 = { p1: red, p2: green };
if (process.argv.includes('--log')) {
  playMatch(
    engine,
    { p1: red, p2: green },
    { p1: heuristic(0, decks0), p2: heuristic(0, decks0) },
    n,
    {
      onEvents: (events, state) => {
        for (const e of events) {
          const line = describeEvent(e, state);
          if (line) console.log(line);
        }
      },
    },
  );
  process.exit(0);
}

const label = (a: string, x: Decklist, b: string, y: Decklist) =>
  `${a} ${x.name}`.padEnd(30) + ` vs ${b} ${y.name}`;

// Brawl decks play each other (mirrors included: there may be only a few).
const brawlRuns = () => {
  const b = PLAYABLE_BRAWL_DECKS;
  for (const x of b) {
    const g = deckGameOptions(x, x);
    run(label('heuristic', x, 'random', x), heuristic, random, g.decks, g);
  }
  for (const [i, x] of b.entries())
    for (const y of b.slice(i)) {
      const g = deckGameOptions(x, y);
      run(label('heuristic', x, 'heuristic', y), heuristic, heuristic, g.decks, g);
    }
};
if (process.argv.includes('--brawl')) {
  brawlRuns();
  process.exit(0);
}

const lists: readonly Decklist[] = PLAYABLE_DECKS;
const pairs = lists.flatMap((a, i) => lists.slice(i + 1).map((b) => [a, b] as const));
const decksOf = (x: Decklist, y: Decklist) => ({ p1: deckIds(x), p2: deckIds(y) });

if (process.argv.includes('--search')) {
  for (const [x, y] of pairs) {
    run(label('search', x, 'heuristic', y), search, heuristic, decksOf(x, y));
    run(label('heuristic', x, 'search', y), heuristic, search, decksOf(x, y));
  }
  process.exit(0);
}

// `--deck=<id>`: one deck against the ten Foundations starter decks, both seats, with its sideboard.
const only = process.argv.find((x) => x.startsWith('--deck='))?.split('=')[1];
if (only) {
  const mine = deckById(only);
  for (const y of lists.filter((d) => d.source === 'arena' && d.series === 'starter')) {
    const g = deckGameOptions(mine, y);
    run(label('heuristic', mine, 'heuristic', y), heuristic, heuristic, g.decks, g);
    const h = deckGameOptions(y, mine);
    run(label('heuristic', y, 'heuristic', mine), heuristic, heuristic, h.decks, h);
  }
  process.exit(0);
}

for (const x of lists) run(label('heuristic', x, 'random', x), heuristic, random, decksOf(x, x));
for (const [x, y] of pairs) {
  const g = deckGameOptions(x, y);
  run(label('heuristic', x, 'heuristic', y), heuristic, heuristic, g.decks, g);
  const h = deckGameOptions(y, x);
  run(label('heuristic', y, 'heuristic', x), heuristic, heuristic, h.decks, h);
}
brawlRuns();
