import { cardDb } from '@mtg/cards';
import {
  type Action,
  getCharacteristics,
  type GameState,
  type ObjectId,
  type PlayerId,
} from '@mtg/engine';

/** A teamwork spell being cast: the creatures picked so far to tap for it. */
export interface TeamPick {
  action: Extract<Action, { type: 'castSpell' }>;
  /** The total power needed (teamwork N). */
  need: number;
  chosen: ObjectId[];
}

/** Starts picking creatures if `a` casts a spell with teamwork and none are chosen yet. */
export function startTeamPick(view: GameState, a: Action): TeamPick | null {
  if (a.type !== 'castSpell' || !a.kicked || a.teamwork) return null;
  const need = cardDb.get(view.objects[a.card]!.defId)?.kicker?.teamwork;
  return need === undefined ? null : { action: a, need, chosen: [] };
}

/** Untapped creatures `me` controls that could be tapped (not the spell itself). */
export function teamOptions(view: GameState, me: PlayerId, pick: TeamPick): ObjectId[] {
  return view.battlefield.filter((id) => {
    const o = view.objects[id]!;
    return (
      o.controller === me &&
      !o.tapped &&
      id !== pick.action.card &&
      getCharacteristics(view, cardDb, id).types.includes('Creature')
    );
  });
}

export function teamPower(view: GameState, ids: readonly ObjectId[]): number {
  return ids.reduce((sum, id) => sum + Math.max(0, getCharacteristics(view, cardDb, id).power), 0);
}
