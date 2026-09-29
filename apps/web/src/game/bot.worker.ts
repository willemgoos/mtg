/// <reference lib="webworker" />
import { type Bot, createEasyBot, createHeuristicBot, createSearchBot, EASY_LEVELS } from '@mtg/ai';
import { cardDb } from '@mtg/cards';
import type { CardDefId, GameState, PlayerId } from '@mtg/engine';

/** An expedition opponent: the easy bot at one of EASY_LEVELS (1 is the gentlest). */
export type LevelBot = 'level1' | 'level2' | 'level3' | 'level4' | 'level5' | 'level6';
export type BotKind = 'easy' | 'heuristic' | 'search' | LevelBot;

function createBot(kind: BotKind, decks: Record<PlayerId, CardDefId[]>, seed: number): Bot {
  if (kind === 'search')
    return createSearchBot(cardDb, decks, { seed, rollouts: 128, timeMs: 1500 });
  if (kind === 'heuristic') return createHeuristicBot(cardDb);
  if (kind === 'easy') return createEasyBot(cardDb, { seed });
  const level = EASY_LEVELS[Number(kind.slice('level'.length)) - 1];
  return createEasyBot(cardDb, { seed, ...level });
}

export interface BotRequest {
  id: number;
  kind: BotKind;
  decks: Record<PlayerId, CardDefId[]>;
  seed: number;
  view: GameState;
  player: PlayerId;
}

export interface BotResponse {
  id: number;
  action: ReturnType<Bot['chooseAction']>;
  ms: number;
}

// One bot per game (search bots keep plans between calls).
let current: { key: string; bot: Bot } | null = null;

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const { id, kind, decks, seed, view, player } = e.data;
  const key = `${kind}:${seed}`;
  if (current?.key !== key) {
    current = { key, bot: createBot(kind, decks, seed) };
  }
  const t0 = performance.now();
  const action = current.bot.chooseAction(view, player);
  const res: BotResponse = { id, action, ms: performance.now() - t0 };
  self.postMessage(res);
};
