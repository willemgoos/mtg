import { cardDb, describeEvent } from '@mtg/cards';
import { nextInt, redactEvents, redactFor, type Action } from '@mtg/engine';
import type { SavedGame } from './saved.ts';
import type { LogLine } from './useGame.ts';
import {
  appendSeasonAction,
  beginSeasonMatch,
  replaySeasonMatch,
  requireSeason,
  resolveSeasonMatch,
  SEASON_STARTERS,
  type SeasonSave,
} from './season.ts';

/** Persist both independent selections; the initial roster consists of starter decks. */
export function queueSeasonMatch(save: SeasonSave, now: number): SeasonSave {
  requireSeason(!save.match, 'Resume or abandon the current match first');
  const next = structuredClone(save);
  const opponent = SEASON_STARTERS[nextInt(next.rng, SEASON_STARTERS.length)]!;
  const skill = nextInt(next.rng, 100);
  const bot = skill < 25 ? 'easy' : skill < 75 ? 'heuristic' : 'search';
  const seed = nextInt(next.rng, 0x80000000);
  const startingPlayer = nextInt(next.rng, 2) === 0 ? 'p1' : 'p2';
  return beginSeasonMatch(next, opponent.id, bot, seed, startingPlayer, now);
}

/** Called once per validated board action, before the UI advances. */
export function recordSeasonAction(
  save: SeasonSave,
  matchId: number,
  action: Action,
  now: number,
): SeasonSave {
  if (action.type === 'concede') {
    requireSeason(action.player === 'p1', 'Only the player may concede through this control');
    return resolveSeasonMatch(save, matchId, 'concede', now);
  }
  const next = appendSeasonAction(save, matchId, action, now);
  return finishSeasonMatch(next, now);
}

/** Also settles an imported terminal match whose reward was not yet committed. */
export function finishSeasonMatch(save: SeasonSave, now: number): SeasonSave {
  if (!save.match) return save;
  const { state } = replaySeasonMatch(save.match);
  if (!state.winner) return save;
  return resolveSeasonMatch(
    save,
    save.match.id,
    state.winner === 'p1' ? 'win' : state.winner === 'p2' ? 'loss' : 'draw',
    now,
  );
}

export function resumeSeasonGame(save: SeasonSave): SavedGame {
  requireSeason(save.match, 'No match to resume');
  const match = save.match;
  const log: LogLine[] = [];
  const { state } = replaySeasonMatch(match, (state, events) => {
    const view = redactFor(state, 'p1', cardDb);
    for (const event of redactEvents(events, state, 'p1')) {
      const text = describeEvent(event, view);
      if (!text || event.type === 'stepChanged') continue;
      const who =
        'player' in event && (event.player === 'p1' || event.player === 'p2') ? event.player : null;
      log.push({
        id: log.length,
        text: text
          .trim()
          .replace(/\bp1\b/g, 'You')
          .replace(/\bp2\b/g, 'Opponent'),
        turn: state.turn.number,
        who,
      });
    }
  });
  return {
    v: 1,
    choice: {
      you: save.purchasedStarters[0]!,
      them: match.opponentDeckId,
      cards: [...match.decks.p1],
      options: { startingPlayer: match.startingPlayer },
    },
    seed: match.seed,
    opponent: match.bot,
    state,
    log: log.slice(-300),
  };
}
