/**
 * Plays random-vs-random games headlessly.
 *
 *   pnpm sim              # 200 games, summary
 *   pnpm sim -- 1000      # N games
 *   pnpm sim -- 1 --log   # one game with a readable event log
 */
import { createEngine, type GameEvent, type GameState, playRandomGame } from '@mtg/engine';
import { cardDb, deckIds, MONO_GREEN, MONO_RED } from '../src/index.ts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);
const log = args.includes('--log');

const engine = createEngine(cardDb);
const decks = { p1: deckIds(MONO_RED), p2: deckIds(MONO_GREEN) };

function describe(e: GameEvent, s: GameState): string | null {
  const name = (id: string) => cardDb.get(s.objects[id]?.defId ?? '')?.name ?? id;
  switch (e.type) {
    case 'stepChanged':
      return e.step === 'upkeep' ? `\n== Turn ${e.turn} (${e.activePlayer}) ==` : null;
    case 'spellCast':
      return `${e.player} casts ${name(e.id)}`;
    case 'abilityActivated':
      return `${e.player} activates ${name(e.source)}`;
    case 'objectMoved':
      if (e.to === 'battlefield' || e.to === 'graveyard')
        return `  ${cardDb.get(e.defId)?.name} → ${e.to}`;
      return null;
    case 'damageDealt': {
      const to = 'player' in e.to ? e.to.player : name(e.to.object.id);
      return `  ${name(e.source)} deals ${e.amount} to ${to}${e.combat ? ' (combat)' : ''}`;
    }
    case 'lifeChanged':
      return `  ${e.player} life ${e.life}`;
    case 'attackersDeclared':
      return e.attackers.length ? `attacks with ${e.attackers.map(name).join(', ')}` : null;
    case 'gameOver':
      return `\nWinner: ${e.winner}`;
    default:
      return null;
  }
}

const wins = { p1: 0, p2: 0, draw: 0 };
let turns = 0;
let actions = 0;
const start = performance.now();
for (let seed = 1; seed <= n; seed++) {
  const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919, {
    onEvents: log
      ? (events, _action, state) => {
          for (const e of events) {
            const line = describe(e, state);
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
console.log(
  `${MONO_RED.name} (p1): ${wins.p1}  ${MONO_GREEN.name} (p2): ${wins.p2}  draws: ${wins.draw}`,
);
console.log(`avg turns ${(turns / n).toFixed(1)}, avg actions ${(actions / n).toFixed(0)}`);
