/**
 * Plays random-vs-random games headlessly.
 *
 *   pnpm sim              # 200 games, summary
 *   pnpm sim -- 1000      # N games
 *   pnpm sim -- 1 --log   # one game with a readable event log
 */
import { createEngine, playRandomGame } from '@mtg/engine';
import { cardDb, deckById, deckIds, describeEvent } from '../src/index.ts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);
const log = args.includes('--log');

const engine = createEngine(cardDb);
const d1 = deckById('path-of-power');
const d2 = deckById('might-of-the-legion');
const decks = { p1: deckIds(d1), p2: deckIds(d2) };

const wins = { p1: 0, p2: 0, draw: 0 };
let turns = 0;
let actions = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919, {
    onEvents: log
      ? (events, _action, state) => {
          for (const e of events) {
            const line = describeEvent(e, state);
            if (line) console.log(line);
          }
        }
      : undefined,
  });
  if (r.winner) wins[r.winner]++;
  turns += r.turns;
  actions += r.actions.length;
}
const secs = (performance.now() - start) / 1000;
console.log(
  `\n${n} games in ${secs.toFixed(1)}s (${(n / secs).toFixed(0)} games/s, ${(actions / secs).toFixed(0)} actions/s)`,
);
console.log(`${d1.name} (p1): ${wins.p1}  ${d2.name} (p2): ${wins.p2}  draws: ${wins.draw}`);
console.log(`avg turns ${(turns / n).toFixed(1)}, avg actions ${(actions / n).toFixed(0)}`);
