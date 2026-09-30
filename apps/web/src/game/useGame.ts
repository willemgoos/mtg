import { cardDb, DECKS, deckIds, describeEvent } from '@mtg/cards';
import {
  type Action,
  type CardDefId,
  type NewGameOptions,
  createEngine,
  type GameEvent,
  type GameState,
  type PlayerId,
  redactEvents,
  redactFor,
} from '@mtg/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BotKind, BotRequest, BotResponse } from './bot.worker.ts';
import { type PassSettings, shouldAutoPass } from './interaction.ts';
import { type SavedGame, saveGame } from './saved.ts';

export const HUMAN: PlayerId = 'p1';
export const BOT: PlayerId = 'p2';
/** Deck ids (see DECKS in @mtg/cards) for the human and the bot. */
export interface DeckChoice {
  you: string;
  them: string;
  /** The human's own cards instead of `you`'s list (an expedition deck). */
  cards?: CardDefId[];
  /** Setup changes for the game (an expedition's boons). */
  options?: Omit<NewGameOptions, 'decks' | 'seed'>;
}

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

export function useGame(
  choice: DeckChoice,
  seed: number,
  opponent: BotKind,
  resume: SavedGame | null = null,
  /** Overrides global autosaving. Must succeed before advancing the visible state. */
  persistAction?: (action: Action) => void,
) {
  const persistence = useRef(persistAction);
  persistence.current = persistAction;
  // Errors in timers and the worker don't reach React by themselves. They are
  // rethrown while rendering so the error boundary can offer a way out.
  const [error, setError] = useState<unknown>(null);
  // The bot thinks in a worker so the board stays smooth while it searches.
  // Created in an effect (not useMemo) so StrictMode's remount gets a live worker.
  const [worker, setWorker] = useState<Worker | null>(null);
  useEffect(() => {
    const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    setWorker(w);
    w.addEventListener('error', (e) => setError(e.error ?? new Error(e.message)));
    return () => {
      w.terminate();
      setWorker(null);
    };
  }, []);
  const [thinking, setThinking] = useState(false);
  const decks = useMemo(() => {
    const list = (id: string) => {
      const d = DECKS.find((x) => x.id === id);
      if (!d) throw new Error(`Unknown deck "${id}"`);
      return deckIds(d);
    };
    return { p1: choice.cards ?? list(choice.you), p2: list(choice.them) };
  }, [choice.you, choice.them, choice.cards]);

  const [state, setState] = useState<GameState>(
    () => resume?.state ?? engine.newGame({ ...choice.options, decks, seed }),
  );
  const stateRef = useRef(state);
  const [log, setLog] = useState<LogLine[]>(() => resume?.log ?? []);
  const [batch, setBatch] = useState<EventBatch>({ seq: 0, events: [] });
  const [settings, setSettings] = useState<PassSettings>({ fullControl: false, passTurn: null });
  const logId = useRef(resume?.log.length ? resume.log.at(-1)!.id + 1 : 0);
  const requestId = useRef(0);

  const apply = useCallback((action: Action) => {
    let r: ReturnType<typeof engine.applyAction>;
    try {
      r = engine.applyAction(stateRef.current, action);
      persistence.current?.(action);
    } catch (e) {
      setError(e);
      return;
    }
    stateRef.current = r.state;
    const events = redactEvents(r.events, r.state, HUMAN);
    const view = redactFor(r.state, HUMAN, cardDb);
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
  const view = useMemo(() => redactFor(state, HUMAN, cardDb), [state]);
  const autoPassing = useMemo(
    () => shouldAutoPass(state, legal, HUMAN, settings),
    [state, legal, settings],
  );

  // The bot acts, and the human auto-passes where nothing is worth stopping for.
  useEffect(() => {
    const d = state.decision;
    if (d.kind === 'gameOver') return;
    if (d.player === BOT) {
      if (!worker) return;
      const id = ++requestId.current;
      const request: BotRequest = {
        id,
        kind: opponent,
        decks,
        seed,
        view: redactFor(state, BOT, cardDb),
        player: BOT,
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onMessage = (e: MessageEvent<BotResponse>) => {
        if (e.data.id !== id) return;
        setThinking(false);
        // Keep a minimum pace so the human can follow along.
        timer = setTimeout(
          () => apply(e.data.action),
          Math.max(0, botDelay(e.data.action) - e.data.ms),
        );
      };
      worker.addEventListener('message', onMessage);
      const slow = setTimeout(() => setThinking(true), 250);
      // Posted a tick later: StrictMode's throwaway first effect run never sends.
      const post = setTimeout(() => worker.postMessage(request));
      return () => {
        worker.removeEventListener('message', onMessage);
        clearTimeout(post);
        clearTimeout(slow);
        clearTimeout(timer);
        setThinking(false);
      };
    }
    if (autoPassing) {
      const t = setTimeout(() => apply({ type: 'passPriority', player: HUMAN }), 110);
      return () => clearTimeout(t);
    }
  }, [state, autoPassing, apply, worker, opponent, decks, seed]);

  useEffect(() => {
    if (!persistAction) saveGame({ choice, seed, opponent, state, log });
  }, [choice, seed, opponent, state, log, persistAction]);

  // "End turn" only lasts for the turn it was pressed in.
  useEffect(() => {
    if (settings.passTurn !== null && settings.passTurn !== state.turn.number)
      setSettings((s) => ({ ...s, passTurn: null }));
  }, [state.turn.number, settings.passTurn]);

  if (error) throw error;

  return {
    engine,
    state,
    view,
    legal,
    apply,
    log,
    batch,
    settings,
    setSettings,
    thinking,
    autoPassing,
  };
}

export type GameSession = ReturnType<typeof useGame>;
