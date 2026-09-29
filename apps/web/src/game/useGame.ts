import { createHeuristicBot } from '@mtg/ai';
import { cardDb, deckIds, describeEvent, MONO_GREEN, MONO_RED } from '@mtg/cards';
import {
  type Action,
  createEngine,
  type GameEvent,
  type GameState,
  type PlayerId,
  redactEvents,
  redactFor,
} from '@mtg/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type PassSettings, shouldAutoPass } from './interaction.ts';

export const HUMAN: PlayerId = 'p1';
export const BOT: PlayerId = 'p2';
export type DeckChoice = 'red' | 'green';

const engine = createEngine(cardDb);

export interface LogLine {
  id: number;
  text: string;
  turn: number;
  who: PlayerId | null;
}

export interface EventBatch {
  seq: number;
  events: GameEvent[];
}

/** Delay before the bot's action lands, so the human can follow along. */
function botDelay(a: Action): number {
  switch (a.type) {
    case 'passPriority':
      return 160;
    case 'addAttacker':
    case 'addBlock':
    case 'removeAttacker':
    case 'removeBlock':
      return 320;
    case 'keepHand':
    case 'mulligan':
    case 'bottomCard':
      return 250;
    default:
      return 750;
  }
}

export function useGame(deck: DeckChoice, seed: number) {
  const bot = useMemo(() => createHeuristicBot(cardDb), []);
  const decks = useMemo(() => {
    const red = deckIds(MONO_RED);
    const green = deckIds(MONO_GREEN);
    return deck === 'red' ? { p1: red, p2: green } : { p1: green, p2: red };
  }, [deck]);

  const [state, setState] = useState<GameState>(() => engine.newGame({ decks, seed }));
  const stateRef = useRef(state);
  const [log, setLog] = useState<LogLine[]>([]);
  const [batch, setBatch] = useState<EventBatch>({ seq: 0, events: [] });
  const [settings, setSettings] = useState<PassSettings>({ fullControl: false, passTurn: null });
  const logId = useRef(0);

  const apply = useCallback((action: Action) => {
    const r = engine.applyAction(stateRef.current, action);
    stateRef.current = r.state;
    const events = redactEvents(r.events, r.state, HUMAN);
    const view = redactFor(r.state, HUMAN);
    const lines: LogLine[] = [];
    for (const e of events) {
      const text = describeEvent(e, view);
      if (!text || e.type === 'stepChanged') continue;
      const who = 'player' in e && typeof e.player === 'string' ? (e.player as PlayerId) : null;
      const named = text
        .trim()
        .replace(/\bp1\b/g, 'You')
        .replace(/\bp2\b/g, 'Opponent');
      lines.push({ id: logId.current++, text: named, turn: r.state.turn.number, who });
    }
    if (lines.length) setLog((l) => [...l, ...lines].slice(-300));
    setBatch((b) => ({ seq: b.seq + 1, events }));
    setState(r.state);
  }, []);

  const legal = useMemo(() => engine.getLegalActions(state, HUMAN), [state]);
  const view = useMemo(() => redactFor(state, HUMAN), [state]);

  // The bot acts, and the human auto-passes where nothing is worth stopping for.
  useEffect(() => {
    const d = state.decision;
    if (d.kind === 'gameOver') return;
    let action: Action | null = null;
    let delay = 0;
    if (d.player === BOT) {
      action = bot.chooseAction(redactFor(state, BOT), BOT);
      delay = botDelay(action);
    } else if (shouldAutoPass(state, legal, HUMAN, settings)) {
      action = { type: 'passPriority', player: HUMAN };
      delay = 110;
    }
    if (!action) return;
    const a = action;
    const t = setTimeout(() => apply(a), delay);
    return () => clearTimeout(t);
  }, [state, legal, settings, bot, apply]);

  // "End turn" only lasts for the turn it was pressed in.
  useEffect(() => {
    if (settings.passTurn !== null && settings.passTurn !== state.turn.number)
      setSettings((s) => ({ ...s, passTurn: null }));
  }, [state.turn.number, settings.passTurn]);

  return { engine, state, view, legal, apply, log, batch, settings, setSettings };
}

export type GameSession = ReturnType<typeof useGame>;
