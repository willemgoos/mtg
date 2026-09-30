import { cardDb } from '@mtg/cards';
import { createEngine } from '@mtg/engine';
import { replaySeasonMatch, type SeasonSave } from '../src/game/season.ts';

const engine = createEngine(cardDb);

/** Passing all opportunities advances real engine turns without fabricated state. */
export function passToTurn(save: SeasonSave, target: number): SeasonSave {
  const match = structuredClone(save.match!);
  let { state, playerTurnsBegun } = replaySeasonMatch(match);
  for (let i = 0; playerTurnsBegun < target && i < 400; i++) {
    const player = 'player' in state.decision ? state.decision.player : 'p1';
    const legal = engine.getLegalActions(state, player);
    const action =
      legal.find((a) => a.type === 'keepHand') ??
      legal.find((a) => a.type === 'passPriority') ??
      legal.find((a) => a.type === 'confirmAttackers' || a.type === 'confirmBlockers') ??
      legal[0];
    if (!action) throw new Error('Cannot advance game');
    match.actions.push(action);
    const turn = state.turn.number;
    state = engine.applyAction(state, action).state;
    if (state.turn.number !== turn && state.turn.activePlayer === 'p1') playerTurnsBegun++;
  }
  if (playerTurnsBegun !== target) throw new Error('Did not reach the requested player turn');
  return { ...save, match };
}
