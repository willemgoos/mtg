import {
  type Action,
  type CardDb,
  type CardDefinition,
  createEngine,
  type Engine,
  type GameState,
  HIDDEN_CARD,
  type PlayerId,
} from '@mtg/engine';

/** A bot decides from a redacted view of the game (see redactFor). */
export interface Bot {
  readonly name: string;
  chooseAction(view: GameState, player: PlayerId): Action;
}

/**
 * Hidden cards (defId "?") become an inert land with no abilities, so a bot
 * can simulate on its view without knowing (or guessing) the opponent's cards.
 */
const HIDDEN_DEF: CardDefinition = {
  id: HIDDEN_CARD,
  name: 'Hidden card',
  manaCost: { generic: 0, colored: {} },
  colors: [],
  types: ['Land'],
  supertypes: [],
  subtypes: [],
  keywords: [],
  abilities: [],
};

/** An engine that can run on redacted states. */
export function viewEngine(db: CardDb): Engine {
  return createEngine(new Map([...db, [HIDDEN_CARD, HIDDEN_DEF]]));
}

export const other = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');
