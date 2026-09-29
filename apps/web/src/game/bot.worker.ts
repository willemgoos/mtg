/// <reference lib="webworker" />
import { type Bot, createHeuristicBot, createSearchBot } from '@mtg/ai';
import { cardDb } from '@mtg/cards';
import type { CardDefId, GameState, PlayerId } from '@mtg/engine';

export type BotKind = 'heuristic' | 'search';

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
    current = {
      key,
      bot:
        kind === 'search'
          ? createSearchBot(cardDb, decks, { seed, rollouts: 128, timeMs: 1500 })
          : createHeuristicBot(cardDb),
    };
  }
  const t0 = performance.now();
  const action = current.bot.chooseAction(view, player);
  const res: BotResponse = { id, action, ms: performance.now() - t0 };
  self.postMessage(res);
};
