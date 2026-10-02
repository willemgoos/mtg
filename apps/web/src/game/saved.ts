import { findDeck } from '@mtg/cards';
import type { GameState } from '@mtg/engine';
import type { BotKind } from './bot.worker.ts';
import type { DeckChoice, LogLine } from './useGame.ts';

/** The game in progress, kept in localStorage so a reload doesn't lose it. */
export interface SavedGame {
  v: typeof VERSION;
  choice: DeckChoice;
  seed: number;
  opponent: BotKind;
  state: GameState;
  log: LogLine[];
}

const KEY = 'mtg.savedGame';
// Bump when GameState changes shape, so old saves are dropped instead of misread.
const VERSION = 1;

export function loadGame(): SavedGame | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedGame | null;
    if (g?.v !== VERSION) return null;
    const known = (id: string) => !!findDeck(id);
    if (!known(g.choice.you) || !known(g.choice.them)) return null;
    if (g.state.decision.kind === 'gameOver') return null;
    // Saved before Brawl: no command zones yet.
    for (const ps of Object.values(g.state.players)) ps.command ??= [];
    return g;
  } catch {
    return null;
  }
}

export function saveGame(g: Omit<SavedGame, 'v'>): void {
  try {
    if (g.state.decision.kind === 'gameOver') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...g }));
  } catch {
    // Storage can be full or unavailable (private mode); the game just won't survive a reload.
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved, then.
  }
}
