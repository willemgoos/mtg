/**
 * How the heuristic bot attacks: heuristic mirrors between the Foundations starter decks.
 *
 *   pnpm aggression          # 2 games per pairing (each deck on each side)
 *   pnpm aggression -- 4
 *   pnpm aggression -- --crackback=0.3                         # with other attack weights (ATTACK)
 *   pnpm aggression -- --crackback=0.3 --vs                    # those weights against the defaults
 *   pnpm aggression -- --trick=0.3 --base-trick=0 --vs           # a weight against the bot without it
 *   pnpm aggression -- --passive                               # against a bot that blocks but never attacks
 *
 * Reports how often a bot that could attack sent nobody, how many it sent, how much life the
 * loser still had when the last turn started (high means the game ended in one big swing), and
 * the share of the loser's lost life that came on that last turn.
 */
import { type GameState, createEngine } from '@mtg/engine';
import { cardDb, deckById, deckIds, PLAYABLE_DECKS } from '@mtg/cards';
import { ATTACK, type Bot, createHeuristicBot, playMatch } from '../src/index.ts';

const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 2);
const engine = createEngine(cardDb);
const starters = PLAYABLE_DECKS.filter((d) => d.source === 'arena' && d.series === 'starter');
const only = process.argv.find((x) => x.startsWith('--deck='))?.split('=')[1];
const lists = only ? [deckById(only), ...starters.filter((d) => d.id !== only)] : starters;

const flag = (name: string) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=')[1];
const base = { ...ATTACK };
// Any ATTACK weight can be set as --name=value; `--base-name=value` changes the defaults it plays against.
for (const k of Object.keys(base) as (keyof typeof ATTACK)[])
  base[k] = Number(flag(`base-${k}`) ?? base[k]);
const tuned = { ...base };
for (const k of Object.keys(base) as (keyof typeof ATTACK)[]) tuned[k] = Number(flag(k) ?? base[k]);
const vs = process.argv.includes('--vs');
const passive = process.argv.includes('--passive');
/** A defensive player: the heuristic bot that never attacks (only the tuned bot's attacks are counted). */
const neverAttacks = (): Bot => {
  const inner = createHeuristicBot(cardDb);
  return {
    name: 'passive',
    chooseAction(view, me) {
      if (view.decision.kind === 'declareAttackers')
        return { type: 'confirmAttackers', player: me };
      Object.assign(ATTACK, base);
      return inner.chooseAction(view, me);
    },
  };
};
/** The heuristic bot playing with these attack weights. */
const withWeights = (w: typeof ATTACK): Bot => {
  const inner = createHeuristicBot(cardDb);
  return {
    name: inner.name,
    chooseAction(view, me) {
      Object.assign(ATTACK, w);
      return inner.chooseAction(view, me);
    },
  };
};

let tunedWins = 0;
let baseWins = 0;
let holdThenKill = 0;
let games = 0;
let turns = 0;
let combats = 0;
let idle = 0;
let sent = 0;
let couldSend = 0;
let decided = 0;
let lifeBeforeLast = 0;
let lastShare = 0;
let bigSwings = 0;

for (const [i, x] of lists.entries())
  for (const y of lists.slice(i + 1)) {
    if (only && i > 0) continue;
    for (let seed = 1; seed <= n; seed++) {
      const decks =
        seed % 2 ? { p1: deckIds(x), p2: deckIds(y) } : { p1: deckIds(y), p2: deckIds(x) };
      const turnStartLife: { turn: number; life: Record<string, number> }[] = [];
      let prev: GameState | null = null;
      let open: { player: string; options: number } | null = null;
      // --vs: the tuned bot takes each side in turn.
      const tunedSide = vs || passive ? (games % 2 ? 'p2' : 'p1') : null;
      const opponent = () => (passive ? neverAttacks() : withWeights(base));
      const bots = {
        p1: tunedSide === 'p2' ? opponent() : withWeights(tuned),
        p2: tunedSide === 'p1' ? opponent() : withWeights(tuned),
      };
      const history: { player: string; idle: boolean }[] = [];
      const r = playMatch(engine, decks, bots, seed, {
        startingPlayer: seed % 2 ? 'p1' : 'p2',
        onEvents: (_events, state, action) => {
          const before = prev;
          prev = state;
          if (turnStartLife.at(-1)?.turn !== state.turn.number)
            turnStartLife.push({
              turn: state.turn.number,
              life: { p1: state.players.p1.life, p2: state.players.p2.life },
            });
          if (!before) return;
          const d = before.decision;
          if (passive && d.kind === 'declareAttackers' && d.player !== tunedSide) return;
          if (d.kind === 'declareAttackers' && d.declared.length === 0 && !open) {
            const options = new Set(
              engine
                .getLegalActions(before, d.player)
                .flatMap((a) => (a.type === 'addAttacker' ? [a.attacker] : [])),
            ).size;
            open = { player: d.player, options };
          }
          if (action.type === 'confirmAttackers' && open && d.kind === 'declareAttackers') {
            if (open.options > 0) {
              combats++;
              if (d.declared.length === 0) idle++;
              history.push({ player: d.player, idle: d.declared.length === 0 });
              sent += d.declared.length;
              couldSend += open.options;
            }
            open = null;
          }
        },
      });
      games++;
      turns += r.turns;
      process.stderr.write(`\r${games} games`);
      if (r.winner !== 'p1' && r.winner !== 'p2') continue;
      if (tunedSide) {
        if (r.winner === tunedSide) tunedWins++;
        else baseWins++;
      }
      const mine = history.filter((h) => h.player === r.winner);
      if (mine.length >= 3 && !mine.at(-1)!.idle && mine.at(-2)!.idle && mine.at(-3)!.idle)
        holdThenKill++;
      const loser = r.winner === 'p1' ? 'p2' : 'p1';
      const last = turnStartLife.at(-1)!.life[loser]!;
      decided++;
      lifeBeforeLast += last;
      lastShare += last / 20;
      if (last >= 10) bigSwings++;
    }
  }

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
console.log(`weights ${JSON.stringify(tuned)}${vs ? ` vs ${JSON.stringify(base)}` : ''}`);
if (vs || passive)
  console.log(`tuned ${tunedWins} – ${baseWins} default (${pct(tunedWins, tunedWins + baseWins)})`);
console.log(`${games} games, avg ${(turns / games).toFixed(1)} turns`);
console.log(`combats with an attacker available: ${combats}`);
console.log(`  sent nobody: ${pct(idle, combats)}`);
console.log(`  attackers sent of those able: ${pct(sent, couldSend)}`);
console.log(
  `loser's life when the last turn started: avg ${(lifeBeforeLast / decided).toFixed(1)}`,
);
console.log(`  share of 20 life lost on the last turn: ${pct(lastShare, decided)}`);
console.log(`  games ending from 10+ life in one turn: ${pct(bigSwings, decided)}`);
console.log(`  winner held back 2+ combats, then won: ${pct(holdThenKill, decided)}`);
