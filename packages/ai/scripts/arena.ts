/**
 * Bot vs bot matches with win rates, alternating who starts.
 *
 *   pnpm arena            # 20 games per pairing
 *   pnpm arena -- 100
 *   pnpm arena -- --log 3   # play-by-play of one heuristic mirror game (seed 3)
 *   pnpm arena -- 20 --search --rollouts=96   # search bot vs heuristic bot
 */
import { createEngine } from '@mtg/engine';
import { cardDb, deckIds, describeEvent, MONO_GREEN, MONO_RED } from '@mtg/cards';
import {
  type Bot,
  createHeuristicBot,
  createRandomBot,
  createSearchBot,
  playMatch,
} from '../src/index.ts';

const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 20);
const engine = createEngine(cardDb);
const red = deckIds(MONO_RED);
const green = deckIds(MONO_GREEN);

type Decks = { p1: string[]; p2: string[] };
type Maker = (seed: number, decks: Decks) => Bot;
const heuristic: Maker = () => createHeuristicBot(cardDb);
const random: Maker = (seed) => createRandomBot(cardDb, seed);
const rollouts = Number(process.argv.find((x) => x.startsWith('--rollouts='))?.split('=')[1] ?? 96);
const search: Maker = (seed, decks) => createSearchBot(cardDb, decks, { seed, rollouts });

function run(label: string, p1: Maker, p2: Maker, decks: Decks) {
  let w1 = 0;
  let w2 = 0;
  let turns = 0;
  let decisions = 0;
  let ms = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= n; seed++) {
    const r = playMatch(engine, decks, { p1: p1(seed, decks), p2: p2(seed + 1000, decks) }, seed, {
      startingPlayer: seed % 2 ? 'p1' : 'p2',
    });
    if (r.winner === 'p1') w1++;
    else if (r.winner === 'p2') w2++;
    turns += r.turns;
    decisions += r.actions.length;
    ms += r.thinkMs.p1 + r.thinkMs.p2;
  }
  const secs = (performance.now() - t0) / 1000;
  console.log(
    `${label.padEnd(44)} p1 ${String(w1).padStart(3)} – ${String(w2).padEnd(3)} p2` +
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

if (process.argv.includes('--search')) {
  run('search RED      vs heuristic GREEN', search, heuristic, { p1: red, p2: green });
  run('heuristic RED   vs search GREEN', heuristic, search, { p1: red, p2: green });
  process.exit(0);
}

run('heuristic RED   vs random GREEN', heuristic, random, { p1: red, p2: green });
run('random RED      vs heuristic GREEN', random, heuristic, { p1: red, p2: green });
run('heuristic RED   vs heuristic GREEN', heuristic, heuristic, { p1: red, p2: green });
run('heuristic GREEN vs heuristic RED', heuristic, heuristic, { p1: green, p2: red });
