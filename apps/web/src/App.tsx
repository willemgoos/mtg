import {
  DECKS,
  deckById,
  findDeck,
  type Decklist,
  isBrawl,
  isJumpIn,
  isPlayable,
  JUMP_IN_DECKS,
  jumpInPackets,
  registerDeck,
  scryfallById,
  slug,
} from '@mtg/cards';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from './components/Board.tsx';
import { CardSearch } from './components/CardSearch.tsx';
import { DeckView } from './components/DeckView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Expedition } from './components/Expedition.tsx';
import { Gauntlet } from './components/Gauntlet.tsx';
import { type Event, Home, isEvent, type Mode, Nav, type Tab } from './components/Home.tsx';
import { JumpIn } from './components/JumpIn.tsx';
import { JumpInLobby } from './components/JumpInLobby.tsx';
import { Season } from './components/Season.tsx';
import { Sealed, sealedRunSummary, seasonRepository } from './components/Sealed.tsx';
import type { BotKind } from './game/bot.worker.ts';
import './components/decks.css';
import { artFor, BLURBS } from './game/deckArt.ts';
import { HumanMade } from './components/HumanMade.tsx';
import * as X from './game/expedition.ts';
import * as J from './game/jumpInMatch.ts';
import * as S from './game/sealed.ts';
import {
  type DeckRecord,
  type GauntletState,
  loadGauntlet,
  recordResult,
  ROUNDS,
  roundOf,
  type RunSummary,
  saveGauntlet,
  startMatch,
  startRun,
  summarize,
} from './game/gauntlet.ts';
import { clearGame, loadGame, type SavedGame } from './game/saved.ts';
import { createSeasonRepository } from './game/seasonStorage.ts';
import { BOT, type DeckChoice, HUMAN, useGame } from './game/useGame.ts';

// Playable decks first; the rest show as "coming soon".
/** Deck grid sections, playable decks first within each. */
const SECTIONS: { title: string; blurb: string; decks: Decklist[] }[] = [
  {
    title: 'Starter decks',
    blurb: 'Two-colour decks from Arena’s Starter Deck Duel',
    series: 'starter' as const,
  },
  {
    title: 'Foundations draft decks',
    blurb: '40-card decks that went 7–0 in Arena’s Premier Draft; they play each other',
    series: 'trophy' as const,
  },
  {
    title: 'Bloomburrow',
    blurb: 'Two-colour Bloomburrow decks to face the starter decks: ours and the Starter Kit’s',
    series: 'starter' as const,
    set: 'blb' as const,
  },
  {
    title: 'Bloomburrow draft decks',
    blurb: '40-card decks that went 7–0 to 7–2 in Arena’s Premier Draft; they play each other',
    series: 'trophy' as const,
    set: 'blb' as const,
  },
  {
    title: 'Marvel Super Heroes',
    blurb: 'Our two-colour decks from Marvel Super Heroes, built to face the starter decks',
    series: 'starter' as const,
    set: 'msh' as const,
  },
  {
    title: 'Marvel Super Heroes draft decks',
    blurb: '40-card decks that went 7–0 in Arena’s Premier Draft; they play each other',
    series: 'trophy' as const,
    set: 'msh' as const,
  },
  {
    title: 'Final Fantasy',
    blurb:
      'Our two-colour decks from Final Fantasy, built to face the starter decks, and the Starter Kit’s Cloud and Sephiroth',
    series: 'starter' as const,
    set: 'fin' as const,
  },
  {
    title: 'Final Fantasy draft decks',
    blurb: '40-card decks that went 7–0 in Arena’s Premier Draft; they play each other',
    series: 'trophy' as const,
    set: 'fin' as const,
  },
  {
    title: 'Strixhaven',
    blurb: 'Our two-colour decks from Strixhaven: School of Mages, built to face the starter decks',
    series: 'starter' as const,
    set: 'stx' as const,
  },
  {
    title: 'Secrets of Strixhaven',
    blurb: 'Our two-colour decks from Secrets of Strixhaven, built to face the starter decks',
    series: 'starter' as const,
    set: 'sos' as const,
  },
  {
    title: 'Reality Fracture',
    blurb: 'Our two-colour decks from Reality Fracture, built to face the starter decks',
    series: 'starter' as const,
    set: 'fra' as const,
  },
  {
    title: 'Lorwyn Eclipsed',
    blurb: 'Our two-colour decks from Lorwyn Eclipsed, built to face the starter decks',
    series: 'starter' as const,
    set: 'ecl' as const,
  },
  {
    title: 'Color Challenge',
    blurb: 'The mono-colour decks Sparky plays against new players',
    series: 'colorChallenge' as const,
  },
].map(
  ({
    series,
    set,
    ...s
  }: {
    title: string;
    blurb: string;
    series: string;
    set?: 'blb' | 'msh' | 'fin' | 'stx' | 'sos' | 'fra' | 'ecl';
  }) => {
    const decks = DECKS.filter((d) => d.series === series && d.set === set);
    return { ...s, decks: [...decks.filter(isPlayable), ...decks.filter((d) => !isPlayable(d))] };
  },
);
/** Brawl's own deck grid: commander decks only play each other. */
const brawlDecks = (inSet: (d: Decklist) => boolean) => [
  ...DECKS.filter((d) => isBrawl(d) && inSet(d) && isPlayable(d)),
  ...DECKS.filter((d) => isBrawl(d) && inSet(d) && !isPlayable(d)),
];
const BRAWL_SECTIONS: { title: string; blurb: string; decks: Decklist[] }[] = [
  {
    title: 'Brawl',
    blurb: '100-card singleton decks led by a legendary commander, 25 life',
    decks: brawlDecks((d) => d.set !== 'fic' && d.set !== 'soc' && d.set !== 'stx'),
  },
  {
    title: 'Final Fantasy',
    blurb: 'Arena’s Final Fantasy Brawl decks, led by heroes of the series',
    decks: brawlDecks((d) => d.set === 'fic'),
  },
  {
    title: 'Strixhaven',
    blurb: 'Our Brawl decks led by Strixhaven’s commanders, built like Arena’s precons',
    decks: brawlDecks((d) => d.set === 'soc' || d.set === 'stx'),
  },
];
const PLAYABLE = DECKS.filter(isPlayable);

/**
 * Decks built in Season mode (every save) that are big enough to set out with,
 * registered so they can be viewed and played by id like our own.
 */
function seasonDecks(): Decklist[] {
  try {
    const decks = createSeasonRepository(localStorage)
      .load()
      .saves.flatMap((save) => save.decks.map((d) => X.seasonDecklist(save.id, d)))
      .filter((d) => d.cards.reduce((n, [, k]) => n + k, 0) >= X.MIN_DECK);
    decks.forEach(registerDeck);
    return decks;
  } catch {
    return [];
  }
}

interface Match {
  choice: DeckChoice;
  seed: number;
  /** A saved game to pick up from instead of starting fresh. */
  resume: SavedGame | null;
  /** Bumped by "Reload game" after a crash, to remount the game. */
  attempt: number;
  bot: BotKind;
  /** A round of a run (its result counts toward the run) rather than a quick match. */
  event: Event | null;
  /** A game of the Jump In match (`jumpIn.series`). */
  series?: boolean;
}

const EVENT_NAMES: Record<Event, string> = {
  gauntlet: 'Gauntlet',
  expedition: 'Expedition',
  sealed: 'Sealed',
};

export function App() {
  // Loading Sealed registers its decks, which a saved Sealed game needs to be recognised below.
  const [sealed, setSealed] = useState(S.loadSealed);
  const sealedNow = useRef(sealed);
  // A game in progress when the page was closed or reloaded carries on.
  const [saved] = useState(loadGame);
  const [gauntlet, setGauntlet] = useState(loadGauntlet);
  const [expedition, setExpedition] = useState(X.loadExpedition);
  const [jumpIn, setJumpIn] = useState(J.loadJumpIn);
  const [match, setMatch] = useState<Match | null>(
    () =>
      saved && {
        choice: saved.choice,
        seed: saved.seed,
        resume: saved,
        attempt: 0,
        bot: saved.opponent,
        event:
          gauntlet.run?.match === saved.seed
            ? 'gauntlet'
            : expedition.run?.match === saved.seed
              ? 'expedition'
              : sealed.event?.match === saved.seed
                ? 'sealed'
                : null,
        series: !!jumpIn.series && J.current(jumpIn.series) === saved.seed,
      },
  );
  const [mode, setMode] = useState<Mode>(
    () =>
      match?.event ??
      (match?.series
        ? 'jumpIn'
        : expedition.run
          ? 'expedition'
          : gauntlet.run
            ? 'gauntlet'
            : sealed.event && !sealed.event.finished
              ? 'sealed'
              : 'quick'),
  );
  const [hub, setHub] = useState<Event | null>(null);
  /** Picking Jump In packets for a new expedition. */
  const [jumping, setJumping] = useState(false);
  const [opponent, setOpponent] = useState<BotKind>(
    saved && !match?.event ? saved.opponent : 'easy',
  );
  const [theirDeck, setTheirDeck] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [lastQuick, setLastQuick] = useState(loadLastQuick);
  const pick = (you: string, bot = opponent) => {
    const seed = newSeed();
    // A chosen opponent deck from the other kind (Brawl or 60 cards) doesn't apply.
    // A Jump In deck always meets another Jump In deck.
    const chosen =
      theirDeck && !isJumpIn(you) && isBrawl(deckById(theirDeck)) === isBrawl(deckById(you));
    const them = chosen ? theirDeck : randomOther(you, seed);
    setLastQuick(saveLastQuick({ deck: you, opponent: bot }));
    setMatch({
      choice: { you, them },
      seed,
      resume: null,
      attempt: 0,
      bot,
      event: null,
    });
  };
  const openDecks = (m: Mode) => {
    setMode(m);
    if (m === 'sealed') return setHub('sealed');
    setTab('decks');
  };
  const menu = () => {
    clearGame();
    setMatch(null);
    setTab('home');
  };

  // ------------------------------------------------------------ Jump In
  const updateJumpIn = (f: (s: J.JumpInState) => J.JumpInState) =>
    setJumpIn((s) => J.saveJumpIn(f(s)));
  const series = jumpIn.series;
  /** The match's current game was left part-way. */
  const seriesPaused = !!series && loadGame()?.seed === J.current(series);
  const playSeries = (s: J.Series) => {
    const left = loadGame();
    const resume = left?.seed === J.current(s) ? left : null;
    const first = J.startingPlayer(s, HUMAN, BOT);
    setMatch({
      choice: resume?.choice ?? {
        you: s.you,
        them: s.them,
        // A Jump In match is best of three, which Arena plays without hand smoothing.
        options: { handSmoothing: [], ...(first ? { startingPlayer: first } : {}) },
      },
      seed: J.current(s),
      resume,
      attempt: 0,
      bot: s.bot,
      event: null,
      series: true,
    });
  };
  const startSeries = (s: J.Series) => {
    updateJumpIn((x) => ({ ...x, series: s }));
    playSeries(s);
  };
  /** The next game of the match, or the one left part-way. */
  const continueSeries = () => {
    if (!series) return;
    if (seriesPaused || !J.gameDone(series)) return playSeries(series);
    if (!J.isOver(series)) startSeries(J.nextGame(series, newSeed()));
  };
  const abandonSeries = () => {
    if (seriesPaused) clearGame();
    updateJumpIn((x) => ({ ...x, series: null }));
  };
  const toLobby = () => {
    setMatch(null);
    setMode('jumpIn');
    setTab('decks');
  };

  // ------------------------------------------------- gauntlet and expedition
  const updateGauntlet = (f: (s: GauntletState) => GauntletState) =>
    setGauntlet((s) => {
      const next = f(s);
      saveGauntlet(next);
      return next;
    });
  /** Sealed changes go through a ref: finishing an event pays its prize, which must happen once. */
  const updateSealed = (f: (s: S.SealedState) => S.SealedState) => {
    let next = f(sealedNow.current);
    if (next.event?.finished && !next.event.prizePaid)
      next = S.paySealedPrize(next, seasonRepository(), Date.now());
    sealedNow.current = next;
    S.saveSealed(next);
    setSealed(next);
  };
  const updateExpedition = (f: (s: X.ExpeditionState) => X.ExpeditionState) =>
    setExpedition((s) => {
      const next = f(s);
      X.saveExpedition(next);
      return next;
    });
  const summaries: Record<Event, RunSummary | null> = {
    gauntlet: gauntlet.run && summarize(gauntlet.run),
    expedition: expedition.run && X.summarize(expedition.run),
    sealed: sealedRunSummary(sealed.event),
  };
  const paused = (e: Event) => {
    const m =
      e === 'gauntlet'
        ? gauntlet.run?.match
        : e === 'expedition'
          ? expedition.run?.match
          : sealed.event?.match;
    return m != null && loadGame()?.seed === m;
  };
  const beginRun = (e: Event, deck: string) => {
    if (e === 'gauntlet') updateGauntlet((s) => startRun(s, deck, newSeed()));
    else updateExpedition((s) => X.startExpedition(s, deck, newSeed()));
    setHub(e);
  };
  const playRound = (e: Event) => {
    const resume = paused(e) ? loadGame() : null;
    const seed = resume?.seed ?? newSeed();
    const start = (choice: DeckChoice, bot: BotKind) =>
      setMatch({ choice: resume?.choice ?? choice, seed, resume, attempt: 0, bot, event: e });
    if (e === 'gauntlet') {
      const r = gauntlet.run;
      if (!r) return;
      if (!resume) updateGauntlet((s) => startMatch(s, seed));
      const round = roundOf(r);
      return start({ you: r.deck, them: r.opponents[round]! }, ROUNDS[round]!.bot);
    }
    const r = expedition.run;
    const fight = r && X.fightOf(r);
    if (!r || !fight) return;
    if (!resume) updateExpedition((s) => X.startMatch(s, seed));
    start(
      {
        you: r.deck,
        them: fight.opponent,
        cards: X.deckCards(r.build),
        options: X.gameOptions(r),
      },
      fight.bot,
    );
  };
  const playSealed = () => {
    const e = sealed.event;
    if (!e || e.finished) return;
    const resume = paused('sealed') ? loadGame() : null;
    if (!resume && !S.canPlay(e)) return;
    const seed = resume?.seed ?? newSeed();
    if (!resume) updateSealed((s) => S.startSealedMatch(s, seed));
    const foe = S.currentOpponent(e);
    setMatch({
      choice: resume?.choice ?? {
        you: S.sealedPlayerDeck(e).id,
        them: foe.deck.id,
        cards: S.sealedDeckCards(e),
      },
      seed,
      resume,
      attempt: 0,
      bot: foe.bot,
      event: 'sealed',
    });
  };
  // Leaving a run's match keeps it saved, so the round can be resumed rather than restarted.
  const toHub = (e: Event) => {
    setMatch(null);
    setHub(e);
  };
  const endRun = (e: Event) => {
    if (e === 'gauntlet') updateGauntlet((s) => ({ ...s, run: null }));
    else updateExpedition((s) => ({ ...s, run: null }));
    setHub(null);
    setMode(e);
  };
  /** Home's Play button: carry on a run, replay the last quick match, or go pick a deck. */
  const playHome = (m: Mode) => {
    setMode(m);
    if (m === 'sealed' || (isEvent(m) && summaries[m])) return setHub(m as Event);
    if (m === 'jumpIn') return setTab('decks');
    // Replay the last single game if it was in this mode (Brawl decks only play Brawl).
    const brawlDeck = lastQuick && isBrawl(deckById(lastQuick.deck));
    if (!isEvent(m) && lastQuick && brawlDeck === (m === 'brawl'))
      return pick(lastQuick.deck, lastQuick.opponent);
    setTab('decks');
  };
  const onEnd = (outcome: 'win' | 'loss' | 'draw') => {
    const seed = match?.seed;
    if (seed === undefined) return;
    if (match?.event === 'gauntlet') updateGauntlet((s) => recordResult(s, seed, outcome));
    if (match?.event === 'expedition') updateExpedition((s) => X.recordMatch(s, seed, outcome));
    if (match?.event === 'sealed') updateSealed((s) => S.recordSealedMatch(s, seed, outcome));
    if (match?.series)
      updateJumpIn((s) => ({ ...s, series: s.series && J.recordGame(s.series, seed, outcome) }));
  };
  const back = useCallback(() => setViewing(null), []);
  if (seasonOpen) return <Season onHome={() => setSeasonOpen(false)} />;
  if (!match && viewing)
    return (
      <DeckView
        deck={deckById(viewing)}
        onBack={back}
        onPlay={() => {
          setViewing(null);
          pick(viewing);
        }}
      />
    );
  if (!match && hub === 'gauntlet' && gauntlet.run)
    return (
      <Gauntlet
        state={gauntlet}
        resumable={paused('gauntlet')}
        onPlay={() => playRound('gauntlet')}
        onAbandon={() => endRun('gauntlet')}
        onAgain={() => beginRun('gauntlet', gauntlet.run!.deck)}
        onMenu={() => {
          setHub(null);
          setTab('home');
        }}
      />
    );
  if (!match && hub === 'sealed')
    return (
      <Sealed
        state={sealed}
        update={updateSealed}
        resumable={paused('sealed')}
        onPlay={playSealed}
        onMenu={() => {
          setHub(null);
          setTab('home');
        }}
        onSeason={() => setSeasonOpen(true)}
      />
    );
  if (!match && hub === 'expedition' && expedition.run)
    return (
      <Expedition
        state={expedition}
        update={updateExpedition}
        resumable={paused('expedition')}
        onPlay={() => playRound('expedition')}
        onAbandon={() => endRun('expedition')}
        onAgain={() => {
          // A Jump In run starts over from the packet pick, not the same pair.
          const r = expedition.run!;
          if (!isJumpIn(r.deck)) return beginRun('expedition', r.deck);
          endRun('expedition');
          setJumping(true);
        }}
        onContinue={() => updateExpedition((s) => X.continueExpedition(s, newSeed()))}
        onMenu={() => {
          setHub(null);
          setTab('home');
        }}
      />
    );
  if (!match && jumping)
    return (
      <JumpIn
        onPick={(deck) => {
          setJumping(false);
          beginRun('expedition', deck);
        }}
        onBack={() => setJumping(false)}
      />
    );
  if (!match && tab === 'cards')
    return <CardSearch onTab={setTab} clears={clearsOf(gauntlet) + clearsOf(expedition)} />;
  if (!match && tab === 'home')
    return (
      <Home
        mode={mode}
        onMode={setMode}
        runs={summaries}
        clears={clearsOf(gauntlet) + clearsOf(expedition)}
        quick={
          lastQuick && {
            deck: deckById(lastQuick.deck),
            opponent: OPPONENTS.find((o) => o.id === lastQuick.opponent)!.name,
          }
        }
        onPlay={playHome}
        onDecks={openDecks}
        onJumpIn={() => setJumping(true)}
        jumpIn={
          series && series.bestOf > 1 && !J.isOver(series)
            ? `Best of ${series.bestOf} · ${J.scoreLine(series)}`
            : null
        }
        onTab={setTab}
        onSeason={() => setSeasonOpen(true)}
        sealedBest={Math.max(0, ...Object.values(sealed.records).map((r) => r.best)) || null}
      />
    );
  // Sealed has no deck grid: its tile opens the event instead.
  const startMode = mode === 'sealed' ? 'quick' : mode;
  if (!match)
    return (
      <Start
        onTab={setTab}
        clears={clearsOf(gauntlet) + clearsOf(expedition)}
        mode={startMode}
        onMode={setMode}
        run={isEvent(startMode) ? summaries[startMode] : null}
        records={!isEvent(startMode) ? {} : startMode === 'gauntlet' ? gauntlet.records : expedition.records}
        onContinue={() => isEvent(startMode) && setHub(startMode)}
        onRun={(deck) => isEvent(startMode) && beginRun(startMode, deck)}
        onJumpIn={() => setJumping(true)}
        lobby={
          <JumpInLobby
            setup={jumpIn.setup}
            onSetup={(setup) => updateJumpIn((x) => ({ ...x, setup }))}
            series={series}
            resumable={seriesPaused}
            opponents={OPPONENTS}
            onPlay={() => startSeries(J.startSeries(jumpIn.setup, newSeed()))}
            onContinue={continueSeries}
            onAbandon={abandonSeries}
          />
        }
        opponent={opponent}
        onOpponent={setOpponent}
        theirDeck={theirDeck}
        onTheirDeck={setTheirDeck}
        onPick={pick}
        onView={setViewing}
      />
    );
  const inSeries = match.series && series ? series : null;
  const bo3 = inSeries && inSeries.bestOf > 1 ? inSeries : null;
  return (
    <ErrorBoundary
      onMenu={menu}
      onRetry={() => setMatch((m) => m && { ...m, resume: loadGame(), attempt: m.attempt + 1 })}
    >
      <Game
        key={`${match.seed}-${match.attempt}`}
        choice={match.choice}
        seed={match.seed}
        opponent={match.bot}
        resume={match.resume}
        onEnd={onEnd}
        yours={
          match.event === 'expedition' && expedition.run ? X.runDeck(expedition.run) : undefined
        }
        gauntlet={
          match.event
            ? runLabel(EVENT_NAMES[match.event], summaries[match.event])
            : bo3
              ? J.gameLabel(bo3)
              : undefined
        }
        resultText={bo3 && J.gameDone(bo3) ? J.scoreLine(bo3) : undefined}
        concedeText={bo3 ? 'Concede this game? It counts as a loss.' : undefined}
        pauseText={bo3 ? 'Leave the match? You can pick this game up from Jump In.' : undefined}
        onMenu={match.event ? () => toHub(match.event!) : bo3 ? toLobby : menu}
        onRematch={
          match.event
            ? () => toHub(match.event!)
            : bo3
              ? // Continue: the next game, or back to the lobby once the match is decided.
                () => (J.isOver(bo3) ? toLobby() : startSeries(J.nextGame(bo3, newSeed())))
              : inSeries
                ? () => startSeries({ ...inSeries, seeds: [newSeed()], results: [] })
                : () => setMatch((m) => m && { ...m, seed: newSeed(), resume: null, attempt: 0 })
        }
      />
    </ErrorBoundary>
  );
}

function runLabel(name: string, run: RunSummary | null): string {
  if (!run) return name;
  return `${name} · ${run.status === 'playing' ? run.label ?? `${run.unit} ${run.step} of ${run.steps}` : 'Final result'}`;
}

const clearsOf = (s: { records: Record<string, DeckRecord> }) =>
  Object.values(s.records).reduce((n, r) => n + r.clears, 0);

interface LastQuick {
  deck: string;
  opponent: BotKind;
}
const LAST_QUICK = 'mtg.lastQuick';

function loadLastQuick(): LastQuick | null {
  try {
    const q = JSON.parse(localStorage.getItem(LAST_QUICK) ?? 'null') as LastQuick | null;
    const deck = q && findDeck(q.deck);
    const known = deck && isPlayable(deck);
    return known && OPPONENTS.some((o) => o.id === q.opponent) ? q : null;
  } catch {
    return null;
  }
}

function saveLastQuick(q: LastQuick): LastQuick {
  try {
    localStorage.setItem(LAST_QUICK, JSON.stringify(q));
  } catch {
    // Storage unavailable: Play on the home screen just opens the deck picker.
  }
  return q;
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** A random playable deck for the bot, other than the player's when possible. */
function randomOther(you: string, seed: number): string {
  // A Jump In player meets a Jump In bot whose halves are both different from theirs.
  const mine = jumpInPackets(you);
  if (mine) {
    const pool = JUMP_IN_DECKS.filter((d) => !jumpInPackets(d.id)!.some((p) => mine.includes(p)));
    return pool[seed % pool.length]!.id;
  }
  // Same series as the player's deck (Color Challenge decks meet each other, like on Arena).
  const series = DECKS.find((d) => d.id === you)?.series;
  const others = PLAYABLE.filter((d) => d.id !== you && d.series === series);
  // Brawl decks only meet Brawl decks (a mirror match if there is no other).
  const pool = others.length ? others : PLAYABLE.filter((d) => isBrawl(d) === (series === 'brawl'));
  return pool[seed % pool.length]!.id;
}

function Game({
  choice,
  seed,
  opponent,
  resume,
  yours,
  gauntlet,
  resultText,
  concedeText,
  pauseText,
  onEnd,
  onMenu,
  onRematch,
}: {
  choice: DeckChoice;
  seed: number;
  opponent: BotKind;
  resume: SavedGame | null;
  /** The player's deck when it isn't a stock list (an expedition deck). */
  yours?: Decklist;
  gauntlet?: string;
  resultText?: string;
  concedeText?: string;
  pauseText?: string;
  onEnd: (outcome: 'win' | 'loss' | 'draw') => void;
  onMenu: () => void;
  onRematch: () => void;
}) {
  const game = useGame(choice, seed, opponent, resume);
  const winner = game.state.winner;
  useEffect(() => {
    if (winner) onEnd(winner === 'draw' ? 'draw' : winner === HUMAN ? 'win' : 'loss');
    // Keyed on the winner alone: recordResult ignores repeats anyway.
  }, [winner]);
  const deck = (id: string) => deckById(id);
  return (
    <Board
      game={game}
      decks={{ you: yours ?? deck(choice.you), them: deck(choice.them) }}
      gauntlet={gauntlet}
      resultText={resultText}
      concedeText={concedeText}
      pauseText={pauseText}
      onMenu={onMenu}
      onRematch={onRematch}
    />
  );
}

const OPPONENTS: { id: BotKind; name: string; blurb: string }[] = [
  {
    id: 'easy',
    name: 'Novice',
    blurb: 'Still learning: makes mistakes, never responds on your turn',
  },
  { id: 'heuristic', name: 'Apprentice', blurb: 'Plays fast, thinks one move ahead' },
  { id: 'search', name: 'Master', blurb: 'Simulates hundreds of futures per decision' },
];

const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'quick', name: 'Quick match', blurb: 'One game, any deck against any opponent' },
  { id: 'brawl', name: 'Brawl', blurb: '1v1 Commander: 100-card decks, 25 life' },
  {
    id: 'jumpIn',
    name: 'Jump In!',
    blurb: 'Two half-decks each from every packet; one game or a best of three',
  },
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    blurb: `${ROUNDS.length} opponents, each tougher. Three losses and you're out`,
  },
  {
    id: 'expedition',
    name: 'Expedition',
    blurb: 'A starter deck and two packs. Every win opens another; build as you go',
  },
];

const cardCount = (d: Decklist) => d.cards.reduce((n, [, k]) => n + k, 0) + (d.commander ? 1 : 0);

function Start({
  onTab,
  clears,
  mode,
  onMode,
  run,
  records,
  onContinue,
  onRun,
  onJumpIn,
  lobby,
  onPick,
  onView,
  opponent,
  onOpponent,
  theirDeck,
  onTheirDeck,
}: {
  onTab: (t: Tab) => void;
  clears: number;
  mode: Mode;
  onMode: (m: Mode) => void;
  /** The selected run mode's state (null for quick matches). */
  run: RunSummary | null;
  records: Record<string, DeckRecord>;
  onContinue: () => void;
  onRun: (deckId: string) => void;
  onJumpIn: () => void;
  /** The Jump In mode's lobby, shown instead of the deck grid. */
  lobby: React.ReactNode;
  onPick: (deckId: string) => void;
  onView: (deckId: string) => void;
  opponent: BotKind;
  onOpponent: (b: BotKind) => void;
  theirDeck: string | null;
  onTheirDeck: (id: string | null) => void;
}) {
  const running = run?.status === 'playing';
  const name = isEvent(mode) ? EVENT_NAMES[mode] : '';
  const single = !isEvent(mode);
  const [season] = useState(seasonDecks);
  /** The one section shown, or every section. */
  const [filter, setFilter] = useState<string | null>(null);
  // Expeditions can also set out with a deck built in Season mode.
  const sections =
    mode === 'brawl'
      ? BRAWL_SECTIONS
      : mode === 'expedition' && season.length
        ? [
            SECTIONS[0]!,
            { title: 'Your Season decks', blurb: 'Decks you built in Season mode', decks: season },
            ...SECTIONS.slice(1),
          ]
        : SECTIONS;
  // Jump In has its own packet browser (the lobby) instead of the deck grid.
  const shown = mode === 'jumpIn' ? [] : sections.filter((s) => !filter || s.title === filter);
  const steps = mode === 'expedition' ? X.FLOORS : ROUNDS.length;
  const playable = (s: { decks: Decklist[] }) => s.decks.filter(isPlayable).length;
  const status = (d: Decklist): TileStatus | undefined => {
    if (!isPlayable(d)) return { text: 'Coming soon' };
    const record = single ? undefined : records[d.id];
    if (!record || record.runs === 0) return undefined;
    return record.clears
      ? { text: `Cleared${record.clears > 1 ? ` ×${record.clears}` : ''}`, cleared: true }
      : { text: `Best ${record.best}/${steps}` };
  };
  return (
    <div className="dpick">
      <Nav tab="decks" onTab={onTab} clears={clears} />
      <main className="dpick__main">
        <header className="dpick__head">
          <div className="dpick__title">
            <h1>
              {mode === 'quick'
                ? 'Quick match'
                : mode === 'brawl'
                  ? 'Brawl'
                  : mode === 'jumpIn'
                    ? 'Jump In!'
                    : name}
            </h1>
            <p>
              {mode === 'jumpIn'
                ? 'Two themed half-decks make a 40-card deck. Pick yours and, if you like, the bot’s.'
                : single
                  ? 'Choose your opponent, then pick a deck to play.'
                  : running
                    ? 'Your run is waiting. Finish it to start another.'
                    : mode === 'gauntlet'
                      ? 'Choose a deck to take through the gauntlet.'
                      : 'Choose a deck to set out with.'}
            </p>
          </div>
          <div className="dseg" role="radiogroup" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                title={m.blurb}
                className={`dseg__opt ${mode === m.id ? 'is-on' : ''}`}
                onClick={() => {
                  setFilter(null);
                  onMode(m.id);
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </header>

        {mode === 'jumpIn' ? (
          lobby
        ) : single ? (
          <div className="dsetup">
            <div className="dsetup__field">
              <span className="dsetup__label">Opponent</span>
              <div className="dseg dseg--sm" role="radiogroup" aria-label="Opponent">
                {OPPONENTS.map((o) => (
                  <button
                    key={o.id}
                    role="radio"
                    aria-checked={opponent === o.id}
                    className={`dseg__opt ${opponent === o.id ? 'is-on' : ''}`}
                    onClick={() => onOpponent(o.id)}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
              <span className="dsetup__hint">
                {OPPONENTS.find((o) => o.id === opponent)?.blurb}
              </span>
            </div>
            <label className="dsetup__field">
              <span className="dsetup__label">Their deck</span>
              <span className="dselect">
                <select
                  value={theirDeck ?? ''}
                  onChange={(e) => onTheirDeck(e.target.value || null)}
                >
                  <option value="">Random</option>
                  {sections.map((s) => (
                    <optgroup key={s.title} label={s.title}>
                      {s.decks.filter(isPlayable).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <svg className="hico" viewBox="0 0 16 16" aria-hidden>
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </span>
              <span className="dsetup__hint">
                {theirDeck ? 'Always this deck' : 'A different deck from the same series'}
              </span>
            </label>
          </div>
        ) : (
          run && <RunBanner name={name} run={run} onContinue={onContinue} />
        )}

        {mode !== 'jumpIn' && (
          <div className="dfilter" role="toolbar" aria-label="Deck series">
            <button
              aria-pressed={!filter}
              className={`dfilter__chip ${!filter ? 'is-on' : ''}`}
              onClick={() => setFilter(null)}
            >
              All <span>{sections.reduce((n, s) => n + playable(s), 0)}</span>
            </button>
            {sections.map((s) => (
              <button
                key={s.title}
                aria-pressed={filter === s.title}
                className={`dfilter__chip ${filter === s.title ? 'is-on' : ''}`}
                onClick={() => setFilter(filter === s.title ? null : s.title)}
              >
                {s.title} <span>{playable(s)}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'expedition' && !filter && (
          <JumpInSection records={records} locked={running} onJumpIn={onJumpIn} />
        )}
        {shown.map((section) => (
          <section key={section.title} className="dsection">
            <div className="dsection__head">
              <h2>{section.title}</h2>
              <p>{section.blurb}</p>
            </div>
            <div className={`dgrid ${running ? 'is-waiting' : ''}`}>
              {section.decks.map((d, i) => (
                <DeckTile
                  key={d.id}
                  deck={d}
                  art={artFor(d)}
                  i={i}
                  disabled={!isPlayable(d) || running}
                  status={status(d)}
                  meta={
                    BLURBS[d.id] ??
                    d.credit ??
                    `${cardCount(d)} cards${d.series === 'season' ? ' from Season' : ''}`
                  }
                  badge={<HumanMade of={d} />}
                  onPick={() => (single ? onPick(d.id) : onRun(d.id))}
                  onView={() => onView(d.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

interface TileStatus {
  text: string;
  cleared?: boolean;
}

/** A deck in the picker: art, name and colours; View opens the list. */
function DeckTile({
  deck,
  art,
  i,
  disabled,
  status,
  meta,
  badge,
  onPick,
  onView,
}: {
  deck: Pick<Decklist, 'name' | 'colors'>;
  art: string;
  i: number;
  disabled: boolean;
  status?: TileStatus;
  meta: string;
  /** Shown on the art's corner (the human-made badge). */
  badge?: React.ReactNode;
  onPick: () => void;
  onView?: () => void;
}) {
  return (
    <div
      className={`dtile ${disabled ? 'is-off' : ''}`}
      style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
    >
      <button className="dtile__main" disabled={disabled} onClick={onPick}>
        <span className="dtile__media" style={{ backgroundImage: `url("${art}")` }}>
          {badge}
          {status && (
            <span className={`tile__status ${status.cleared ? 'tile__status--cleared' : ''}`}>
              {status.text}
            </span>
          )}
        </span>
        <span className="dtile__body">
          <span className="dtile__row">
            <span className="dtile__name">{deck.name}</span>
            <span className="dpips" aria-label={deck.colors.join('')}>
              {deck.colors.map((c) => (
                <i key={c} style={{ background: `var(--mana-${c})` }} />
              ))}
            </span>
          </span>
          <span className="dtile__meta">{meta}</span>
        </span>
      </button>
      {onView && (
        <button className="dtile__view" onClick={onView} aria-label={`View ${deck.name}`}>
          View deck
        </button>
      )}
    </div>
  );
}

/** The Jump In! entry for expeditions, with the best record over every pair of packets. */
function JumpInSection({
  blurb = 'Pick two themed half-decks and shuffle them together',
  deckBlurb = 'A new 40-card deck every run',
  records,
  locked,
  onJumpIn,
}: {
  blurb?: string;
  deckBlurb?: string;
  records: Record<string, DeckRecord>;
  locked: boolean;
  onJumpIn: () => void;
}) {
  const mine = Object.entries(records)
    .filter(([id]) => isJumpIn(id))
    .map(([, r]) => r);
  const clears = mine.reduce((n, r) => n + r.clears, 0);
  const best = Math.max(0, ...mine.map((r) => r.best));
  return (
    <section className="dsection">
      <div className="dsection__head">
        <h2>Jump In!</h2>
        <p>{blurb}</p>
      </div>
      <div className={`dgrid ${locked ? 'is-waiting' : ''}`}>
        <DeckTile
          deck={{ name: 'Jump In!', colors: ['W', 'U', 'B', 'R', 'G'] }}
          art={scryfallById.get(slug(JUMP_IN_FACE))?.image?.artCrop ?? ''}
          i={0}
          disabled={locked}
          status={
            mine.length > 0
              ? clears
                ? { text: `Cleared${clears > 1 ? ` ×${clears}` : ''}`, cleared: true }
                : { text: `Best ${best}/${X.FLOORS}` }
              : undefined
          }
          meta={deckBlurb}
          onPick={onJumpIn}
        />
      </div>
    </section>
  );
}

const JUMP_IN_FACE = 'Krenko, Mob Boss';

/** The run in progress (or just finished), on the start screen. */
function RunBanner({
  name,
  run,
  onContinue,
}: {
  name: string;
  run: RunSummary;
  onContinue: () => void;
}) {
  const deck = deckById(run.deck);
  const status = run.status;
  return (
    <div className="drun">
      <span className="drun__art" style={{ backgroundImage: `url("${artFor(deck)}")` }} />
      <div className="drun__text">
        <span className={`drun__state ${status === 'playing' ? 'is-live' : ''}`}>
          {status === 'playing'
            ? `${run.unit} ${run.step} of ${run.steps} · ${run.livesLeft} ${run.livesLeft === 1 ? 'life' : 'lives'} left`
            : status === 'cleared'
              ? `${name} cleared!`
              : 'Run over'}
        </span>
        <span className="drun__deck">{deck.name}</span>
      </div>
      <button className="hbtn hbtn--primary" onClick={onContinue}>
        {status === 'playing' ? 'Continue run' : 'See result'}
      </button>
    </div>
  );
}
